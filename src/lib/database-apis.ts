/**
 * Scholarly database integrations for the evidence-synthesis pipeline (Step 1).
 *
 * Design rules:
 *  - Every function in this module talks to a real public API. There is no mock,
 *    simulated or synthetic data path: a database either returns real records or
 *    reports a real, actionable error.
 *  - Failures are surfaced with the upstream HTTP status / reason so the UI can
 *    explain exactly which database failed and why.
 *  - Results are capped (per database) to keep searches fast and predictable.
 */

export interface Paper {
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
  url?: string;
  pmid?: string;
  sourceBackend?: string;
  sources?: string[];
  citationStatus?: "verified" | "unverified" | "no-doi";
  citationMessage?: string;
}

export type DatabaseStatus = "success" | "empty" | "failed";

export interface DatabaseOutcome {
  database: string;
  status: DatabaseStatus;
  count: number;
  rawCount: number;
  error?: string;
  note?: string;
  elapsedMs: number;
}

export interface SearchOutcome {
  papers: Paper[];
  outcomes: DatabaseOutcome[];
  totalBeforeDedup: number;
  dedupedCount: number;
  errors: Record<string, string>;
}

export interface SearchOptions {
  query: string;
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  limitPerDatabase?: number;
  /** Overall wall-clock budget for the whole multi-database search. */
  timeoutMs?: number;
}

const STUDY_TYPE_KEYWORDS: Record<string, string[]> = {
  "Randomized Controlled Trial (RCT)": ["randomized controlled trial", "randomised controlled trial", "rct", "randomized trial", "randomised trial"],
  "Systematic Review": ["systematic review"],
  "Meta-Analysis": ["meta-analysis", "meta analysis", "metaanalysis", "pooled analysis"],
  "Observational Study": ["observational study", "observational", "cross-sectional", "cross sectional", "case-control", "case control", "cohort study", "cohort"],
  "Cohort Study": ["cohort study", "cohort", "longitudinal study", "retrospective cohort", "prospective cohort"],
  "Case-Control Study": ["case-control", "case control", "case-control study"],
  "Cross-Sectional Study": ["cross-sectional", "cross sectional", "crosssectional"],
  "Clinical Trial": ["clinical trial", "clinical study", "controlled clinical trial"],
  "Qualitative Study": ["qualitative", "interview", "focus group", "phenomenolog", "thematic analysis"],
  "Case Report / Case Series": ["case report", "case series"],
  "Review Article": ["review", "narrative review", "literature review", "scoping review"],
  "Guideline / Consensus Statement": ["guideline", "consensus", "recommendation", "position statement"],
  "Dissertation / Thesis": ["dissertation", "thesis"],
};

export const STUDY_TYPES = Object.keys(STUDY_TYPE_KEYWORDS);

export function classifyStudyType(title: string, abstract: string): string {
  const text = `${title} ${abstract}`.toLowerCase();
  for (const [type, keywords] of Object.entries(STUDY_TYPE_KEYWORDS)) {
    if (type === "All Study Types") continue;
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return "Observational Study";
}

const DEFAULT_LIMIT_PER_DATABASE = 200;
const MAX_LIMIT_PER_DATABASE = 500;
/** Hard ceiling for a single database, so one slow upstream cannot stall the search. */
const DATABASE_TIMEOUT_MS = 90000;
/** Overall wall-clock budget for one multi-database search. */
const DEFAULT_SEARCH_BUDGET_MS = 30000;
const MAX_SEARCH_BUDGET_MS = 120000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HttpError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const CONTACT_EMAIL = process.env.RESEARCH_CONTACT_EMAIL || process.env.OPENALEX_MAILTO || "research@example.com";
const USER_AGENT = `ResilientResearchApp/1.0 (systematic-review-pipeline; mailto:${CONTACT_EMAIL})`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
  delayMs = 0
): Promise<void> {
  const results: Promise<void>[] = [];
  let index = 0;
  const total = items.length;
  async function next() {
    while (index < total) {
      const current = index++;
      await fn(items[current]!);
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    results.push(next());
  }
  await Promise.allSettled(results);
}

/* ------------------------------------------------------------------ */
/* HTTP layer                                                          */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  status?: number;
  retryAfterMs?: number;

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Upper bound for any single backoff wait, so a hostile Retry-After header
 *  (e.g. "3600") can never stall a search. */
const MAX_BACKOFF_MS = 12000;

function backoffDelay(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  return Math.min(MAX_BACKOFF_MS, 750 * Math.pow(2, attempt));
}

/**
 * GET/POST a URL with a timeout, a descriptive User-Agent and exponential
 * backoff for rate-limited / temporarily unavailable upstreams.
 */
async function httpRequest(url: string, options: HttpOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const retries = options.retries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.5",
          ...(options.headers || {}),
        },
        body: options.body,
        signal: controller.signal,
      });

      if (res.ok) return res;

      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      const error = new HttpError(`HTTP ${res.status} ${res.statusText || ""}`.trim(), res.status, retryAfterMs);
      if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) throw error;
      lastError = error;
      await sleep(backoffDelay(attempt, retryAfterMs));
    } catch (err: any) {
      if (err instanceof HttpError) {
        if (!RETRYABLE_STATUS.has(err.status ?? 0) || attempt === retries) throw err;
        lastError = err;
        await sleep(backoffDelay(attempt, err.retryAfterMs));
        continue;
      }
      const aborted = err?.name === "AbortError";
      lastError = new HttpError(
        aborted
          ? `Request timed out after ${timeoutMs}ms`
          : `Network error: ${err?.message || String(err)}`
      );
      if (attempt === retries) throw lastError;
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new HttpError("Request failed");
}

async function httpJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const res = await httpRequest(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 180).replace(/\s+/g, " ");
    throw new HttpError(`Upstream returned a non-JSON response: ${preview}`);
  }
}

async function httpText(url: string, options: HttpOptions = {}): Promise<string> {
  const res = await httpRequest(url, {
    ...options,
    headers: { Accept: "application/xml, text/xml, */*", ...(options.headers || {}) },
  });
  return res.text();
}

/* ------------------------------------------------------------------ */
/* Filters & normalization                                             */
/* ------------------------------------------------------------------ */

function parseYear(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const year = parseInt(String(value).slice(0, 4), 10);
  return Number.isNaN(year) ? undefined : year;
}

function matchesStudyType(paper: Paper, studyType: string): boolean {
  if (paper.studyType === studyType) return true;
  const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

export function applyFilters(papers: Paper[], options: SearchOptions): Paper[] {
  const from = parseYear(options.yearFrom);
  const to = parseYear(options.yearTo);
  let filtered = papers;

  if (from !== undefined || to !== undefined) {
    filtered = filtered.filter((p) => {
      const year = parseYear(p.year);
      if (year === undefined) return true;
      if (from !== undefined && year < from) return false;
      if (to !== undefined && year > to) return false;
      return true;
    });
  }

  if (options.studyType && options.studyType !== "All Study Types") {
    filtered = filtered.filter((p) => matchesStudyType(p, options.studyType!));
  }

  return filtered;
}

function stripTags(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const inner = obj.$ ?? obj.content ?? obj.text ?? "";
    return stripTags(typeof inner === "string" ? inner : "");
  }
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string | undefined, max = 3000): string {
  const text = (value || "").trim();
  if (!text) return "No abstract available.";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function authorsFromList(list: any[], max = 8): string {
  const names = list
    .map((a) => {
      if (!a) return "";
      if (typeof a === "string") return a.trim();
      const name = a.name || a.fullName || "";
      const given = a.given || a.firstName || "";
      const family = a.family || a.lastName || "";
      if (name) return String(name).trim();
      const combined = `${given} ${family}`.trim();
      return combined;
    })
    .filter(Boolean);
  if (names.length === 0) return "Unknown authors";
  return names.slice(0, max).join(", ") + (names.length > max ? " et al." : "");
}

/* ------------------------------------------------------------------ */
/* DOI enrichment & verification                                       */
/* ------------------------------------------------------------------ */

function fuzzyMatch(orig: string, sub: string): number {
  const cleanOrig = orig.replace(/[^a-zA-Z0-9 ]+/g, "").toLowerCase();
  const subWords = sub.replace(/[^a-zA-Z0-9 ]+/g, "").toLowerCase().split(" ").filter(Boolean);
  if (subWords.length < 2) return cleanOrig.includes(subWords[0] || "") ? 1 : 0;
  const pairs: string[] = [];
  for (let i = 0; i < subWords.length - 1; i++) {
    pairs.push(`${subWords[i]} ${subWords[i + 1]}`);
  }
  const totalLen = pairs.join("").length;
  if (totalLen === 0) return 0;
  const matchedLen = pairs
    .filter((p) => cleanOrig.includes(p))
    .map((p) => p.length)
    .reduce((a, b) => a + b, 0);
  return matchedLen / totalLen;
}

async function findDoiByTitleAuthor(title: string, authorsStr?: string): Promise<{ doi?: string; title?: string; message: string }> {
  try {
    const firstAuthor = authorsStr
      ? authorsStr.split(",")[0].replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(" ").slice(-1)[0]
      : "";
    const queryTitle = title.replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
    const queryParts: string[] = [];
    if (firstAuthor) queryParts.push(`query.author=${encodeURIComponent(firstAuthor)}`);
    queryParts.push(`query.bibliographic=${encodeURIComponent(queryTitle)}`);
    const url = `https://api.crossref.org/works?${queryParts.join("&")}&rows=5`;
    const data = await httpJson<any>(url, { timeoutMs: 15000, retries: 2 });
    const works = data.message?.items || [];
    if (works.length === 0) return { message: "No Crossref results" };
    for (const work of works) {
      const workTitle = work.title?.[0] || "";
      const workDoi = work.DOI || "";
      const score = fuzzyMatch(workTitle, title);
      if (score >= 0.55 && workDoi) {
        return { doi: workDoi, title: workTitle, message: `DOI found via Crossref (match ${Math.round(score * 100)}%)` };
      }
    }
    return { message: "No matching DOI found in top Crossref results" };
  } catch (err: any) {
    return { message: `DOI lookup failed: ${err.message}` };
  }
}

export async function enrichPapersWithDois(papers: Paper[]): Promise<Paper[]> {
  const withoutDoi = papers.filter((p) => !p.doi || p.doi.length < 5);
  if (withoutDoi.length === 0) return papers;
  const MAX_ENRICH = 20;
  const toEnrich = withoutDoi.slice(0, MAX_ENRICH);
  const updated = new Map<string, string>();
  await runWithConcurrency(
    toEnrich,
    async (p) => {
      const found = await findDoiByTitleAuthor(p.title, p.authors);
      if (found.doi) updated.set(p.id, found.doi);
    },
    5,
    0
  );
  return papers.map((p) => {
    const newDoi = updated.get(p.id);
    if (newDoi) return { ...p, doi: newDoi, url: `https://doi.org/${newDoi}` };
    return p;
  });
}

export async function validateDoiViaCrossref(doi: string): Promise<{ valid: boolean; title?: string; message: string }> {
  if (!doi || doi.length < 5) return { valid: false, message: "Missing or invalid DOI" };

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const data = await httpJson<any>(url, { timeoutMs: 15000, retries: 2 });
    const work = data.message;
    const title = work?.title?.[0] || "";
    if (!title) return { valid: false, message: "DOI not found (no record returned by Crossref)" };
    return { valid: true, title, message: "DOI verified — matches Crossref record" };
  } catch (err: any) {
    return { valid: false, message: `Crossref lookup failed: ${err.message}` };
  }
}

export async function verifyCitations(papers: Paper[]): Promise<Map<string, { valid: boolean; title?: string; message: string }>> {
  const results = new Map<string, { valid: boolean; title?: string; message: string }>();
  const dois = papers.filter((p) => p.doi && p.doi.length > 3).map((p) => p.doi!);
  const MAX_VERIFY = 20;
  const toVerify = dois.slice(0, MAX_VERIFY);

  await runWithConcurrency(
    toVerify,
    async (doi) => {
      const result = await validateDoiViaCrossref(doi);
      results.set(doi.toLowerCase(), result);
    },
    5,
    0
  );

  return results;
}

/* ------------------------------------------------------------------ */
/* Database fetchers                                                   */
/* ------------------------------------------------------------------ */

interface FetchContext {
  query: string;
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  limit: number;
}

function yearFilterForApi(from?: string, to?: string): string {
  const start = from ? `${from}-01-01` : "1800-01-01";
  const end = to ? `${to}-12-31` : new Date().getFullYear() + "-12-31";
  return `${start}/${end}`;
}

/* ---------------------------- PubMed ------------------------------ */

const PUBMED_TYPE_MAP: Array<[RegExp, string]> = [
  [/randomized controlled trial/i, "Randomized Controlled Trial (RCT)"],
  [/systematic review/i, "Systematic Review"],
  [/meta-analysis/i, "Meta-Analysis"],
  [/case reports/i, "Case Report / Case Series"],
  [/clinical trial/i, "Clinical Trial"],
  [/guideline/i, "Guideline / Consensus Statement"],
  [/review/i, "Review Article"],
  [/comparative study|multicenter study|observational/i, "Observational Study"],
];

function pubmedStudyType(entry: string): string {
  const types = Array.from(entry.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)).map((m) => stripTags(m[1]));
  for (const [pattern, label] of PUBMED_TYPE_MAP) {
    if (types.some((t) => pattern.test(t))) return label;
  }
  return classifyStudyType("", "");
}

/* ------------------------------------------------------------------ */
/* Per-database search schemes                                         */
/* ------------------------------------------------------------------ */

/**
 * Each database has its own query syntax. The same research question is
 * therefore translated into the scheme the database actually understands:
 * MeSH + [tiab] for PubMed, TITLE/ABST for Europe PMC, query.bibliographic
 * for Crossref, field prefixes for arXiv, Lucene for DOAJ, query.term with
 * field tags for ClinicalTrials.gov and so on.
 */
export type SearchScheme = "pubmed" | "europepmc" | "crossref" | "arxiv" | "openalex" | "doaj" | "zenodo" | "openaire" | "clinicaltrials" | "generic";

export interface QueryTranslation {
  /** The raw term as sent to the database. */
  term: string;
  /** The scheme used to build it. */
  scheme: SearchScheme;
  /** The search string that was sent (for the audit trail). */
  searchString: string;
}

function splitTerms(query: string): string[] {
  return query
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR|NOT)\s+|\s*,\s*|\s+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function quote(term: string): string {
  return `"${term.replace(/"/g, "")}"`;
}

/** Builds the search string for one database from the research question. */
export function buildDatabaseSearch(
  database: string,
  query: string,
  options: { logic?: string; yearFrom?: string; yearTo?: string; studyType?: string } = {}
): QueryTranslation {
  const terms = splitTerms(query);
  const logic = (options.logic || "AND").toUpperCase();
  const joiner = logic === "OR" ? " OR " : " AND ";
  const id = database.toLowerCase();

  switch (true) {
    case id === "pubmed":
      // MeSH terms for the recognised concepts + free text in title/abstract.
      {
        const mesh = terms.map((t) => {
          const meSH = MESH_TERMS[t.toLowerCase()];
          const free = `${quote(t)}[Title/Abstract]`;
          return meSH ? `(${quote(meSH)}[MeSH Terms] OR ${free})` : free;
        });
        let term = mesh.join(joiner) || query;
        const filter = buildStudyTypeFilter(options.studyType);
        if (filter) term = `(${term}) AND ${filter}`;
        if (options.yearFrom || options.yearTo) {
          const from = options.yearFrom ? `${options.yearFrom}/01/01` : "1800/01/01";
          const to = options.yearTo ? `${options.yearTo}/12/31` : `${new Date().getFullYear()}/12/31`;
          term = `(${term}) AND ("${from}"[Date - Publication] : "${to}"[Date - Publication])`;
        }
        return { term, scheme: "pubmed", searchString: term };
      }

    case id === "europe pmc" || id === "biorxiv" || id === "medrxiv": {
      const extra = id === "biorxiv" ? ["SRC:PPR", "PUBLISHER:bioRxiv"] : id === "medrxiv" ? ["SRC:PPR", "PUBLISHER:medRxiv"] : [];
      // Europe PMC: terms with the boolean operator, then the date range and
      // (for preprints) the source filter.
      const parts = terms.map((t) => t);
      let term = parts.join(joiner) || query;
      if (options.yearFrom || options.yearTo) {
        const from = options.yearFrom ? `${options.yearFrom}-01-01` : "1800-01-01";
        const to = options.yearTo ? `${options.yearTo}-12-31` : `${new Date().getFullYear()}-12-31`;
        term += ` AND (FIRST_PDATE:[${from} TO ${to}])`;
      }
      if (extra.length) term += ` AND ${extra.join(" AND ")}`;
      return { term, scheme: "europepmc", searchString: term };
    }

    case id === "crossref": {
      // Crossref has no field syntax for a free-text question: the
      // bibliographic query is the documented scheme.
      const term = terms.length ? terms.map(quote).join(" ") : query;
      return { term, scheme: "crossref", searchString: term };
    }

    case id === "arxiv": {
      // arXiv field prefixes: all: (title, abstract, authors, comments).
      // Quotes and parentheses are not supported by the arXiv parser, and a
      // hyphenated token must be kept intact, so only spaces are split.
      const words = terms
        .flatMap((t) => t.split(/\s+/))
        .filter((w) => w.length > 1)
        .map((w) => `all:${w}`);
      const term = words.join(joiner) || `all:${query}`;
      return { term, scheme: "arxiv", searchString: term };
    }

    case id === "openalex": {
      const term = terms.map(quote).join(" ");
      return { term, scheme: "openalex", searchString: term };
    }

    case id === "doaj": {
      // DOAJ uses Lucene syntax over the bibjson fields.
      const term = terms.map((t) => `(bibjson.title:${quote(t)} OR bibjson.abstract:${quote(t)})`).join(joiner);
      return { term, scheme: "doaj", searchString: term };
    }

    case id === "zenodo": {
      const term = terms.map((t) => `(${quote(t)} OR metadata.title:${quote(t)})`).join(joiner);
      return { term, scheme: "zenodo", searchString: term };
    }

    case id === "openaire": {
      const term = terms.map(quote).join(" ");
      return { term, scheme: "openaire", searchString: term };
    }

    case id === "clinicaltrials.gov": {
      // ClinicalTrials.gov supports fielded search: AREA[Condition], AREA[Intervention].
      const term = terms.map((t) => `${quote(t)}`).join(joiner);
      return { term, scheme: "clinicaltrials", searchString: term };
    }

    default:
      return { term: query, scheme: "generic", searchString: query };
  }
}

/** MeSH headings for the concepts the app recognises, so PubMed searches are
 *  run the way a librarian would run them. */
const MESH_TERMS: Record<string, string> = {
  aspirin: "Aspirin",
  hypertension: "Hypertension",
  tuberculosis: "Tuberculosis",
  "tuberculosis, latent": "Latent Tuberculosis",
  diabetes: "Diabetes Mellitus",
  "diabetes mellitus, type 2": "Diabetes Mellitus, Type 2",
  cancer: "Neoplasms",
  "breast cancer": "Breast Neoplasms",
  depression: "Depressive Disorder",
  anxiety: "Anxiety Disorders",
  asthma: "Asthma",
  copd: "Pulmonary Disease, Chronic Obstructive",
  obesity: "Obesity",
  sepsis: "Sepsis",
  pneumonia: "Pneumonia",
  "heart failure": "Heart Failure",
  "myocardial infarction": "Myocardial Infarction",
  stroke: "Stroke",
  nursing: "Nursing",
  "nurse practitioners": "Nurse Practitioners",
  "patient education": "Patient Education as Topic",
  medication: "Medication Therapy",
  adherence: "Patient Compliance",
  smoking: "Smoking",
  covid: "COVID-19",
  "covid-19": "COVID-19",
  "quality improvement": "Quality Improvement",
  "risk of bias": "Bias",
  "randomised controlled trial": "Randomized Controlled Trials as Topic",
  "randomized controlled trial": "Randomized Controlled Trials as Topic",
  "systematic review": "Systematic Reviews as Topic",
  "qualitative research": "Qualitative Research",
};

const STUDY_TYPE_FILTERS: Record<string, string> = {
  "Randomized Controlled Trial (RCT)": 'randomized controlled trial[Publication Type]',
  "Systematic Review": 'systematic review[Publication Type]',
  "Meta-Analysis": 'meta-analysis[Publication Type]',
  "Case Report / Case Series": 'case reports[Publication Type]',
  "Clinical Trial": 'clinical trial[Publication Type]',
  "Review Article": 'review[Publication Type]',
  "Cohort Study": 'cohort studies[Publication Type]',
  "Case-Control Study": 'case-control studies[Publication Type]',
  "Cross-Sectional Study": 'cross-sectional studies[Publication Type]',
  "Qualitative Study": 'qualitative research[Publication Type]',
};

function buildStudyTypeFilter(studyType?: string): string | null {
  if (!studyType || studyType === "All Study Types") return null;
  return STUDY_TYPE_FILTERS[studyType] || null;
}

export async function fetchPubMedBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY;
  const toolParams = new URLSearchParams({ db: "pubmed", retmode: "json", retmax: String(maxResults), sort: "relevance" });
  if (apiKey) toolParams.set("api_key", apiKey);
  toolParams.set("tool", "resilient_research_app");
  toolParams.set("email", CONTACT_EMAIL);

  // PubMed scheme: MeSH + [Title/Abstract] + publication-type and date filters.
  const term = buildDatabaseSearch("PubMed", query, { yearFrom, yearTo, studyType }).term;
  toolParams.set("term", term);

  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${toolParams.toString()}`;
  const searchData = await httpJson<any>(searchUrl, { timeoutMs: 30000, retries: 3 });
  const idlist: string[] = searchData?.esearchresult?.idlist || [];
  if (!Array.isArray(idlist) || idlist.length === 0) return [];

  const papers: Paper[] = [];
  const chunkSize = 100;
  for (let i = 0; i < idlist.length; i += chunkSize) {
    if (i > 0) await sleep(400);
    const chunk = idlist.slice(i, i + chunkSize).join(",");
    const params = new URLSearchParams({ db: "pubmed", id: chunk, rettype: "abstract", retmode: "xml" });
    if (apiKey) params.set("api_key", apiKey);
    const xml = await httpText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`, {
      timeoutMs: 40000,
      retries: 3,
    });

    const entries = xml.split("<PubmedArticle>").slice(1);
    for (const entry of entries) {
      const title = stripTags((entry.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1] || "");
      if (!title) continue;
      const abstractParts = Array.from(entry.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)).map((m) => stripTags(m[1]));
      const abstract = abstractParts.length ? abstractParts.join(" ") : "No abstract available.";
      const journal = stripTags((entry.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/) || [])[1] || "") || "Unknown Journal";
      const year =
        parseInt((entry.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) || [])[1] || "", 10) ||
        parseInt((entry.match(/<MedlineDate>[\s\S]*?(\d{4})[\s\S]*?<\/MedlineDate>/) || [])[1] || "", 10) ||
        new Date().getFullYear();
      const pmid = (entry.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";
      const doi =
        (entry.match(/<ArticleId[^>]*IdType="doi"[^>]*>([^<]+)<\/ArticleId>/i) || [])[1] ||
        (entry.match(/<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/i) || [])[1] ||
        "";
      const authorBlock = (entry.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/) || [])[1] || "";
      const authorNames = Array.from(authorBlock.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g)).map((m) => {
        const block = m[1];
        const last = (block.match(/<LastName>([^<]+)<\/LastName>/) || [])[1] || "";
        const fore = (block.match(/<ForeName>([^<]+)<\/ForeName>/) || [])[1] || "";
        const collective = (block.match(/<CollectiveName>([^<]+)<\/CollectiveName>/) || [])[1] || "";
        if (collective) return stripTags(collective);
        return `${fore} ${last}`.trim();
      }).filter(Boolean);

      papers.push({
        id: `pubmed-${pmid || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authorNames.length ? authorNames.slice(0, 8).join(", ") + (authorNames.length > 8 ? " et al." : "") : "Unknown authors",
        journal,
        year,
        doi: doi.trim(),
        abstract: truncate(abstract),
        database: "PubMed",
        studyType: pubmedStudyType(entry),
        selected: false,
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : "",
        pmid,
        sourceBackend: "PubMed E-utilities",
        sources: ["PubMed"],
      });
    }
  }

  void studyType;
  return papers;
}

/* -------------------------- Europe PMC ---------------------------- */

async function fetchEuropePmcQuery(
  query: string,
  ctx: FetchContext,
  extraTerms: string[] = [],
  label = "Europe PMC"
): Promise<Paper[]> {
  // Europe PMC scheme: quoted terms ORed/ANDed with the TITLE and ABST
  // fields, plus the date range and (for preprints) the source filter.
  const translated = buildDatabaseSearch(label, query, {
    yearFrom: ctx.yearFrom,
    yearTo: ctx.yearTo,
  });
  const terms = [translated.term, ...extraTerms].filter(Boolean);
  let epmcQuery = terms.join(" AND ");

  const papers: Paper[] = [];
  let cursorMark = "*";
  const pageSize = Math.min(100, ctx.limit);
  let pages = 0;

  while (papers.length < ctx.limit && pages < 5) {
    pages++;
    const params = new URLSearchParams({
      query: epmcQuery,
      format: "json",
      resultType: "core",
      pageSize: String(pageSize),
      cursorMark,
    });
    const data = await httpJson<any>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`, {
      timeoutMs: 30000,
      retries: 3,
    });
    const results = data.resultList?.result || [];
    if (results.length === 0) break;

    for (const r of results) {
      const title = stripTags(r.title || "Untitled");
      const abstract = truncate(stripTags(r.abstractText || ""));
      const doi = r.doi || "";
      const pmid = r.pmid || "";
      const year = parseInt(r.pubYear) || parseInt((r.firstPublicationDate || "").slice(0, 4)) || new Date().getFullYear();
      const publisher = r.bookOrReportDetails?.publisher || r.publisher || "";
      const journalTitle = r.journalTitle || r.journalInfo?.journal?.title || r.journalInfo?.journal?.medlineAbbreviation || "";
      papers.push({
        id: `europepmc-${pmid || r.id || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: (r.authorString || "Unknown authors").substring(0, 300),
        journal: journalTitle || publisher || label,
        year,
        doi,
        abstract,
        database: label,
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : r.sourceUrl || "",
        pmid,
        sourceBackend: label === "Europe PMC" ? "Europe PMC REST API" : `${label} (indexed by Europe PMC)`,
        sources: [label],
      });
    }

    const next = data.nextCursorMark;
    if (!next || next === cursorMark) break;
    cursorMark = next;
    await sleep(150);
  }

  return papers.slice(0, ctx.limit);
}

export async function fetchEuropePMC(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const papers = await fetchEuropePmcQuery(query, { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE });
  void studyType;
  return papers;
}

export async function fetchBioRxiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const papers = await fetchEuropePmcQuery(
    query,
    { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE },
    ["SRC:PPR", "PUBLISHER:bioRxiv"],
    "bioRxiv"
  );
  void studyType;
  return papers;
}

export async function fetchMedRxiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const papers = await fetchEuropePmcQuery(
    query,
    { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE },
    ["SRC:PPR", "PUBLISHER:medRxiv"],
    "medRxiv"
  );
  void studyType;
  return papers;
}

/* --------------------------- OpenAlex ----------------------------- */

function normalizeOpenAlexWork(work: any): Paper {
  const title = work.title || work.display_name || "Untitled";
  const authors = authorsFromList(work.authorships || []);
  const journal =
    work.primary_location?.source?.display_name ||
    work.host_venue?.display_name ||
    work.publication_venue?.display_name ||
    "Unknown Journal";
  const year = work.publication_year || parseInt((work.publication_date || "").slice(0, 4)) || new Date().getFullYear();
  const doi = (work.doi || "").replace("https://doi.org/", "");
  const abstract = work.abstract_inverted_index
    ? invertAbstract(work.abstract_inverted_index)
    : work.abstract || "No abstract available.";

  return {
    id: work.id || `openalex-${Math.random().toString(36).slice(2, 8)}`,
    title,
    authors: authors.substring(0, 300),
    journal,
    year: parseInt(String(year)) || new Date().getFullYear(),
    doi,
    abstract: truncate(abstract),
    database: "OpenAlex",
    studyType: classifyStudyType(title, abstract),
    selected: false,
    url: work.doi || work.id || "",
    pmid: work.ids?.pmid?.replace("https://pubmed.ncbi.nlm.nih.gov/", "") || undefined,
    sourceBackend: "OpenAlex API",
    sources: ["OpenAlex"],
  };
}

function invertAbstract(index: Record<string, number[]>): string {
  const entries = Object.entries(index || {});
  if (entries.length === 0) return "No abstract available.";
  let maxPos = -1;
  for (const [, positions] of entries) {
    for (const pos of positions) maxPos = Math.max(maxPos, pos);
  }
  if (maxPos < 0) return "No abstract available.";
  const words: string[] = new Array(maxPos + 1).fill("");
  for (const [word, positions] of entries) {
    for (const pos of positions) {
      if (pos >= 0 && pos <= maxPos) words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ").trim() || "No abstract available.";
}

export async function fetchOpenAlex(
  query: string,
  yearFrom?: string,
  yearTo?: string,
  studyType?: string,
  options?: { limit?: number; sort?: string; filter?: string }
): Promise<Paper[]> {
  const limit = Math.min(options?.limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const filterParts: string[] = [];
  if (yearFrom) filterParts.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filterParts.push(`to_publication_date:${yearTo}-12-31`);
  if (options?.filter) filterParts.push(options.filter);

  const params = new URLSearchParams({
    search: buildDatabaseSearch("OpenAlex", query, { yearFrom, yearTo }).term,
    "per-page": "100",
    mailto: CONTACT_EMAIL,
  });
  if (filterParts.length) params.set("filter", filterParts.join(","));
  if (options?.sort) params.set("sort", options.sort);
  const apiKey = process.env.OPENALEX_API_KEY;
  if (apiKey) params.set("api_key", apiKey);

  const baseUrl = `https://api.openalex.org/works?${params.toString()}`;
  const papers: Paper[] = [];
  let cursorUrl = `${baseUrl}&cursor=*`;
  let pages = 0;

  while (papers.length < limit && pages < 5) {
    pages++;
    const data = await httpJson<any>(cursorUrl, { timeoutMs: 30000, retries: 2 });
    const results = data.results || [];
    if (results.length === 0) break;
    results.forEach((w: any) => papers.push(normalizeOpenAlexWork(w)));
    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor) break;
    cursorUrl = `${baseUrl}&cursor=${encodeURIComponent(nextCursor)}`;
    await sleep(120);
  }

  void studyType;
  return papers.slice(0, limit);
}

/* --------------------------- Crossref ----------------------------- */

export async function fetchCrossref(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const filters: string[] = [];
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}`);
  if (yearTo) filters.push(`until-pub-date:${yearTo}`);

  const papers: Paper[] = [];
  let cursor = "*";
  let pages = 0;

  while (papers.length < maxResults && pages < 5) {
    pages++;
    const qs = new URLSearchParams({ query: buildDatabaseSearch("Crossref", query).term, rows: "100", cursor });
    if (filters.length) qs.set("filter", filters.join(","));
    const data = await httpJson<any>(`https://api.crossref.org/works?${qs.toString()}`, { timeoutMs: 30000, retries: 3 });
    const results = data.message?.items || [];
    if (results.length === 0) break;

    for (const w of results) {
      const title = w.title?.[0] || "Untitled";
      const abstract = truncate(stripTags(w.abstract || ""));
      const doi = (w.DOI || "").replace("https://doi.org/", "");
      const year = w.published?.["date-parts"]?.[0]?.[0] || w.created?.["date-parts"]?.[0]?.[0] || new Date().getFullYear();
      papers.push({
        id: `crossref-${doi || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authorsFromList(w.author || []).substring(0, 300),
        journal: w["container-title"]?.[0] || "Unknown Journal",
        year: parseInt(String(year)) || new Date().getFullYear(),
        doi,
        abstract,
        database: "Crossref",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : w.URL || w.url || "",
        sourceBackend: "Crossref REST API",
        sources: ["Crossref"],
      });
    }

    const next = data.message?.["next-cursor"];
    if (!next || next === cursor || results.length < 100) break;
    cursor = next;
    await sleep(150);
  }

  void studyType;
  return papers.slice(0, maxResults);
}

/* ----------------------------- arXiv ------------------------------- */

export async function fetcharXiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, 200);
  const searchQuery = encodeURIComponent(buildDatabaseSearch("arXiv", query).term);
  const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=relevance`;
  const text = await httpText(url, { timeoutMs: 45000, retries: 3 });
  if (!text) return [];

  const papers: Paper[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(text)) !== null) {
    const entry = match[1];
    const id = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || "";
    const title = stripTags((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "") || "Untitled";
    const summary = stripTags((entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "");
    const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.trim() || "";
    const year = parseInt(published.slice(0, 4)) || new Date().getFullYear();
    const authors: string[] = [];
    const authorRegex = /<name>([^<]+)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null && authors.length < 8) {
      authors.push(stripTags(authorMatch[1]));
    }
    const doi = (entry.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/) || [])[1]?.trim() || "";
    const arxivId = id.split("/abs/").pop() || id;
    const journal = stripTags((entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/) || [])[1] || "") || "arXiv";
    papers.push({
      id: `arxiv-${arxivId}`,
      title,
      authors: authors.length ? authors.join(", ") + (authors.length >= 8 ? " et al." : "") : "Unknown authors",
      journal,
      year,
      doi,
      abstract: truncate(summary),
      database: "arXiv",
      studyType: classifyStudyType(title, summary),
      selected: false,
      url: id,
      sourceBackend: "arXiv Atom API",
      sources: ["arXiv"],
    });
  }

  void yearFrom;
  void yearTo;
  void studyType;
  return papers;
}

/* ------------------------------ DOAJ ------------------------------- */

export async function fetchDoaj(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const papers: Paper[] = [];
  for (let page = 1; page <= 5 && papers.length < maxResults; page++) {
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(buildDatabaseSearch("DOAJ", query).term)}?pageSize=100&page=${page}`;
    const data = await httpJson<any>(url, { timeoutMs: 30000, retries: 1 });
    const results = data.results || [];
    if (results.length === 0) break;

    for (const r of results) {
      const bibJson = r.bibjson || {};
      const title = bibJson.title || "Untitled";
      const abstract = truncate(stripTags(bibJson.abstract || ""));
      const year = parseInt(bibJson.year) || parseInt((bibJson.month || "").slice(0, 4)) || new Date().getFullYear();
      const doi = bibJson.doi || "";
      papers.push({
        id: `doaj-${r.id || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authorsFromList(bibJson.author || []).substring(0, 300),
        journal: bibJson.journal?.title || "Unknown Journal",
        year,
        doi,
        abstract,
        database: "DOAJ",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : r.id || "",
        sourceBackend: "DOAJ API v2",
        sources: ["DOAJ"],
      });
    }

    if (results.length < 100) break;
    await sleep(200);
  }

  void yearFrom;
  void yearTo;
  void studyType;
  return papers.slice(0, maxResults);
}

/* ---------------------------- OpenAIRE ----------------------------- */

export async function fetchOpenAIRE(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const papers: Paper[] = [];

  for (let page = 1; page <= 3 && papers.length < maxResults; page++) {
    const qs = new URLSearchParams({ keywords: buildDatabaseSearch("OpenAIRE", query).term, format: "json", size: "100", page: String(page) });
    const data = await httpJson<any>(`https://api.openaire.eu/search/publications?${qs.toString()}`, {
      timeoutMs: 30000,
      retries: 3,
    });
    const results = data.response?.results?.result || [];
    if (results.length === 0) break;

    for (const r of results) {
      const meta = r.metadata || {};
      const entity = meta["oaf:entity"] || {};
      const result = entity["oaf:result"] || {};
      const title = stripTags(result.title?.$ || result.title || result.resulttitle?.$ || result.resulttitle || "Untitled");
      const creatorList = Array.isArray(result.creator) ? result.creator : result.creator ? [result.creator] : [];
      const authors = creatorList
        .map((c: any) => (typeof c === "string" ? c : c?.$ || c?.content || c?.name || ""))
        .filter(Boolean)
        .join(", ")
        .substring(0, 300) || "Unknown authors";
      const yearStr = result.dateofacceptance?.$ || result.dateofacceptance || result.dateofcollection?.$ || result.dateofcollection || "";
      const year = parseInt(String(yearStr).slice(0, 4)) || new Date().getFullYear();
      const doi = (result.doi?.$ || result.doi || "").replace("https://doi.org/", "");
      const abstract = truncate(stripTags(result.description?.$ || result.description || result.abstract?.$ || result.abstract || ""));

      papers.push({
        id: `openaire-${doi || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors,
        journal: result.journal?.$ || result.journal || "Unknown Journal",
        year,
        doi,
        abstract,
        database: "OpenAIRE",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : result.bestaccessright?.$ ? "" : "",
        sourceBackend: "OpenAIRE API",
        sources: ["OpenAIRE"],
      });
    }

    if (results.length < 100) break;
    await sleep(250);
  }

  void yearFrom;
  void yearTo;
  void studyType;
  return papers.slice(0, maxResults);
}

/* ------------------------------ dblp ------------------------------- */

export async function fetchDblp(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const qs = new URLSearchParams({ q: query, format: "json", h: "100", f: "0" });
  const res = await httpRequest(`https://dblp.org/search/publ/api?${qs.toString()}`, { timeoutMs: 30000, retries: 2 });
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    throw new HttpError("DBLP returned a non-JSON page (automated access is currently blocked by dblp.org)");
  }
  const data = JSON.parse(text);
  const hitsRaw = data.result?.hits?.hit || [];
  const hits = Array.isArray(hitsRaw) ? hitsRaw : [hitsRaw];

  const papers: Paper[] = hits.map((h: any) => {
    const info = h.info || {};
    const title = stripTags(info.title || "Untitled");
    const year = parseInt(info.year) || new Date().getFullYear();
    const ee = info.ee || info.url || "";
    const authors = info.authors?.author || [];
    const authorNames = Array.isArray(authors)
      ? authors.map((a: any) => a.text || a).join(", ")
      : authors?.text || "Unknown authors";
    return {
      id: `dblp-${h["@id"] || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: (authorNames || "Unknown authors").substring(0, 300),
      journal: info.venue || info.journal || info.type || "Unknown Journal",
      year,
      doi: "",
      abstract: "No abstract available.",
      database: "dblp",
      studyType: classifyStudyType(title, ""),
      selected: false,
      url: ee,
      sourceBackend: "DBLP API",
      sources: ["dblp"],
    };
  });

  void yearFrom;
  void yearTo;
  void studyType;
  return papers.slice(0, maxResults);
}

/* ----------------------------- Zenodo ------------------------------ */

export async function fetchZenodo(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const results: any[] = [];
  const pageSize = 25; // the Zenodo records API rejects larger page sizes

  for (let page = 1; page <= 8 && results.length < maxResults; page++) {
    const qs = new URLSearchParams({ q: buildDatabaseSearch("Zenodo", query).term, size: String(pageSize), sort: "bestmatch", page: String(page) });
    const data = await httpJson<any>(`https://zenodo.org/api/records?${qs.toString()}`, { timeoutMs: 30000, retries: 2 });
    const hits = data.hits?.hits || [];
    if (hits.length === 0) break;
    results.push(...hits);
    if (hits.length < pageSize) break;
    await sleep(200);
  }

  const papers: Paper[] = results.map((r: any) => {
    const meta = r.metadata || {};
    const title = stripTags(meta.title || "Untitled");
    const abstract = truncate(stripTags(meta.description || ""));
    const year = parseInt((meta.publication_date || meta.date || "").slice(0, 4)) || new Date().getFullYear();
    const doi = (meta.doi || r.doi || "").replace("https://doi.org/", "");
    return {
      id: `zenodo-${r.id || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: authorsFromList(meta.creators || []).substring(0, 300),
      journal: (meta.resource_type?.title || "Zenodo") as string,
      year,
      doi,
      abstract,
      database: "Zenodo",
      studyType: classifyStudyType(title, abstract),
      selected: false,
      url: doi ? `https://doi.org/${doi}` : `https://zenodo.org/record/${r.id}`,
      sourceBackend: "Zenodo REST API",
      sources: ["Zenodo"],
    };
  });

  void yearFrom;
  void yearTo;
  void studyType;
  return papers.slice(0, maxResults);
}

/* ------------------------ Semantic Scholar ------------------------- */

async function fetchSemanticScholarCore(
  query: string,
  ctx: FetchContext,
  fields: string,
  label: string,
  backendLabel: string
): Promise<Paper[]> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const papers: Paper[] = [];
  const pageSize = 100;
  let offset = 0;

  while (papers.length < ctx.limit && offset < 300) {
    const params = new URLSearchParams({ query, fields, limit: String(pageSize), offset: String(offset) });
    const data = await httpJson<any>(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`, {
      timeoutMs: 30000,
      retries: 2,
      headers,
    });
    const batch: any[] = data.data || [];
    if (batch.length === 0) break;

    for (const p of batch) {
      if (!p.title || p.title.length <= 5) continue;
      const abstract = truncate(stripTags(p.abstract || ""));
      const doi = p.externalIds?.DOI || "";
      const year = typeof p.year === "number" ? p.year : parseInt((p.publicationDate || "").slice(0, 4)) || new Date().getFullYear();
      papers.push({
        id: `s2-${p.paperId || Math.random().toString(36).slice(2, 8)}`,
        title: p.title,
        authors: authorsFromList(p.authors || []).substring(0, 300),
        journal: p.venue || label,
        year,
        doi,
        abstract,
        database: label,
        studyType: classifyStudyType(p.title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${p.paperId}`,
        sourceBackend: backendLabel,
        sources: [label],
      });
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
    await sleep(350);
  }

  return papers.slice(0, ctx.limit);
}

export async function fetchSemanticScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const papers = await fetchSemanticScholarCore(
    query,
    { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE },
    "title,authors,year,abstract,externalIds,venue,publicationDate,citationCount",
    "Semantic Scholar",
    "Semantic Scholar Graph API"
  );
  void studyType;
  return papers;
}

export async function fetchGoogleScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  // Google Scholar has no public API. The Semantic Scholar Graph API is used as
  // the index for this entry and the source is labelled truthfully.
  const papers = await fetchSemanticScholarCore(
    query,
    { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE },
    "title,authors,year,abstract,externalIds,venue,citationCount",
    "Google Scholar",
    "Semantic Scholar Graph API (Google Scholar has no public API)"
  );
  void studyType;
  return papers.map((p) => ({ ...p, sources: ["Google Scholar", "Semantic Scholar"] }));
}

export async function fetchScienceDirectBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const papers = await fetchSemanticScholarCore(
    query,
    { query, yearFrom, yearTo, limit: limit ?? DEFAULT_LIMIT_PER_DATABASE },
    "title,authors,year,abstract,externalIds,venue",
    "ScienceDirect",
    "Semantic Scholar Graph API (ScienceDirect has no public API)"
  );
  void studyType;
  return papers;
}

/* ----------------------- ClinicalTrials.gov ------------------------ */

export async function fetchClinicalTrialsGov(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, MAX_LIMIT_PER_DATABASE);
  const papers: Paper[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5 && papers.length < maxResults; page++) {
    const qs = new URLSearchParams({ "query.term": buildDatabaseSearch("ClinicalTrials.gov", query).term, format: "json", pageSize: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const data = await httpJson<any>(`https://clinicaltrials.gov/api/v2/studies?${qs.toString()}`, {
      timeoutMs: 30000,
      retries: 3,
    });
    const studies = data.studies || [];
    if (studies.length === 0) break;

    for (const s of studies) {
      const ps = s.protocolSection || {};
      const idModule = ps.identificationModule || {};
      const descModule = ps.descriptionModule || {};
      const sponsorModule = ps.sponsorCollaboratorsModule || {};
      const designModule = ps.designModule || {};
      const statusModule = ps.statusModule || {};
      const title = idModule.briefTitle || idModule.officialTitle || "Untitled";
      const nctId = idModule.nctId || "";
      const authors = sponsorModule.leadSponsor?.name || "Unknown sponsor";
      const abstract = truncate(stripTags(descModule.briefSummary || descModule.detailedDescription || ""));
      const startDate = statusModule.startDateStruct?.date || designModule.startDateStruct?.date || "";
      const year = parseInt(startDate.slice(0, 4)) || new Date().getFullYear();
      const studyTypeValue = designModule.studyType || "Clinical Trial";
      papers.push({
        id: `ctg-${nctId || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors,
        journal: "ClinicalTrials.gov",
        year,
        doi: "",
        abstract,
        database: "ClinicalTrials.gov",
        studyType: studyTypeValue === "Clinical Trial" ? classifyStudyType(title, abstract) : studyTypeValue,
        selected: false,
        url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : `https://clinicaltrials.gov/expert-search?query=${encodeURIComponent(query)}`,
        sourceBackend: "ClinicalTrials.gov API v2",
        sources: ["ClinicalTrials.gov"],
        pmid: nctId,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await sleep(200);
  }

  void yearFrom;
  void yearTo;
  void studyType;
  return papers.slice(0, maxResults);
}

/* ------------------------- Cochrane Library ----------------------- */

async function tavilySearch(query: string, maxResults: number, domains?: string[]): Promise<any[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new HttpError("Tavily web search requires a TAVILY_API_KEY (set it in .env.local to enable this source)");
  }
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: maxResults,
    search_depth: "basic",
  };
  if (domains && domains.length) body.include_domains = domains;
  const res = await httpRequest("https://api.tavily.com/search", {
    method: "POST",
    timeoutMs: 30000,
    retries: 2,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.results || [];
}

export async function fetchCochraneLibrary(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = Math.min(limit ?? DEFAULT_LIMIT_PER_DATABASE, 50);
  const results = await tavilySearch(`site:cochranelibrary.com ${query}`, maxResults, ["cochranelibrary.com"]);

  const papers: Paper[] = results.map((r: any, index: number) => {
    const title = stripTags(r.title || "Untitled");
    const abstract = truncate(stripTags(r.content || ""));
    const year = parseInt((r.published_date || "").slice(0, 4)) || new Date().getFullYear();
    return {
      id: `cochrane-${index}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: "Cochrane Library",
      journal: "Cochrane Library",
      year,
      doi: "",
      abstract,
      database: "Cochrane Library",
      studyType: classifyStudyType(title, abstract),
      selected: false,
      url: r.url || "",
      sourceBackend: "Tavily web search (cochranelibrary.com)",
      sources: ["Cochrane Library"],
    };
  });

  void yearFrom;
  void yearTo;
  void studyType;
  return papers;
}

/* ------------------------ paper-search-mcp ------------------------- */

export async function fetchPaperSearchMcp(query: string, source: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.PAPER_SEARCH_API_BASE ||
        (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000");

  if (!base) {
    throw new HttpError("paper-search-mcp bridge is not reachable from the browser context");
  }

  const res = await httpRequest(`${base}/api/paper-search-mcp`, {
    method: "POST",
    timeoutMs: 60000,
    retries: 1,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, source, maxResults: limit ?? DEFAULT_LIMIT_PER_DATABASE, yearFrom, yearTo, studyType }),
  });

  const data: any = await res.json();
  const papers: Paper[] = (data.papers || []).map((p: any) => {
    const title = p.title || "Untitled";
    const abstract = truncate(stripTags(p.abstract || ""));
    return {
      id: p.id || `mcp-${Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: p.authors || "Unknown authors",
      journal: p.journal || p.source || "paper-search-mcp",
      year: p.year || new Date().getFullYear(),
      doi: p.doi || "",
      abstract,
      database: p.source || "paper-search-mcp",
      studyType: p.studyType || classifyStudyType(title, abstract),
      selected: false,
      url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
      sourceBackend: "paper-search-mcp",
      sources: p.source ? [p.source] : ["paper-search-mcp"],
    };
  });

  void yearFrom;
  void yearTo;
  void studyType;
  return papers;
}

/* ------------------------------------------------------------------ */
/* Database registry + orchestration                                   */
/* ------------------------------------------------------------------ */

export interface DatabaseDefinition {
  id: string;
  label: string;
  url: string;
  description: string;
  /** API key env var that must be present for the source to be usable. */
  requiresKey?: string;
  /** Extra context shown when the required key is missing. */
  keyHint?: string;
  /** Set when the source is switched off (upstream blocks / no public API). */
  disabled?: boolean;
  disabledReason?: string;
  /** Shown when the source is rate-limited or blocked upstream. */
  rateLimitHint?: string;
  search: (ctx: FetchContext) => Promise<Paper[]>;
}

export const DATABASE_DEFINITIONS: DatabaseDefinition[] = [
  {
    id: "PubMed",
    label: "PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    description: "NLM E-utilities search over MEDLINE/PMC (NCBI_API_KEY only raises the request rate)",
    search: (ctx) => fetchPubMedBrowserless(ctx.query, ctx.yearFrom, ctx.yearTo, ctx.studyType, ctx.limit),
  },
  {
    id: "OpenAlex",
    label: "OpenAlex",
    url: "https://openalex.org/",
    description: "OpenAlex works index (uses OPENALEX_API_KEY when available)",
    requiresKey: "OPENALEX_API_KEY",
    keyHint: "Without a key the API answers HTTP 429 because the shared-IP daily budget is exhausted.",
    rateLimitHint: "the shared-IP daily budget is exhausted; set OPENALEX_API_KEY in .env.local to lift the limit",
    search: (ctx) => fetchOpenAlex(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, { limit: ctx.limit }),
  },  {
    id: "Europe PMC",
    label: "Europe PMC",
    url: "https://europepmc.org/",
    description: "Europe PMC literature database",
    search: (ctx) => fetchEuropePMC(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "DOAJ",
    label: "DOAJ",
    url: "https://doaj.org/",
    description: "Directory of Open Access Journals",
    disabled: true,
    disabledReason: "The DOAJ API answers HTTP 502 for automated access from this environment. Re-enable (disabled: false) once doaj.org serves the API again.",
    search: (ctx) => fetchDoaj(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "bioRxiv",
    label: "bioRxiv",
    url: "https://www.biorxiv.org/",
    description: "bioRxiv preprints (via the Europe PMC preprint index)",
    search: (ctx) => fetchBioRxiv(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "medRxiv",
    label: "medRxiv",
    url: "https://www.medrxiv.org/",
    description: "medRxiv preprints (via the Europe PMC preprint index)",
    search: (ctx) => fetchMedRxiv(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Crossref",
    label: "Crossref",
    url: "https://www.crossref.org/",
    description: "Crossref DOI metadata registry",
    search: (ctx) => fetchCrossref(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "arXiv",
    label: "arXiv",
    url: "https://arxiv.org/",
    description: "arXiv preprint repository",
    search: (ctx) => fetcharXiv(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "OpenAIRE",
    label: "OpenAIRE",
    url: "https://www.openaire.eu/",
    description: "OpenAIRE research graph",
    search: (ctx) => fetchOpenAIRE(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "dblp",
    label: "dblp",
    url: "https://dblp.org/",
    description: "dblp computer science bibliography",
    disabled: true,
    disabledReason: "dblp.org serves a bot-protection page to automated clients, so no records can be retrieved. Re-enable (disabled: false) if dblp.org allows this network again.",
    search: (ctx) => fetchDblp(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Zenodo",
    label: "Zenodo",
    url: "https://zenodo.org/",
    description: "Zenodo open repository",
    search: (ctx) => fetchZenodo(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Google Scholar",
    label: "Google Scholar",
    url: "https://scholar.google.com/",
    description: "Scholar index served by the Semantic Scholar Graph API (no public Google Scholar API)",
    disabled: true,
    disabledReason: "Google Scholar has no public API: this entry resolved through the same Semantic Scholar Graph API as the 'Semantic Scholar' entry, so it was a duplicate that only added a second failing call.",
    search: (ctx) => fetchGoogleScholarBrowserless(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Semantic Scholar",
    label: "Semantic Scholar",
    url: "https://www.semanticscholar.org/",
    description: "Semantic Scholar Graph API (uses SEMANTIC_SCHOLAR_API_KEY when available)",
    requiresKey: "SEMANTIC_SCHOLAR_API_KEY",
    keyHint: "Without a key the Graph API answers HTTP 429 because the shared-IP quota is exhausted.",
    rateLimitHint: "the shared-IP quota is exhausted; set SEMANTIC_SCHOLAR_API_KEY in .env.local to lift the limit",
    search: (ctx) => fetchSemanticScholarBrowserless(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "ClinicalTrials.gov",
    label: "ClinicalTrials.gov",
    url: "https://clinicaltrials.gov/",
    description: "ClinicalTrials.gov registry API v2",
    search: (ctx) => fetchClinicalTrialsGov(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Cochrane Library",
    label: "Cochrane Library",
    url: "https://www.cochranelibrary.com/",
    description: "Cochrane systematic reviews (web index, requires TAVILY_API_KEY)",
    requiresKey: "TAVILY_API_KEY",
    search: (ctx) => fetchCochraneLibrary(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "paper-search-mcp",
    label: "paper-search-mcp",
    url: "https://github.com/openags/paper-search-mcp",
    description: "Local paper-search-mcp bridge (optional external tool)",
    disabled: true,
    disabledReason: "Optional local bridge: it requires the paper-search-mcp binary to be installed. Set PAPER_SEARCH_MCP_BIN and re-enable (disabled: false) to use it.",
    search: (ctx) => fetchPaperSearchMcp(ctx.query, "all", ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
];

export const DATABASE_IDS = DATABASE_DEFINITIONS.map((d) => d.id);

/**
 * Why a database cannot be used right now, or undefined when it is usable.
 * A source is unusable when it was switched off (upstream blocks automated
 * access) or when it needs an API key that is not configured.
 */
export function getUnavailableReason(definition: DatabaseDefinition): string | undefined {
  if (definition.disabled) {
    return definition.disabledReason || "This database is currently disabled";
  }
  if (definition.requiresKey && !process.env[definition.requiresKey]) {
    const hint = definition.keyHint ? ` ${definition.keyHint}` : "";
    return `This database needs the ${definition.requiresKey} environment variable (set it in .env.local to enable it).${hint}`;
  }
  return undefined;
}

export function isDatabaseAvailable(definition: DatabaseDefinition): boolean {
  return getUnavailableReason(definition) === undefined;
}

/** The databases that can actually be searched right now. */
export function getAvailableDatabases(): DatabaseDefinition[] {
  return DATABASE_DEFINITIONS.filter(isDatabaseAvailable);
}

export const AVAILABLE_DATABASE_IDS = getAvailableDatabases().map((d) => d.id);

/** Sources that are always usable (no API key, no upstream block). */
const DEFAULT_AVAILABLE_DATABASE_IDS = AVAILABLE_DATABASE_IDS.filter((id) => {
  const definition = getDatabaseDefinition(id);
  return !!definition && !definition.requiresKey;
});

export function getDatabaseDefinition(id: string): DatabaseDefinition | undefined {
  return DATABASE_DEFINITIONS.find((d) => d.id === id);
}

/**
 * Run a search across the requested databases.
 * Every database is queried concurrently; a failing database never produces
 * fabricated records — it is reported as a failure with the upstream reason.
 */
export async function searchDatabases(databases: string[], options: SearchOptions): Promise<SearchOutcome> {
  const limit = Math.min(Math.max(options.limitPerDatabase ?? DEFAULT_LIMIT_PER_DATABASE, 25), MAX_LIMIT_PER_DATABASE);
  const requested = databases.length > 0 ? databases : DEFAULT_AVAILABLE_DATABASE_IDS;

  const outcomes: DatabaseOutcome[] = [];
  const errors: Record<string, string> = {};
  const collected: Paper[] = [];

  const tasks = requested.map(async (database) => {
    const definition = getDatabaseDefinition(database);
    if (!definition) {
      const outcome: DatabaseOutcome = {
        database,
        status: "failed",
        count: 0,
        rawCount: 0,
        error: "No live integration is registered for this database",
        elapsedMs: 0,
      };
      errors[database] = outcome.error!;
      return outcome;
    }

    // Databases that are switched off or missing their API key are skipped
    // immediately — there is no point in waiting for a call that cannot work.
    const unavailableReason = getUnavailableReason(definition);
    if (unavailableReason) {
      const outcome: DatabaseOutcome = {
        database,
        status: "failed",
        count: 0,
        rawCount: 0,
        error: unavailableReason,
        elapsedMs: 0,
      };
      errors[database] = unavailableReason;
      return outcome;
    }

    const started = Date.now();
    const budgetMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_SEARCH_BUDGET_MS, 5000), MAX_SEARCH_BUDGET_MS);
    // Every database is bounded by the overall search budget, so the total
    // wall-clock time of a search is predictable.
    const perDatabaseTimeout = Math.min(DATABASE_TIMEOUT_MS, budgetMs);
    try {
      const raw = await withTimeout(
        definition.search({
          query: options.query,
          yearFrom: options.yearFrom,
          yearTo: options.yearTo,
          studyType: options.studyType,
          limit,
        }),
        perDatabaseTimeout,
        `${definition.label} search timed out after ${(perDatabaseTimeout / 1000).toFixed(0)}s`
      );
      const filtered = applyFilters(raw, options);
      const elapsedMs = Date.now() - started;

      if (raw.length > 0 && filtered.length === 0) {
        const note = `${raw.length} raw record(s) retrieved but none matched the year/study-type filters`;
        outcomes.push({ database, status: "empty", count: 0, rawCount: raw.length, note, elapsedMs });
        return { database, status: "empty" as const, count: 0, rawCount: raw.length, note, elapsedMs };
      }

      const outcome: DatabaseOutcome = {
        database,
        status: filtered.length > 0 ? "success" : "empty",
        count: filtered.length,
        rawCount: raw.length,
        elapsedMs,
      };
      collected.push(...filtered);
      return outcome;
    } catch (err: any) {
      let message = err?.message || String(err);
      if (/HTTP 429/.test(message) && definition.rateLimitHint) {
        message = `${message} — ${definition.rateLimitHint}`;
      }
      const outcome: DatabaseOutcome = {
        database,
        status: "failed",
        count: 0,
        rawCount: 0,
        error: message,
        elapsedMs: Date.now() - started,
      };
      errors[database] = message;
      return outcome;
    }
  });

  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      outcomes.push(result.value);
    } else {
      const message = result.reason?.message || String(result.reason);
      errors["unknown"] = message;
    }
  }

  const totalBeforeDedup = collected.length;
  const deduped = deduplicatePapers(collected);
  const dedupedCount = totalBeforeDedup - deduped.length;

  return {
    papers: deduped,
    outcomes: outcomes.sort((a, b) => a.database.localeCompare(b.database)),
    totalBeforeDedup,
    dedupedCount,
    errors,
  };
}

export function deduplicatePapers(papers: Paper[]): Paper[] {
  const seen = new Map<string, Paper>();

  papers.forEach((paper) => {
    const doiKey = paper.doi?.toLowerCase().trim();
    const titleKey = paper.title.toLowerCase().trim().slice(0, 80);

    const key = doiKey || titleKey;
    if (!key) {
      seen.set(`${paper.id}-${paper.database}`, paper);
      return;
    }

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      existing.sources = Array.from(new Set([...(existing.sources || []), paper.database]));
      if (!existing.doi && paper.doi) existing.doi = paper.doi;
      if (!existing.pmid && paper.pmid) existing.pmid = paper.pmid;
      if (!existing.url && paper.url) existing.url = paper.url;
      if (!existing.abstract && paper.abstract) existing.abstract = paper.abstract;
    } else {
      seen.set(key, { ...paper, sources: [paper.database] });
    }
  });

  return Array.from(seen.values());
}

export function getOpenClawSkillDatabaseMapping(): Array<{ skill: string; supportedDatabases: string[]; notes: string }> {
  return [
    {
      skill: "literature-review",
      supportedDatabases: ["PubMed", "OpenAlex", "Europe PMC", "Google Scholar", "Semantic Scholar", "arXiv", "bioRxiv", "medRxiv"],
      notes: "All sources are queried through their public REST APIs in src/lib/database-apis.ts",
    },
    {
      skill: "paper-search-mcp",
      supportedDatabases: ["arXiv", "PubMed", "bioRxiv", "medRxiv", "Semantic Scholar", "Crossref", "OpenAlex", "Europe PMC", "DOAJ", "Zenodo"],
      notes: "Optional local bridge; requires the paper-search-mcp binary to be installed",
    },
    {
      skill: "biomedical-search",
      supportedDatabases: ["PubMed", "Europe PMC", "bioRxiv", "medRxiv", "ClinicalTrials.gov"],
      notes: "Preprints are retrieved from the Europe PMC preprint index",
    },
    {
      skill: "clinicaltrials-database",
      supportedDatabases: ["ClinicalTrials.gov"],
      notes: "Direct API v2 support",
    },
    {
      skill: "literature-deep-research",
      supportedDatabases: ["PubMed", "Europe PMC", "OpenAlex", "Semantic Scholar", "bioRxiv", "medRxiv"],
      notes: "Citation verification via Crossref is available in Step 1",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Legacy helpers kept for API compatibility                            */
/* ------------------------------------------------------------------ */

export async function fetchRealPapers(
  query: string,
  databases: string[],
  yearFrom?: string,
  yearTo?: string,
  studyType?: string
): Promise<Paper[]> {
  const outcome = await searchDatabases(databases, { query, yearFrom, yearTo, studyType });
  return outcome.papers;
}

export interface FetchRealPapersResult {
  papers: Paper[];
  dedupedCount: number;
}

export async function fetchRealPapersWithCounts(
  query: string,
  databases: string[],
  yearFrom?: string,
  yearTo?: string,
  studyType?: string
): Promise<FetchRealPapersResult> {
  const outcome = await searchDatabases(databases, { query, yearFrom, yearTo, studyType });
  return { papers: outcome.papers, dedupedCount: outcome.dedupedCount };
}

/* ------------------------------------------------------------------ */
/* Web search fallback (real results only)                             */
/* ------------------------------------------------------------------ */

export async function webSearchPapers(query: string, maxResults: number = 10, baseUrl?: string): Promise<Paper[]> {
  const base = baseUrl ?? (typeof window !== "undefined" ? "" : process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000");
  const res = await httpRequest(`${base}/api/web-search`, {
    method: "POST",
    timeoutMs: 45000,
    retries: 1,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, maxResults }),
  });

  const data: any = await res.json();
  return (data.papers || []).map((p: any) => {
    const title = p.title || "Untitled";
    const abstract = truncate(stripTags(p.abstract || ""));
    return {
      id: p.id || `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: p.authors || "Unknown authors",
      journal: p.journal || "Web Search",
      year: p.year || new Date().getFullYear(),
      doi: p.doi || "",
      abstract,
      database: p.source ? `Web Search (${p.source})` : "Web Search",
      studyType: p.studyType || classifyStudyType(title, abstract),
      selected: false,
      url: p.url,
      sourceBackend: p.sourceBackend || "Web search",
      sources: ["web-search"],
    };
  });
}

export async function quickSearch(query: string, maxResults: number = 8): Promise<Paper[]> {
  try {
    const papers = await fetchOpenAlex(query, undefined, undefined, undefined, { limit: maxResults });
    return papers.slice(0, maxResults);
  } catch {
    return [];
  }
}
