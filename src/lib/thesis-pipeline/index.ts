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
import {
  buildAipochConceptualization,
  alignOutlineToAipochPlan,
  aipochChapterTargets,
  appraiseAipochEvidenceBase,
  buildAipochEvidenceAppraisalMarkdown,
} from "@/lib/aipoch-conceptualization";

function buildVancouverReferencesMarkdown(papers: ThesisPaper[], maxReferences: number): string {
  const list = papers.slice(0, maxReferences);
  if (list.length === 0) {
    return "## References\n\nNo references were retrieved for this thesis.";
  }
  const lines: string[] = ["## References", ""];
  list.forEach((p, i) => {
    const year = p.year ?? "n.d.";
    const authors = p.authors || "Unknown authors";
    const title = p.title || "Untitled";
    const journal = p.journal ? `. <em>${p.journal}</em>` : "";
    const doi = p.doi ? ` doi:${p.doi}` : "";
    const url = p.url ? ` [${p.url}]` : "";
    lines.push(`${i + 1}. ${authors}. ${title}${journal}. ${year}.${doi}${url}.`);
  });
  lines.push("");
  return lines.join("\n");
}

export interface PipelineDeps {
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  searchFn?: (query: string, opts?: { yearFrom?: number; yearTo?: number; studyDesign?: string }) => Promise<ThesisPaper[]>;
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
    prose: { ok: false },
    refine: { ok: false },
    appraise: { ok: false },
  };

  // Phase 1: Conceptualization — AIPoCH (PICO, methodology, chapter structure, appraisal plan)
  onProgress?.("conceptualization", "Building the AIPoCH thesis conceptualization...");
  const aipochPlan = buildAipochConceptualization({
    topic: config.topic,
    level: config.level,
    targetWordCount: config.targetWordCount || 15000,
    studyDesign: config.studyDesign,
    databases: [],
    yearFrom: config.yearFrom,
    yearTo: config.yearTo,
  });
  subResults.outline = { ok: false };

  // Phase 2: Drafting & Assembly — OpenDraft outline, then per-chapter prose
  onProgress?.("outline", "Generating thesis outline (OpenDraft)...");
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
  let outline: ThesisOutline = outlineResult.outline;

  // The AIPoCH plan owns the chapter structure and word budget: align the
  // OpenDraft outline to it so every chapter is written to the allocated words.
  outline.chapters = alignOutlineToAipochPlan(outline, aipochPlan);
  const wordTargets = aipochChapterTargets(aipochPlan);
  onProgress?.(
    "outline",
    `Outline ready: ${outline.chapters.length} chapters, ${Object.values(wordTargets).reduce((a, b) => a + b, 0).toLocaleString()} words planned`
  );

  onProgress?.("prose", "Searching databases for grounding papers...");
  let papers: ThesisPaper[] = [];
  if (searchFn) {
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

  // Phase 3: Academic Refinement — ScholarCopilot (refine + citations + word budget)
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

  // CASP appraisal of the evidence base (part of Phase 3 refinement)
  onProgress?.("appraise", "Appraising the evidence base with CASP...");
  let evidenceAppraisal: ReturnType<typeof appraiseAipochEvidenceBase> = [];
  let evidenceAppraisalMarkdown = "";
  try {
    evidenceAppraisal = appraiseAipochEvidenceBase(papers);
    evidenceAppraisalMarkdown = buildAipochEvidenceAppraisalMarkdown(evidenceAppraisal);
    subResults.appraise = { ok: true, data: { studies: evidenceAppraisal.length } };
  } catch (err: any) {
    subResults.appraise = { ok: false, error: err?.message || "Evidence appraisal failed" };
  }

  if (evidenceAppraisalMarkdown) {
    fullThesis = `${fullThesis}\n\n---\n\n${evidenceAppraisalMarkdown}`;
  }

  // Append a complete Vancouver-style reference list (with DOI) so every
  // reference used in the thesis is shown — no hallucinated references.
  const references = papers.slice(0, config.maxReferences || 150);
  const vancouverReferences = buildVancouverReferencesMarkdown(papers, config.maxReferences || 150);
  if (vancouverReferences.trim()) {
    fullThesis = `${fullThesis}\n\n---\n\n${vancouverReferences}`;
  }

  const markdownOutline = outlineResult.markdownOutline;

  const stats: any = {
    totalWords: fullThesis.split(/\s+/).filter(Boolean).length,
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
    fullThesis,
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
    aipochConceptualization: aipochPlan,
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
