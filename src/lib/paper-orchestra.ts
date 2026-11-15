/**
 * PaperOrchestra (google-research/paper-orchestra) multi-agent writing pipeline,
 * ported to this app's TypeScript stack.
 *
 * Mirrors paper-orchestra's four staged agents:
 *   1. Outline Agent        — structured section outline with GPS rhythm
 *   2. Literature Review Agent — per-section literature synthesis + citation map
 *   3. Section Writing Agent   — writes each manuscript section
 *   4. Content Refinement Agent — self-correction / reflection polish
 *
 * The caller supplies `callModel` (client: wraps callAiWithFallback → /api/chat,
 * the app's existing wired API; server: wraps a direct provider fetch). All
 * citations are Vancouver-style and drawn only from the pipeline's own evidence
 * base (no invented references).
 */

import type { AICallOptions, AiProviderName } from "./ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestraCitation {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  doi?: string;
}

export interface OrchestraSection {
  key: string;
  number: number;
  title: string;
  blurb: string;
  subheadings: string[];
  content?: string;
}

export interface OrchestraOutline {
  topic: string;
  reviewType: string;
  sections: OrchestraSection[];
}

export interface PaperOrchestraContext {
  topic: string;
  reviewType: string;
  papers: OrchestraCitation[];
  synthesisOutput?: string;
  effectSizes?: Array<{ study: string; effect: string; ci: string; weight: string }>;
  robAssessments?: Record<string, { overall?: string; notes?: string }>;
  robTool?: string;
  robMode?: "robvis" | "probast";
  prismaCounts?: {
    identification: number;
    deduped: number;
    screened: number;
    excluded: number;
    assessed: number;
    included: number;
  };
  selectedDbs?: string[];
  query?: string;
  requirements?: string;
  instructions?: string;
  literatureSections?: {
    introduction: string;
    globalIndian: string;
    gaps: string;
    futureAdvice: string;
    summary: string;
    references: string;
  };
}

export interface PaperOrchestraResult {
  outline: OrchestraOutline;
  literatureSections: Record<string, string>;
  manuscript: string;
  citations: OrchestraCitation[];
  agentLog: Array<{ agent: string; ok: boolean; detail?: string }>;
}

export type CallModel = (prompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stripFences = (text: string): string =>
  text.replace(/```json/gi, "").replace(/```markdown/gi, "").replace(/```/g, "").trim();

const extractJson = (text: string): any => {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return a JSON object");
    return JSON.parse(match[0]);
  }
};

const vancouverRef = (p: OrchestraCitation, index: number): string =>
  `${index}. ${p.authors}. ${p.title}. ${p.journal}. ${p.year}${p.doi ? ` doi:${p.doi}` : ""}`;

const citationList = (papers: OrchestraCitation[]): string =>
  papers.map((p, i) => vancouverRef(p, i + 1)).join("\n");

// ---------------------------------------------------------------------------
// Prompt builders (paper-orchestra agent prompts, adapted)
// ---------------------------------------------------------------------------

const buildOutlinePrompt = (ctx: PaperOrchestraContext): string => {
  const { topic, reviewType, prismaCounts, selectedDbs, query } = ctx;
  const included = prismaCounts?.included ?? ctx.papers.length;
  return `You are the Outline Agent of PaperOrchestra (google-research/paper-orchestra), a multi-agent academic writing framework.

TASK: Produce a structured outline for a ${reviewType} on the topic: "${topic}".

EVIDENCE BASE (from the app's evidence-synthesis pipeline):
- Studies included: ${included}
- Databases searched: ${(ctx.selectedDbs?.length ? ctx.selectedDbs.join(", ") : "multiple")}
- Query: ${query || topic}
${ctx.prismaCounts ? `PRISMA 2020 flow: identification ${ctx.prismaCounts.identification} → deduped ${ctx.prismaCounts.deduped} → screened ${ctx.prismaCounts.screened} → assessed ${ctx.prismaCounts.assessed} → included ${ctx.prismaCounts.included}` : ""}
${ctx.requirements ? `USER REQUIREMENTS:\n${ctx.requirements}\n` : ""}
${ctx.instructions ? `SYNTHESIS INSTRUCTIONS:\n${ctx.instructions}\n` : ""}

OUTPUT FORMAT — Return ONLY a JSON object (no markdown fences):
{
  "topic": "${topic}",
  "reviewType": "${reviewType}",
  "sections": [
    { "key": "abstract", "number": 0, "title": "Abstract", "blurb": "Structured summary of background, methods, results, conclusion", "subheadings": ["Background", "Objective", "Methods", "Results", "Conclusion"] },
    { "key": "introduction", "number": 1, "title": "Introduction", "blurb": "Goal-Problem-Solution framing of the review", "subheadings": ["1.1 Background and Context", "1.2 Rationale", "1.3 Objectives"] },
    { "key": "methods", "number": 2, "title": "Methods", "blurb": "Search strategy, eligibility, quality assessment, PRISMA flow", "subheadings": ["2.1 Search Strategy", "2.2 Inclusion/Exclusion Criteria", "2.3 Quality Assessment", "2.4 PRISMA 2020 Flow", "2.5 Synthesis Methods"] },
    { "key": "results", "number": 3, "title": "Results", "blurb": "Study characteristics and thematic synthesis", "subheadings": ["3.1 Study Characteristics", "3.2 Thematic Synthesis", "3.3 Meta-analysis (if applicable)", "3.4 Risk of Bias"] },
    { "key": "discussion", "number": 4, "title": "Discussion", "blurb": "Interpretation, limitations, implications", "subheadings": ["4.1 Principal Findings", "4.2 Strengths and Limitations", "4.3 Implications for Practice"] },
    { "key": "grade", "number": 5, "title": "GRADE Certainty of Evidence", "blurb": "Certainty ratings for key outcomes", "subheadings": [] },
    { "key": "conclusion", "number": 6, "title": "Conclusion", "blurb": "Take-home messages and recommendations", "subheadings": [] },
    { "key": "references", "number": 7, "title": "References", "blurb": "Vancouver-style reference list", "subheadings": [] }
  ]
}

Apply GPS Rhythm (Goal-Problem-Solution) to each section and give every section a single Nugget (takeaway). Return ONLY the JSON object.`;
};

const buildLiteratureReviewPrompt = (section: OrchestraSection, ctx: PaperOrchestraContext): string => {
  const { topic, reviewType, papers, synthesisOutput, prismaCounts, query, requirements } = ctx;
  const refs = citationList(papers);
  return `You are the Literature Review Agent of PaperOrchestra (google-research/paper-orchestra). Write ONE section of a publication-ready narrative literature review using ONLY the evidence below.

TOPIC: ${topic}
REVIEW TYPE: ${reviewType}
SECTION: ${section.number}. ${section.title}
SECTION FOCUS: ${section.blurb}
SUBHEADINGS TO USE: ${section.subheadings.join("\n")}

EVIDENCE BASE (studies included: ${papers.length}):
${refs}

${synthesisOutput ? `SYNTHESIS OUTPUT:\n${synthesisOutput.slice(0, 6000)}\n` : ""}
${prismaCounts ? `PRISMA: ${prismaCounts.included} included of ${prismaCounts.identification} identified.` : ""}
${query ? `RESEARCH QUERY: ${query}` : ""}
${requirements ? `REQUIREMENTS:\n${requirements}\n` : ""}

RULES:
- Cite inline using author-year, e.g. (Smith 2020). Every citation MUST map to one of the numbered references above.
- Do NOT invent references. Use only the studies listed above.
- Write 6-10 substantial paragraphs. Use the subheadings above.
- Synthesize thematically (convergence/divergence), not paper-by-paper.
- Ground every claim in the evidence. Acknowledge conflicting or limited evidence.
- Do NOT include a reference list (handled separately).

Write the section "${section.title}" now in Markdown.`;
};

const buildSectionWritingPrompt = (
  section: OrchestraSection,
  literature: string,
  ctx: PaperOrchestraContext,
): string => {
  const { topic, reviewType, effectSizes, prismaCounts } = ctx;
  const effectText =
    effectSizes && effectSizes.length
      ? `EFFECT SIZES:\n${effectSizes.map((r) => `- ${r.study}: ${r.effect} (95% CI ${r.ci})`).join("\n")}`
      : "";
  return `You are the Section Writing Agent of PaperOrchestra (google-research/paper-orchestra). Draft the prose for one manuscript section.

TOPIC: ${topic}
REVIEW TYPE: ${reviewType}
SECTION: ${section.number}. ${section.title}
SUBHEADINGS: ${section.subheadings.join("\n")}

LITERATURE SYNTHESIS (from Literature Review Agent — cite only these studies):
${literature}

${effectText}
${prismaCounts ? `PRISMA FLOW: ${prismaCounts.identification} → ${prismaCounts.deduped} → ${prismaCounts.screened} → ${prismaCounts.assessed} → ${prismaCounts.included}` : ""}

RULES:
- Academic tone, precise terminology, one idea per sentence.
- Apply GPS Rhythm: Goal → Problem → Solution.
- Apply Claim-First: first sentence of each paragraph states the message.
- Apply Paragraph Closers: end with a transition to the next paragraph.
- Apply The Nugget: exactly one takeaway per section.
- Apply Ruthless Conciseness: no redundant words.
- Cite inline author-year; every citation maps to the literature synthesis above.
- For meta-analysis reviews, include pooled estimates, I², τ² and a forest-plot description.
- Output Markdown only.

Draft section "${section.title}" now.`;
};

const buildContentRefinementPrompt = (manuscript: string, ctx: PaperOrchestraContext): string => {
  const { topic, reviewType, papers } = ctx;
  const refs = citationList(papers);
  return `You are the Content Refinement Agent of PaperOrchestra (google-research/paper-orchestra). Polish the manuscript draft below through self-correction.

TOPIC: ${topic}
REVIEW TYPE: ${reviewType}

MANUSCRIPT DRAFT:
${manuscript}

AVAILABLE REFERENCES (Vancouver — cite only these):
${refs}

INSTRUCTIONS (apply the paper-orchestra refinement methodology):
1. Recursive consistency: every section echoes the core claim; headings, topic sentences, and conclusions align.
2. Logical chaining: each paragraph sets up the next.
3. Definition order: terms defined before use.
4. Claim-first: each paragraph states its point in the first sentence.
5. One idea per sentence; calibrated confidence (suggests/demonstrates/proves).
6. Negation-contrast: frame limitations as contrast, not failure.
7. Bibliography hygiene: every citation complete and in Vancouver style; references in order of appearance.
8. AI-tell detection: remove generic transitions and overly balanced structures.
9. Self-review checklist: confirm title page, abstract, introduction, methods, results, discussion, conclusion, references all present.
10. Do NOT add or remove studies; keep the existing evidence base.

Output the complete refined manuscript in Markdown only.`;
};

// ---------------------------------------------------------------------------
// Agent runners (each takes an injectable callModel)
// ---------------------------------------------------------------------------

const runOutlineAgent = async (
  callModel: CallModel,
  ctx: PaperOrchestraContext,
  log: PaperOrchestraResult["agentLog"],
): Promise<OrchestraOutline> => {
  log.push({ agent: "Outline Agent", ok: false });
  try {
    const prompt = buildOutlinePrompt(ctx);
    const data = extractJson(await callModel(prompt));
    const outline: OrchestraOutline = {
      topic: data.topic || ctx.topic,
      reviewType: data.reviewType || ctx.reviewType,
      sections: Array.isArray(data.sections) ? data.sections : [],
    };
    log[log.length - 1] = { agent: "Outline Agent", ok: true, detail: `${outline.sections.length} sections` };
    return outline;
  } catch (err: any) {
    log[log.length - 1] = { agent: "Outline Agent", ok: false, detail: err?.message || String(err) };
    return {
      topic: ctx.topic,
      reviewType: ctx.reviewType,
      sections: [
        { key: "introduction", number: 1, title: "Introduction", blurb: "Goal-Problem-Solution framing", subheadings: ["1.1 Background and Context", "1.2 Rationale", "1.3 Objectives"] },
        { key: "methods", number: 2, title: "Methods", blurb: "Search strategy and PRISMA flow", subheadings: ["2.1 Search Strategy", "2.2 PRISMA 2020 Flow"] },
        { key: "results", number: 3, title: "Results", blurb: "Study characteristics and synthesis", subheadings: ["3.1 Study Characteristics", "3.2 Thematic Synthesis"] },
        { key: "discussion", number: 4, title: "Discussion", blurb: "Interpretation and implications", subheadings: ["4.1 Principal Findings", "4.2 Strengths and Limitations"] },
        { key: "conclusion", number: 5, title: "Conclusion", blurb: "Take-home messages", subheadings: [] },
        { key: "references", number: 6, title: "References", blurb: "Vancouver-style list", subheadings: [] },
      ],
    };
  }
};

const runLiteratureReviewAgent = async (
  callModel: CallModel,
  sections: OrchestraSection[],
  ctx: PaperOrchestraContext,
  log: PaperOrchestraResult["agentLog"],
): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const section of sections) {
    if (section.key === "references") continue;
    log.push({ agent: `Literature Review Agent (${section.title})`, ok: false });
    try {
      const prompt = buildLiteratureReviewPrompt(section, ctx);
      out[section.key] = stripFences(await callModel(prompt));
      log[log.length - 1] = { agent: `Literature Review Agent (${section.title})`, ok: true, detail: `${out[section.key].length} chars` };
    } catch (err: any) {
      out[section.key] = `*Section "${section.title}" could not be generated (${err?.message || String(err)}).*`;
      log[log.length - 1] = { agent: `Literature Review Agent (${section.title})`, ok: false, detail: err?.message || String(err) };
    }
  }
  return out;
};

const runSectionWritingAgent = async (
  callModel: CallModel,
  sections: OrchestraSection[],
  literature: Record<string, string>,
  ctx: PaperOrchestraContext,
  log: PaperOrchestraResult["agentLog"],
): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const section of sections) {
    if (section.key === "references") continue;
    log.push({ agent: `Section Writing Agent (${section.title})`, ok: false });
    try {
      const prompt = buildSectionWritingPrompt(section, literature[section.key] || "", ctx);
      out[section.key] = stripFences(await callModel(prompt));
      log[log.length - 1] = { agent: `Section Writing Agent (${section.title})`, ok: true, detail: `${out[section.key].length} chars` };
    } catch (err: any) {
      out[section.key] = literature[section.key] || `*Section "${section.title}" could not be written (${err?.message || String(err)}).*`;
      log[log.length - 1] = { agent: `Section Writing Agent (${section.title})`, ok: false, detail: err?.message || String(err) };
    }
  }
  return out;
};

const runContentRefinementAgent = async (
  callModel: CallModel,
  manuscript: string,
  ctx: PaperOrchestraContext,
  log: PaperOrchestraResult["agentLog"],
): Promise<string> => {
  log.push({ agent: "Content Refinement Agent", ok: false });
  try {
    const text = stripFences(await callModel(buildContentRefinementPrompt(manuscript, ctx)));
    log[log.length - 1] = { agent: "Content Refinement Agent", ok: true, detail: `${text.length} chars` };
    return text || manuscript;
  } catch (err: any) {
    log[log.length - 1] = { agent: "Content Refinement Agent", ok: false, detail: err?.message || String(err) };
    return manuscript;
  }
};

// ---------------------------------------------------------------------------
// Core orchestration (provider-agnostic; caller injects callModel)
// ---------------------------------------------------------------------------

/**
 * Runs the full PaperOrchestra pipeline: outline → literature review → section
 * writing → content refinement. Returns the manuscript plus per-section output
 * and an agent log. The first 5 literature-review sections (introduction,
 * global/Indian situations, gaps, future advice, summary) are produced as
 * individual sections when `ctx.literatureSections` keys are supplied.
 */
export const orchestratePaperOrchestra = async (
  callModel: CallModel,
  ctx: PaperOrchestraContext,
  options?: AICallOptions,
): Promise<PaperOrchestraResult> => {
  const log: PaperOrchestraResult["agentLog"] = [];
  const citations = [...ctx.papers];

  // 1. Outline Agent
  const outline = await runOutlineAgent(callModel, ctx, log);

  // 2. Literature Review Agent — per-section synthesis
  const literature = await runLiteratureReviewAgent(callModel, outline.sections, ctx, log);

  // Merge caller-supplied literature section drafts (main pipeline Step 4 first 5 sections)
  const literatureSections: Record<string, string> = { ...literature };
  if (ctx.literatureSections) {
    for (const key of ["introduction", "globalIndian", "gaps", "futureAdvice", "summary"] as const) {
      if (ctx.literatureSections[key]) literatureSections[key] = ctx.literatureSections[key];
    }
  }

  // 3. Section Writing Agent — write each section
  const sections = await runSectionWritingAgent(callModel, outline.sections, literatureSections, ctx, log);

  // 4. Assemble manuscript in section order
  const ordered = [...outline.sections].sort((a, b) => a.number - b.number);
  let manuscript = `# ${ctx.reviewType}: ${ctx.topic}\n\n`;
  manuscript += `**Drafting engine:** PaperOrchestra (google-research/paper-orchestra)\n`;
  manuscript += `**Topic:** ${ctx.topic}\n**Date:** ${new Date().toISOString().split("T")[0]}\n\n---\n\n`;
  for (const section of ordered) {
    if (section.key === "references") continue;
    manuscript += `## ${section.number}. ${section.title}\n\n`;
    manuscript += `${sections[section.key] || literatureSections[section.key] || "*Section not generated.*"}\n\n---\n\n`;
  }
  manuscript += `## References\n\n${citationList(citations)}\n\n`;
  manuscript += `---
\n*Manuscript drafted using PaperOrchestra methodology (google-research/paper-orchestra), aligned with PRISMA 2020 and Vancouver citation style.*\n`;

  // 5. Content Refinement Agent — polish
  const refined = await runContentRefinementAgent(callModel, manuscript, ctx, log);

  return {
    outline,
    literatureSections,
    manuscript: refined,
    citations,
    agentLog: log,
  };
};

// ---------------------------------------------------------------------------
// Client convenience wrapper (uses the app's existing wired AI API → /api/chat)
// ---------------------------------------------------------------------------

/**
 * Client-side entry point. Delegates to callAiWithFallback which posts to the
 * app's existing /api/chat API route (gemini → groq → local model fallback).
 */
export const runPaperOrchestraPipeline = async (
  apiKey: string | undefined,
  provider: AiProviderName | undefined,
  ctx: PaperOrchestraContext,
  options?: AICallOptions,
): Promise<PaperOrchestraResult> => {
  const { callAiWithFallback } = await import("./ai");
  const keys: { gemini?: string; groq?: string } = {};
  if (apiKey && provider && provider !== "local") keys[provider as "gemini" | "groq"] = apiKey;
  const callModel: CallModel = (prompt) =>
    callAiWithFallback(prompt, options, {
      order: provider ? ([provider] as AiProviderName[]) : undefined,
      keys,
    });
  return orchestratePaperOrchestra(callModel, ctx, options);
};

/**
 * Lightweight per-section generator for the main pipeline's Review of Literature
 * (Step 4), producing each of the first 5 sections individually using the
 * PaperOrchestra section-writing agent.
 */
export const generateLiteratureReviewSections = async (
  apiKey: string | undefined,
  provider: AiProviderName | undefined,
  ctx: PaperOrchestraContext,
  options?: AICallOptions,
): Promise<Record<string, string>> => {
  const { callAiWithFallback } = await import("./ai");
  const keys: { gemini?: string; groq?: string } = {};
  if (apiKey && provider && provider !== "local") keys[provider as "gemini" | "groq"] = apiKey;
  const callModel: CallModel = (prompt) =>
    callAiWithFallback(prompt, options, {
      order: provider ? ([provider] as AiProviderName[]) : undefined,
      keys,
    });
  const log: PaperOrchestraResult["agentLog"] = [];
  const outline = await runOutlineAgent(callModel, ctx, log);
  const literature = await runLiteratureReviewAgent(callModel, outline.sections, ctx, log);
  const sections = await runSectionWritingAgent(callModel, outline.sections, literature, ctx, log);

  const litSections: Record<string, string> = {};
  const map: Record<string, string> = {
    introduction: "introduction",
    globalIndian: "globalIndian",
    gaps: "gaps",
    futureAdvice: "futureAdvice",
    summary: "summary",
  };
  for (const [key, outlineKey] of Object.entries(map)) {
    const section = outline.sections.find((s) => s.key === outlineKey);
    litSections[key] = section ? (sections[section.key] || literature[section.key] || "") : "";
  }
  return litSections;
};
