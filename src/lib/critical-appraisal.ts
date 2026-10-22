/**
 * Critical Appraisal pipeline (CASP UK).
 *
 * Takes the text of an uploaded paper (PDF / Word / plain text), works out the
 * study design, applies the matching CASP checklist item by item and produces
 * a complete appraisal report.
 *
 * The output format follows the CASP appraisal report template published by
 * the Critical Appraisal Skills Programme and mirrored by the NurseStack
 * `review-casp` command.
 */

import { CASP_CHECKLISTS, getCaspChecklist, type CaspChecklist, type CaspItem, type CaspJudgment } from "./casp-checklists";

export { getCaspChecklist };
export type { CaspJudgment };
import { evaluateCaspItem, splitSentences, type ItemEvidence, type Sentence } from "./casp-evidence";

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
  consider: string[];
  judgment: CaspJudgment;
  evidence?: string;
  rationale: string;
  /** Set when an AI reviewer judged this item instead of the rule engine. */
  source: "rules" | "ai";
}

export interface AppraisalSection {
  id: string;
  title: string;
  items: AppraisalItem[];
  yes: number;
  no: number;
  cantTell: number;
}

export interface AppraisalSummary {
  total: number;
  yes: number;
  no: number;
  cantTell: number;
  /** Percentage of the criteria that were clearly met. */
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
  detection: DesignDetection;
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

const DESIGN_SIGNALS: Array<{ checklistId: string; design: string; patterns: RegExp[] }> = [
  {
    checklistId: "rct",
    design: "Randomised Controlled Trial (RCT)",
    patterns: [/randomi[sz]ed (?:controlled )?(?:trial|study)/i, /\brct\b/i, /randomly (?:assigned|allocated)/i, /double-?blind/i, /placebo[- ]controlled/i, /intention-?to-?treat/i, /randomi[sz]ation (?:was|were)/i],
  },
  {
    checklistId: "systematic_review",
    design: "Systematic Review / Meta-analysis",
    patterns: [/systematic review/i, /meta-?analysis/i, /\bPRISMA\b/i, /databases searched/i, /we searched/i, /risk of bias (?:was )?(?:assessed|evaluated)/i, /inclusion criteria (?:were|was) (?:pre-?specified|defined)/i, /Embase|MEDLINE|CINAHL/i, /randomi[sz]ed trials? (?:were )?(?:identified|included)/i],
  },
  {
    checklistId: "qualitative",
    design: "Qualitative Research",
    patterns: [/qualitative (?:study|research|design|data|method|analysis)/i, /thematic analysis/i, /semi-?structured interview/i, /focus group/i, /phenomenolog/i, /grounded theory/i, /ethnograph/i, /saturation/i, /interviews? (?:were|was) (?:conducted|undertaken|performed)/i, /lived experience/i, /inductive (?:analysis|approach)/i],
  },
  {
    checklistId: "cohort",
    design: "Cohort Study",
    patterns: [/\bcohort study/i, /prospective cohort/i, /retrospective cohort/i, /cohort of [\d,]+/i, /followed for [\w]+ (?:months|years)/i, /incidence rate/i, /longitudinal (?:study|analysis)/i, /case series/i],
  },
  {
    checklistId: "case_control",
    design: "Case-Control Study",
    patterns: [/case-?control study/i, /\bcases? and controls?\b/i, /matched (?:case|control)/i, /odds ratio/i],
  },
  {
    checklistId: "cross_sectional",
    design: "Cross-Sectional Study / Service Evaluation",
    patterns: [/cross-?sectional/i, /questionnaire (?:was )?(?:sent|administered|completed) by/i, /\bprevalence study/i, /survey of /i, /service evaluation/i, /before and after (?:study|audit|design)/i, /service (?:evaluation|model|pathway)/i, /audit of /i, /quality improvement/i, /feasibility study/i, /implementation (?:study|evaluation)/i],
  },
  {
    checklistId: "diagnostic",
    design: "Diagnostic Accuracy Study",
    patterns: [/diagnostic (?:accuracy|test|study)/i, /index test/i, /reference standard/i, /sensitivity and specificity/i, /\bROC curve\b/i, /area under the curve/i],
  },
  {
    checklistId: "economic_evaluation",
    design: "Economic Evaluation",
    patterns: [/cost-?effectiveness/i, /cost-?utility/i, /cost-?benefit analysis/i, /\bICER\b/i, /\bQALY/i, /incremental cost[- ]effectiveness ratio/i, /economic evaluation/i],
  },
  {
    checklistId: "clinical_prediction_rule",
    design: "Clinical Prediction Rule",
    patterns: [/clinical prediction rule/i, /prediction (?:model|rule|tool) (?:was|were) developed/i, /risk score/i, /derived (?:a|the) (?:clinical )?(?:prediction|risk)/i],
  },
];

/**
 * A design signal only counts when the document attributes that design to
 * itself. Without this, a systematic review that merely *mentions* randomised
 * trials would be mistaken for an RCT.
 */
const DESIGN_SELF_MARKER =
  /\b(we|our|ours|the present|this (?:review|study|systematic review|scoping review|meta-?analysis|research)|our (?:review|study)|we searched|we included|we identified|included (?:studies|trials|articles|records)|our search|our review|our study)\b/i;

const DESIGN_EXCLUSION =
  /\b(?:the|another|previous|prior|other|earlier|a recent)\s+[A-Z][A-Za-z0-9‐-]{1,}\s+(?:review|study|trial)\b|\b(?:previous|prior|earlier|other|another|related)\s+(?:reviews?|studies|trials|research)\b/i;

/** Works out which CASP checklist fits the uploaded study. */
export function detectStudyDesign(text: string): DesignDetection {
  const sample = text.slice(0, 40000);
  const lower = sample.toLowerCase();

  // 1) where does each design first appear? The earliest mention is usually in
  //    the title, which is the paper's own design.
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
      const other = DESIGN_EXCLUSION.test(window) && !/\b(we|our|this (?:review|study|systematic review))\b/i.test(window);
      if (!self || other) continue;
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
    return {
      design: design.design,
      checklistId: design.checklistId,
      score,
      evidence: evidenceByDesign[design.checklistId] || [],
    };
  }).sort((a, b) => b.score - a.score);

  const best = signals[0];
  if (!best || best.score === 0) {
    return {
      checklistId: "rct",
      design: "Randomised Controlled Trial (RCT)",
      confidence: 0,
      signals,
      summary:
        "The study design could not be identified from the document. The RCT checklist is shown as the default — please select the correct checklist before finalising the appraisal.",
    };
  }

  const total = signals.reduce((a, s) => a + s.score, 0);
  const confidence = Math.round((best.score / Math.max(total, 1)) * 100);
  const runnerUp = signals[1];
  const ambiguity =
    runnerUp && runnerUp.score === best.score
      ? ` The document shows equal signals for ${runnerUp.design} — please confirm the design before finalising.`
      : "";

  return {
    checklistId: best.checklistId,
    design: best.design,
    confidence,
    signals,
    summary: `Study design identified as ${best.design} (${best.score} design signals, ${confidence}% of the matched signals).${ambiguity}`,
  };
}

export function listChecklists(): Array<{ id: string; label: string; design: string; sourceUrl: string; itemCount: number }> {
  return CASP_CHECKLISTS.map((c) => ({
    id: c.id,
    label: c.label,
    design: c.design,
    sourceUrl: c.sourceUrl,
    itemCount: c.sections.reduce((a, s) => a + s.items.length, 0),
  }));
}

function scoreSection(items: AppraisalItem[]): { yes: number; no: number; cantTell: number } {
  return {
    yes: items.filter((i) => i.judgment === "yes").length,
    no: items.filter((i) => i.judgment === "no").length,
    cantTell: items.filter((i) => i.judgment === "cant_tell").length,
  };
}

function buildSummary(sections: AppraisalSection[], sentences: Sentence[], design: string): AppraisalSummary {
  const all = sections.flatMap((s) => s.items);
  const yes = all.filter((i) => i.judgment === "yes").length;
  const no = all.filter((i) => i.judgment === "no").length;
  const cantTell = all.filter((i) => i.judgment === "cant_tell").length;
  const total = all.length;
  const judged = yes + no;
  const qualityScore = total > 0 ? Math.round((yes / total) * 100) : 0;

  const validitySection = sections[0];
  const validityItems = validitySection?.items ?? [];
  const validityYes = validityItems.filter((i) => i.judgment === "yes").length;
  const validityRatio = validityItems.length ? validityYes / validityItems.length : 0;
  const validity =
    validityRatio >= 0.8 ? "Strong" : validityRatio >= 0.5 ? "Moderate" : validityItems.length ? "Weak" : "Not assessable";

  const resultsSection = sections.find((s) => /result/i.test(s.title)) ?? sections[sections.length - 2];
  const resultsItems = resultsSection?.items ?? [];
  const resultsYes = resultsItems.filter((i) => i.judgment === "yes").length;
  const resultsRatio = resultsItems.length ? resultsYes / resultsItems.length : 0;
  const results =
    resultsItems.length === 0
      ? "Not assessable from the uploaded document"
      : `${resultsYes} of ${resultsItems.length} result criteria were clearly reported (${resultsRatio >= 0.8 ? "well reported" : resultsRatio >= 0.5 ? "partially reported" : "poorly reported"}).`;

  const applicabilitySection = sections[sections.length - 1];
  const applicabilityItems = applicabilitySection?.items ?? [];
  const applicabilityYes = applicabilityItems.filter((i) => i.judgment === "yes").length;
  const applicabilityRatio = applicabilityItems.length ? applicabilityYes / applicabilityItems.length : 0;
  const applicability =
    applicabilityItems.length === 0
      ? "Not assessable"
      : `${applicabilityRatio >= 0.8 ? "High" : applicabilityRatio >= 0.5 ? "Moderate" : "Low"} — ${
          applicabilityYes
        } of ${applicabilityItems.length} applicability criteria were addressed in the paper${
          applicabilityRatio < 0.5 ? "; local context, population fit and resource implications need reviewer judgement." : "."
        }`;

  const strengths = all
    .filter((i) => i.judgment === "yes")
    .slice(0, 6)
    .map((i) => i.text.replace(/^\(\w\)\s*/, ""));
  const limitations = all
    .filter((i) => i.judgment === "no")
    .map((i) => i.text.replace(/^\(\w\)\s*/, ""));
  const unknowns = all.filter((i) => i.judgment === "cant_tell").length;
  if (unknowns > 0) {
    limitations.push(
      `${unknowns} criterion/criteria could not be judged from the document ("Can’t tell") — the authors did not report enough detail to be sure.`
    );
  }

  const inclusionRecommendation =
    validity === "Strong" && no <= Math.max(1, Math.round(total * 0.1))
      ? "YES"
      : validity === "Weak" || no > Math.round(total * 0.3)
        ? "NO"
        : "WITH CAVEATS";
  const recommendationReason =
    inclusionRecommendation === "YES"
      ? `Methodologically sound on the validity criteria (${validity.toLowerCase()}) with ${no} concern(s) raised.`
      : inclusionRecommendation === "NO"
        ? `${no} criteria were not met and the validity assessment is ${validity.toLowerCase()} — the findings should not be relied on without further reading.`
        : `Usable with caveats: ${no} criterion/criteria were not met and ${cantTell} could not be judged from the document.`;

  // The key finding is taken from the conclusion-type sentences of the paper.
  const conclusionSentences = sentences
    .filter((s) => /(conclusion|in conclusion|our findings|these findings|we found|demonstrated that|showed that|associated with|reduced|increased)/i.test(s.text))
    .filter((s) => s.text.length > 60)
    .slice(0, 3);

  const resultSentence = conclusionSentences[0]?.text;

  return {
    total,
    yes,
    no,
    cantTell,
    qualityScore,
    qualityScoreLabel: `${yes}/${total} criteria clearly met (${qualityScore}%)`,
    validity,
    results: resultSentence ? `${results} Key finding: ${resultSentence}` : results,
    applicability,
    strengths,
    limitations,
    inclusionRecommendation,
    recommendationReason,
  };
}

export function buildAppraisalReportMarkdown(
  checklist: CaspChecklist,
  sections: AppraisalSection[],
  summary: AppraisalSummary,
  metadata: AppraisalMetadata,
  detection: DesignDetection
): string {
  const lines: string[] = [];
  lines.push("CASP APPRAISAL REPORT");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(`Paper: ${metadata.title || "Untitled document"}`);
  if (metadata.authors) lines.push(`Authors: ${metadata.authors}`);
  if (metadata.year) lines.push(`Year: ${metadata.year}`);
  if (metadata.journal) lines.push(`Journal: ${metadata.journal}`);
  lines.push(`Study Design: ${detection.design}`);
  lines.push(`CASP Tool Applied: ${checklist.label} (${checklist.sections.reduce((a, s) => a + s.items.length, 0)} criteria)`);
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
      const mark = item.judgment === "yes" ? "YES" : item.judgment === "no" ? "NO" : "CAN'T TELL";
      lines.push("");
      lines.push(`${item.id.toUpperCase()}. ${item.text}`);
      lines.push(`   [ ${mark} ]  ${item.rationale}`);
      if (item.evidence) lines.push(`   Evidence: "${item.evidence.replace(/\s+/g, " ").trim()}"`);
      if (item.consider.length) {
        lines.push("   Consider:");
        for (const prompt of item.consider) lines.push(`     - ${prompt}`);
      }
    }
    lines.push("");
  }

  lines.push("SUMMARY");
  lines.push("───────────────────────────────────────────────────────");
  lines.push(`VALIDITY SUMMARY: ${summary.validity}`);
  lines.push(`RESULTS SUMMARY: ${summary.results}`);
  lines.push(`APPLICABILITY TO LOCAL PRACTICE: ${summary.applicability}`);
  lines.push(`QUALITY SCORE: ${summary.qualityScoreLabel} — ${summary.yes} yes, ${summary.no} no, ${summary.cantTell} can't tell`);
  lines.push("");
  lines.push("Key strengths:");
  if (summary.strengths.length) summary.strengths.forEach((s) => lines.push(`  ✅ ${s}`));
  else lines.push("  ✅ None clearly evidenced in the uploaded document.");
  lines.push("");
  lines.push("Key limitations:");
  if (summary.limitations.length) summary.limitations.forEach((s) => lines.push(`  ⚠️ ${s}`));
  else lines.push("  ⚠️ None identified.");
  lines.push("");
  lines.push(`SUITABLE FOR INCLUSION IN A LITERATURE REVIEW: ${summary.inclusionRecommendation}`);
  lines.push(`  ${summary.recommendationReason}`);
  lines.push("");
  lines.push("REFERENCING (Harvard)");
  lines.push(
    `Critical Appraisal Skills Programme (2024). CASP ${checklist.label} Checklist. [online] Available at: ${checklist.sourceUrl}. Accessed: ${new Date().toISOString().slice(0, 10)}.`
  );
  lines.push("CASP UK content is published under CC BY-NC-SA 4.0.");
  return lines.join("\n");
}

export interface AppraiseOptions {
  text: string;
  checklistId?: string;
  metadata: AppraisalMetadata;
  /** Pre-computed AI judgements keyed by CASP item id. */
  aiJudgements?: Record<
    string,
    { judgment: CaspJudgment; evidence?: string; rationale?: string }
  >;
}

/** Runs the full appraisal of one uploaded document. */
export function appraiseDocument(options: AppraiseOptions): AppraisalResult {
  const detection = detectStudyDesign(options.text);
  const checklistId = options.checklistId || detection.checklistId;
  const checklist = getCaspChecklist(checklistId) || CASP_CHECKLISTS[0]!;
  const sentences = splitSentences(options.text);

  const sections: AppraisalSection[] = checklist.sections.map((section) => {
    const items: AppraisalItem[] = section.items.map((item: CaspItem) => {
      const ai = options.aiJudgements?.[item.id];
      if (ai) {
        return {
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          text: item.text,
          consider: item.consider,
          judgment: ai.judgment,
          evidence: ai.evidence,
          rationale: ai.rationale || `AI reviewer judgement: ${ai.judgment.replace("_", " ").toUpperCase()}.`,
          source: "ai" as const,
        };
      }
      const evidence: ItemEvidence = evaluateCaspItem(item, sentences);
      return {
        id: item.id,
        sectionId: section.id,
        sectionTitle: section.title,
        text: item.text,
        consider: item.consider,
        judgment: evidence.judgment,
        evidence: evidence.evidence,
        rationale: evidence.rationale,
        source: "rules" as const,
      };
    });

    return {
      id: section.id,
      title: section.title,
      items,
      ...scoreSection(items),
    };
  });

  const summary = buildSummary(sections, sentences, checklist.design);
  const reportMarkdown = buildAppraisalReportMarkdown(checklist, sections, summary, options.metadata, detection);

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

/**
 * Prompt used when an AI provider is configured: the AI is asked to judge the
 * paper against the CASP items, and its answers are merged with the rule-based
 * evidence. The rule engine remains the fallback when no key is available.
 */
export function buildCaspAiPrompt(checklistId: string, documentText: string): string {
  const checklist = getCaspChecklist(checklistId) || CASP_CHECKLISTS[0]!;
  const items = checklist.sections.flatMap((s) =>
    s.items.map((item) => ({ id: item.id, section: s.title, question: item.text, consider: item.consider }))
  );
  const document = documentText.slice(0, 48000);

  return `You are a Research Methods Specialist and Evidence-Based Practice (EBP) Expert critically appraising a research study with the Critical Appraisal Skills Programme (CASP) toolkit.

STUDY DESIGN: ${checklist.design}
CASP CHECKLIST: ${checklist.label}

CRITERIA TO APPRAISE (JSON):
${JSON.stringify(items, null, 1)}

STUDY DOCUMENT:
"""
${document}
"""

For EVERY criterion return one object with:
- "id": the criterion id exactly as given
- "judgment": "yes" | "no" | "cant_tell"
- "evidence": a short verbatim quote (<= 220 characters) from the document that justifies the judgement (empty string if cant_tell)
- "rationale": one sentence of critical commentary on how the criterion was met or not met

Rules:
- Never make assumptions: if the document does not report it, use "cant_tell".
- A "no" must be supported by an explicit statement in the document.
- Return ONLY a JSON array, no prose, no markdown fence.`;
}
