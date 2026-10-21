// Per-track search strategy compilation.
//
// Every database family has a different query language, so a single boolean
// string cannot be reused across all of them. The compiler therefore produces
// one plan with three tracks:
//
//   Track 1 — field-tagged biomedical databases (PubMed, ClinicalTrials.gov).
//              Full boolean nesting, MeSH headings, publication-type filters.
//
//   Track 2 — simple full-text databases (OpenAlex, Europe PMC, Crossref,
//              DOAJ, OpenAIRE, Semantic Scholar, dblp, Zenodo, Google Scholar).
//              One query per concept, terms OR-ed inside a concept.
//
//   Track 3 — preprint servers (bioRxiv, medRxiv, arXiv). Restricted syntax,
//              so only the top synonyms of each concept are used and every
//              concept is AND-ed into a single query.

import type { ConceptBlock } from "./concept-extraction";

export type QueryTrack = 1 | 2 | 3;

export interface CompiledQuery {
  database: string;
  track: QueryTrack;
  query: string;
  label: string;
  /** ClinicalTrials.gov study-type area applied natively by the database. */
  nativeStudyType?: string;
  /** True when the study-type restriction is already part of the query. */
  studyTypeFilteredNatively: boolean;
}

export interface QueryPlan {
  track1: CompiledQuery[];
  track2: CompiledQuery[];
  track3: CompiledQuery[];
  all: CompiledQuery[];
}

export const DATABASE_TRACKS: Record<string, QueryTrack> = {
  PubMed: 1,
  "ClinicalTrials.gov": 1,
  OpenAlex: 2,
  "Europe PMC": 2,
  DOAJ: 2,
  Crossref: 2,
  OpenAIRE: 2,
  "Semantic Scholar": 2,
  dblp: 2,
  Zenodo: 2,
  "Google Scholar": 2,
  bioRxiv: 3,
  medRxiv: 3,
  arXiv: 3,
};

/**
 * PubMed publication-type / MeSH filters per study type.
 *
 * The field tag must sit OUTSIDE the quotes ("term"[pt]) — PubMed silently
 * treats "term"[pt] as a literal phrase and returns nothing useful.
 */
export const PUBMED_STUDY_TYPE_TAGS: Record<
  string,
  Array<{ term: string; field: "pt" | "mh" }>
> = {
  "Randomized Controlled Trial (RCT)": [
    { term: "randomized controlled trial", field: "pt" },
    { term: "randomised controlled trial", field: "pt" },
    { term: "randomized controlled trials", field: "pt" },
    { term: "randomised controlled trials", field: "pt" },
  ],
  "Systematic Review": [
    { term: "systematic review", field: "pt" },
    { term: "systematic reviews", field: "pt" },
  ],
  "Meta-Analysis": [
    { term: "meta-analysis", field: "pt" },
    { term: "meta analysis", field: "pt" },
  ],
  "Observational Study": [{ term: "observational study", field: "pt" }],
  "Cohort Study": [
    { term: "cohort study", field: "pt" },
    { term: "cohort studies", field: "pt" },
    { term: "cohort", field: "mh" },
  ],
  "Case-Control Study": [
    { term: "case-control studies", field: "pt" },
    { term: "case control", field: "mh" },
  ],
  "Cross-Sectional Study": [{ term: "cross-sectional studies", field: "pt" }],
  "Clinical Trial": [
    { term: "clinical trial", field: "pt" },
    { term: "clinical trials", field: "pt" },
  ],
  "Qualitative Study": [
    { term: "qualitative research", field: "pt" },
    { term: "qualitative studies", field: "pt" },
  ],
  "Case Report / Case Series": [
    { term: "case reports", field: "pt" },
    { term: "case series", field: "pt" },
  ],
  "Review Article": [{ term: "review", field: "pt" }],
  "Guideline / Consensus Statement": [
    { term: "guideline", field: "pt" },
    { term: "practice guideline", field: "pt" },
    { term: "consensus development conference", field: "pt" },
  ],
  "Dissertation / Thesis": [
    { term: "dissertation", field: "pt" },
    { term: "thesis", field: "pt" },
  ],
};

/** ClinicalTrials.gov study-type areas per study type. */
export const CLINICAL_TRIALS_STUDY_TYPE_AREAS: Record<string, string[]> = {
  "Randomized Controlled Trial (RCT)": ["interventional"],
  "Clinical Trial": ["interventional"],
  "Observational Study": ["observational"],
  "Cohort Study": ["observational"],
  "Case-Control Study": ["observational"],
  "Cross-Sectional Study": ["observational"],
  "Case Report / Case Series": ["observational"],
  "Qualitative Study": ["observational"],
};

export interface CompileOptions {
  concepts: ConceptBlock[];
  studyTypes: string[];
  databases: string[];
  searchLogic?: "AND" | "OR" | "NOT";
  rawQuery?: string;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = (value || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function splitConcepts(concepts: ConceptBlock[]) {
  const search = concepts.filter((c) => c.role !== "design" && !c.negated);
  const design = concepts.filter((c) => c.role === "design" && !c.negated);
  const negated = concepts.filter((c) => c.negated);
  return {
    required: search.filter((c) => c.required),
    optional: search.filter((c) => !c.required),
    design,
    negated,
  };
}

/** PubMed variants for one concept: free text in [tiab] plus MeSH headings. */
function pubMedVariants(concept: ConceptBlock): string[] {
  const variants: string[] = [`"${concept.label}"[tiab]`];
  for (const synonym of uniqueStrings(concept.synonyms || [])) {
    variants.push(`"${synonym}"[tiab]`);
  }
  for (const mesh of uniqueStrings(concept.meshTerms || [])) {
    variants.push(`"${mesh}"[Mesh]`);
  }
  return uniqueStrings(variants);
}

/** Build the PubMed publication-type clause for the selected study types. */
export function compilePubMedStudyTypeClause(studyTypes: string[]): string {
  const parts: string[] = [];
  for (const studyType of studyTypes) {
    const tags = PUBMED_STUDY_TYPE_TAGS[studyType];
    if (!tags || tags.length === 0) continue;
    parts.push(`(${tags.map((t) => `"${t.term}"[${t.field}]`).join(" OR ")})`);
  }
  if (parts.length === 0) return "";
  return `(${parts.join(" OR ")})`;
}

/** Compile the Track 1 PubMed query. */
export function compilePubMedQuery(options: CompileOptions): string {
  const { concepts, studyTypes, searchLogic = "AND", rawQuery } = options;
  const { required, optional, design, negated } = splitConcepts(concepts);

  const groups: string[] = [];

  // Required concepts form the core topic and are combined with the logic the
  // user selected in Step 1.
  const joiner = searchLogic === "OR" ? " OR " : " AND ";
  const requiredClauses = required
    .map((c) => pubMedVariants(c))
    .filter((v) => v.length > 0)
    .map((v) => `(${v.join(" OR ")})`);
  if (requiredClauses.length > 0) groups.push(requiredClauses.join(joiner));

  const designClauses = design
    .map((c) => pubMedVariants(c))
    .filter((v) => v.length > 0)
    .map((v) => `(${v.join(" OR ")})`);
  if (designClauses.length > 0) groups.push(designClauses.join(" OR "));

  // Optional concepts are alternatives to each other.
  const optionalClauses = optional
    .map((c) => pubMedVariants(c))
    .filter((v) => v.length > 0)
    .map((v) => `(${v.join(" OR ")})`);
  if (optionalClauses.length > 0) groups.push(optionalClauses.join(" OR "));

  if (groups.length === 0 && rawQuery) {
    const fallback = rawQuery
      .split(/\s+AND\s+/i)
      .map((t) => `"${t.trim()}"[tiab]`)
      .join(" AND ");
    groups.push(fallback);
  }

  const negatedClauses = negated
    .map((c) => pubMedVariants(c))
    .filter((v) => v.length > 0)
    .map((v) => `(${v.join(" OR ")})`);
  if (negatedClauses.length > 0) {
    groups.push(`NOT ${negatedClauses.join(" AND ")}`);
  }

  const studyTypeClause = compilePubMedStudyTypeClause(studyTypes);
  if (studyTypeClause) groups.push(studyTypeClause);

  return groups.map((g) => `(${g})`).join(" AND ");
}

/** Compile the Track 1 ClinicalTrials.gov query. */
export function compileClinicalTrialsQuery(options: CompileOptions): string {
  const { concepts, rawQuery } = options;
  const { required, optional, design, negated } = splitConcepts(concepts);

  const groups: string[] = [];

  const conditionTerms = uniqueStrings(
    required
      .filter((c) => c.role === "condition")
      .flatMap((c) => [c.label, ...(c.synonyms || [])])
  );
  if (conditionTerms.length > 0) {
    groups.push(
      `AREA[ConditionSearch](${conditionTerms.map((t) => `"${t}"`).join(" OR ")})`
    );
  }

  const otherTerms = uniqueStrings(
    [...required, ...optional]
      .filter((c) => c.role !== "condition")
      .flatMap((c) => [c.label, ...(c.synonyms || [])])
  );
  if (otherTerms.length > 0) {
    groups.push(`(${otherTerms.map((t) => `"${t}"`).join(" OR ")})`);
  }

  const designTerms = uniqueStrings(
    design.flatMap((c) => [c.label, ...(c.synonyms || [])])
  );
  if (designTerms.length > 0) {
    groups.push(`AREA[Title](${designTerms.map((t) => `"${t}"`).join(" OR ")})`);
  }

  const negatedTerms = uniqueStrings(
    negated.flatMap((c) => [c.label, ...(c.synonyms || [])])
  );
  if (negatedTerms.length > 0) {
    groups.push(`NOT (${negatedTerms.map((t) => `"${t}"`).join(" OR ")})`);
  }

  if (groups.length === 0 && rawQuery) {
    groups.push(`("${rawQuery.trim()}")`);
  }

  return groups.map((g) => `(${g})`).join(" AND ");
}

/** Native ClinicalTrials.gov study-type area for the selected study types. */
export function clinicalTrialsStudyTypeArea(studyTypes: string[]): string | undefined {
  const areas = new Set<string>();
  for (const studyType of studyTypes) {
    for (const area of CLINICAL_TRIALS_STUDY_TYPE_AREAS[studyType] || []) {
      areas.add(area);
    }
  }
  if (areas.size === 0) return undefined;
  if (areas.size === 1) return Array.from(areas)[0];
  return "interventional"; // mixed selection — interventional is the superset
}

/** Simple (unfielded) term list for one concept. */
function simpleTerms(concept: ConceptBlock, limit = 8): string[] {
  return uniqueStrings([concept.label, ...(concept.synonyms || [])]).slice(0, limit);
}

/**
 * Track 2 — one query per concept so a broad database returns records for
 * each concept independently.
 */
export function compileTrack2Queries(
  database: string,
  options: CompileOptions
): CompiledQuery[] {
  const { concepts, rawQuery } = options;
  const { required, optional, design } = splitConcepts(concepts);
  const ordered = [...required, ...optional, ...design].filter((c) => !c.negated);

  const queries: CompiledQuery[] = [];
  ordered.slice(0, 3).forEach((concept) => {
    const terms = simpleTerms(concept);
    if (terms.length === 0) return;
    // Parenthesised so the OR group cannot be re-associated by databases that
    // bind AND tighter than OR (Europe PMC, for example).
    const body = terms.map((t) => `"${t}"`).join(" OR ");
    queries.push({
      database,
      track: 2,
      query: terms.length > 1 ? `(${body})` : body,
      label: `${database} — ${concept.label}`,
      studyTypeFilteredNatively: false,
    });
  });

  if (queries.length === 0 && rawQuery) {
    queries.push({
      database,
      track: 2,
      query: rawQuery.trim(),
      label: `${database} — raw query`,
      studyTypeFilteredNatively: false,
    });
  }

  return queries;
}

/**
 * Track 3 — preprint servers have a restricted query language, so a single
 * AND-ed query built from the top synonyms of every concept is used.
 */
export function compileTrack3Queries(
  database: string,
  options: CompileOptions
): CompiledQuery[] {
  const { concepts, rawQuery } = options;
  const { required, optional, design } = splitConcepts(concepts);
  const ordered = [...required, ...optional, ...design].filter((c) => !c.negated);

  const groups = ordered
    .map((concept) => {
      const terms = simpleTerms(concept, 3);
      if (terms.length === 0) return "";
      return `(${terms.map((t) => `"${t}"`).join(" OR ")})`;
    })
    .filter(Boolean);

  const query =
    groups.length > 0
      ? groups.join(" AND ")
      : rawQuery
        ? `("${rawQuery.trim()}")`
        : "";

  if (!query) return [];

  return [
    {
      database,
      track: 3,
      query,
      label: `${database} — combined concept query`,
      studyTypeFilteredNatively: false,
    },
  ];
}

/** Compile the full plan for the selected databases. */
export function compileQueryPlan(options: CompileOptions): QueryPlan {
  const databases = options.databases.length
    ? options.databases
    : Object.keys(DATABASE_TRACKS);

  const track1: CompiledQuery[] = [];
  const track2: CompiledQuery[] = [];
  const track3: CompiledQuery[] = [];

  for (const database of databases) {
    const track = DATABASE_TRACKS[database] || 2;
    if (track === 1) {
      if (database === "PubMed") {
        const query = compilePubMedQuery(options);
        if (query) {
          track1.push({
            database,
            track: 1,
            query,
            label: "PubMed — field-tagged boolean search",
            studyTypeFilteredNatively: options.studyTypes.length > 0,
          });
        }
      } else if (database === "ClinicalTrials.gov") {
        const query = compileClinicalTrialsQuery(options);
        if (query) {
          track1.push({
            database,
            track: 1,
            query,
            label: "ClinicalTrials.gov — area-scoped search",
            nativeStudyType: clinicalTrialsStudyTypeArea(options.studyTypes),
            studyTypeFilteredNatively: options.studyTypes.length > 0,
          });
        }
      }
      continue;
    }

    if (track === 2) {
      track2.push(...compileTrack2Queries(database, options));
      continue;
    }

    track3.push(...compileTrack3Queries(database, options));
  }

  return {
    track1,
    track2,
    track3,
    all: [...track1, ...track2, ...track3],
  };
}

/** Human-readable summary of a compiled plan, used by the Step 1 preview. */
export function summarizePlan(plan: QueryPlan): string[] {
  const lines: string[] = [];
  if (plan.track1.length > 0) {
    lines.push("Track 1 — field-tagged biomedical databases");
    for (const q of plan.track1) lines.push(`  ${q.database}: ${q.query}`);
  }
  if (plan.track2.length > 0) {
    lines.push("Track 2 — simple full-text databases");
    for (const q of plan.track2) lines.push(`  ${q.database}: ${q.query}`);
  }
  if (plan.track3.length > 0) {
    lines.push("Track 3 — preprint servers");
    for (const q of plan.track3) lines.push(`  ${q.database}: ${q.query}`);
  }
  return lines;
}
