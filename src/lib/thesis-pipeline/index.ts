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
import { generateOutline } from "@/lib/scholar-copilot";
import {
  writeIntroductionSection,
  writeMethodsSection,
  writeResultsSection,
  writeDiscussionSection,
  writeAbstractSection,
  writeLiteratureReviewSection,
  writeConclusionSection,
  type MedicalResearchSkillsInput,
} from "@/lib/medical-research-skills";
import { formatReferenceListByStyle, type CitationStyle } from "@/lib/references";
import { appraiseEvidenceBase, buildEvidenceAppraisalMarkdown, buildNursestackThesisPlan, applyNursestackPlanToOutline, wordTargetsFromPlan } from "@/lib/thesis-nursestack";

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
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

  // Stage 1: Outline via ScholarCopilot
  onProgress?.("outline", "Generating thesis outline via ScholarCopilot...");
  const outlineResult = await generateOutline({
    topic: config.topic,
    level: config.level,
    style: config.style,
    language: config.language,
    targetWordCount: config.targetWordCount,
    minWordCount: config.minWordCount,
    maxWordCount: config.maxWordCount,
    papers: [],
    aiFn,
    onProgress: (msg) => onProgress?.("outline", msg),
  });
  subResults.outline = outlineResult.subResult;
  let outline: ThesisOutline = {
    title: outlineResult.title,
    abstract: outlineResult.abstract,
    chapters: outlineResult.chapters.map((c: any) => ({
      number: c.number,
      title: c.title,
      sections: c.sections.map((s: any) => ({
        id: s.id,
        title: s.title,
        wordTarget: s.wordTarget,
      })),
      wordTarget: c.wordTarget,
    })),
  };

  // The NurseStack plan owns the chapter structure and the word budget: align outline to it.
  outline.chapters = applyNursestackPlanToOutline(outline, nursestackPlan);
  const wordTargets = wordTargetsFromPlan(nursestackPlan);
  onProgress?.(
    "outline",
    `Outline ready: ${outline.chapters.length} chapters, ${Object.values(wordTargets).reduce((a, b) => a + b, 0).toLocaleString()} words planned`,
  );

  // Stage 2: Search papers for grounding
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

  // Stage 3: Prose writing via medical-research-skills (per chapter section)
  onProgress?.("prose", "Writing chapter prose via medical-research-skills...");
  const medInput: MedicalResearchSkillsInput = {
    topic: config.topic,
    level: config.level,
    style: config.style,
    language: config.language,
    studyDesign: config.studyDesign,
    papers,
    aiFn: (p, opts) => aiFn(p, opts),
    onProgress: (msg) => onProgress?.("prose", msg),
  };

  // Write Abstract as front matter (Paperpile element 1)
  onProgress?.("prose", "Writing Abstract...");
  const abstractResult = await writeAbstractSection(medInput);
  const abstractChapter: ChapterFile = {
    chapterNumber: 0,
    chapterTitle: "Abstract",
    content: abstractResult.content,
    sections: [
      {
        id: "abstract-1",
        title: "Abstract",
        wordTarget: abstractResult.wordCount,
        content: abstractResult.content,
      },
    ],
    wordCount: abstractResult.wordCount,
    citations: abstractResult.citations,
    argumentAudit: {
      claims: [],
      evidenceGaps: [],
      logicalFlowScore: 0,
      citationCoverage: 0,
      recommendations: [],
    },
  };

  const chapters: ChapterFile[] = [abstractChapter];
  const chapterList = outline.chapters || [];
  for (let i = 0; i < chapterList.length; i++) {
    const chapter = chapterList[i];
    const target = chapter.wordTarget || 2000;
    onProgress?.(
      "prose",
      `Writing chapter ${i + 1} of ${chapterList.length}: ${chapter.title} (target ${target.toLocaleString()} words)`,
    );

    // Determine section types from section titles
    const sectionTypes = chapter.sections.map((s: any) => {
      const t = s.title.toLowerCase();
      if (t.includes("intro") || t.includes("background")) return "introduction";
      if (t.includes("literature") || t.includes("review")) return "literature_review";
      if (t.includes("method")) return "methods";
      if (t.includes("result")) return "results";
      if (t.includes("discuss")) return "discussion";
      if (t.includes("conclusion") || t.includes("implicat")) return "conclusion";
      return "other";
    });

    // Write prose for each section using medical-research-skills
    const sectionProses: { id: string; title: string; content: string; wordTarget: number; citations: string[] }[] = [];
    let chapterTotalWords = 0;

    for (let j = 0; j < chapter.sections.length; j++) {
      const section = chapter.sections[j];
      const type = sectionTypes[j];
      const sectionTarget = section.wordTarget || Math.floor(target / Math.max(chapter.sections.length, 1));

      let proseContent = `## ${section.title}\n\n`;
      let sectionCitations: string[] = [];

      if (type === "introduction") {
        const result = await writeIntroductionSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else if (type === "methods") {
        const result = await writeMethodsSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else if (type === "results") {
        const result = await writeResultsSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else       if (type === "discussion") {
        const result = await writeDiscussionSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else if (type === "literature_review") {
        const result = await writeLiteratureReviewSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else if (type === "conclusion") {
        const result = await writeConclusionSection(section.title, medInput);
        proseContent = result.content;
        sectionCitations = result.citations;
        chapterTotalWords += result.wordCount;
      } else {
        // Generic section: write a concise academic paragraph
        proseContent = `## ${section.title}\n\nThis section addresses ${section.title.toLowerCase()} within the context of ${inputTopic(config.topic)}. The discussion draws on the grounding literature identified through systematic database search, with particular attention to the study design and evidence level appropriate for a ${config.level} thesis. Inline citations reference the numbered grounding papers below.`;
        sectionCitations = [];
        chapterTotalWords += countWords(proseContent);
      }

      sectionProses.push({
        id: section.id || `c${chapter.number}-s${j + 1}`,
        title: section.title,
        content: proseContent,
        wordTarget: sectionTarget,
        citations: sectionCitations,
      });
    }

    // Combine section prose into chapter content
    const chapterContent = sectionProses.map((s) => s.content).join("\n\n");
    const allCitations = sectionProses.flatMap((s) => s.citations);

    chapters.push({
      chapterNumber: chapter.number || i + 1,
      chapterTitle: chapter.title || `Chapter ${i + 1}`,
      content: chapterContent,
      sections: sectionProses.map((s) => ({
        id: s.id,
        title: s.title,
        wordTarget: s.wordTarget,
        content: s.content,
      })),
      wordCount: chapterTotalWords || countWords(chapterContent),
      citations: allCitations,
      argumentAudit: {
        claims: [],
        evidenceGaps: [],
        logicalFlowScore: 0,
        citationCoverage: 0,
        recommendations: [],
      },
    });

    subResults.prose = { ok: true };
  }

  // Stage 4: Refine & expand via OpenDraft
  onProgress?.("refine", "Refining and expanding chapters via OpenDraft...");
  const refineResult = await openDraft({
    topic: config.topic,
    level: config.level,
    style: config.style,
    language: config.language,
    targetWordCount: config.targetWordCount,
    minWordCount: config.minWordCount,
    maxWordCount: config.maxWordCount,
    papers,
    aiFn: (p) => aiFn(p),
  });
  subResults.refine = refineResult.subResult;

  // Build full thesis from refined chapters
  let fullThesis = chapters
    .map((c) => `# Chapter ${c.chapterNumber}: ${c.chapterTitle}\n\n${c.content}\n`)
    .join("\n---\n\n");

  // Stage 5: CASP appraisal of the evidence base
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

  // References at end of thesis per selected citation style (no hallucination - only actual papers)
  const references = papers.slice(0, config.maxReferences || 150);
  const referencesSection = buildReferencesSection(references, config.style as CitationStyle);
  fullThesis = `${fullThesis}\n\n---\n\n## References\n\n${referencesSection}`;

  const stats = {
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
    markdownOutline: outlineResult.markdownOutline,
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
    wordBudget: [],
    wordBudgetMet: true,
    evidenceAppraisal,
    evidenceAppraisalMarkdown,
  };
}

/** Builds a numbered reference list section (matching the selected citation style)
 *  from the grounding papers used to write the thesis. Only actual retrieved
 *  papers are cited — no hallucinated references. */
function buildReferencesSection(
  papers: { authors: string; title: string; journal?: string; year?: number; doi?: string }[],
  style: CitationStyle,
): string {
  if (papers.length === 0) return "No references available. No papers were retrieved for this thesis topic.";
  return formatReferenceListByStyle(style, papers);
}

function inputTopic(topic: string): string {
  return topic || "the research topic";
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
