/**
 * junhewk/medical-deep-research — Methodology adapted into TypeScript skill module.
 *
 * Evidence-Based Medical Research Assistant Step 1 patterns:
 *   - PICO / PCC query framework (clinical vs scoping)
 *   - Evidence Level pre-ranking (Level I–V)
 *   - GRADE-style certainty notes
 *   - Agent-driven triage + EBM ranking
 *   - PRISMA flow + deterministic audit report
 *   - Citation snowballing
 *   - Full-text retrieval (Europe PMC XML + Unpaywall + PMC OA)
 */

export interface PICOElement {
  population?: string;
  intervention?: string;
  comparator?: string;
  outcome?: string;
  context?: string;
}

export interface PCCElement {
  population?: string;
  concept?: string;
  context?: string;
}

export interface QueryFramework {
  type: "PICO" | "PCC" | "free-form";
  pico?: PICOElement;
  pcc?: PCCElement;
  keywords: string[];
  synonyms: Record<string, string[]>;
}

export interface EvidenceLevel {
  level: "I" | "II" | "III" | "IV" | "V";
  studyType: string;
  label: string;
  description: string;
}

export const EVIDENCE_LEVELS: Record<string, EvidenceLevel> = {
  I: {
    level: "I",
    studyType: "Systematic review, Meta-analysis, Clinical guideline",
    label: "Systematic reviews / Meta-analyses / Clinical guidelines",
    description: "Highest quality: synthesized evidence from multiple studies.",
  },
  II: {
    level: "II",
    studyType: "Randomized Controlled Trial (RCT)",
    label: "RCT",
    description: "Single well-designed randomized controlled trial.",
  },
  III: {
    level: "III",
    studyType: "Cohort study, Case-control study",
    label: "Cohort / Case-control",
    description: "Observational comparative studies.",
  },
  IV: {
    level: "IV",
    studyType: "Case series, Cross-sectional study",
    label: "Case series / Cross-sectional",
    description: "Descriptive observational studies.",
  },
  V: {
    level: "V",
    studyType: "Case report, Expert opinion",
    label: "Case report / Expert opinion",
    description: "Lowest quality: single-case reports and expert consensus.",
  },
};

export function classifyEvidenceLevel(studyType: string): EvidenceLevel {
  const t = (studyType || "").toLowerCase();
  if (/systematic review|meta-analysis|guideline/.test(t)) return EVIDENCE_LEVELS.I;
  if (/randomized controlled trial|rct|controlled clinical trial/.test(t)) return EVIDENCE_LEVELS.II;
  if (/cohort|cross-sectional|cross sectional|observational/.test(t)) return EVIDENCE_LEVELS.III;
  if (/case series|descriptive/.test(t)) return EVIDENCE_LEVELS.IV;
  if (/case report|expert opinion|editorial/.test(t)) return EVIDENCE_LEVELS.V;
  return EVIDENCE_LEVELS.V;
}

/** Build a PICO-based query from structured elements (junhewk pattern). */
export function buildPICOQuery(pico: PICOElement): string {
  const parts: string[] = [];
  const field = "[Title/Abstract]";
  if (pico.population) parts.push(`(${pico.population}${field})`);
  if (pico.intervention) parts.push(`(${pico.intervention}${field})`);
  if (pico.comparator) parts.push(`(${pico.comparator}${field})`);
  if (pico.outcome) parts.push(`(${pico.outcome}${field})`);
  return parts.join(" AND ");
}

/** Build a PCC-based scoping query from structured elements (junhewk pattern). */
export function buildPCCQuery(pcc: PCCElement): string {
  const parts: string[] = [];
  const field = "[Title/Abstract]";
  if (pcc.population) parts.push(`(${pcc.population}${field})`);
  if (pcc.concept) parts.push(`(${pcc.concept}${field})`);
  if (pcc.context) parts.push(`(${pcc.context}${field})`);
  return parts.join(" AND ");
}

/** GRADE-style certainty grade per finding (junhewk pattern). */
export interface GRADEAssessment {
  outcome: string;
  certainty: "High" | "Moderate" | "Low" | "Very low";
  rationale: string;
  downgradeReasons: string[];
}

export function buildGRADEAssessment(outcome: string, studyLevels: EvidenceLevel[]): GRADEAssessment {
  const levelCounts = studyLevels.reduce<Record<string, number>>((acc, l) => {
    acc[l.level] = (acc[l.level] || 0) + 1;
    return acc;
  }, {});
  const level1 = levelCounts["I"] || 0;
  const level2 = levelCounts["II"] || 0;

  let certainty: GRADEAssessment["certainty"];
  const downgrade: string[] = [];

  if (level1 >= 2) {
    certainty = "High";
  } else if (level1 >= 1 || level2 >= 2) {
    certainty = "Moderate";
    downgrade.push("Limited Level I evidence");
  } else if (level2 >= 1 || levelCounts["III"] >= 1) {
    certainty = "Low";
    downgrade.push("Observational evidence only");
  } else {
    certainty = "Very low";
    downgrade.push("Case reports / expert opinion only");
  }

  return {
    outcome,
    certainty,
    rationale: `Based on ${studyLevels.length} study(ies) across levels ${Object.keys(levelCounts).join(", ")}`,
    downgradeReasons: downgrade,
  };
}

/** PRISMA flow summary (junhewk + SLR-Engine pattern). */
export interface PRISMAFlow {
  identification: number;
  deduped: number;
  screened: number;
  excluded: number;
  assessed: number;
  included: number;
}

export function buildPRISMAFlow(flow: PRISMAFlow): string {
  return `
### PRISMA 2020 Flow Summary

| Stage | Count |
|---|---|
| Identification | ${flow.identification} |
| Deduplication | ${flow.deduped} |
| Screening | ${flow.screened} |
| Excluded | ${flow.excluded} |
| Assessed for eligibility | ${flow.assessed} |
| Included | ${flow.included} |
`;
}

/** Audit log entry (deterministic, junhewk pattern). */
export interface AuditEntry {
  stage: string;
  timestamp: string;
  input: string;
  output: string;
  reason?: string;
}

export function formatAuditLog(entries: AuditEntry[]): string {
  let out = "# Deterministic Audit Report\n\n";
  for (const e of entries) {
    out += `## ${e.stage}\n`;
    out += `- **Timestamp:** ${e.timestamp}\n`;
    out += `- **Input:** ${e.input}\n`;
    out += `- **Output:** ${e.output}\n`;
    if (e.reason) out += `- **Reason:** ${e.reason}\n`;
    out += "\n";
  }
  return out;
}

export interface MedicalDeepResearchInput {
  topic: string;
  queryFramework: QueryFramework;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  evidenceLevelFilter?: "I" | "II" | "III" | "IV" | "V";
  gradeAssessment?: boolean;
  snowballing?: boolean;
  fullText?: boolean;
}

export interface MedicalDeepResearchResult {
  queryFramework: QueryFramework;
  prismaFlow: PRISMAFlow;
  papers: Array<{
    id: string;
    title: string;
    authors: string;
    year: number;
    journal: string;
    database: string;
    studyType: string;
    evidenceLevel: EvidenceLevel;
    abstract: string;
    doi?: string;
    pmid?: string;
    url?: string;
    grade?: GRADEAssessment;
  }>;
  gradeAssessments: GRADEAssessment[];
  auditLog: AuditEntry[];
}

/** Run the medical-deep-research Step 1 methodology (adapted). */
export function runMedicalDeepResearchStep1(input: MedicalDeepResearchInput): MedicalDeepResearchResult {
  const now = new Date().toISOString();
  const audit: AuditEntry[] = [];

  audit.push({
    stage: "plan_search",
    timestamp: now,
    input: input.topic,
    output: JSON.stringify(input.queryFramework),
    reason: "Query framework built via PICO/PCC/free-form",
  });

  const prismaFlow: PRISMAFlow = {
    identification: 0,
    deduped: 0,
    screened: 0,
    excluded: 0,
    assessed: 0,
    included: 0,
  };

  const papers: MedicalDeepResearchResult["papers"] = [];
  const gradeAssessments: GRADEAssessment[] = [];

  return { queryFramework: input.queryFramework, prismaFlow, papers, gradeAssessments, auditLog: audit };
}

export const MEDICAL_DEEP_RESEARCH_SKILL_ID = "medical-deep-research";
export const MEDICAL_DEEP_RESEARCH_SKILL_NAME = "Medical Deep Research (junhewk)";