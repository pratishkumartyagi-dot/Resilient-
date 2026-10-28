import type {
  ThesisGeneratorConfig,
  ThesisPipelineResult,
  ThesisOutline,
  ThesisPaper,
  ChapterFile,
  ThesisStageSubResult,
} from "@/lib/thesis-types";
import { LEVEL_WORD_RANGES } from "@/lib/thesis-types";
import { openDraft } from "@/lib/opendraft";
import { generateThesis } from "@/lib/thesis-generator";
import { scholarCopilot } from "@/lib/scholar-copilot";
import { formatReferenceListByStyle } from "@/lib/references";
import { appraiseEvidenceBase, buildEvidenceAppraisalMarkdown, buildNursestackThesisPlan, applyNursestackPlanToOutline, wordTargetsFromPlan } from "@/lib/thesis-nursestack";

export interface PipelineDeps {
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  searchFn?: (query: string, opts?: { yearFrom?: number; yearTo?: number; studyDesign?: string }) => Promise<ThesisPaper[]>;
  /** Pre-selected papers from the research pipeline (Step 1/2) used as the
   * grounding corpus for deep reasoning + chapter expansion. */
  groundingPapers?: ThesisPaper[];
  onProgress?: (stage: string, message: string) => void;
}

export async function runThesisPipeline(
  config: ThesisGeneratorConfig,
  deps: PipelineDeps,
): Promise<ThesisPipelineResult> {
  const { aiFn, searchFn, onProgress } = deps;
  const start = Date.now();

  const subResults: Record<string, ThesisStageSubResult> = {
    outline: { ok: false },
    reasoning: { ok: false },
    prose: { ok: false },
    refine: { ok: false },
    appraise: { ok: false },
  };

  // Stage 0: NurseStack plan (methodology fit, PICO, chapter structure, appraisal plan)
  onProgress?.("outline", "Building the NurseStack thesis plan...");
  const nursestackPlan = buildNursestackThesisPlan({
    topic: config.topic,
    level: config.level,
    targetWordCount: config.targetWordCount || 15000,
    studyDesign: config.studyDesign,
    databases: [],
    yearFrom: config.yearFrom,
    yearTo: config.yearTo,
  });
  subResults.outline = { ok: false };

  // Stage 1: Outline
  onProgress?.("outline", "Generating thesis outline...");
  const outlineResult = await openDraft({
    topic: config.topic,
    level: config.level,
    style: config.style,
    language: config.language,
    targetWordCount: config.targetWordCount,
    minWordCount: config.minWordCount,
    maxWordCount: config.maxWordCount,
    papers: [],
    aiFn: (p) => aiFn(p),
  });
  subResults.outline = outlineResult.subResult;
  const outline: ThesisOutline = outlineResult.outline;

  // The NurseStack plan owns the chapter structure and the word budget: the
  // OpenDraft outline is aligned to it so every chapter is written to the
  // number of words the plan allocates.
  outline.chapters = applyNursestackPlanToOutline(outline, nursestackPlan);
  const wordTargets = wordTargetsFromPlan(nursestackPlan);
  onProgress?.(
    "outline",
    `Outline ready: ${outline.chapters.length} chapters, ${Object.values(wordTargets).reduce((a, b) => a + b, 0).toLocaleString()} words planned`
  );

  // ------------------------------------------------------------------
  // Stage 1b: Deep reasoning over the selected papers (open-notebook style)
  // Synthesize the grounding corpus into per-chapter evidence notes so chapter
  // prose is built on deep reasoning across the selected papers, not just a
  // reference list.
  // ------------------------------------------------------------------
  const groundingPapers: ThesisPaper[] = (deps.groundingPapers || []).slice(0, config.maxReferences || 150);
  let chapterEvidence: Record<number, string> = {};
  if (groundingPapers.length > 0) {
    onProgress?.("reasoning", "Deep reasoning over selected papers (open-notebook synthesis)...");
    try {
      const synthesisPrompt = `You are a research synthesizer. Given the thesis topic and the selected papers below, produce a concise per-chapter evidence synthesis: for each chapter, list the key findings, methods, and citations (Author Year) that support it.

TOPIC: ${config.topic}
LEVEL: ${config.level}
CHAPTERS: ${outline.chapters.map((c) => `${c.number}. ${c.title}`).join("; ")}

SELECTED PAPERS:
${groundingPapers.map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Return ONLY a JSON object mapping chapter number to an evidence summary string:
{
  "1": "evidence summary for chapter 1 ...",
  "2": "evidence summary for chapter 2 ..."
}`;
      const text = await aiFn(synthesisPrompt);
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed: any = {};
      try { parsed = JSON.parse(cleaned); } catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) try { parsed = JSON.parse(m[0]); } catch { parsed = {}; }
      }
      chapterEvidence = parsed || {};
      subResults.reasoning = { ok: true, data: { papers: groundingPapers.length } };
    } catch (err: any) {
      subResults.reasoning = { ok: false, error: err?.message || "Deep reasoning failed" };
    }
    onProgress?.("reasoning", `Deep reasoning complete: ${groundingPapers.length} papers synthesized across ${outline.chapters.length} chapters`);
  } else {
    subResults.reasoning = { ok: false, error: "No grounding papers available" };
  }

  // Stage 2: Prose (ground each chapter in the deep-reasoned evidence)
  onProgress?.("prose", "Searching databases for grounding papers...");
  let papers: ThesisPaper[] = groundingPapers;
  if (searchFn && groundingPapers.length === 0) {
    try {
      papers = await searchFn(config.topic, {
        yearFrom: config.yearFrom,
        yearTo: config.yearTo,
        studyDesign: config.studyDesign,
      });
    } catch {
      papers = [];
    }
  }

  onProgress?.("prose", `Generating prose for ${outline.chapters.length} chapters...`);
  const proseResult = await generateThesis({
    outline,
    papers,
    chapterEvidence,
    config: {
      topic: config.topic,
      level: config.level,
      style: config.style,
      language: config.language,
      studyDesign: config.studyDesign,
      targetWordCount: config.targetWordCount,
      maxReferences: config.maxReferences,
    },
    aiFn,
    onProgress: (msg) => onProgress?.("prose", msg),
  });
  subResults.prose = proseResult.subResult;
  let chapters: ChapterFile[] = proseResult.chapters;

  // Stage 3: Refine / citation validation
  onProgress?.("refine", "Refining chapters and validating citations...");
  const refineResult = await scholarCopilot({
    chapters,
    papers,
    config: { topic: config.topic, level: config.level, style: config.style },
    wordTargets,
    aiFn,
    onProgress: (msg) => onProgress?.("refine", msg),
  });
  subResults.refine = refineResult.subResult;
  chapters = refineResult.chapters;
  let fullThesis = refineResult.fullThesis;

  // Stage 4: CASP appraisal of the evidence base (NurseStack /review-evidence)
  onProgress?.("appraise", "Appraising the evidence base with CASP...");
  let evidenceAppraisal: ReturnType<typeof appraiseEvidenceBase> = [];
  let evidenceAppraisalMarkdown = "";
  try {
    evidenceAppraisal = appraiseEvidenceBase(papers);
    evidenceAppraisalMarkdown = buildEvidenceAppraisalMarkdown(evidenceAppraisal);
    subResults.appraise = { ok: true, data: { studies: evidenceAppraisal.length } };
  } catch (err: any) {
    subResults.appraise = { ok: false, error: err?.message || "Evidence appraisal failed" };
  }

  // The CASP appraisal of the evidence base is part of the written thesis.
  if (evidenceAppraisalMarkdown) {
    fullThesis = `${fullThesis}\n\n---\n\n${evidenceAppraisalMarkdown}`;
  }

  // Build references (Vancouver) from grounding papers
  const references = papers.slice(0, config.maxReferences || 150);
  const markdownOutline = outlineResult.markdownOutline;

  // Append a numbered references section to the end of the thesis so the
  // reference list (serial no. 1 onward, Vancouver style) is part of the
  // document, not only a side panel.
  let referencesSection = "";
  if (references.length > 0) {
    const refsMarkdown = formatReferenceListByStyle(config.style, references.map((p) => ({
      authors: p.authors,
      title: p.title,
      journal: p.journal,
      year: p.year,
      doi: p.doi,
    })));
    referencesSection = `\n\n---\n\n## References\n\n${refsMarkdown}`;
  }

  const stats: any = {
    totalWords: (fullThesis + referencesSection).split(/\s+/).filter(Boolean).length,
    totalReferences: references.length,
    totalChapters: chapters.length,
    generationTimeMs: Date.now() - start,
  };

  const stages = {
    outline: subResults.outline.ok,
    prose: subResults.prose.ok,
    refine: subResults.refine.ok,
    appraise: subResults.appraise.ok,
    complete: subResults.outline.ok && subResults.prose.ok && subResults.refine.ok,
  };

  return {
    outline,
    fullThesis: `${fullThesis}${referencesSection}`,
    markdownOutline,
    chapters,
    references,
    papers,
    stats,
    stages,
    subResults: {
      outline: subResults.outline,
      prose: subResults.prose,
      refine: subResults.refine,
      appraise: subResults.appraise,
    },
    nursestackPlan,
    wordBudget: refineResult.wordBudget,
    wordBudgetMet: refineResult.wordBudgetMet,
    evidenceAppraisal,
    evidenceAppraisalMarkdown,
  };
}

export function buildDefaultConfig(partial: Partial<ThesisGeneratorConfig>): ThesisGeneratorConfig {
  const level = partial.level || "master";
  const range = LEVEL_WORD_RANGES[level as keyof typeof LEVEL_WORD_RANGES] ?? LEVEL_WORD_RANGES.master;
  const targetWordCount = partial.targetWordCount ?? Math.round((range.min + range.max) / 2);
  const minWordCount = partial.minWordCount ?? range.min;
  const maxWordCount = partial.maxWordCount ?? range.max;

  return {
    topic: partial.topic || "",
    level,
    style: partial.style || "vancouver",
    language: partial.language || "en",
    author: partial.author,
    institution: partial.institution,
    apiKey: partial.apiKey || "",
    provider: partial.provider || "gemini",
    yearFrom: partial.yearFrom,
    yearTo: partial.yearTo,
    studyDesign: partial.studyDesign || "other",
    targetWordCount,
    minWordCount,
    maxWordCount,
    maxReferences: partial.maxReferences ?? 150,
    onProgress: partial.onProgress,
    aiFn: partial.aiFn!,
  };
}
