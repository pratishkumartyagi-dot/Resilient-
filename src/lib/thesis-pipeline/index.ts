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
import { scholarCopilot } from "@/lib/scholar-copilot";
import { generateChapterWithMedicalSkills } from "@/lib/medical-research-skills";
import { formatVancouverList } from "@/lib/references";
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

  // Stage 1: Outline with ScholarCopilot/OpenDraft
  onProgress?.("outline", "Generating thesis outline with ScholarCopilot...");
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

  // The NurseStack plan owns the chapter structure and the word budget
  outline.chapters = applyNursestackPlanToOutline(outline, nursestackPlan);
  const wordTargets = wordTargetsFromPlan(nursestackPlan);
  onProgress?.(
    "outline",
    `Outline ready: ${outline.chapters.length} chapters, ${Object.values(wordTargets).reduce((a, b) => a + b, 0).toLocaleString()} words planned`
  );

  // Stage 2: Prose with medical-research-skills
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

  onProgress?.("prose", `Generating prose for ${outline.chapters.length} chapters with medical-research-skills...`);
  const chapters: ChapterFile[] = [];
  for (let i = 0; i < outline.chapters.length; i++) {
    const ch = outline.chapters[i];
    const wordTarget = wordTargets[i + 1] || ch.wordTarget;
    try {
      const res = await generateChapterWithMedicalSkills({
        chapter: { ...ch, wordTarget },
        papers,
        config: {
          topic: config.topic,
          level: config.level,
          style: config.style,
          language: config.language,
          studyDesign: config.studyDesign,
          targetWordCount: config.targetWordCount,
        },
        aiFn,
        onProgress: (msg) => onProgress?.("prose", `Chapter ${i + 1}/${outline.chapters.length}: ${msg}`),
      });
      chapters.push(res.chapter);
    } catch (err: any) {
      onProgress?.("prose", `Chapter ${i + 1}/${outline.chapters.length}: fallback generation failed`);
      chapters.push({
        chapterNumber: ch.number || i + 1,
        chapterTitle: ch.title,
        content: `# ${ch.title}\n\n[Content generation encountered an issue for this chapter.]`,
        sections: ch.sections || [],
        wordCount: 0,
        citations: [],
        argumentAudit: { claims: [], evidenceGaps: [], logicalFlowScore: 0, citationCoverage: 0, recommendations: [] },
      });
    }
  }
  subResults.prose = { ok: true };

  // Stage 3: Refine/expand with OpenDraft/ScholarCopilot
  onProgress?.("refine", "Refining and expanding chapters with ScholarCopilot...");
  const refineResult = await scholarCopilot({
    chapters,
    papers,
    config: { topic: config.topic, level: config.level, style: config.style },
    wordTargets,
    aiFn,
    onProgress: (msg) => onProgress?.("refine", msg),
  });
  subResults.refine = refineResult.subResult;
  let refinedChapters = refineResult.chapters;
  let fullThesis = refineResult.fullThesis;

  // Stage 4: CASP appraisal
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

  if (evidenceAppraisalMarkdown) {
    fullThesis = `${fullThesis}\n\n---\n\n${evidenceAppraisalMarkdown}`;
  }

  // References at the end as per citation style (no hallucination - only from papers)
  const references = papers.slice(0, config.maxReferences || 150);
  let referencesSection = "";
  try {
    const formatted = formatVancouverList(references);
    const referencesList = Array.isArray(formatted) ? formatted.map((r: any) => (typeof r === "string" ? r : r.text)).filter(Boolean) : [];
    if (referencesList.length > 0) {
      referencesSection = `\n\n## References\n\n${referencesList.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n\n")}`;
    }
  } catch {
    referencesSection = "";
  }
  fullThesis = `${fullThesis}${referencesSection}`;

  const markdownOutline = outlineResult.markdownOutline;

  const stats = {
    totalWords: fullThesis.split(/\s+/).filter(Boolean).length,
    totalReferences: references.length,
    totalChapters: refinedChapters.length,
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
