import { EvidenceGrade, EVIDENCE_TIERS } from "./skills-registry";

export function gradeEvidence(input: {
  studyType?: string;
  abstract?: string;
  journal?: string;
  year?: number;
  hasExperimentalData?: boolean;
  isPrimaryResearch?: boolean;
  isReview?: boolean;
  isScreenHit?: boolean;
  qualityScore?: number;
}): EvidenceGrade {
  const {
    studyType,
    abstract = "",
    isPrimaryResearch = false,
    isReview = false,
    isScreenHit = false,
    qualityScore = 0,
  } = input;

  const text = `${studyType} ${abstract}`.toLowerCase();

  if (isReview) {
    return EVIDENCE_TIERS.T4;
  }

  if (isScreenHit) {
    return EVIDENCE_TIERS.T3;
  }

  const mechanisticKeywords = [
    "knockout", "knockout", "rescue", "knockdown", "overexpression",
    "in vitro", "in vivo", "mouse model", "crispr", "gene editing",
    "experimental", "mechanism", "biochemical", "structural",
    "crystal structure", "cryo-em", "x-ray", "binding assay",
    "enzyme activity", "kinase assay", "western blot", "patch clamp",
  ];

  const functionalKeywords = [
    "phenotype", "pathway", "signaling", "interaction", "co-immunoprecipitation",
    "chip-seq", "rna-seq", "scrna-seq", "flow cytometry", "immunofluorescence",
    "subcellular localization", "protein-protein interaction", "network",
    "systems biology", "transcriptomic", "proteomic",
  ];

  const mechanisticCount = mechanisticKeywords.filter((kw) => text.includes(kw)).length;
  const functionalCount = functionalKeywords.filter((kw) => text.includes(kw)).length;

  const hasMechanistic =
    (studyType || "").toLowerCase().includes("randomized") ||
    (studyType || "").toLowerCase().includes("rct") ||
    (studyType || "").toLowerCase().includes("clinical trial") ||
    mechanisticCount >= 2;

  const hasFunctional =
    functionalCount >= 2 ||
    ((studyType || "").toLowerCase().includes("observational") && functionalCount >= 1);

  if (hasMechanistic && qualityScore >= 3) return EVIDENCE_TIERS.T1;
  if (hasFunctional && qualityScore >= 2) return EVIDENCE_TIERS.T2;

  if (isPrimaryResearch && !isReview) {
    if (mechanisticCount >= 1 || functionalCount >= 2) return EVIDENCE_TIERS.T2;
    if (abstract.length > 200) return EVIDENCE_TIERS.T3;
  }

  return EVIDENCE_TIERS.T4;
}

export function formatGradeForPrompt(grade: EvidenceGrade): string {
  return `${grade.stars} ${grade.label}`;
}

export function annotateFindingsWithGrades(findings: string[]): string[] {
  return findings.map((finding) => {
    const lower = finding.toLowerCase();
    let grade: EvidenceGrade;

    if (
      lower.includes("knockout") ||
      lower.includes("rescue") ||
      lower.includes("rct") ||
      lower.includes("clinical trial") ||
      lower.includes("randomized")
    ) {
      grade = EVIDENCE_TIERS.T1;
    } else if (
      lower.includes("pathway") ||
      lower.includes("signaling") ||
      lower.includes("interaction") ||
      lower.includes("phenotype")
    ) {
      grade = EVIDENCE_TIERS.T2;
    } else if (
      lower.includes("association") ||
      lower.includes("correlation") ||
      lower.includes("screen") ||
      lower.includes("gwas")
    ) {
      grade = EVIDENCE_TIERS.T3;
    } else {
      grade = EVIDENCE_TIERS.T4;
    }

    return `[${grade.stars} ${grade.label}] ${finding}`;
  });
}
