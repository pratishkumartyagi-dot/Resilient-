/**
 * NurseStack-powered thesis planning and evidence appraisal.
 *
 * Uses the CASP engine from src/lib/critical-appraisal.ts to appraise the
 * literature base of a thesis (title/abstract level), and the NurseStack
 * command layer (src/lib/nursestack-commands.ts) to produce the dissertation
 * plan that the thesis generator then writes against.
 */

import type { ThesisPaper } from "./thesis-types";
import {
  buildDissertationPlan,
  buildPicoSkeleton,
  recommendMethodology,
  type DissertationChapterPlan,
  type MethodologyRecommendation,
  type PicoFramework,
} from "./nursestack-commands";
import { appraiseDocument, detectStudyDesign, getCaspChecklist } from "./critical-appraisal";
import type { AppraisalItem } from "./critical-appraisal";

export interface EvidenceAppraisalRow {
  paperId: string;
  title: string;
  year?: number;
  design: string;
  checklist: string;
  yes: number;
  no: number;
  cantTell: number;
  /** Criteria that could be judged at all (yes + no). */
  assessable: number;
  /** Percentage of the judged criteria that were met (null when none could be judged). */
  score: number | null;
  verdict: "fit" | "caveats" | "not_fit" | "insufficient";
  keyGaps: string[];
  level: "title/abstract only";
}

export interface NursestackThesisPlan {
  topic: string;
  level: string;
  targetWordCount: number;
  methodology: MethodologyRecommendation;
  pico: PicoFramework;
  chapters: DissertationChapterPlan[];
  searchStrategy: string[];
  appraisalPlan: string[];
  markdown: string;
}

export function buildNursestackThesisPlan(options: {
  topic: string;
  level: string;
  targetWordCount: number;
  studyDesign?: string;
  databases: string[];
  yearFrom?: number;
  yearTo?: number;
}): NursestackThesisPlan {
  const methodology = recommendMethodology(options.topic);
  const pico = buildPicoSkeleton(options.topic, options.studyDesign);
  const chapters = buildDissertationPlan(options.topic, options.level, options.targetWordCount, methodology.methodology);

  const searchStrategy = [
    `Databases: ${options.databases.join(", ") || "PubMed, Europe PMC, Crossref, arXiv, OpenAIRE, Zenodo, ClinicalTrials.gov"}`,
    `Date range: ${options.yearFrom ?? "no lower limit"} – ${options.yearTo ?? "present"}`,
    "Search string: (PICO terms) AND (design filter) — record the exact string and hit count per database",
    "Deduplicate on DOI and normalised title; record the PRISMA flow counts",
  ];

  const appraisalPlan = [
    `Appraise every included study with the CASP checklist for its design (${methodology.caspChecklistId.replace("_", " ")})`,
    "Record YES / NO / CAN'T TELL for each CASP item with the evidence quoted from the paper",
    "Do not synthesise a study that was appraised as methodologically poor unless the caveat is stated",
    "Report the certainty of the body of evidence (GRADE-style: risk of bias, inconsistency, indirectness, imprecision)",
    `Report against ${methodology.reportingGuideline}; ethics position: ${methodology.ethicsNote}`,
  ];

  const markdown = [
    `# NurseStack thesis plan — ${options.topic}`,
    "",
    `**Level:** ${options.level}  •  **Target length:** ${options.targetWordCount.toLocaleString()} words`,
    "",
    "## Methodology fit",
    `| Field | Value |`,
    `|---|---|`,
    `| Question type | ${methodology.questionType} |`,
    `| Recommended methodology | ${methodology.methodology} |`,
    `| CASP checklist | ${methodology.caspChecklistId.replace("_", " ")} |`,
    `| Reporting guideline | ${methodology.reportingGuideline} |`,
    `| Ethics | ${methodology.ethicsNote} |`,
    "",
    "## PICO(S)",
    `- ${pico.population}`,
    `- ${pico.intervention}`,
    `- ${pico.comparison}`,
    `- ${pico.outcome}`,
    `- ${pico.studyDesign}`,
    "",
    "## Chapter structure",
    ...chapters.map(
      (c) => `### Chapter ${c.number}: ${c.title} (~${c.wordTarget.toLocaleString()} words, ${c.percentage}%)\n${c.sections.map((s) => `- ${s}`).join("\n")}`
    ),
    "",
    "## Search strategy",
    ...searchStrategy.map((s) => `- ${s}`),
    "",
    "## Critical appraisal plan (CASP)",
    ...appraisalPlan.map((s) => `- ${s}`),
  ].join("\n");

  return {
    topic: options.topic,
    level: options.level,
    targetWordCount: options.targetWordCount,
    methodology,
    pico,
    chapters,
    searchStrategy,
    appraisalPlan,
    markdown,
  };
}

/**
 * Appraises the retrieved literature at title/abstract level with the CASP
 * checklists. The level of the appraisal is always stated: abstract-only
 * appraisal can flag design and reporting issues but cannot judge every
 * methodological criterion.
 */
export function appraiseEvidenceBase(papers: ThesisPaper[]): EvidenceAppraisalRow[] {
  const rows: EvidenceAppraisalRow[] = [];

  for (const paper of papers) {
    const text = `${paper.title}. ${paper.abstract || ""}`;
    if (text.trim().length < 40) continue;

    const detection = detectStudyDesign(text);
    const appraisal = appraiseDocument({
      text,
      checklistId: detection.checklistId,
      metadata: {
        title: paper.title,
        authors: paper.authors,
        year: paper.year ? String(paper.year) : "",
        journal: paper.journal || "",
        reviewer: "",
        sourceFile: "",
      },
    });

    const items = appraisal.sections.flatMap((s) => s.items);
    const yes = items.filter((i) => i.judgment === "yes").length;
    const no = items.filter((i) => i.judgment === "no").length;
    const cantTell = items.filter((i) => i.judgment === "cant_tell").length;
    const assessable = yes + no;
    const score = assessable > 0 ? Math.round((yes / assessable) * 100) : null;
    const checklist = getCaspChecklist(appraisal.checklistId);
    const detected = detection.confidence > 0;

    const keyGaps = items
      .filter((i: AppraisalItem) => i.judgment === "no" || i.judgment === "cant_tell")
      .slice(0, 3)
      .map((i) => i.text.replace(/^\(\w\)\s*/, ""));

    const verdict: EvidenceAppraisalRow["verdict"] =
      assessable < 3
        ? "insufficient"
        : score !== null && score >= 70 && no <= 1
          ? "fit"
          : score !== null && score >= 50
            ? "caveats"
            : "not_fit";

    rows.push({
      paperId: paper.id,
      title: paper.title,
      year: paper.year,
      design: detected ? detection.design : "Design not detected from title/abstract",
      checklist: checklist?.label || detection.design,
      yes,
      no,
      cantTell,
      assessable,
      score,
      verdict,
      keyGaps,
      level: "title/abstract only",
    });
  }

  return rows;
}

export function buildEvidenceAppraisalMarkdown(rows: EvidenceAppraisalRow[]): string {
  if (rows.length === 0) {
    return "## Critical appraisal of the evidence base\n\nNo papers were available to appraise.";
  }
  const lines: string[] = [];
  lines.push("## Critical appraisal of the evidence base (CASP)");
  lines.push("");
  lines.push(
    "Each retrieved study was appraised with the CASP checklist for its design. Appraisal is based on the title and abstract only: criteria that need the full text are recorded as “Can’t tell”, so the score is the share of the criteria that could be judged that were met. Use the Critical Appraisal tab for a full-text appraisal before deciding what to include."
  );
  lines.push("");
  lines.push("| Study | Design | CASP checklist | Yes | No | Can't tell | Judged | Score | Verdict |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    const title = row.title.length > 70 ? `${row.title.slice(0, 70)}…` : row.title;
    lines.push(
      `| ${title} (${row.year ?? "n/a"}) | ${row.design} | ${row.checklist} | ${row.yes} | ${row.no} | ${row.cantTell} | ${row.assessable} | ${row.score === null ? "—" : `${row.score}%`} | ${row.verdict === "fit" ? "Fit to include" : row.verdict === "caveats" ? "Include with caveats" : row.verdict === "insufficient" ? "Too little reported to judge" : "Not fit"} |`
    );
  }
  lines.push("");
  lines.push("### Key gaps per study");
  for (const row of rows.filter((r) => r.keyGaps.length)) {
    lines.push(`- **${row.title.slice(0, 80)}${row.title.length > 80 ? "…" : ""}** — ${row.keyGaps.join("; ")}`);
  }
  return lines.join("\n");
}
