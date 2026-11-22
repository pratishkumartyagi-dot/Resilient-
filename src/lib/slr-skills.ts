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
 * ------------------------------------------------------------------
 * Database-specific search strategy builders (Skill 3b)
 * ------------------------------------------------------------------
 *
 * Generates per-database search strings in the exact syntax each
 * database understands, following the evidence-synthesis search
 * strategy format (one concept block per database field, concepts
 * AND-ed across blocks).
 *
 * Concepts are extracted from the PICO/PECO/PECOT fields or the
 * free-flow query. Known concepts (e.g. india, air pollution,
 * anemia) are expanded with controlled-vocabulary terms (MeSH,
 * Embase exp, WoS TS=, GIM tw:) plus free-text [tiab]/ti,ab,kw
 * variants. Unknown concepts fall back to the raw query terms.
 */

/** A single concept extracted from the research question. */
export interface SearchConcept {
  label: string;        // human-readable concept name
  terms: string[];      // raw terms for this concept (used for fallbacks)
}

/** Extracted concept blocks from an SLR question. */
export interface SearchConcepts {
  population: SearchConcept;   // P — country / population
  exposure: SearchConcept;     // I / E — intervention / exposure
  outcome: SearchConcept;      // O — outcome
}

/** Extract concept blocks from an SLR question. */
export function extractSearchConceptsFromQuestion(q: SLRQuestion): SearchConcepts {
  const popRaw = q.framework === "freeflow" ? q.freeQuery || "" : q.population || "";
  const expRaw = q.framework === "PECO" || q.framework === "PECOT"
    ? q.exposure || ""
    : q.intervention || "";
  const outRaw = q.outcome || "";

  const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);

  return {
    population: {
      label: "Population / Location",
      terms: splitWords(popRaw),
    },
    exposure: {
      label: "Exposure / Intervention",
      terms: splitWords(expRaw),
    },
    outcome: {
      label: "Outcome",
      terms: splitWords(outRaw),
    },
  };
}

/** Recognised concept → canonical key (lowercased, trimmed). */
function conceptKey(terms: string[]): string {
  return terms.map((t) => t.toLowerCase().trim()).join(" ");
}

/** Known concept expansions for database-specific searching.
 *  Each concept maps to per-database term lists. */
interface ConceptExpansion {
  pubmedMesh: string[];      // MeSH headings for PubMed
  pubmedTiab: string[];      // [Title/Abstract] terms for PubMed
  europepmcMesh: string[];   // MESH:"term" for Europe PMC
  europepmcTitle: string[];  // TITLE:(...) for Europe PMC
  europepmcAbstract: string[]; // ABSTRACT:(...) for Europe PMC
  europepmcKw: string[];     // KW:(...) for Europe PMC
  embaseExp: string[];       // /exp terms for Embase
  embaseTiab: string[];      // :ti,ab,kw terms for Embase
  wos: string[];             // TS= terms for Web of Science
  gim: string[];             // tw: terms for WHO GIM
  medRxiv: string[];         // separate medRxiv sub-queries (each combined with location+outcome)
  scholar: string[];         // Google Scholar parenthesised OR group
}

/** Known concept dictionary — seeded with the typhoid/air-pollution/anaemia
 *  examples from the request. Unknown concepts fall back to raw terms. */
const CONCEPT_DICTIONARY: Record<string, ConceptExpansion> = {
  india: {
    pubmedMesh: ["India[MeSH Terms]"],
    pubmedTiab: ["India[tiab]", "Indian[tiab]"],
    europepmcMesh: ['MESH:"India"'],
    europepmcTitle: ["TITLE:(india OR indian)"],
    europepmcAbstract: ["ABSTRACT:(india OR indian)"],
    europepmcKw: ["KW:(india OR indian)"],
    embaseExp: ["'india'/exp"],
    embaseTiab: ["india:ti,ab,kw", "indian:ti,ab,kw"],
    wos: ["india", "indian"],
    gim: ["india", "indian"],
    medRxiv: ["india"],
    scholar: ["india"],
  },
  "air pollution": {
    pubmedMesh: [
      '"Air Pollution"[MeSH]',
      '"Air Pollutants"[MeSH]',
      '"Air Pollution, Indoor"[MeSH]',
      '"Particulate Matter"[MeSH]',
      '"Tobacco Smoke Pollution"[MeSH]',
    ],
    pubmedTiab: [
      '"air pollut*"[tiab]',
      '"particulate matter"[tiab]',
      "PM2.5[tiab]",
      "PM10[tiab]",
      '"household air pollution"[tiab]',
      '"solid fuel*"[tiab]',
      "biomass[tiab]",
      '"cooking fuel*"[tiab]',
      '"clean fuel*"[tiab]',
      "cookstove*[tiab]",
      '"black carbon"[tiab]',
      '"nitrogen dioxide"[tiab]',
      '"second-hand smoke"[tiab]',
    ],
    europepmcMesh: [
      'MESH:"Air Pollution"',
      'MESH:"Air Pollutants"',
      'MESH:"Air Pollution, Indoor"',
      'MESH:"Particulate Matter"',
      'MESH:"Tobacco Smoke Pollution"',
    ],
    europepmcTitle: [
      'TITLE:("air pollution" OR "air pollutant" OR "air pollutants" OR "particulate matter" OR PM2.5 OR PM10 OR "household air pollution" OR "solid fuel" OR "solid fuels" OR biomass OR "cooking fuel" OR "cooking fuels" OR "clean fuel" OR "clean fuels" OR cookstove OR cookstoves OR "black carbon" OR "nitrogen dioxide" OR "second-hand smoke")',
    ],
    europepmcAbstract: [
      'ABSTRACT:("air pollution" OR "air pollutant" OR "air pollutants" OR "particulate matter" OR PM2.5 OR PM10 OR "household air pollution" OR "solid fuel" OR "solid fuels" OR biomass OR "cooking fuel" OR "cooking fuels" OR "clean fuel" OR "clean fuels" OR cookstove OR cookstoves OR "black carbon" OR "nitrogen dioxide" OR "second-hand smoke")',
    ],
    europepmcKw: [
      'KW:("air pollution" OR "air pollutant" OR "air pollutants" OR "particulate matter" OR PM2.5 OR PM10 OR "household air pollution" OR "solid fuel" OR "solid fuels" OR biomass OR "cooking fuel" OR "cooking fuels" OR "clean fuel" OR "clean fuels" OR cookstove OR cookstoves OR "black carbon" OR "nitrogen dioxide" OR "second-hand smoke")',
    ],
    embaseExp: [
      "'air pollution'/exp",
      "'air pollutant'/exp",
      "'indoor air pollution'/exp",
      "'particulate matter'/exp",
      "'passive smoking'/exp",
    ],
    embaseTiab: [
      "'air pollut*':ti,ab,kw",
      "'particulate matter':ti,ab,kw",
      "'pm2.5':ti,ab,kw",
      "pm10:ti,ab,kw",
      "'household air pollution':ti,ab,kw",
      "'solid fuel*':ti,ab,kw",
      "biomass:ti,ab,kw",
      "'cooking fuel*':ti,ab,kw",
      "'clean fuel*':ti,ab,kw",
      "cookstove*:ti,ab,kw",
      "'black carbon':ti,ab,kw",
      "'nitrogen dioxide':ti,ab,kw",
      "'second hand smoke':ti,ab,kw",
    ],
    wos: [
      '"air pollut*"',
      '"particulate matter"',
      '"PM2.5"',
      '"PM 2.5"',
      "PM10",
      '"household air pollution"',
      '"solid fuel*"',
      "biomass",
      '"cooking fuel*"',
      '"clean fuel*"',
      "cookstove*",
      '"black carbon"',
      '"nitrogen dioxide"',
      '"second-hand smoke"',
    ],
    gim: [
      '"air pollut*"',
      '"particulate matter"',
      "pm2.5",
      "pm10",
      '"household air pollution"',
      '"solid fuel*"',
      "biomass",
      '"cooking fuel*"',
      '"clean fuel*"',
      "cookstove*",
      '"black carbon"',
    ],
    medRxiv: [
      "air pollution",
      "PM2.5",
      "household air pollution",
      "cooking fuel",
    ],
    scholar: [
      '"air pollution"',
      '"PM2.5"',
      '"household air pollution"',
      '"cooking fuel"',
    ],
  },
  anemia: {
    pubmedMesh: [
      "Anemia[MeSH]",
      "Hemoglobins[MeSH]",
    ],
    pubmedTiab: [
      "anaemi*[tiab]",
      "anemi*[tiab]",
      "haemoglobin[tiab]",
      "hemoglobin[tiab]",
      "ferritin*[tiab]",
      '"iron deficiency"[tiab]',
      "hepcidin[tiab]",
      '"C-reactive protein"[tiab]',
    ],
    europepmcMesh: ['MESH:"Anemia"', 'MESH:"Hemoglobins"'],
    europepmcTitle: [
      'TITLE:(anaemia OR anemia OR anaemic OR anemic OR haemoglobin OR hemoglobin OR ferritin OR "iron deficiency" OR hepcidin OR "C-reactive protein")',
    ],
    europepmcAbstract: [
      'ABSTRACT:(anaemia OR anemia OR anaemic OR anemic OR haemoglobin OR hemoglobin OR ferritin OR "iron deficiency" OR hepcidin OR "C-reactive protein")',
    ],
    europepmcKw: [
      'KW:(anaemia OR anemia OR anaemic OR anemic OR haemoglobin OR hemoglobin OR ferritin OR "iron deficiency" OR hepcidin OR "C-reactive protein")',
    ],
    embaseExp: [
      "'anemia'/exp",
      "'hemoglobin'/exp",
      "'ferritin'/exp",
      "'iron deficiency'/exp",
      "'hepcidin'/exp",
      "'c reactive protein'/exp",
    ],
    embaseTiab: [
      "anaemi*:ti,ab,kw",
      "anemi*:ti,ab,kw",
      "haemoglobin:ti,ab,kw",
      "hemoglobin:ti,ab,kw",
      "ferritin*:ti,ab,kw",
      "'iron deficiency':ti,ab,kw",
      "hepcidin:ti,ab,kw",
    ],
    wos: [
      "anaemi*",
      "anemi*",
      "haemoglobin",
      "hemoglobin",
      "ferritin*",
      '"iron deficiency"',
      "hepcidin",
      '"C-reactive protein"',
    ],
    gim: [
      "anaemi*",
      "anemi*",
      "haemoglobin",
      "hemoglobin",
      "ferritin",
      '"iron deficiency"',
    ],
    medRxiv: ["anaemia", "anemia", "hemoglobin"],
    scholar: ["anaemia", "anemia", "haemoglobin"],
  },
};

/** Look up a concept in the dictionary, returning its expansion or a
 *  raw-term fallback. */
function lookupConcept(concept: SearchConcept): ConceptExpansion {
  const key = conceptKey(concept.terms);
  const expansion = CONCEPT_DICTIONARY[key];
  if (expansion) return expansion;

  // Fallback: raw terms with minimal database syntax
  const quoted = concept.terms.map((t) => `"${t}"`);
  const quotedMesh = quoted.map((t) => `MESH:${t}`);
  return {
    pubmedMesh: quoted.map((t) => `${t}[MeSH Terms]`),
    pubmedTiab: quoted.map((t) => `${t}[tiab]`),
    europepmcMesh: quotedMesh,
    europepmcTitle: [`TITLE:(${quoted.join(" OR ")})`],
    europepmcAbstract: [`ABSTRACT:(${quoted.join(" OR ")})`],
    europepmcKw: [`KW:(${quoted.join(" OR ")})`],
    embaseExp: quoted.map((t) => `'${t}'/exp`),
    embaseTiab: quoted.map((t) => `'${t}':ti,ab,kw`),
    wos: quoted,
    gim: quoted,
    medRxiv: concept.terms,
    scholar: quoted,
  };
}

/** Build a parenthesised OR group of terms. */
function orGroup(terms: string[]): string {
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" OR ")})`;
}

/** Append a PubMed date filter to a term. */
function pubmedDateFilter(term: string, from?: string, to?: string): string {
  if (!from && !to) return term;
  const f = from ? `${from}/01/01` : "1800/01/01";
  const t = to ? `${to}/12/31` : `${new Date().getFullYear()}/12/31`;
  return `(${term}) AND ("${f}"[Date - Publication] : "${t}"[Date - Publication])`;
}

/** Append an Europe PMC date filter. */
function europepmcDateFilter(term: string, from?: string, to?: string): string {
  if (!from && !to) return term;
  const f = from ? `${from}-01-01` : "1800-01-01";
  const t = to ? `${to}-12-31` : `${new Date().getFullYear()}-12-31`;
  return `${term} AND FIRST_PDATE:[${f} TO ${t}]`;
}

/** Append an Embase date filter. */
function embaseDateFilter(term: string, from?: string, to?: string): string {
  if (!from && !to) return term;
  const f = from ? `${from}` : "1800";
  const t = to ? `${to}` : new Date().getFullYear().toString();
  return `(${term}) AND [${f}-01-01 TO ${t}-12-31]/dp`;
}

/** Append a Web of Science date filter. */
function wosDateFilter(term: string, from?: string, to?: string): string {
  if (!from && !to) return term;
  const f = from ? `${from}` : "1800";
  const t = to ? `${to}` : new Date().getFullYear().toString();
  return `${term} AND PY=(${f}-${t})`;
}

/** Append a WHO GIM date filter. */
function gimDateFilter(term: string, from?: string, to?: string): string {
  if (!from && !to) return term;
  const f = from ? `${from}-01-01` : "1800-01-01";
  const t = to ? `${to}-12-31` : `${new Date().getFullYear()}-12-31`;
  return `${term} AND (SR:PDAT:[${f} TO ${t}])`;
}

/* ================================================================
 *  Per-database query builders
 * ================================================================ */

/** PubMed: (population[MeSH OR tiab]) AND ((exposure[MeSH OR tiab]) AND (outcome[MeSH OR tiab])) + date. */
export function buildPubMedSearchQuery(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup([...pop.pubmedMesh, ...pop.pubmedTiab]);
  const expPart = orGroup([...exp.pubmedMesh, ...exp.pubmedTiab]);
  const outPart = orGroup([...out.pubmedMesh, ...out.pubmedTiab]);

  let term = `(${popPart}) AND ((${expPart}) AND (${outPart}))`;
  term = pubmedDateFilter(term, yearFrom, yearTo);
  return term;
}

/** Europe PMC: ((MESH:"..." OR TITLE:(...) OR ABSTRACT:(...) OR KW:(...)) AND (...)) AND (...) + date.
 *
 * Each concept block combines MESH headings with TITLE/ABSTRACT/KW free-text
 * terms, all OR-ed within the block, then the three blocks are AND-ed.
 */
export function buildEuropePmcSearchQuery(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup([
    ...pop.europepmcMesh,
    ...pop.europepmcTitle,
    ...pop.europepmcAbstract,
    ...pop.europepmcKw,
  ]);
  const expPart = orGroup([
    ...exp.europepmcMesh,
    ...exp.europepmcTitle,
    ...exp.europepmcAbstract,
    ...exp.europepmcKw,
  ]);
  const outPart = orGroup([
    ...out.europepmcMesh,
    ...out.europepmcTitle,
    ...out.europepmcAbstract,
    ...out.europepmcKw,
  ]);

  let term = `(${popPart}) AND ((${expPart}) AND (${outPart}))`;
  term = europepmcDateFilter(term, yearFrom, yearTo);
  return term;
}

/** Embase.com: (population'/exp OR ti,ab,kw) AND ((exposure...) AND (outcome...)) + date. */
export function buildEmbaseSearchQuery(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup([...pop.embaseExp, ...pop.embaseTiab]);
  const expPart = orGroup([...exp.embaseExp, ...exp.embaseTiab]);
  const outPart = orGroup([...out.embaseExp, ...out.embaseTiab]);

  let term = `(${popPart}) AND ((${expPart}) AND (${outPart}))`;
  term = embaseDateFilter(term, yearFrom, yearTo);
  return term;
}

/** Web of Science: TS=(pop) AND TS=(exp) AND TS=(out) + PY date. */
export function buildWosSearchQuery(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup(pop.wos);
  const expPart = orGroup(exp.wos);
  const outPart = orGroup(out.wos);

  let term = `TS=(${popPart}) AND TS=(${expPart}) AND TS=(${outPart})`;
  term = wosDateFilter(term, yearFrom, yearTo);
  return term;
}

/** WHO Global Index Medicus: (tw:(pop)) AND (tw:(exp)) AND (tw:(out)) + date. */
export function buildWhogimSearchQuery(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup(pop.gim);
  const expPart = orGroup(exp.gim);
  const outPart = orGroup(out.gim);

  let term = `(tw:(${popPart})) AND (tw:(${expPart})) AND (tw:(${outPart}))`;
  term = gimDateFilter(term, yearFrom, yearTo);
  return term;
}

/** medRxiv: separate searches, each combining one exposure sub-term + outcome + location. */
export function buildMedrxivSearchQueries(
  concepts: SearchConcepts,
  yearFrom?: string,
  yearTo?: string,
): string[] {
  const pop = lookupConcept(concepts.population);
  const out = lookupConcept(concepts.outcome);
  const exp = lookupConcept(concepts.exposure);

  const popStr = orGroup([...pop.medRxiv.map((t) => `"${t}"`)]);
  const outStr = orGroup([...out.medRxiv.map((t) => `"${t}"`)]);

  const queries: string[] = [];
  for (const e of exp.medRxiv) {
    const q = `"${e}" ${outStr} ${popStr}`;
    queries.push(q.trim());
  }
  return queries;
}

/** Google Scholar: location ("exposure" OR ...) ("outcome" OR ...). */
export function buildGoogleScholarSearchQuery(
  concepts: SearchConcepts,
): string {
  const pop = lookupConcept(concepts.population);
  const exp = lookupConcept(concepts.exposure);
  const out = lookupConcept(concepts.outcome);

  const popPart = orGroup([...pop.scholar]);
  const expPart = orGroup([...exp.scholar]);
  const outPart = orGroup([...out.scholar]);

  return `${popPart} ${expPart} ${outPart}`.trim();
}

/** Build database-specific search queries for all requested databases.
 *  Returns one entry per database with the query string in that
 *  database's native syntax. */
export interface DatabaseSearchQuery {
  database: string;
  query: string;
  description: string;
}

export function buildDatabaseSpecificQueries(
  q: SLRQuestion,
  databases: string[],
): DatabaseSearchQuery[] {
  const concepts = extractSearchConceptsFromQuestion(q);
  const results: DatabaseSearchQuery[] = [];

  for (const db of databases) {
    const id = db.toLowerCase();
    let query = "";
    let description = "";

    switch (true) {
      case id === "pubmed": {
        query = buildPubMedSearchQuery(concepts, q.yearFrom, q.yearTo);
        description = "PubMed: (population[MeSH/tiab]) AND ((exposure[MeSH/tiab]) AND (outcome[MeSH/tiab])) + date range";
        break;
      }
      case id === "europe pmc" || id === "europepmc": {
        query = buildEuropePmcSearchQuery(concepts, q.yearFrom, q.yearTo);
        description = "Europe PMC: ((MESH/TITLE/ABSTRACT/KW:pop) AND ((MESH/TITLE/ABSTRACT/KW:exp) AND (MESH/TITLE/ABSTRACT/KW:out))) + FIRST_PDATE range";
        break;
      }
      case id === "embase.com" || id === "embase": {
        query = buildEmbaseSearchQuery(concepts, q.yearFrom, q.yearTo);
        description = "Embase: (population'/exp OR ti,ab,kw) AND ((exposure...) AND (outcome...)) + date";
        break;
      }
      case id === "web of science" || id === "wos": {
        query = buildWosSearchQuery(concepts, q.yearFrom, q.yearTo);
        description = "Web of Science: TS=(pop) AND TS=(exp) AND TS=(out) + PY date";
        break;
      }
      case id === "who global index medicus" || id === "whogim" || id === "gim": {
        query = buildWhogimSearchQuery(concepts, q.yearFrom, q.yearTo);
        description = "WHO GIM: (tw:(pop)) AND (tw:(exp)) AND (tw:(out)) + date";
        break;
      }
      case id === "medrxiv": {
        const medRxivQueries = buildMedrxivSearchQueries(concepts, q.yearFrom, q.yearTo);
        query = medRxivQueries.join("\n• ");
        description = "medRxiv: separate searches per exposure sub-term, each combined with outcome + location";
        break;
      }
      case id === "google scholar": {
        query = buildGoogleScholarSearchQuery(concepts);
        description = "Google Scholar: location (exposure OR ...) (outcome OR ...)";
        break;
      }
      default:
        // Fallback: use the generic combined query for unsupported databases
        query = buildSearchQueries(q, [db])[0] || "";
        description = "Generic boolean query (fallback)";
    }

    results.push({ database: db, query, description });
  }

  return results;
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
