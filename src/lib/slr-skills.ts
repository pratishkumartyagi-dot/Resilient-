/**
 * SLR-Engine skills — systematic literature review step-by-step workflow.
 *
 * Adapted from https://github.com/tuirk/SLR-Engine#step-by-step-workflow
 *
 * All skills ported, including optional ones:
 *   1. Problem Formulation (PICO/PECO/PECOT/freeflow research question)
 *   2. Protocol Development (inclusion/exclusion criteria, search strategy)
 *   3. Literature Search (multi-database search with compiled queries)
 *   4. Study Selection (title/abstract screening, full-text screening)
 *   5. Data Extraction (PICO extraction, evidence table)
 *   6. Quality Assessment (risk of bias — ROB-2, NOS, AMSTAR-2)
 *   7. Data Synthesis (evidence synthesis, PRISMA flow, meta-analysis prep)
 *   8. Reporting (manuscript generation, PRISMA 2020 compliance)
 */

export type SLRFramework = "PICO" | "PECO" | "PECOT" | "freeflow";

export interface SLRQuestion {
  framework: SLRFramework;
  population?: string;
  intervention?: string;
  exposure?: string;
  comparator?: string;
  outcome?: string;
  timeframe?: string;
  studyType?: string;
  freeQuery?: string;
  yearFrom?: string;
  yearTo?: string;
}

export interface SLRSearchStrategy {
  databases: string[];
  keywords: string[];
  compiledQueries: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
}

export interface SLRPaper {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  abstract: string;
  database: string;
  studyType: string;
  selected: boolean;
  screened: boolean;
  included: boolean;
  screeningReason?: string;
  pico?: any;
  riskOfBias?: string;
}

export interface SLRStepResult {
  step: number;
  name: string;
  completed: boolean;
  data: any;
}

/**
 * Skill 1 — Problem Formulation
 * Builds a PICO/PECO/PECOT/freeflow research question from user inputs.
 */
export function buildProblemFormulation(q: SLRQuestion): string {
  const lines: string[] = [];
  lines.push("# SLR Step 1 — Problem Formulation");
  lines.push("");
  lines.push(`Framework: **${q.framework}**`);
  lines.push("");
  if (q.framework === "freeflow") {
    lines.push(`Research Question: ${q.freeQuery}`);
  } else {
    lines.push("| Element | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Population (P) | ${q.population || "—"} |`);
    if (q.framework === "PECO" || q.framework === "PECOT") {
      lines.push(`| Exposure (E) | ${q.exposure || "—"} |`);
    } else {
      lines.push(`| Intervention (I) | ${q.intervention || "—"} |`);
    }
    if (q.framework === "PECOT") {
      lines.push(`| Comparator (C) | ${q.comparator || "—"} |`);
      lines.push(`| Timeframe (T) | ${q.timeframe || "—"} |`);
    } else if (q.framework === "PICO" || q.framework === "PECO") {
      lines.push(`| Comparator (C) | ${q.comparator || "—"} |`);
      lines.push(`| Outcome (O) | ${q.outcome || "—"} |`);
    }
    if (q.framework === "PICO" || q.framework === "PECOT") {
      lines.push(`| Timeframe (T) | ${q.timeframe || "—"} |`);
    }
  }
  if (q.yearFrom || q.yearTo) {
    lines.push("");
    lines.push(`Year Range: ${q.yearFrom || "—"} to ${q.yearTo || "—"}`);
  }
  return lines.join("\n");
}

/**
 * Skill 2 — Protocol Development
 * Defines inclusion/exclusion criteria and search strategy.
 */
export function buildProtocol(q: SLRQuestion, databases: string[]): string {
  const lines: string[] = [];
  lines.push("# SLR Step 2 — Protocol Development");
  lines.push("");
  lines.push("## Inclusion Criteria");
  lines.push("- Papers published within the selected year range");
  lines.push("- Papers addressing the research question elements");
  lines.push("- Peer-reviewed journal articles, conference papers, or preprints");
  lines.push("- Full text or abstract available");
  lines.push("");
  lines.push("## Exclusion Criteria");
  lines.push("- Papers outside the year range");
  lines.push("- Papers not addressing the research question");
  lines.push("- Non-peer-reviewed opinion pieces or editorials");
  lines.push("- Duplicate records");
  lines.push("");
  lines.push("## Databases to Search");
  lines.push(databases.map((d) => `- ${d}`).join("\n"));
  lines.push("");
  lines.push("## Search String Construction");
  lines.push("Keywords derived from PICO/PECO/PECOT elements combined with Boolean operators.");
  return lines.join("\n");
}

/**
 * Skill 3 — Literature Search
 * Generates compiled database queries from the research question.
 */
export function buildSearchQueries(q: SLRQuestion, databases: string[]): string[] {
  const queries: string[] = [];
  const terms: string[] = [];

  if (q.framework === "freeflow") {
    terms.push(q.freeQuery || "");
  } else {
    const p = q.population || "";
    const i = q.framework === "PECO" || q.framework === "PECOT" ? q.exposure || "" : q.intervention || "";
    const c = q.comparator || "";
    const o = q.outcome || "";
    const t = q.timeframe || "";

    const popTerms = p.split(/\s+/).filter(Boolean).map((w) => `(${w})`).join(" OR ");
    const intTerms = i.split(/\s+/).filter(Boolean).map((w) => `(${w})`).join(" OR ");
    const compTerms = c.split(/\s+/).filter(Boolean).map((w) => `(${w})`).join(" OR ");
    const outTerms = o.split(/\s+/).filter(Boolean).map((w) => `(${w})`).join(" OR ");
    const timeTerms = t.split(/\s+/).filter(Boolean).map((w) => `(${w})`).join(" OR ");

    if (popTerms) terms.push(`(${popTerms})`);
    if (intTerms) terms.push(`(${intTerms})`);
    if (compTerms) terms.push(`(${compTerms})`);
    if (outTerms) terms.push(`(${outTerms})`);
    if (timeTerms) terms.push(`(${timeTerms})`);
  }

  const combined = terms.join(" AND ");
  for (const db of databases) {
    queries.push(`[${db}] ${combined} ${q.yearFrom && q.yearTo ? `(${q.yearFrom}:${q.yearTo}[dp])` : ""}`.trim());
  }
  return queries;
}

/**
 * Skill 4 — Study Selection
 * Applies inclusion/exclusion criteria to screen papers.
 */
export function buildScreeningCriteria(q: SLRQuestion): string {
  const lines: string[] = [];
  lines.push("# SLR Step 4 — Study Selection Criteria");
  lines.push("");
  lines.push("## Title & Abstract Screening");
  lines.push("- Include if title/abstract addresses any PICO/PECO/PECOT element");
  lines.push("- Exclude if clearly outside scope (wrong population, intervention, outcome)");
  lines.push("");
  lines.push("## Full-Text Screening");
  lines.push("- Include if full text confirms PICO/PECO/PECOT alignment");
  lines.push("- Exclude if full text unavailable or does not address research question");
  lines.push("- Exclude if study design is inappropriate for the question");
  lines.push("");
  lines.push("## Screening Decision");
  lines.push("Each paper receives: INCLUDE / EXCLUDE / MAYBE (full-text review needed)");
  return lines.join("\n");
}

/**
 * Skill 5 — Data Extraction
 * Extracts PICO elements and study details from each included paper.
 */
export function buildExtractionPrompt(papers: any[]): string {
  const lines: string[] = [];
  lines.push("# SLR Step 5 — Data Extraction");
  lines.push("");
  lines.push("For each included paper, extract:");
  lines.push("- Study design and setting");
  lines.push("- Population characteristics");
  lines.push("- Intervention/Exposure details");
  lines.push("- Comparator group");
  lines.push("- Outcome measures and results");
  lines.push("- Sample size and effect estimates");
  lines.push("");
  lines.push("## Papers to Extract:");
  papers.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.title} (${p.year}) — ${p.database}`);
    lines.push(`   Abstract: ${p.abstract}`);
  });
  return lines.join("\n");
}

/**
 * Skill 6 — Quality Assessment (Risk of Bias)
 * Assesses risk of bias using appropriate tools per study design.
 */
export function buildQualityAssessment(): string {
  return `# SLR Step 6 — Quality Assessment (Risk of Bias)

## Tools by Study Design:
- **RCTs:** Cochrane RoB 2 (randomisation, deviations, missing data, outcome measurement, selective reporting)
- **Observational:** Newcastle-Ottawa Scale (selection, comparability, outcome/exposure)
- **Systematic Reviews:** AMSTAR 2
- **Diagnostic Accuracy:** QUADAS-2
- **Qualitative:** CASP Qualitative Checklist

## Risk of Bias Ratings:
- Low risk
- Some concerns
- High risk

## Output per paper:
- Overall risk of bias judgement
- Domain-specific judgements
- Rationale for each judgement`;
}

/**
 * Skill 7 — Data Synthesis
 * Synthesizes evidence across included papers, builds PRISMA flow.
 */
export function buildSynthesisPrompt(papers: any[], prisma: { identified: number; screened: number; eligible: number; included: number }): string {
  const lines: string[] = [];
  lines.push("# SLR Step 7 — Data Synthesis");
  lines.push("");
  lines.push("## PRISMA 2020 Flow");
  lines.push(`- Identified: ${prisma.identified}`);
  lines.push(`- Screened: ${prisma.screened}`);
  lines.push(`- Eligible: ${prisma.eligible}`);
  lines.push(`- Included: ${prisma.included}`);
  lines.push("");
  lines.push("## Evidence Synthesis");
  lines.push("Group findings by theme, not by study.");
  lines.push("Report convergent and divergent findings.");
  lines.push("Grade evidence strength (T1/T2/T3/T4).");
  lines.push("Identify research gaps and future work.");
  lines.push("");
  lines.push("## Included Papers:");
  papers.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.title} (${p.year}) — ${p.database}`);
  });
  return lines.join("\n");
}

/**
 * Skill 8 — Reporting
 * Generates the final SLR manuscript following PRISMA 2020.
 */
export function buildReportingPrompt(q: SLRQuestion, papers: any[], synthesis: string): string {
  const lines: string[] = [];
  lines.push("# SLR Step 8 — Reporting (PRISMA 2020)");
  lines.push("");
  lines.push("## Title");
  lines.push(`Systematic Literature Review: ${q.freeQuery || q.population || "Research Topic"}`);
  lines.push("");
  lines.push("## Abstract");
  lines.push("Background, Methods, Results, Conclusions (structured)");
  lines.push("");
  lines.push("## Introduction");
  lines.push("Research problem, gap, objectives");
  lines.push("");
  lines.push("## Methods");
  lines.push("Protocol registration, eligibility criteria, search strategy, study selection, data extraction, risk of bias, synthesis methods");
  lines.push("");
  lines.push("## Results");
  lines.push("Study selection (PRISMA flow), study characteristics, risk of bias, synthesis of results");
  lines.push("");
  lines.push("## Discussion");
  lines.push("Summary of evidence, limitations, implications for practice and research");
  lines.push("");
  lines.push("## Conclusion");
  lines.push("Main findings and future directions");
  lines.push("");
  lines.push("## References");
  lines.push("Vancouver-style reference list with DOIs");
  return lines.join("\n");
}

/**
 * Skill 9 (Optional) — Citation Chasing
 * Forward and backward citation searching.
 */
export function buildCitationChasing(paperId: string, paperTitle: string): string {
  return `# SLR Optional — Citation Chasing\n\nPaper: ${paperTitle}\n\n- Backward citation search (references cited by this paper)\n- Forward citation search (papers citing this paper)\n- Identify additional relevant studies for inclusion`;
}

/**
 * Skill 10 (Optional) — Living SLR
 * Sets up ongoing monitoring for new evidence.
 */
export function buildLivingSLR(query: string): string {
  return `# SLR Optional — Living Systematic Review\n\nSearch Query: ${query}\n\n- Schedule periodic re-runs of the search strategy\n- Screen new records against inclusion criteria\n- Update synthesis and conclusions as new evidence emerges\n- Maintain versioned review with change log`;
}

export const SLR_SKILLS = [
  { id: "problem-formulation", name: "Problem Formulation", step: 1, optional: false },
  { id: "protocol-development", name: "Protocol Development", step: 2, optional: false },
  { id: "literature-search", name: "Literature Search", step: 3, optional: false },
  { id: "study-selection", name: "Study Selection", step: 4, optional: false },
  { id: "data-extraction", name: "Data Extraction", step: 5, optional: false },
  { id: "quality-assessment", name: "Quality Assessment (Risk of Bias)", step: 6, optional: false },
  { id: "data-synthesis", name: "Data Synthesis", step: 7, optional: false },
  { id: "reporting", name: "Reporting (PRISMA 2020)", step: 8, optional: false },
  { id: "citation-chasing", name: "Citation Chasing", step: 9, optional: true },
  { id: "living-slr", name: "Living SLR", step: 10, optional: true },
];
