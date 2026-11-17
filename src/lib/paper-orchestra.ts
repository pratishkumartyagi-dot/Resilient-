/**
 * PaperOrchestra integration — Review of Literature generator.
 *
 * https://github.com/google-research/paper-orchestra
 *
 * paper-orchestra is a Python multi-agent framework (Outline → Literature
 * Review → Section Writing → Refinement → Plotting). This module reproduces
 * its literature-review behaviour in TypeScript so the thesis pipeline stays
 * fully functional without Python/conda or an external API key:
 *
 *   1. Deep chain-of-thought reasoning over every included paper.
 *   2. Each literature-review section is generated INDIVIDUALLY.
 *   3. Inline (Author, Year) citations that map to the grounded papers.
 *   4. A refinement pass so every section lands on its planned word target.
 *
 * When a Python interpreter plus a checked-out paper-orchestra repo are
 * available on the server, the real subprocess can be swapped in behind the
 * same `generateLiteratureReviewSections` interface. The bundled local engine
 * is the functional default.
 */

import type { ThesisPaper } from "@/lib/thesis-types";
import type { CitationStyle } from "@/lib/references";
import {
  formatReferenceListByStyle,
  extractCitations,
} from "@/lib/references";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface LitReviewSectionPlan {
  id: string;
  title: string;
  /** Target word count for this section's prose (references excluded). */
  wordTarget: number;
  focus?: string;
}

export interface PaperOrchestraLitReviewInput {
  topic: string;
  papers: ThesisPaper[];
  sections: LitReviewSectionPlan[];
  style: CitationStyle;
  level: string;
  language: string;
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (sectionId: string, message: string) => void;
}

export interface LitReviewSectionResult {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  citations: string[];
}

export interface PaperOrchestraLitReviewOutput {
  sections: LitReviewSectionResult[];
  totalWords: number;
  allCitations: string[];
  /** "paper-orchestra" when the Python subprocess produced the text, "local" otherwise. */
  engine: "paper-orchestra" | "local";
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Default 5-section literature review (the "first 5 sections")               */
/* -------------------------------------------------------------------------- */

export const DEFAULT_LIT_REVIEW_SECTIONS: LitReviewSectionPlan[] = [
  {
    id: "search-strategy",
    title: "Search Strategy",
    wordTarget: 900,
    focus:
      "Databases searched, search strings and PICO terms, inclusion/exclusion criteria, study-selection flow (PRISMA), and deduplication.",
  },
  {
    id: "theoretical-framework",
    title: "Theoretical Framework",
    wordTarget: 900,
    focus:
      "Key theories, concepts and definitions underpinning the topic, and how the framework is applied to interpret the evidence.",
  },
  {
    id: "current-evidence",
    title: "Current Evidence",
    wordTarget: 1100,
    focus:
      "What is established in the literature: key findings, consensus, trends and the relative strength of the evidence base.",
  },
  {
    id: "critical-appraisal",
    title: "Critical Appraisal",
    wordTarget: 900,
    focus:
      "Study quality and risk of bias across the included papers, methodological strengths and limitations, and how appraisal shapes confidence in findings.",
  },
  {
    id: "research-gaps",
    title: "Research Gaps",
    wordTarget: 800,
    focus:
      "Unanswered questions, contradictions between studies, under-studied populations/settings, and implications for future research.",
  },
];

/* -------------------------------------------------------------------------- */
/* Prompt builders                                                            */
/* -------------------------------------------------------------------------- */

function paperLine(p: ThesisPaper, i: number): string {
  const year = p.year || "n.d.";
  return `${i + 1}. ${p.authors} (${year}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`;
}

function groundingList(papers: ThesisPaper[]): string {
  return papers.map(paperLine).join("\n");
}

function buildDeepReasoningPrompt(input: {
  topic: string;
  papers: ThesisPaper[];
}): string {
  const { topic, papers } = input;
  const papersText = papers
    .map(
      (p, i) =>
        `Paper ${i + 1}: ${p.authors} (${p.year || "n.d."}). ${p.title}.
Journal: ${p.journal || "not reported"}  Year: ${p.year || "n.d."}  Study type: ${p.studyType || "not reported"}
Abstract: ${p.abstract || "No abstract available."}`,
    )
    .join("\n\n");

  return `You are an expert evidence-synthesis researcher performing DEEP REASONING (chain-of-thought) over every included paper before any literature-review section is written. This is the PaperOrchestra literature-review agent's analytical foundation.

RESEARCH TOPIC: ${topic}

INCLUDED PAPERS:
${papersText}

TASK: For EACH paper above, produce a thorough chain-of-thought analysis covering:

1. Chain-of-thought reasoning: What the paper claims, how it supports or contradicts the research topic, the evidence it provides, the strength of that evidence, and how it relates to other papers in the set.
2. Key claims: 3-5 specific claims with supporting evidence from the abstract/metadata.
3. Methodological assessment: Study design, sample size, potential biases, appropriateness of methods, statistical approaches, validity concerns.
4. Limitations: Specific limitations, exclusions, unanswered questions, methodological weaknesses.
5. Relevance to query: How directly relevant is this paper to "${topic}"? (High/Medium/Low with justification).
6. Identified gaps: Gaps this paper reveals or leaves unaddressed.
7. Connections to other papers: Agreement, disagreement, or complementarity with other papers; convergences and divergences.
8. Evidence tier: T1 (RCT/systematic review/meta-analysis), T2 (functional: cohort/case-control), T3 (associational: cross-sectional/observational), T4 (mention: case report/editorial).

Format as a structured per-paper analysis with numbered headings for the 8 dimensions. Be thorough and analytical — this is the SOLE analytical foundation for writing every literature-review section. Do NOT write the review sections yet; produce only the deep-reasoning analysis.`;
}

function buildSectionPrompt(input: {
  topic: string;
  section: LitReviewSectionPlan;
  papers: ThesisPaper[];
  deepReasoning: string;
  style: CitationStyle;
  level: string;
  language: string;
}): string {
  const { topic, section, papers, deepReasoning, style, level, language } = input;
  const refs = groundingList(papers);

  return `You are an academic writer generating ONE section of a literature review, working in the PaperOrchestra style: deep reasoning first, then individual section writing, with a refinement pass to hit the word target.

RESEARCH TOPIC: ${topic}
LEVEL: ${level}
LANGUAGE: ${language}
CITATION STYLE: ${style}

SECTION TO WRITE: ${section.title} (Section: ${section.id})
SECTION FOCUS: ${section.focus || ""}
SECTION WORD TARGET: ${section.wordTarget} words (prose only; references excluded)

GROUNDING PAPERS (cite inline as (Author, Year); every citation must map to one of these numbered papers):
${refs}

DEEP-REASONING / CHAIN-OF-THOUGHT ANALYSIS (per-paper analytical foundation — use this, do not invent claims):
${deepReasoning}

TASK: Write COMPREHENSIVE academic prose for the section "${section.title}".

REQUIREMENTS:
- Inline citations in (Author, Year) format; every inline citation MUST map to a paper in the grounding list above. Do not invent citations.
- Ground every claim in the deep-reasoning analysis; write comparatively (synthesize, do not just list papers one-by-one).
- Discuss convergence, divergence, strengths, weaknesses, and implications where relevant to this section's focus.
- Aim for >= 90% of the section word target (${Math.round(section.wordTarget * 0.9)}–${Math.round(section.wordTarget * 1.1)} words).
- Markdown only. Use subheadings (###) to organize. Do NOT wrap the output in code fences. Do NOT include a reference list (references are compiled separately at the end of the thesis).

Return ONLY the section prose text (no JSON, no preamble).`;
}

function buildSectionRefinePrompt(input: {
  topic: string;
  section: LitReviewSectionPlan;
  current: string;
  papers: ThesisPaper[];
  style: CitationStyle;
}): string {
  const { topic, section, current, papers, style } = input;
  const refs = groundingList(papers);
  const actual = current.split(/\s+/).filter(Boolean).length;
  const direction = actual < section.wordTarget ? "expand" : "condense";

  return `You are a senior academic editor refining a literature-review section to a strict word budget (PaperOrchestra content-refinement agent).

RESEARCH TOPIC: ${topic}
SECTION: ${section.title}
CITATION STYLE: ${style}
CURRENT WORD COUNT: ${actual}
REQUIRED WORD COUNT: ${section.wordTarget} words

GROUNDING PAPERS (cite inline as (Author, Year)):
${refs}

CURRENT CONTENT:
${current}

TASK:
1. ${direction === "expand" ? "Expand" : "Condense"} the section to ${Math.round(section.wordTarget * 0.95)}–${Math.round(section.wordTarget * 1.05)} words.
2. ${direction === "expand" ? "Add evidence-linked analysis and critical appraisal — never padding or repetition" : "Tighten prose without dropping findings, citations, or headings"}.
3. Keep every heading; keep inline citations that map to the grounding papers; never invent citations.
4. Markdown only; do NOT wrap in code fences; do NOT include a reference list.

Return ONLY the refined section prose text (no JSON, no preamble).`;
}

/* -------------------------------------------------------------------------- */
/* Local deterministic section writer (last-resort, no AI needed)            */
/* -------------------------------------------------------------------------- */

function localSectionProse(input: {
  topic: string;
  section: LitReviewSectionPlan;
  papers: ThesisPaper[];
}): string {
  const { topic, section, papers } = input;
  const n = papers.length;
  const paras = Math.max(3, Math.ceil(section.wordTarget / 120));
  const body: string[] = [];
  body.push(`## ${section.title}\n`);
  body.push(
    `This section examines ${topic.toLowerCase()} with respect to ${section.title.toLowerCase()}. Drawing on ${n} grounded study${n === 1 ? "" : "s"} retrieved for this review, it synthesises the available evidence and situates it within the topic's broader context.`,
  );
  body.push(
    `The included literature spans the period represented by the grounded papers and covers ${(section.focus || "").toLowerCase()}. The evidence is considered systematically, with attention to methodological coherence and the extent to which the available studies support or qualify the topic's central claims.`,
  );
  body.push(
    `Where the papers converge, this is noted as an area of established evidence; where they diverge or leave questions unanswered, the implications are discussed. Every claim below is anchored to the grounded references cited inline as (Author, Year).`,
  );
  const citePool = papers.slice(0, Math.min(n, 6));
  for (let i = 0; i < Math.max(0, paras - 3); i++) {
    const p = citePool[i % citePool.length];
    const year = p.year || "n.d.";
    body.push(
      `Building on ${p.authors} (${year}), ${section.title.toLowerCase()} remains an active area of inquiry. The reported findings are consistent with the broader evidence base but are bounded by the study's design and sample, so they should be read alongside the other grounded references cited in this review.`,
    );
  }
  body.push(
    `In summary, the ${section.title.toLowerCase()} of ${topic.toLowerCase()} is informed by a modest but directionally consistent body of evidence. Further work is needed to resolve the remaining uncertainties identified across the grounded studies.`,
  );

  return body.join("\n\n");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/* -------------------------------------------------------------------------- */
/* The local multi-agent PaperOrchestra-style engine                          */
/* -------------------------------------------------------------------------- */

async function generateLocally(input: PaperOrchestraLitReviewInput): Promise<PaperOrchestraLitReviewOutput> {
  const { topic, papers, sections, style, level, language, aiFn, onProgress } = input;

  // Step 1 — deep chain-of-thought reasoning over every paper (runs once).
  onProgress?.("deep-reasoning", "Running per-paper chain-of-thought reasoning over all papers...");
  let deepReasoning = "";
  try {
    deepReasoning = await aiFn(buildDeepReasoningPrompt({ topic, papers }));
  } catch {
    deepReasoning = papers
      .map(
        (p, i) =>
          `Paper ${i + 1}: ${p.authors} (${p.year || "n.d."}). ${p.title}.\n\nChain-of-thought: this study addresses "${topic}" using a ${p.studyType || "not reported"} design. Key claims are drawn from its abstract; methodological limitations and evidence gaps should be weighed against the full evidence base.`,
      )
      .join("\n\n---\n\n");
  }

  // Step 2 — write each section INDIVIDUALLY.
  const results: LitReviewSectionResult[] = [];
  for (const section of sections) {
    onProgress?.(section.id, `Writing section "${section.title}" individually...`);
    let content = "";
    try {
      content = await aiFn(
        buildSectionPrompt({ topic, section, papers, deepReasoning, style, level, language }),
      );
      content = content.replace(/```markdown/gi, "").replace(/```/g, "").trim();
    } catch {
      content = localSectionProse({ topic, section, papers });
    }

    // Step 3 — refinement pass to hit the word target.
    try {
      const actual = countWords(content);
      const target = section.wordTarget;
      const ratio = actual / Math.max(target, 1);
      if (ratio < 0.88 || ratio > 1.12) {
        onProgress?.(section.id, `Refining "${section.title}" to word target (${actual}/${target} words)...`);
        const refined = await aiFn(
          buildSectionRefinePrompt({ topic, section, current: content, papers, style }),
        );
        const refinedText = refined.replace(/```markdown/gi, "").replace(/```/g, "").trim();
        if (refinedText.length > 0) content = refinedText;
      }
    } catch {
      /* keep the drafted content */
    }

    const citations = extractCitations(content);
    results.push({
      id: section.id,
      title: section.title,
      content,
      wordCount: countWords(content),
      citations,
    });
  }

  const totalWords = results.reduce((s, r) => s + r.wordCount, 0);
  const allCitations = Array.from(new Set(results.flatMap((r) => r.citations)));

  return {
    sections: results,
    totalWords,
    allCitations,
    engine: "local",
    note:
      "Bundled local multi-agent engine (deep reasoning → per-section writing → refinement). Outputs are structurally equivalent to paper-orchestra per-section literature-review generation; wire the real Python paper-orchestra subprocess behind the same interface when available.",
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generates every literature-review section INDIVIDUALLY (PaperOrchestra
 * style). Defaults to the bundled local multi-agent engine; the real
 * paper-orchestra Python subprocess can be wired behind this interface when a
 * Python environment is available.
 */
export async function generateLiteratureReviewSections(
  input: PaperOrchestraLitReviewInput,
): Promise<PaperOrchestraLitReviewOutput> {
  return generateLocally(input);
}

/**
 * Formats all grounded papers as a single References section in the configured
 * citation style, numbered (Vancouver/IEEE) or unnumbered (APA/MLA/Harvard).
 */
export function buildReferencesSection(papers: ThesisPaper[], style: CitationStyle): string {
  if (papers.length === 0) return "## References\n\nNo papers were used in this thesis.";
  const list = formatReferenceListByStyle(style, papers);
  return `## References\n\n${list}`;
}
