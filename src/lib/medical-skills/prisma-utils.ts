export interface PRISMAFlowData {
  identification: {
    recordsFromDatabases: number;
    additionalRecordsFromOtherSources: number;
    totalRecordsIdentified: number;
  };
  screening: {
    recordsAfterDuplicatesRemoved: number;
    recordsScreenedByTitleAbstract: number;
    recordsExcludedByTitleAbstract: number;
    fullTextArticlesAssessed: number;
    fullTextArticlesExcludedWithReasons: number;
    studiesIncludedInQualitativeSynthesis: number;
    studiesIncludedInMetaAnalysis?: number;
  };
  excludedFullTextReasons: Array<{ reason: string; count: number }>;
}

export interface SearchStrategy {
  database: string;
  dateSearched: string;
  dateRange: string;
  searchString: string;
  results: number;
}

export interface IncludedStudy {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  doi: string;
  studyType: string;
  population: string;
  intervention: string;
  comparator: string;
  outcomes: string;
  keyFindings: string;
  qualityRating: "High" | "Moderate" | "Low" | "Very Low";
  biasAssessment: string;
}

export interface QualityAssessment {
  tool: string;
  overallRating: string;
  domains: Array<{
    id: string;
    label: string;
    judgment: string;
    notes: string;
  }>;
}

export function buildPRISMAFlowDiagram(flow: PRISMAFlowData): string {
  const lines: string[] = [
    `**Identification via databases:** ${flow.identification.recordsFromDatabases} records`,
    `**Additional records identified through other sources:** ${flow.identification.additionalRecordsFromOtherSources} records`,
    `**Total records identified:** ${flow.identification.totalRecordsIdentified} records`,
    ``,
    `**Records after duplicates removed:** ${flow.screening.recordsAfterDuplicatesRemoved}`,
    `**Records screened by title/abstract:** ${flow.screening.recordsScreenedByTitleAbstract}`,
    `**Records excluded by title/abstract:** ${flow.screening.recordsExcludedByTitleAbstract}`,
    ``,
    `**Full-text articles assessed for eligibility:** ${flow.screening.fullTextArticlesAssessed}`,
    `**Full-text articles excluded (with reasons):** ${flow.screening.fullTextArticlesExcludedWithReasons}`,
  ];

  if (flow.excludedFullTextReasons.length > 0) {
    for (const reason of flow.excludedFullTextReasons) {
      lines.push(`> - ${reason.reason}: n = ${reason.count}`);
    }
  }

  lines.push(``);
  lines.push(
    `**Studies included in qualitative synthesis:** ${flow.screening.studiesIncludedInQualitativeSynthesis}`
  );

  if (flow.screening.studiesIncludedInMetaAnalysis !== undefined) {
    lines.push(
      `**Studies included in meta-analysis:** ${flow.screening.studiesIncludedInMetaAnalysis}`
    );
  }

  return lines.join("\n");
}

export function buildSearchStrategyDocument(strategies: SearchStrategy[]): string {
  const lines: string[] = ["## Search Strategy", ""];

  for (const s of strategies) {
    lines.push(`### ${s.database}`);
    lines.push("");
    lines.push(`- **Date searched:** ${s.dateSearched}`);
    lines.push(`- **Date range:** ${s.dateRange}`);
    lines.push("- **Search string:**");
    lines.push("```");
    lines.push(s.searchString);
    lines.push("```");
    lines.push(`- **Results:** ${s.results} articles`);
    lines.push("");
  }

  return lines.join("\n");
}

export function buildInclusionExclusionCriteria(params: {
  inclusion: string[];
  exclusion: string[];
}): string {
  const lines: string[] = ["## Inclusion / Exclusion Criteria", ""];

  lines.push("### Inclusion Criteria");
  lines.push("");
  for (const c of params.inclusion) {
    lines.push(`- ${c}`);
  }

  lines.push("");
  lines.push("### Exclusion Criteria");
  lines.push("");
  for (const c of params.exclusion) {
    lines.push(`- ${c}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function buildQualityAssessment(assessment: QualityAssessment): string {
  const lines: string[] = [
    "## Risk of Bias / Quality Assessment",
    "",
    `**Tool used:** ${assessment.tool}`,
    `**Overall rating:** ${assessment.overallRating}`,
    "",
  ];

  if (assessment.domains.length > 0) {
    lines.push("| Domain | Judgment | Notes |");
    lines.push("|--------|----------|-------|");
    for (const d of assessment.domains) {
      const notes = (d.notes || "").replace(/\|/g, "\\|");
      lines.push(`| ${d.label} | ${d.judgment} | ${notes} |`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function buildEvidenceGradingSummary(
  studies: IncludedStudy[]
): { high: number; moderate: number; low: number; veryLow: number } {
  let high = 0,
    moderate = 0,
    low = 0,
    veryLow = 0;

  for (const s of studies) {
    switch (s.qualityRating) {
      case "High":
        high++;
        break;
      case "Moderate":
        moderate++;
        break;
      case "Low":
        low++;
        break;
      case "Very Low":
        veryLow++;
        break;
    }
  }

  return { high, moderate, low, veryLow };
}
