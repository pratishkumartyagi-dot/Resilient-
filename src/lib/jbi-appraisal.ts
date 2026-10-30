/**
 * JBI Critical Appraisal pipeline — Joanna Briggs Institute.
 *
 * Separate analysis from the CASP pipeline (src/lib/critical-appraisal.ts).
 * JBI checklists are scored yes / no / not applicable / not clear. An overall
 * quality score and an include / exclude / seek further information
 * recommendation are derived from the validity (critical) items.
 *
 * See jbi-checklists.ts for the checklist definitions (https://jbi.global/critical-appraisal-tools).
 */

import {
  getJbiChecklist,
  listJbiChecklists,
  type JbiChecklist,
  type JbiItem,
  type JbiJudgment,
  type JbiSection,
} from "./jbi-checklists";

export { listJbiChecklists, getJbiChecklist };
export type { JbiJudgment };

export interface StudyDesignSignal {
  design: string;
  checklistId: string;
  score: number;
  evidence: string[];
}

export interface DesignDetection {
  checklistId: string;
  design: string;
  confidence: number;
  signals: StudyDesignSignal[];
  summary: string;
}

export interface AppraisalItem {
  id: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  judgment: JbiJudgment;
  evidence?: string;
  rationale: string;
  source: "rules" | "ai";
}

export interface AppraisalSection {
  id: string;
  title: string;
  items: AppraisalItem[];
  yes: number;
  no: number;
  notApplicable: number;
  notClear: number;
}

export interface AppraisalSummary {
  total: number;
  yes: number;
  no: number;
  notApplicable: number;
  notClear: number;
  qualityScore: number;
  qualityScoreLabel: string;
  validity: string;
  results: string;
  applicability: string;
  strengths: string[];
  limitations: string[];
  inclusionRecommendation: string;
  recommendationReason: string;
}

export interface AppraisalResult {
  checklistId: string;
  checklistLabel: string;
  checklistSourceUrl: string;
  guidance: string;
  sections: AppraisalSection[];
  summary: AppraisalSummary;
  reportMarkdown: string;
  metadata: AppraisalMetadata;
  appraisedAt: string;
  usedAi: boolean;
}

export interface AppraisalMetadata {
  title: string;
  authors: string;
  year: string;
  journal: string;
  reviewer: string;
  sourceFile: string;
}

/* -------------------------------------------------------------------------- */
/* Study-design detection                                                     */
/* -------------------------------------------------------------------------- */

const DESIGN_SIGNALS: Array<{ checklistId: string; design: string; patterns: RegExp[] }> = [
  {
    checklistId: "rct",
    design: "Randomized Controlled Trial",
    patterns: [/randomi[sz]ed (?:controlled )?(?:trial|study)/i, /\brct\b/i, /randomly (?:assigned|allocated)/i, /double-?blind/i, /placebo[- ]controlled/i, /intention-?to-?treat/i],
  },
  {
    checklistId: "quasi_experimental",
    design: "Quasi-Experimental Study",
    patterns: [/quasi-?experimental/i, /non-?randomi[sz]ed/i, /controlled trial/i, /pre-?post/i, /before and after/i],
  },
  {
    checklistId: "cohort",
    design: "Cohort Study",
    patterns: [/\bcohort study/i, /prospective cohort/i, /retrospective cohort/i, /cohort of [\d,]+/i, /followed for [\w]+ (?:months|years)/i, /incidence rate/i],
  },
  {
    checklistId: "case_control",
    design: "Case-Control Study",
    patterns: [/case-?control study/i, /\bcases? and controls?\b/i, /matched (?:case|control)/i, /odds ratio/i],
  },
  {
    checklistId: "cross_sectional",
    design: "Cross-Sectional Study",
    patterns: [/cross-?sectional/i, /\bprevalence study/i, /survey of /i, /service evaluation/i],
  },
  {
    checklistId: "qualitative",
    design: "Qualitative Research",
    patterns: [/qualitative (?:study|research|design|method|analysis)/i, /thematic analysis/i, /semi-?structured interview/i, /focus group/i],
  },
  {
    checklistId: "systematic_review",
    design: "Systematic Review / Meta-analysis",
    patterns: [/systematic review/i, /meta-?analysis/i, /\bPRISMA\b/i],
  },
  {
    checklistId: "case_report",
    design: "Case Report",
    patterns: [/case report/i],
  },
  {
    checklistId: "case_series",
    design: "Case Series",
    patterns: [/case series/i],
  },
];

const DESIGN_SELF_MARKER =
  /\b(we|our|ours|the present|this (?:study|review|systematic review|meta-?analysis|research)|our study|we searched|we included|we identified)\b/i;

export function detectStudyDesign(text: string): DesignDetection {
  const sample = text.slice(0, 40000);
  const lower = sample.toLowerCase();

  const firstIndex: Record<string, number> = {};
  const selfCounts: Record<string, number> = {};
  const evidenceByDesign: Record<string, string[]> = {};

  for (const design of DESIGN_SIGNALS) {
    let earliest = Number.POSITIVE_INFINITY;
    let selfCount = 0;
    const evidence: string[] = [];
    for (const pattern of design.patterns) {
      const match = lower.match(pattern);
      if (!match || match.index === undefined) continue;
      earliest = Math.min(earliest, match.index);
      const start = Math.max(0, match.index - 140);
      const window = sample.slice(start, Math.min(sample.length, match.index + match[0].length + 160));
      const self = DESIGN_SELF_MARKER.test(window);
      if (!self) continue;
      selfCount += 1;
      if (evidence.length < 3) evidence.push(window.replace(/\s+/g, " ").trim());
    }
    firstIndex[design.checklistId] = earliest;
    selfCounts[design.checklistId] = selfCount;
    evidenceByDesign[design.checklistId] = evidence;
  }

  const globalEarliest = Math.min(...Object.values(firstIndex).filter((v) => Number.isFinite(v)));

  const signals: StudyDesignSignal[] = DESIGN_SIGNALS.map((design) => {
    const earliest = firstIndex[design.checklistId]!;
    const titledHere = Number.isFinite(earliest) && Math.abs(earliest - globalEarliest) < 5 && earliest < 2500;
    const score = (titledHere ? 2 : 0) + selfCounts[design.checklistId];
    return { design: design.design, checklistId: design.checklistId, score, evidence: evidenceByDesign[design.checklistId] || [] };
  }).sort((a, b) => b.score - a.score);

  const best = signals[0];
  if (!best || best.score === 0) {
    return {
      checklistId: "cohort",
      design: "Cohort Study",
      confidence: 0,
      signals,
      summary: "Study design could not be identified from the document. The cohort checklist is shown as the default — please select the correct checklist.",
    };
  }

  const total = signals.reduce((a, s) => a + s.score, 0);
  const confidence = Math.round((best.score / Math.max(total, 1)) * 100);
  return {
    checklistId: best.checklistId,
    design: best.design,
    confidence,
    signals,
    summary: `Study design identified as ${best.design} (${best.score} design signals, ${confidence}% of matched signals).`,
  };
}

/* -------------------------------------------------------------------------- */
/* Item judgment helpers                                                      */
/* -------------------------------------------------------------------------- */

function scoreSection(items: AppraisalItem[]): { yes: number; no: number; notApplicable: number; notClear: number } {
  return {
    yes: items.filter((i) => i.judgment === "yes").length,
    no: items.filter((i) => i.judgment === "no").length,
    notApplicable: items.filter((i) => i.judgment === "not_applicable").length,
    notClear: items.filter((i) => i.judgment === "not_clear").length,
  };
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

function sentenceContains(sentences: string[], patterns: RegExp[]): boolean {
  return sentences.some((s) => patterns.some((p) => p.test(s)));
}

/* Evidence-based heuristic judgements per JBI item family. These mirror the
   CASP evidence engine but use JBI answer categories. */
function evaluateJbiItem(item: JbiItem, sentences: string[]): { judgment: JbiJudgment; evidence?: string; rationale: string } {
  const lowerText = sentences.join(" ").toLowerCase();
  const id = item.id;

  // Generic: if explicit positive confirmation phrases exist, lean yes; if
  // explicit negation exists, lean no; otherwise not clear.
  const yesPatterns = [/clearly described/i, /clearly stated/i, /clearly reported/i, /appropriately/i, /valid and reliable/i, /randomi[sz]ed/i, /concealed/i, /blind/i, /intention-?to-?treat/i, /appropriate statistical/i];
  const noPatterns = [/not described/i, /not stated/i, /not reported/i, /not randomized/i, /not blinded/i, /not concealed/i, /inappropriate/i, /unclear/i];

  const hasYes = sentenceContains(sentences, yesPatterns);
  const hasNo = sentenceContains(sentences, noPatterns);

  let judgment: JbiJudgment = "not_clear";
  let rationale = "The document does not report sufficient detail to judge this criterion.";
  let evidence: string | undefined;

  if (hasYes && !hasNo) {
    judgment = "yes";
    rationale = "The document reports that this criterion was met.";
    evidence = findEvidence(sentences, yesPatterns);
  } else if (hasNo && !hasYes) {
    judgment = "no";
    rationale = "The document indicates this criterion was not met or not addressed.";
    evidence = findEvidence(sentences, noPatterns);
  }

  return { judgment, evidence, rationale };
}

function findEvidence(sentences: string[], patterns: RegExp[]): string | undefined {
  for (const s of sentences) {
    if (patterns.some((p) => p.test(s))) {
      return s.slice(0, 220).trim();
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Main appraisal                                                             */
/* -------------------------------------------------------------------------- */

export interface AppraiseOptions {
  text: string;
  checklistId?: string;
  metadata: AppraisalMetadata;
  aiJudgements?: Record<string, { judgment: JbiJudgment; evidence?: string; rationale?: string }>;
}

export function appraiseDocument(options: AppraiseOptions): AppraisalResult {
  const detection = detectStudyDesign(options.text);
  const checklistId = options.checklistId || detection.checklistId;
  const checklist = getJbiChecklist(checklistId) || JBI_CHECKLISTS[0]!;
  const sentences = splitSentences(options.text);

  const sections: AppraisalSection[] = checklist.sections.map((section) => {
    const items: AppraisalItem[] = section.items.map((item: JbiItem) => {
      const ai = options.aiJudgements?.[item.id];
      if (ai) {
        return {
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          text: item.text,
          judgment: ai.judgment,
          evidence: ai.evidence,
          rationale: ai.rationale || `AI reviewer judgement: ${ai.judgment.replace(/_/g, " ").toUpperCase()}.`,
          source: "ai" as const,
        };
      }
      const evaled = evaluateJbiItem(item, sentences);
      return {
        id: item.id,
        sectionId: section.id,
        sectionTitle: section.title,
        text: item.text,
        judgment: evaled.judgment,
        evidence: evaled.evidence,
        rationale: evaled.rationale,
        source: "rules" as const,
      };
    });
    return { id: section.id, title: section.title, items, ...scoreSection(items) };
  });

  const summary = buildSummary(sections, sentences, checklist.label);
  const reportMarkdown = buildReportMarkdown(checklist, sections, summary, options.metadata, detection);

  return {
    checklistId: checklist.id,
    checklistLabel: checklist.label,
    checklistSourceUrl: checklist.sourceUrl,
    guidance: checklist.guidance,
    detection: { ...detection, checklistId: checklist.id },
    sections,
    summary,
    reportMarkdown,
    metadata: options.metadata,
    appraisedAt: new Date().toISOString(),
    usedAi: Boolean(options.aiJudgements && Object.keys(options.aiJudgements).length > 0),
  };
}

function buildSummary(sections: AppraisalSection[], sentences: string[], design: string): AppraisalSummary {
  const all = sections.flatMap((s) => s.items);
  const yes = all.filter((i) => i.judgment === "yes").length;
  const no = all.filter((i) => i.judgment === "no").length;
  const notApplicable = all.filter((i) => i.judgment === "not_applicable").length;
  const notClear = all.filter((i) => i.judgment === "not_clear").length;
  const total = all.length;
  const qualityScore = total > 0 ? Math.round((yes / total) * 100) : 0;

  const validity =
    yes >= Math.round(total * 0.8)
      ? "Strong"
      : yes >= Math.round(total * 0.5)
        ? "Moderate"
        : total > 0
          ? "Weak"
          : "Not assessable";

  const strengths = all.filter((i) => i.judgment === "yes").slice(0, 6).map((i) => i.text);
  const limitations = all.filter((i) => i.judgment === "no").map((i) => i.text);
  if (notClear > 0) limitations.push(`${notClear} criterion/criteria could not be judged ("not clear") — the authors did not report enough detail.`);

  const inclusionRecommendation =
    validity === "Strong" && no <= Math.max(1, Math.round(total * 0.1))
      ? "Include"
      : validity === "Weak" || no > Math.round(total * 0.3)
        ? "Exclude"
        : "Seek further information";
  const recommendationReason =
    inclusionRecommendation === "Include"
      ? `Methodologically sound on validity criteria (${validity.toLowerCase()}) with ${no} concern(s).`
      : inclusionRecommendation === "Exclude"
        ? `${no} criteria were not met and validity is ${validity.toLowerCase()}.`
        : `Usable with caveats: ${no} criterion/criteria were not met and ${notClear} could not be judged.`;

  return {
    total,
    yes,
    no,
    notApplicable,
    notClear,
    qualityScore,
    qualityScoreLabel: `${yes}/${total} criteria met (${qualityScore}%)`,
    validity,
    results: `Results appraisal based on the ${total} JBI criteria.`,
    applicability: `Applicability depends on setting, population and intervention fit; reviewer judgement required.`,
    strengths,
    limitations,
    inclusionRecommendation,
    recommendationReason,
  };
}

function buildReportMarkdown(
  checklist: JbiChecklist,
  sections: AppraisalSection[],
  summary: AppraisalSummary,
  metadata: AppraisalMetadata,
  detection: DesignDetection,
): string {
  const lines: string[] = [];
  lines.push("JBI CRITICAL APPRAISAL REPORT");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Paper: ${metadata.title || "Untitled document"}`);
  if (metadata.authors) lines.push(`Authors: ${metadata.authors}`);
  if (metadata.year) lines.push(`Year: ${metadata.year}`);
  if (metadata.journal) lines.push(`Journal: ${metadata.journal}`);
  lines.push(`Study Design: ${detection.design}`);
  lines.push(`JBI Tool Applied: ${checklist.label} (${checklist.sections.reduce((a, s) => a + s.items.length, 0)} criteria)`);
  lines.push(`Checklist source: ${checklist.sourceUrl}`);
  if (metadata.reviewer) lines.push(`Reviewer: ${metadata.reviewer}`);
  if (metadata.sourceFile) lines.push(`Source file: ${metadata.sourceFile}`);
  lines.push(`Appraisal date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(checklist.guidance);
  lines.push("");
  for (const section of sections) {
    lines.push(`── ${section.title.toUpperCase()} ${"─".repeat(Math.max(0, 58 - section.title.length))}`);
    for (const item of section.items) {
      const mark =
        item.judgment === "yes" ? "YES" : item.judgment === "no" ? "NO" : item.judgment === "not_applicable" ? "N/A" : "NOT CLEAR";
      lines.push("");
      lines.push(`${item.id.toUpperCase()}. ${item.text}`);
      lines.push(`   [ ${mark} ]  ${item.rationale}`);
      if (item.evidence) lines.push(`   Evidence: "${item.evidence.replace(/\s+/g, " ").trim()}"`);
    }
  }
  lines.push("");
  lines.push("SUMMARY");
  lines.push("───────────────────────────────────────────────────────");
  lines.push(`VALIDITY: ${summary.validity}`);
  lines.push(`QUALITY SCORE: ${summary.qualityScoreLabel}`);
  lines.push(`INCLUSION RECOMMENDATION: ${summary.inclusionRecommendation}`);
  lines.push(`  ${summary.recommendationReason}`);
  lines.push("");
  return lines.join("\n");
}
