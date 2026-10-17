import type {
  ThesisGeneratorConfig,
  ThesisPipelineResult,
  ThesisOutline,
  ThesisPaper,
  ChapterFile,
  ThesisStageSubResult,
} from "@/lib/thesis-types";
import { openDraft } from "@/lib/opendraft";
import { generateThesis } from "@/lib/thesis-generator";
import { scholarCopilot } from "@/lib/scholar-copilot";
import { humanise } from "@/lib/humaniser";
import { formatVancouverList } from "@/lib/references";

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
    humanise: { ok: false },
  };

  // Stage 1: Outline
  onProgress?.("outline", "Generating thesis outline...");
  const outlineResult = await openDraft({
    topic: config.topic,
    level: config.level,
    style: config.style,
    language: config.language,
    papers: [],
    aiFn: (p) => aiFn(p),
  });
  subResults.outline = outlineResult.subResult;
  const outline: ThesisOutline = outlineResult.outline;
  onProgress?.("outline", `Outline ready: ${outline.chapters.length} chapters`);

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

  // Stage 3: Refine / citation validation
  onProgress?.("refine", "Refining chapters and validating citations...");
  const refineResult = await scholarCopilot({
    chapters,
    papers,
    config: { topic: config.topic, level: config.level, style: config.style },
    aiFn,
    onProgress: (msg) => onProgress?.("refine", msg),
  });
  subResults.refine = refineResult.subResult;
  chapters = refineResult.chapters;
  const fullThesisAfterRefine = refineResult.fullThesis;

  // Stage 4: Humanise
  onProgress?.("humanise", "Applying anti-AI-detection prose rewrite...");
  const humaniseResult = await humanise({
    chapters,
    fullThesis: fullThesisAfterRefine,
    aiFn: (p) => aiFn(p, { searchEnabled: false }),
  });
  subResults.humanise = humaniseResult.subResult;
  chapters = humaniseResult.chapters;
  const fullThesis = humaniseResult.fullThesis;

  // Build references (Vancouver) from grounding papers
  const references = papers.slice(0, config.maxReferences || 150);
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
    humanise: subResults.humanise.ok,
    complete: subResults.outline.ok && subResults.prose.ok && subResults.refine.ok && subResults.humanise.ok,
  };

  return {
    outline,
    fullThesis,
    markdownOutline,
    references,
    papers,
    stats,
    stages,
    subResults: {
      outline: subResults.outline,
      prose: subResults.prose,
      refine: subResults.refine,
      humanise: subResults.humanise,
    },
  };
}

export function buildDefaultConfig(partial: Partial<ThesisGeneratorConfig>): ThesisGeneratorConfig {
  return {
    topic: partial.topic || "",
    level: partial.level || "master",
    style: partial.style || "vancouver",
    language: partial.language || "en",
    author: partial.author,
    institution: partial.institution,
    apiKey: partial.apiKey || "",
    provider: partial.provider || "gemini",
    yearFrom: partial.yearFrom,
    yearTo: partial.yearTo,
    studyDesign: partial.studyDesign || "other",
    targetWordCount: partial.targetWordCount,
    minWordCount: partial.minWordCount,
    maxWordCount: partial.maxWordCount,
    maxReferences: partial.maxReferences ?? 150,
    onProgress: partial.onProgress,
    aiFn: partial.aiFn!,
  };
}
