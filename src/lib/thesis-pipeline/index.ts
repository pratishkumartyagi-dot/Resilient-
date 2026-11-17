import type {
  ThesisGeneratorConfig,
  ThesisPipelineResult,
  ThesisOutline,
  ThesisPaper,
  ChapterFile,
  ThesisStageSubResult,
} from "@/lib/thesis-types";
import { LEVEL_WORD_RANGES } from "@/lib/thesis-types";
import type { CitationStyle } from "@/lib/references";
import { openDraft } from "@/lib/opendraft";
import { generateThesis } from "@/lib/thesis-generator";
import { scholarCopilot } from "@/lib/scholar-copilot";
import { formatVancouverList } from "@/lib/references";
import {
  generateLiteratureReviewSections,
  buildReferencesSection,
  DEFAULT_LIT_REVIEW_SECTIONS,
  type LitReviewSectionPlan,
} from "@/lib/paper-orchestra";
import { appraiseEvidenceBase, buildEvidenceAppraisalMarkdown, buildNursestackThesisPlan, applyNursestackPlanToOutline, wordTargetsFromPlan } from "@/lib/thesis-nursestack";

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
    literatureReview: { ok: false },
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

  // Stage 2: Prose (search papers first for grounding)
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

  // Stage 2b: Literature Review — generated AFTER all papers have been read,
  // with each section produced INDIVIDUALLY (paper-orchestra style) and each
  // section landing on the word target allocated by the NurseStack plan.
  onProgress?.("literatureReview", "Generating literature-review sections individually...");
  const litReviewResult = await (async () => {
    const litIdx = chapters.findIndex((c) => /literature review/i.test(c.chapterTitle));
    if (litIdx < 0) return { ok: true, chapters };
    const litChapter = chapters[litIdx];

    // Section plans come from the NurseStack-aligned outline (generateThesis
    // intentionally stores an empty sections array on each chapter file), so
    // every section carries the word target the plan allocated.
    const litOutlineChapter = outline.chapters.find((c) => /literature review/i.test(c.title));
    const outlineSections = Array.isArray(litOutlineChapter?.sections) ? litOutlineChapter.sections : [];
    const plans: LitReviewSectionPlan[] =
      outlineSections.length > 0
        ? outlineSections.map((s, i) => ({
            id: s.id || `lit-${litChapter.chapterNumber}-${i}`,
            title: s.title || `Section ${i + 1}`,
            wordTarget:
              typeof s.wordTarget === "number" && s.wordTarget > 0
                ? s.wordTarget
                : Math.floor((litChapter.wordCount || 2000) / Math.max(outlineSections.length, 1)),
          }))
        : DEFAULT_LIT_REVIEW_SECTIONS;
    if (plans.length === 0) return { ok: true, chapters };

    const lit = await generateLiteratureReviewSections({
      topic: config.topic,
      papers,
      sections: plans,
      style: config.style as CitationStyle,
      level: config.level,
      language: config.language,
      aiFn,
      onProgress: (_sid, msg) => onProgress?.("literatureReview", msg),
    });

    const litContent = [`# ${litChapter.chapterTitle}`, ...lit.sections.map((s) => `## ${s.title}\n\n${s.content}`)].join("\n\n");
    const litChapterFile: ChapterFile = {
      chapterNumber: litChapter.chapterNumber,
      chapterTitle: litChapter.chapterTitle,
      content: litContent,
      sections: lit.sections.map((s) => ({
        id: s.id,
        title: s.title,
        wordTarget: plans.find((p) => p.id === s.id)?.wordTarget,
        content: s.content,
      })),
      wordCount: lit.totalWords,
      citations: lit.allCitations,
      argumentAudit: litChapter.argumentAudit || {
        claims: [],
        evidenceGaps: [],
        logicalFlowScore: 0,
        citationCoverage: 0,
        recommendations: [],
      },
    };
    const nextChapters = [...chapters];
    nextChapters[litIdx] = litChapterFile;
    return { ok: lit.sections.length > 0, chapters: nextChapters };
  })();
  subResults.literatureReview = { ok: litReviewResult.ok };
  chapters = litReviewResult.chapters;

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

  // References section — appended at the end of the thesis, listing every
  // paper used in thesis generation in the configured citation style.
  const references = papers.slice(0, config.maxReferences || 150);
  const referencesSection = buildReferencesSection(references, config.style as CitationStyle);
  fullThesis = `${fullThesis}\n\n---\n\n${referencesSection}`;

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

  // CASP evidence-appraisal table removed from the written thesis.

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
    literatureReview: subResults.literatureReview.ok,
    refine: subResults.refine.ok,
    appraise: subResults.appraise.ok,
    complete:
      subResults.outline.ok &&
      subResults.prose.ok &&
      subResults.literatureReview.ok &&
      subResults.refine.ok,
  };

  return {
    outline,
    fullThesis,
    markdownOutline,
    chapters,
    references,
    papers,
    referencesSection,
    stats,
    stages,
    subResults: {
      outline: subResults.outline,
      prose: subResults.prose,
      literatureReview: subResults.literatureReview,
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
