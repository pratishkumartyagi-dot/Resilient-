export interface ClaimDecomposition {
  population?: string;
  intervention?: string;
  comparator?: string;
  outcome?: string;
  timeframe?: string;
  setting?: string;
  questionType: "treatment" | "diagnosis" | "prognosis" | "prediction" | "exposure" | "mechanism" | "implementation" | "epidemiology" | "exploratory";
  searchableQuestion: string;
}

export interface PRISMAChecklist2020 {
  title: boolean;
  abstract: boolean;
  introduction: boolean;
  methods_search: boolean;
  methods_selection: boolean;
  methods_extraction: boolean;
  methods_quality: boolean;
  methods_synthesis: boolean;
  results_selection: boolean;
  results_characteristics: boolean;
  results_risk_of_bias: boolean;
  results_synthesis: boolean;
  discussion_limitations: boolean;
  discussion_conclusions: boolean;
  discussion_implications: boolean;
  registration: boolean;
  protocol: boolean;
  funding: boolean;
  conflicts: boolean;
  availability: boolean;
}

export interface JournalQualityScore {
  source: string;
  issn?: string;
  citescore?: number;
  sjr?: number;
  quartile: "Q1" | "Q2" | "Q3" | "Q4" | "Unknown";
  openAccess: boolean;
  verified: boolean;
}

export interface CrosscheckResult {
  claim: string;
  supportedBy: string[];
  contradictedBy: string[];
  uncorroborated: boolean;
  confidence: "high" | "moderate" | "low" | "insufficient";
}

export interface GRADEJudgment {
  outcome: string;
  riskOfBias: number;
  inconsistency: number;
  indirectness: number;
  imprecision: number;
  publicationBias: number;
  certainty: "High" | "Moderate" | "Low" | "Very Low";
  reasons: string[];
}

const PRISMA_ITEMS: { key: keyof PRISMAChecklist2020; label: string }[] = [
  { key: "title", label: "Title identified as systematic review/meta-analysis" },
  { key: "abstract", label: "Structured abstract with background, objectives, data sources, study eligibility, participants, interventions, main results, limitations, conclusions, and implications" },
  { key: "introduction", label: "Rationale and objectives described" },
  { key: "methods_search", label: "Eligibility criteria and information sources (databases, dates, registers) described" },
  { key: "methods_selection", label: "Study selection process described" },
  { key: "methods_extraction", label: "Data extraction process described" },
  { key: "methods_quality", label: "Risk of bias assessment described" },
  { key: "methods_synthesis", label: "Effect measures and synthesis methods described" },
  { key: "results_selection", label: "PRISMA flow diagram reported" },
  { key: "results_characteristics", label: "Study characteristics presented" },
  { key: "results_risk_of_bias", label: "Risk of bias across studies presented" },
  { key: "results_synthesis", label: "Results of individual studies and synthesis presented" },
  { key: "discussion_limitations", label: "Limitations of evidence discussed" },
  { key: "discussion_conclusions", label: "Conclusions with implications for practice and policy" },
  { key: "discussion_implications", label: "Limitations of review process discussed" },
  { key: "registration", label: "Registration (PROSPERO or other) reported" },
  { key: "protocol", label: "Protocol available" },
  { key: "funding", label: "Funding sources reported" },
  { key: "conflicts", label: "Conflicts of interest declared" },
  { key: "availability", label: "Data/code availability statement" },
];

export function buildPRISMAChecklist(): PRISMAChecklist2020 {
  const checklist: PRISMAChecklist2020 = {} as any;
  for (const item of PRISMA_ITEMS) {
    (checklist as any)[item.key] = false;
  }
  return checklist;
}

export function scorePRISMA(checklist: PRISMAChecklist2020): { passed: number; total: number; score: number; gaps: string[] } {
  let passed = 0;
  const gaps: string[] = [];
  for (const item of PRISMA_ITEMS) {
    if ((checklist as any)[item.key]) {
      passed++;
    } else {
      gaps.push(item.label);
    }
  }
  const total = PRISMA_ITEMS.length;
  const score = total > 0 ? (passed / total) * 100 : 0;
  return { passed, total, score, gaps };
}

export function formatPRISMAReport(scoreResult: ReturnType<typeof scorePRISMA>): string {
  const lines = [`**PRISMA 2020 Checklist Audit:** ${scoreResult.passed}/${scoreResult.total} items passed (${scoreResult.score.toFixed(1)}%)`];
  if (scoreResult.score >= 90) {
    lines.push("**Status:** ✅ Ready for submission");
  } else if (scoreResult.score >= 70) {
    lines.push("**Status:** ⚠️ Minor revisions needed");
  } else {
    lines.push("**Status:** ❌ Major revisions needed");
  }
  if (scoreResult.gaps.length > 0) {
    lines.push("\n**Gaps to address:**");
    for (const gap of scoreResult.gaps) {
      lines.push(`- ${gap}`);
    }
  }
  return lines.join("\n");
}

export function decomposeClaim(input: {
  title?: string;
  abstract?: string;
  researchTopic?: string;
}): ClaimDecomposition {
  const text = `${input.title || ""} ${input.abstract || ""} ${input.researchTopic || ""}`.toLowerCase();

  function extract(pattern: RegExp): string | undefined {
    const m = text.match(pattern);
    return m ? m[1]?.trim() : undefined;
  }

  const population =
    extract(/(?:patients?|participants?|subjects?|population|sample|cohort|individuals?|adults?|children|adolescents?|women|men|healthcare workers|hiv-infected|hand eczema|occupational|asthma|rhinitis|population)/i) ||
    extract(/(?:among|in|with|for)\s+([a-z][a-z\s]+?)(?:\s+with|\s+and|\s+who|\s+that|\s+where|,|\.|$)/i);

  const intervention =
    extract(/(?:intervention|treatment|exposure|drug|therapy|program|policy|screening|diagnostic|procedure|surgery|vaccine|antibiotic|nitrile|glove|protective\s+equipment)/i) ||
    extract(/(?:intensive\s+cattle|compost|compost\s+additive|additive)/i);

  const comparator =
    extract(/(?:compared\s+to|versus|vs\.?|standard\s+of\s+care|placebo|usual\s+care|control|alternative)/i);

  const outcome =
    extract(/(?:outcome|endpoint|result|measured|assessed|efficacy|effectiveness|safety|adherence|sensitivity|specificity|a?uc|odds\s+ratio|risk\s+ratio)/i);

  const setting =
    extract(/(?:setting|conducted|performed|hospital|clinic|centre|center|community|school|online|nationwide|multicenter|tertiary|primary\s+care|rural|urban|factory)/i);

  const timeframe = extract(/(?:follow-up|follow\s+up|duration|period|months|years|weeks|days|longitudinal?\s+\d+|12-month|24-month|5-year|10-year)/i);

  const isDiagnostics = /\b(?:sensitivity|specificity|diagnostic|accuracy|detection|screening|smi|smith|d-?dimer)\b/i.test(text);
  const isPrognostic = /\b(?:prognosis|prognostic|survival|mortality|outcome\s+prediction|risk\s+stratification)\b/i.test(text);
  const isMechanistic = /\b(?:mechanism|pathway|signaling|binding|crystallographic|structural|knockout|rescue)\b/i.test(text);
  const isEpidemiology = /\b(?:prevalence|incidence|epidemiology|burden|risk\s+factor|association)\b/i.test(text);
  const isImplementation = /\b(?:implementation|feasibility|acceptability|adoption|uptake|workflow|workflow)\b/i.test(text);

  let questionType: ClaimDecomposition["questionType"] = "exploratory";
  if (isMechanistic) questionType = "mechanism";
  else if (isDiagnostics) questionType = "diagnosis";
  else if (isPrognostic) questionType = "prognosis";
  else if (isEpidemiology) questionType = "epidemiology";
  else if (isImplementation) questionType = "implementation";

  const parts = [population, intervention, comparator, outcome].filter(Boolean);
  const searchable = parts.join(", ") + (timeframe ? ` | ${timeframe}` : "") + (setting ? ` | ${setting}` : "");

  return {
    population,
    intervention,
    comparator,
    outcome,
    timeframe,
    setting,
    questionType,
    searchableQuestion: searchable || input.researchTopic || "",
  };
}

export function buildStudySelectionSummary(papers: {
  id: string;
  selected: boolean;
  database: string;
}[]): { databases: Record<string, number>; selected: number; total: number } {
  const selected = papers.filter((p) => p.selected);
  const databases: Record<string, number> = {};
  for (const paper of selected) {
    databases[paper.database] = (databases[paper.database] || 0) + 1;
  }
  return { databases, selected: selected.length, total: papers.length };
}

export function journalQualityFromCiteScore(citeScore?: number): JournalQualityScore["quartile"] {
  if (!citeScore || citeScore <= 0) return "Unknown";
  if (citeScore >= 15) return "Q1";
  if (citeScore >= 8) return "Q2";
  if (citeScore >= 4) return "Q3";
  return "Q4";
}

export function assessJournalQuality(journal?: string): JournalQualityScore {
  if (!journal) {
    return { source: journal || "Unknown", quartile: "Unknown", openAccess: false, verified: false };
  }

  const q = journalQualityFromCiteScore();

  return {
    source: journal,
    quartile: q,
    openAccess: false,
    verified: false,
  };
}

export function buildGRADEJudgment(
  outcome: string,
  context: { riskOfBiasCount: number; inconsistencyNoted: boolean; indirectEvidence: boolean; imprecise: boolean; publicationBiasSuspected: boolean }
): GRADEJudgment {
  let certainty: GRADEJudgment["certainty"] = "High";
  const reasons: string[] = [];

  if (context.riskOfBiasCount > 0) {
    certainty = certainty === "High" ? "Moderate" : certainty;
    reasons.push(`Downgrade for risk of bias (${context.riskOfBiasCount} study(ies) at high risk)`);
  }
  if (context.inconsistencyNoted) {
    const levels: GRADEJudgment["certainty"][] = ["High", "Moderate", "Low", "Very Low"];
    certainty = levels[Math.min(levels.indexOf(certainty) + 1, levels.length - 1)];
    reasons.push("Downgrade for inconsistency (heterogeneous results or I² > 50%)");
  }
  if (context.indirectEvidence) {
    const levels: GRADEJudgment["certainty"][] = ["High", "Moderate", "Low", "Very Low"];
    certainty = levels[Math.min(levels.indexOf(certainty) + 1, levels.length - 1)];
    reasons.push("Downgrade for indirectness (PICO mismatch or surrogate outcomes)");
  }
  if (context.imprecise) {
    const levels: GRADEJudgment["certainty"][] = ["High", "Moderate", "Low", "Very Low"];
    certainty = levels[Math.min(levels.indexOf(certainty) + 1, levels.length - 1)];
    reasons.push("Downgrade for imprecision (wide confidence intervals or few events)");
  }
  if (context.publicationBiasSuspected) {
    const levels: GRADEJudgment["certainty"][] = ["High", "Moderate", "Low", "Very Low"];
    certainty = levels[Math.min(levels.indexOf(certainty) + 1, levels.length - 1)];
    reasons.push("Downgrade for publication bias");
  }

  return {
    outcome,
    riskOfBias: context.riskOfBiasCount,
    inconsistency: context.inconsistencyNoted ? 1 : 0,
    indirectness: context.indirectEvidence ? 1 : 0,
    imprecision: context.imprecise ? 1 : 0,
    publicationBias: context.publicationBiasSuspected ? 1 : 0,
    certainty,
    reasons,
  };
}

export function formatGRADEJudgment(judgment: GRADEJudgment): string {
  const lines = [
    `**Outcome:** ${judgment.outcome}`,
    `**Certainty:** ${judgment.certainty}`,
    `| Domain | Judgment |`,
    `|--------|----------|`,
    `| Risk of Bias | ${judgment.riskOfBias > 0 ? `Downgrade (${judgment.riskOfBias})` : "No downgrade"} |`,
    `| Inconsistency | ${judgment.inconsistency > 0 ? "Downgrade" : "No downgrade"} |`,
    `| Indirectness | ${judgment.indirectness > 0 ? "Downgrade" : "No downgrade"} |`,
    `| Imprecision | ${judgment.imprecision > 0 ? "Downgrade" : "No downgrade"} |`,
    `| Publication Bias | ${judgment.publicationBias > 0 ? "Suspected / Downgrade" : "Not suspected"} |`,
  ];
  if (judgment.reasons.length > 0) {
    lines.push(`\n**Rationale:** ${judgment.reasons.join("; ")}`);
  }
  return lines.join("\n");
}

export interface SemanticSelectionInput {
  topic: string;
  subtopics: string[];
  papers: { id: string; title: string; abstract: string; subcategory?: string }[];
}

export function selectPapersBySemanticRelevance(input: SemanticSelectionInput): {
  selected: { id: string; relevanceScore: number }[];
  coverage: Record<string, number>;
} {
  const topicKeywords = input.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !["with","from","this","that","these","those","study","into"].includes(w));
  const subtopicKeywords = input.subtopics.flatMap((sub) => sub.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

  const allKeywords = new Set([...topicKeywords, ...subtopicKeywords]);

  const scored = input.papers.map((paper) => {
    const titleLower = paper.title.toLowerCase();
    const abstractLower = (paper.abstract || "").toLowerCase();
    let score = 0;
    for (const kw of allKeywords) {
      if (titleLower.includes(kw)) score += 4;
      if (abstractLower.includes(kw)) score += 1;
    }
    return { id: paper.id, relevanceScore: score };
  });

  const coverage: Record<string, number> = {};
  for (const sub of input.subtopics) {
    coverage[sub] = 0;
  }
  for (const paper of input.papers) {
    const abstractLower = (paper.abstract || "").toLowerCase();
    for (const sub of input.subtopics) {
      if (sub.toLowerCase().split(/\s+/).some((kw) => abstractLower.includes(kw))) {
        coverage[sub]++;
      }
    }
  }

  return {
    selected: scored.sort((a, b) => b.relevanceScore - a.relevanceScore),
    coverage,
  };
}
