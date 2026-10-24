import type { ThesisPaper } from "@/lib/thesis-types";
import {
  buildPicoSkeleton,
  recommendMethodology,
  type MethodologyRecommendation,
  type PicoFramework,
} from "@/lib/nursestack-commands";
import { appraiseEvidenceBase, buildEvidenceAppraisalMarkdown } from "@/lib/thesis-nursestack";

export interface AipochChapterPlan {
  number: number;
  title: string;
  percentage: number;
  wordTarget: number;
  sections: string[];
}

export interface AipochConceptualization {
  topic: string;
  level: string;
  targetWordCount: number;
  researchQuestion: string;
  pico: PicoFramework;
  methodology: MethodologyRecommendation;
  chapters: AipochChapterPlan[];
  searchStrategy: string[];
  appraisalPlan: string[];
  markdown: string;
}

const MEDICAL_UNIVERSITY_CHAPTERS: Array<{ title: string; percentage: number; sections: string[] }> = [
  {
    title: "Introduction",
    percentage: 10,
    sections: [
      "Background and clinical context",
      "Rationale — why this topic matters now",
      "Research question / aim",
      "Objectives",
      "Structure of the thesis",
    ],
  },
  {
    title: "Literature Review",
    percentage: 30,
    sections: [
      "Search strategy and appraisal method (CASP)",
      "Overview of the included literature",
      "Theme 1: clinical / empirical evidence",
      "Theme 2: methodological / contextual evidence",
      "Theme 3: gaps or contradictions",
      "Synthesis and rationale for the current study",
    ],
  },
  {
    title: "Methodology",
    percentage: 20,
    sections: [
      "Research design and justification",
      "Setting and sampling strategy",
      "Data collection method and tool",
      "Data analysis approach",
      "Ethical considerations and governance",
      "Rigour / trustworthiness",
    ],
  },
  {
    title: "Results",
    percentage: 20,
    sections: [
      "Overview of results",
      "Finding / theme 1",
      "Finding / theme 2",
      "Finding / theme 3",
      "Summary of findings",
    ],
  },
  {
    title: "Discussion",
    percentage: 15,
    sections: [
      "How the findings answer the research question",
      "Comparison with the appraised literature",
      "Implications for clinical practice",
      "Implications for policy",
      "Limitations",
      "Recommendations for practice and future research",
    ],
  },
  {
    title: "Conclusion",
    percentage: 5,
    sections: [
      "Summary of key findings",
      "Contribution to medical knowledge",
      "Final clinical statement",
    ],
  },
];

function distributeWords(targetWordCount: number, chapters: Array<{ percentage: number }>): number[] {
  const total = chapters.reduce((a, c) => a + c.percentage, 0);
  const words: number[] = [];
  let remaining = targetWordCount;
  for (let i = 0; i < chapters.length; i++) {
    const w = i === chapters.length - 1 ? remaining : Math.round((chapters[i].percentage / total) * targetWordCount);
    words.push(w);
    remaining -= w;
  }
  return words;
}

function buildMedicalUniversityChapters(topic: string, level: string, targetWordCount: number): AipochChapterPlan[] {
  const targets = distributeWords(targetWordCount, MEDICAL_UNIVERSITY_CHAPTERS);
  return MEDICAL_UNIVERSITY_CHAPTERS.map((chapter, index) => ({
    number: index + 1,
    title: chapter.title,
    percentage: chapter.percentage,
    wordTarget: targets[index],
    sections: chapter.sections,
  }));
}

function buildSearchStrategy(databases: string[], yearFrom?: number, yearTo?: number): string[] {
  return [
    `Databases: ${databases.join(", ") || "PubMed, Europe PMC, Crossref, arXiv, OpenAIRE, Zenodo, ClinicalTrials.gov"}`,
    `Date range: ${yearFrom ?? "no lower limit"} – ${yearTo ?? "present"}`,
    "Search string: (PICO terms) AND (design filter) — record the exact string and hit count per database",
    "Deduplicate on DOI and normalised title; record the PRISMA flow counts",
    "Screen titles and abstracts against inclusion/exclusion criteria; retrieve full texts of eligible records",
  ];
}

function buildAppraisalPlan(methodology: MethodologyRecommendation): string[] {
  return [
    `Appraise every included study with the CASP checklist for its design (${methodology.caspChecklistId.replace("_", " ")})`,
    "Record YES / NO / CAN'T TELL for each CASP item with the evidence quoted from the paper",
    "Do not synthesise a study that was appraised as methodologically poor unless the caveat is stated",
    "Report the certainty of the body of evidence (GRADE-style: risk of bias, inconsistency, indirectness, imprecision)",
    `Report against ${methodology.reportingGuideline}; ethics position: ${methodology.ethicsNote}`,
  ];
}

function buildMarkdown(options: {
  topic: string;
  level: string;
  targetWordCount: number;
  researchQuestion: string;
  pico: PicoFramework;
  methodology: MethodologyRecommendation;
  chapters: AipochChapterPlan[];
  searchStrategy: string[];
  appraisalPlan: string[];
}): string {
  const { topic, level, targetWordCount, researchQuestion, pico, methodology, chapters, searchStrategy, appraisalPlan } = options;
  const lines: string[] = [];
  lines.push(`# AIPoCH thesis conceptualization — ${topic}`);
  lines.push("");
  lines.push(`**Level:** ${level}  •  **Target length:** ${targetWordCount.toLocaleString()} words`);
  lines.push("");
  lines.push("## Phase 1 — Conceptualization (AIPoCH)");
  lines.push("");
  lines.push("### Research question");
  lines.push(researchQuestion);
  lines.push("");
  lines.push("### PICO(S)");
  lines.push(`- Population: ${pico.population}`);
  lines.push(`- Intervention / exposure: ${pico.intervention}`);
  lines.push(`- Comparison: ${pico.comparison}`);
  lines.push(`- Outcome(s): ${pico.outcome}`);
  lines.push(`- Study design: ${pico.studyDesign}`);
  lines.push("");
  lines.push("### Methodology fit");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Question type | ${methodology.questionType} |`);
  lines.push(`| Recommended methodology | ${methodology.methodology} |`);
  lines.push(`| CASP checklist | ${methodology.caspChecklistId.replace("_", " ")} |`);
  lines.push(`| Reporting guideline | ${methodology.reportingGuideline} |`);
  lines.push(`| Ethics | ${methodology.ethicsNote} |`);
  lines.push("");
  lines.push("### Chapter structure (medical university MD/MS)");
  for (const c of chapters) {
    lines.push(`### Chapter ${c.number}: ${c.title} (~${c.wordTarget.toLocaleString()} words, ${c.percentage}%)`);
    for (const s of c.sections) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }
  lines.push("### Search strategy");
  for (const s of searchStrategy) {
    lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("### Critical appraisal plan (CASP)");
  for (const s of appraisalPlan) {
    lines.push(`- ${s}`);
  }
  return lines.join("\n");
}

function buildLocalResearchQuestion(topic: string, studyDesign?: string): string {
  const design = studyDesign || "observational study";
  return `In the population affected by "${topic}", what is the relationship between the intervention/exposure of interest and the measured clinical outcomes, assessed through a ${design} design?`;
}

export function buildAipochConceptualization(options: {
  topic: string;
  level: string;
  targetWordCount: number;
  studyDesign?: string;
  databases: string[];
  yearFrom?: number;
  yearTo?: number;
}): AipochConceptualization {
  const methodology = recommendMethodology(options.topic);
  const pico = buildPicoSkeleton(options.topic, options.studyDesign);
  const chapters = buildMedicalUniversityChapters(options.topic, options.level, options.targetWordCount);
  const researchQuestion = buildLocalResearchQuestion(options.topic, options.studyDesign);
  const searchStrategy = buildSearchStrategy(options.databases, options.yearFrom, options.yearTo);
  const appraisalPlan = buildAppraisalPlan(methodology);
  const markdown = buildMarkdown({
    topic: options.topic,
    level: options.level,
    targetWordCount: options.targetWordCount,
    researchQuestion,
    pico,
    methodology,
    chapters,
    searchStrategy,
    appraisalPlan,
  });

  return {
    topic: options.topic,
    level: options.level,
    targetWordCount: options.targetWordCount,
    researchQuestion,
    pico,
    methodology,
    chapters,
    searchStrategy,
    appraisalPlan,
    markdown,
  };
}

export function aipochChapterTargets(plan: AipochConceptualization): Record<number, number> {
  return Object.fromEntries(plan.chapters.map((c) => [c.number, c.wordTarget]));
}

export function alignOutlineToAipochPlan<T extends { number: number; title: string; sections: any[]; wordTarget?: number }>(
  outline: { chapters: T[] },
  plan: AipochConceptualization
): T[] {
  const planChapters = plan.chapters;
  if (planChapters.length === 0) return outline.chapters;

  return planChapters.map((planChapter, index) => {
    const outlineChapter = outline.chapters[index];
    const outlineSections = Array.isArray(outlineChapter?.sections) ? outlineChapter!.sections : [];

    const sections = (outlineSections.length ? outlineSections : planChapter.sections).map((section: any, sIndex: number) => {
      const title = typeof section === "string" ? section : section.title || planChapter.sections[sIndex] || `Section ${sIndex + 1}`;
      return {
        id: (typeof section === "object" && section.id) || `ch${planChapter.number}-s${sIndex + 1}`,
        title,
        wordTarget: Math.round(planChapter.wordTarget / Math.max((outlineSections.length || planChapter.sections.length), 1)),
        content: typeof section === "object" ? section.content : undefined,
      };
    });

    return {
      ...(outlineChapter || ({} as T)),
      number: planChapter.number,
      title: planChapter.title,
      wordTarget: planChapter.wordTarget,
      sections,
    } as T;
  });
}

export function appraiseAipochEvidenceBase(papers: ThesisPaper[]) {
  return appraiseEvidenceBase(papers);
}

export function buildAipochEvidenceAppraisalMarkdown(rows: ReturnType<typeof appraiseEvidenceBase>) {
  return buildEvidenceAppraisalMarkdown(rows);
}
