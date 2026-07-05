export interface PRISMA2020FlowData {
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

export function buildPRISMA2020FlowDiagram(flow: PRISMA2020FlowData): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [
    { id: "identification", label: `Identification\nrecords from databases: ${flow.identification.recordsFromDatabases}\nadditional records: ${flow.identification.additionalRecordsFromOtherSources}\ntotal identified: ${flow.identification.totalRecordsIdentified}`, type: "identification" },
    { id: "duplicates", label: `Records after duplicates removed:\n${flow.screening.recordsAfterDuplicatesRemoved}`, type: "duplicates" },
    { id: "screened", label: `Records screened by title/abstract:\n${flow.screening.recordsScreenedByTitleAbstract}\nexcluded: ${flow.screening.recordsExcludedByTitleAbstract}`, type: "screened" },
    { id: "eligible", label: `Full-text articles assessed:\n${flow.screening.fullTextArticlesAssessed}\nexcluded: ${flow.screening.fullTextArticlesExcludedWithReasons}`, type: "eligible" },
    { id: "included", label: `Studies included in qualitative synthesis:\n${flow.screening.studiesIncludedInQualitativeSynthesis}`, type: "included" },
  ];

  if (flow.screening.studiesIncludedInMetaAnalysis !== undefined) {
    nodes.push({ id: "meta", label: `Studies included in meta-analysis:\n${flow.screening.studiesIncludedInMetaAnalysis}`, type: "meta" });
  }

  const edges = [
    { from: "identification", to: "duplicates", label: "duplicates removed" },
    { from: "duplicates", to: "screened", label: "screened" },
    { from: "screened", to: "eligible", label: "full-text assessed" },
    { from: "eligible", to: "included", label: "included" },
  ];

  if (flow.screening.studiesIncludedInMetaAnalysis !== undefined) {
    edges.push({ from: "included", to: "meta", label: "meta-analysis" });
  }

  return { nodes, edges };
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
