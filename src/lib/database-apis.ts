import { getSkillById, MEDICAL_SKILLS_REGISTRY } from "./medical-skills/skills-registry";
import * as cheerio from "cheerio";

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

const STUDY_TYPE_KEYWORDS: Record<string, string[]> = {
  "Randomized Controlled Trial (RCT)": ["randomized controlled trial", "randomised controlled trial", "rct"],
  "Systematic Review": ["systematic review"],
  "Meta-Analysis": ["meta-analysis", "meta analysis", "metaanalysis"],
  "Observational Study": ["observational study", "observational"],
  "Cohort Study": ["cohort study", "cohort"],
  "Case-Control Study": ["case-control", "case control", "case-control study"],
  "Cross-Sectional Study": ["cross-sectional", "cross sectional", "crosssectional"],
  "Clinical Trial": ["clinical trial", "clinical study"],
  "Qualitative Study": ["qualitative", "interview", "focus group", "phenomenolog"],
  "Case Report / Case Series": ["case report", "case series"],
  "Review Article": ["review", "narrative review", "literature review"],
  "Guideline / Consensus Statement": ["guideline", "consensus", "recommendation"],
  "Dissertation / Thesis": ["dissertation", "thesis"],
};

function classifyStudyType(title: string, abstract: string): string {
  const text = `${title} ${abstract}`.toLowerCase();
  for (const [type, keywords] of Object.entries(STUDY_TYPE_KEYWORDS)) {
    if (type === "All Study Types") continue;
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return "Observational Study";
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function findDoiByTitleAuthor(title: string, authorsStr?: string): Promise<{doi?: string; title?: string; message: string}> {
  try {
    const firstAuthor = authorsStr
      ? authorsStr.split(",")[0].replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(" ").slice(-1)[0]
      : "";
    const queryTitle = title.replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
    const queryParts: string[] = [];
    if (firstAuthor) queryParts.push(`query.author:=${encodeURIComponent(firstAuthor)}`);
    queryParts.push(`query.bibliographic=${encodeURIComponent(queryTitle)}`);
    const url = `https://api.crossref.org/works?${queryParts.join("&")}&rows=5`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { message: `Crossref query failed: ${res.status}` };
    const data = await res.json();
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
      if (found.doi) {
        updated.set(p.id, found.doi);
      }
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

function normalizeOpenAlexWork(work: any): Paper {
  const title = work.title || `Untitled (${work.id?.split("/").pop() || "unknown"})`;
  const authors =
    work.authorships
      ?.map((a: any) => {
        const name = a.author?.display_name;
        const institutions = (a.institutions?.map((i: any) => i.display_name) || []).filter(Boolean).join(", ");
        if (!name) return null;
        return institutions ? `${name} (${institutions})` : name;
      })
      .filter(Boolean)
      .join(", ") || "Unknown authors";

  const journal = work.host_venue?.display_name || work.publication_venue?.display_name || "Unknown Journal";
  const year = work.publication_year || work.publication_date?.slice(0, 4) || new Date().getFullYear();
  const doi = work.doi || "";
  const abstract = work.abstract_inverted_index
    ? Object.entries(work.abstract_inverted_index)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([, positions]) => (Array.isArray(positions) ? positions[0] : positions))
        .join(" ")
        : work.abstract_inverted_index
        ? work.abstract_inverted_index
        : work.abstract || "No abstract available.";

  return {
    id: work.id || `oa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    authors: authors.substring(0, 300),
    journal,
    year: parseInt(year) || new Date().getFullYear(),
    doi: doi.replace("https://doi.org/", ""),
    abstract: abstract.substring(0, 3000) || "No abstract available.",
    database: "OpenAlex",
    studyType: classifyStudyType(title, abstract),
    selected: false,
    url: work.doi || work.id,
    pmid: work.ids?.pmid?.replace("https://pubmed.ncbi.nlm.nih.gov/", "") || undefined,
  };
}

interface OpenAlexOptions {
  sort?: string;
  filter?: string;
}

export async function fetchOpenAlex(
  query: string,
  yearFrom?: string,
  yearTo?: string,
  studyType?: string,
  options?: OpenAlexOptions
): Promise<Paper[]> {
  const filterParts: string[] = [];
  if (yearFrom) filterParts.push(`publication_year:>${yearFrom}`);
  if (yearTo) filterParts.push(`publication_year:<${yearTo}`);
  if (options?.filter) filterParts.push(options.filter);
  const filterStr = filterParts.length ? `&filter=${filterParts.join(",")}` : "";

  const sortStr = options?.sort ? `&sort=${options.sort}` : "";
  const baseUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=100&mailto=research@example.com${filterStr}${sortStr}`;
  const papers: Paper[] = [];
  let cursor = "*";
  let cursorUrl = `${baseUrl}&cursor=${cursor}`;

  const MAX_PAGES = 20;
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(cursorUrl);
    } catch (err: any) {
      if (page === 0 && papers.length === 0) throw new Error(`OpenAlex fetch failed: ${err?.message || String(err)}`);
      break;
    }
    if (!res.ok) {
      if (page === 0 && papers.length === 0) throw new Error(`OpenAlex error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) break;
    results.forEach((w: any) => papers.push(normalizeOpenAlexWork(w)));
    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor) break;
    cursorUrl = `${baseUrl}&cursor=${encodeURIComponent(nextCursor)}`;
  }

  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped = papers.filter((p) => {
    const doiKey = p.doi?.toLowerCase();
    const titleKey = p.title.toLowerCase().trim().slice(0, 60);
    if (doiKey && seenDois.has(doiKey)) return false;
    if (titleKey && seenTitles.has(titleKey)) return false;
    if (doiKey) seenDois.add(doiKey);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = deduped.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : deduped.slice(0, 20);
  }

  return deduped;
}

// Re-export STUDY_TYPES for backward compatibility
export const STUDY_TYPES = Object.keys(STUDY_TYPE_KEYWORDS);

async function fetchWithTimeout(url: string, ms = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return res;
  } catch (err: any) {
    const name = err?.name || "";
    const msg = (err?.message || String(err)).toLowerCase();
    if (name === "AbortError" || msg.includes("abort")) {
      throw new Error(`Timeout after ${ms}ms fetching ${url}`);
    }
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network error") || msg.includes("cors")) {
      throw new Error(`Network/CORS failure for ${url}: ${err.message}`);
    }
    throw new Error(`Fetch failed for ${url}: ${err.message}`);
  } finally {
    clearTimeout(id);
  }
}

export async function fetchDoaj(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const papers: Paper[] = [];
  for (let page = 1; page <= 10; page++) {
    const qs = new URLSearchParams({
      search: query,
      pageSize: "100",
      page: String(page),
    });
    const url = `https://doaj.org/api/v2/search/articles/${qs.toString()}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 1) throw new Error(`DOAJ error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) break;
    const pagePapers: Paper[] = results.map((r: any) => {
      const bibJson = r.bibjson || {};
      const title = bibJson.title || "Untitled";
      const authors = (bibJson.author || []).map((a: any) => `${a.name || ""}`.trim()).filter(Boolean).join(", ") || "Unknown authors";
      const year = bibJson.year || parseInt(bibJson.month?.slice(0, 4) || "0") || new Date().getFullYear();
      const doi = bibJson.doi || "";
      const abstract = bibJson.abstract || "No abstract available.";
      const journal = bibJson.journal?.title || "Unknown Journal";
      return {
        id: `doaj-${r.id || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authors.substring(0, 300),
        journal,
        year,
        doi,
        abstract: abstract.substring(0, 3000),
        database: "DOAJ",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : r.id,
        sourceBackend: "DOAJ API",
        sources: ["DOAJ"],
      };
    });
    papers.push(...pagePapers);
    if (results.length < 100) break;
  }

  let filtered = papers;
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const typeFiltered = filtered.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return typeFiltered.length > 0 ? typeFiltered : filtered;
  }

  return filtered;
}

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

export async function fetchPaperSearchMcp(query: string, source: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  throw new Error("paper-search-mcp CLI binary is not installed. Databases should use direct API fetchers.");
}

export async function fetcharXiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const searchQuery = encodeURIComponent(`all:${query}`);
  const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=200&sortBy=relevance`;
  const res = await fetchWithTimeout(url);
  const text = await res.text();
  if (!text) return [];
  const papers: Paper[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(text)) !== null) {
    const entry = match[1];
    const id = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || "";
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || "Untitled";
    const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.trim() || "";
    const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.trim() || "";
    const year = parseInt(published.slice(0, 4)) || new Date().getFullYear();
    const authors: string[] = [];
    const authorRegex = /<name>([^<]+)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null && authors.length < 8) {
      authors.push(authorMatch[1].trim());
    }
    const doiMatch = entry.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/);
    const doi = doiMatch ? doiMatch[1].trim() : "";
    const arxivId = id.split("/abs/").pop() || id;
    if (yearFrom && year < parseInt(yearFrom)) continue;
    if (yearTo && year > parseInt(yearTo)) continue;
    papers.push({
      id: `arxiv-${arxivId}`,
      title,
      authors: authors.length > 0 ? authors.join(", ") + (authors.length >= 8 ? " et al." : "") : "Unknown authors",
      journal: "arXiv",
      year,
      doi,
      abstract: summary.substring(0, 3000) || "No abstract available.",
      database: "arXiv",
      studyType: classifyStudyType(title, summary),
      selected: false,
      url: id,
      sourceBackend: "arXiv API",
      sources: ["arXiv"],
    });
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }
  return papers.slice(0, 20);
}

export async function fetchBioRxiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultFrom = `${currentYear - 3}-01-01`;
  const defaultTo = `${currentYear}-12-31`;
  const from = yearFrom ? `${yearFrom}-01-01` : defaultFrom;
  const to = yearTo ? `${yearTo}-12-31` : defaultTo;
  const baseUrl = `https://api.biorxiv.org/details/biorxiv/${from}/${to}`;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const papers: Paper[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${baseUrl}/${page}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 1) throw new Error(`bioRxiv error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.collection || [];
    if (results.length === 0) break;
    let pageMatches = 0;
    for (const r of results) {
      const authors = (r.authors || "").split(";").map((a: string) => a.trim()).filter(Boolean).join(", ");
      const title = r.title || "Untitled";
      const year = parseInt(r.date?.slice(0, 4) || r.year) || new Date().getFullYear();
      const doi = r.doi || "";
      const abstract = r.abstract || "No abstract available.";
      if (queryTerms.length > 0) {
        const text = `${title} ${abstract}`.toLowerCase();
        if (!queryTerms.some((t) => text.includes(t))) continue;
      }
      pageMatches++;
      papers.push({
        id: `biorxiv-${r.doi || r.journal || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authors || "Unknown authors",
        journal: "bioRxiv",
        year,
        doi,
        abstract: abstract.substring(0, 3000),
        database: "bioRxiv",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.biorxiv.org/content/${r.doi || r.journal}`,
        sourceBackend: "bioRxiv API",
        sources: ["bioRxiv"],
      });
    }
    if (pageMatches === 0 && page > 1) break;
    const meta = data.messages?.[0] || {};
    const totalPages = Math.ceil((parseInt(meta.total || "0") || 0) / (parseInt(meta.count || "100") || 100));
    if (page >= totalPages) break;
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchMedRxiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultFrom = `${currentYear - 3}-01-01`;
  const defaultTo = `${currentYear}-12-31`;
  const from = yearFrom ? `${yearFrom}-01-01` : defaultFrom;
  const to = yearTo ? `${yearTo}-12-31` : defaultTo;
  const baseUrl = `https://api.medrxiv.org/details/medrxiv/${from}/${to}`;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const papers: Paper[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${baseUrl}/${page}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 1) throw new Error(`medRxiv error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.collection || [];
    if (results.length === 0) break;
    let pageMatches = 0;
    for (const r of results) {
      const authors = (r.authors || "").split(";").map((a: string) => a.trim()).filter(Boolean).join(", ");
      const title = r.title || "Untitled";
      const year = parseInt(r.date?.slice(0, 4) || r.year) || new Date().getFullYear();
      const doi = r.doi || "";
      const abstract = r.abstract || "No abstract available.";
      if (queryTerms.length > 0) {
        const text = `${title} ${abstract}`.toLowerCase();
        if (!queryTerms.some((t) => text.includes(t))) continue;
      }
      pageMatches++;
      papers.push({
        id: `medrxiv-${r.doi || r.journal || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authors || "Unknown authors",
        journal: "medRxiv",
        year,
        doi,
        abstract: abstract.substring(0, 3000),
        database: "medRxiv",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.medrxiv.org/content/${r.doi || r.journal}`,
        sourceBackend: "medRxiv API",
        sources: ["medRxiv"],
      });
    }
    if (pageMatches === 0 && page > 1) break;
    const meta = data.messages?.[0] || {};
    const totalPages = Math.ceil((parseInt(meta.total || "0") || 0) / (parseInt(meta.count || "100") || 100));
    if (page >= totalPages) break;
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchZenodo(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({ q: query, size: "100", sort: "mostrecent" });
  const url = `https://zenodo.org/api/records?${qs.toString()}`;
  const res = await fetchWithTimeout(url, 25000);
  if (!res.ok) {
    if (res.status === 400) {
      const qs2 = new URLSearchParams({ q: query, size: "100", sort: "version" });
      const url2 = `https://zenodo.org/api/records?${qs2.toString()}`;
      const res2 = await fetchWithTimeout(url2, 25000);
      if (!res2.ok) throw new Error(`Zenodo error: ${res2.status}`);
      const data = await res2.json();
      const results = data.hits?.hits || [];
      return buildZenodoPapers(results, yearFrom, yearTo, studyType);
    }
    throw new Error(`Zenodo error: ${res.status}`);
  }
  const data = await res.json();
  const results = data.hits?.hits || [];
  return buildZenodoPapers(results, yearFrom, yearTo, studyType);
}

function buildZenodoPapers(results: any[], yearFrom?: string, yearTo?: string, studyType?: string): Paper[] {
  const papers: Paper[] = results.map((r: any) => {
    const meta = r.metadata || {};
    const title = meta.title || "Untitled";
    const creators = meta.creators || [];
    const authors = creators.map((c: any) => c.name || "").filter(Boolean).join(", ") || "Unknown authors";
    const year = parseInt(meta.publication_date?.slice(0, 4) || meta.date?.slice(0, 4)) || new Date().getFullYear();
    const doi = (meta.doi || "").replace("https://doi.org/", "");
    const abstract = meta.description || "No abstract available.";
    return {
      id: `zenodo-${r.id || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: authors.substring(0, 300),
      journal: "Zenodo",
      year,
      doi,
      abstract: abstract.substring(0, 3000),
      database: "Zenodo",
      studyType: classifyStudyType(title, abstract),
      selected: false,
      url: doi ? `https://doi.org/${doi}` : `https://zenodo.org/record/${r.id}`,
      sourceBackend: "Zenodo API",
      sources: ["Zenodo"],
    };
  });
  let filtered = papers;
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const typeFiltered = filtered.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return typeFiltered.length > 0 ? typeFiltered : filtered;
  }
  return papers.slice(0, 20);
}

export async function fetchCrossref(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({ query: query, rows: "100", sort: "relevance" });
  if (yearFrom) qs.set("filter", `from-pub-date:${yearFrom}`);
  if (yearTo) qs.set("filter", `until-pub-date:${yearTo}`);
  const url = `https://api.crossref.org/works?${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Crossref error: ${res.status}`);
  const data = await res.json();
  const results = data.message?.items || [];
  const papers: Paper[] = results.map((w: any) => {
    const title = w.title?.[0] || "Untitled";
    const authors = (w.author || []).slice(0, 8).map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean).join(", ") || "Unknown authors";
    const year = w.published?.["date-parts"]?.[0]?.[0] || w.created?.["date-parts"]?.[0]?.[0] || new Date().getFullYear();
    const doi = (w.DOI || "").replace("https://doi.org/", "");
    const abstract = w.abstract || "No abstract available.";
    return {
      id: `crossref-${doi || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: authors.substring(0, 300),
      journal: w["container-title"]?.[0] || "Unknown Journal",
      year: parseInt(String(year)) || new Date().getFullYear(),
      doi,
      abstract: abstract.substring(0, 3000),
      database: "Crossref",
      studyType: classifyStudyType(title, abstract),
      selected: false,
      url: doi ? `https://doi.org/${doi}` : w.url || "",
      sourceBackend: "Crossref API",
      sources: ["Crossref"],
    };
  });
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }
  return papers.slice(0, 20);
}

export async function fetchOpenAIRE(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({ title: query, format: "json", size: "100" });
  const url = `https://api.openaire.eu/search/publications?${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OpenAIRE error: ${res.status}`);
  const data = await res.json();
  const results = data.response?.results?.result || [];
  const papers: Paper[] = results.map((r: any) => {
    const meta = r.metadata || {};
    const entity = meta["oaf:entity"] || {};
    const result = entity["oaf:result"] || {};
    const title = result.resulttitle || "Untitled";
    const authors = (result.publisher || "").substring(0, 300);
    const year = parseInt(result.dateofcollection?.slice(0, 4) || result.dateofacceptance?.slice(0, 4)) || new Date().getFullYear();
    const doi = (result.doi || "").replace("https://doi.org/", "");
    const abstract = result.description || result.abstract || "No abstract available.";
    const pid = result.pid || [];
    const doiPid = pid.find((p: any) => p["@classname"] === "Digital Object Identifier");
    const resolvedDoi = doiPid?.["$"]?.replace("doi_dedup___::", "") || doi;
    if (yearFrom && year < parseInt(yearFrom)) return null;
    if (yearTo && year > parseInt(yearTo)) return null;
    return {
      id: `openaire-${resolvedDoi || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: authors || "Unknown authors",
      journal: result.journal || "Unknown Journal",
      year,
      doi: resolvedDoi,
      abstract: abstract.substring(0, 3000),
      database: "OpenAIRE",
      studyType: classifyStudyType(title, abstract),
      selected: false,
      url: resolvedDoi ? `https://doi.org/${resolvedDoi}` : "",
      sourceBackend: "OpenAIRE API",
      sources: ["OpenAIRE"],
    };
  }).filter(Boolean) as Paper[];
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }
  return papers.slice(0, 20);
}

export async function fetchDblp(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({ q: query, format: "json", h: "100", f: "0" });
  const url = `https://dblp.org/search/publ/api?${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`DBLP error: ${res.status}`);
  const data = await res.json();
  const hits = data.result?.hits?.hit || [];
  const papers: Paper[] = hits.map((h: any) => {
    const info = h.info || {};
    const title = info.title || "Untitled";
    const year = parseInt(info.year) || new Date().getFullYear();
    const ee = info.ee || info.url || "";
    const authors = info.authors?.author || [];
    const authorNames = Array.isArray(authors) ? authors.map((a: any) => a.text || a).join(", ") : (authors?.text || "Unknown authors");
    if (yearFrom && year < parseInt(yearFrom)) return null;
    if (yearTo && year > parseInt(yearTo)) return null;
    return {
      id: `dblp-${h["@id"] || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors: (authorNames || "Unknown authors").substring(0, 300),
      journal: info.journal || info.type || "Unknown Journal",
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
  }).filter(Boolean) as Paper[];
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }
  return papers.slice(0, 20);
}

export async function fetchRealPapers(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const allPapers: Paper[] = [];
  const failedDbs: string[] = [];
  const succeededDbs: string[] = [];

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "PubMed": () => fetchPubMedBrowserless(query, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchGoogleScholarBrowserless(query, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchSemanticScholarBrowserless(query, yearFrom, yearTo, studyType),
    "ClinicalTrials.gov": () => fetchClinicalTrialsGov(query, yearFrom, yearTo, studyType),
    "Cochrane Library": () => fetchCochraneLibrary(query, yearFrom, yearTo, studyType),
    "Shodhganga": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
    "ScienceDirect": () => fetchScienceDirectBrowserless(query, yearFrom, yearTo, studyType),
    "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "arXiv": () => fetcharXiv(query, yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchBioRxiv(query, yearFrom, yearTo, studyType),
    "medRxiv": () => fetchMedRxiv(query, yearFrom, yearTo, studyType),
    "CORE": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "Zenodo": () => fetchZenodo(query, yearFrom, yearTo, studyType),
    "HAL": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "SSRN": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "BASE": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "Crossref": () => fetchCrossref(query, yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchOpenAIRE(query, yearFrom, yearTo, studyType),
    "CiteSeerX": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "dblp": () => fetchDblp(query, yearFrom, yearTo, studyType),
    "IACR": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "Unpaywall": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "WHO IRIS": () => fetchOpenAlex(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
    "Prospero": () => fetchOpenAlex(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
    "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "paper-search-mcp": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
  };

  const selectedApis = databases.filter((db) => apiDatabases[db]);

  await Promise.allSettled(
    selectedApis.map(async (db) => {
      try {
        const fetchFn = apiDatabases[db];
        if (!fetchFn) return;
        const papers = await fetchFn();
        if (papers.length > 0) succeededDbs.push(db);
        else console.warn(`[fetchRealPapers] ${db}: returned 0 results for query "${query}"`);
        papers.forEach((p) => {
          if (!p.database) p.database = db;
          p.sourceBackend = getDatabaseBackend(db);
          p.sources = Array.from(new Set([...(p.sources || []), db]));
        });
        allPapers.push(...papers);
      } catch (err: any) {
        failedDbs.push(db);
        const reason = err?.message || `${err?.name || String(err)}`;
        console.warn(`[fetchRealPapers] ${db} failed: ${reason}`);
      }
    })
  );

  if (allPapers.length === 0 && failedDbs.length > 0) {
    console.error(`[fetchRealPapers] ALL databases failed: ${failedDbs.join(", ")} — network or CORS restrictions are likely blocking external API calls from this environment.`);
  }

  const totalBeforeDedup = allPapers.length;
  const deduped = deduplicatePapers(allPapers);
  const dedupedCount = totalBeforeDedup - deduped.length;

  const enriched = await enrichPapersWithDois(deduped);

  if (enriched.length === 0) {
    throw new Error(
      `No papers found across ${selectedApis.length} selected databases. ` +
      (failedDbs.length > 0
        ? `Failed databases: ${failedDbs.join(", ")}. `
        : "") +
      (succeededDbs.length > 0
        ? `Succeeded but returned no results: ${succeededDbs.join(", ")}. `
        : "") +
      `Try broadening your query or selecting more databases.`
    );
  }

  return enriched;
}

export interface FetchRealPapersResult {
  papers: Paper[];
  dedupedCount: number;
}

export async function fetchRealPapersWithCounts(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<FetchRealPapersResult> {
  const allPapers: Paper[] = [];

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "PubMed": () => fetchPubMedBrowserless(query, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchGoogleScholarBrowserless(query, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchSemanticScholarBrowserless(query, yearFrom, yearTo, studyType),
    "ClinicalTrials.gov": () => fetchClinicalTrialsGov(query, yearFrom, yearTo, studyType),
    "Cochrane Library": () => fetchCochraneLibrary(query, yearFrom, yearTo, studyType),
    "Shodhganga": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
    "ScienceDirect": () => fetchScienceDirectBrowserless(query, yearFrom, yearTo, studyType),
    "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "arXiv": () => fetcharXiv(query, yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchBioRxiv(query, yearFrom, yearTo, studyType),
    "medRxiv": () => fetchMedRxiv(query, yearFrom, yearTo, studyType),
    "CORE": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "Zenodo": () => fetchZenodo(query, yearFrom, yearTo, studyType),
    "HAL": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "SSRN": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "BASE": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "Crossref": () => fetchCrossref(query, yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchOpenAIRE(query, yearFrom, yearTo, studyType),
    "CiteSeerX": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "dblp": () => fetchDblp(query, yearFrom, yearTo, studyType),
    "IACR": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "Unpaywall": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "WHO IRIS": () => fetchOpenAlex(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
    "Prospero": () => fetchOpenAlex(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
    "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "paper-search-mcp": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
  };

  const selectedApis = databases.filter((db) => apiDatabases[db]);

  await Promise.allSettled(
    selectedApis.map(async (db) => {
      try {
        const fetchFn = apiDatabases[db];
        if (!fetchFn) return;
        const papers = await fetchFn();
        papers.forEach((p) => {
          if (!p.database) p.database = db;
          p.sourceBackend = getDatabaseBackend(db);
          p.sources = Array.from(new Set([...(p.sources || []), db]));
        });
        allPapers.push(...papers);
      } catch (err) {
        console.warn(`[${db}] fetch failed:`, err);
      }
    })
  );

  const totalBeforeDedup = allPapers.length;
  const deduped = deduplicatePapers(allPapers);
  const dedupedCount = totalBeforeDedup - deduped.length;

  const enriched = await enrichPapersWithDois(deduped);

  if (enriched.length === 0) {
    throw new Error(`No papers found across ${databases.length} selected databases. Try broadening your query or selecting more databases.`);
  }

  return { papers: enriched, dedupedCount };
}

function getDatabaseBackend(uiDatabase: string): string {
  const mapping: Record<string, string> = {
    "OpenAlex": "OpenAlex API",
    "PubMed": "PubMed E-utilities",
    "Google Scholar": "Semantic Scholar Graph API",
    "Semantic Scholar": "Semantic Scholar Graph API",
    "ClinicalTrials.gov": "ClinicalTrials.gov API v2",
    "Cochrane Library": "Web Search (cochranelibrary.com)",
    "Shodhganga": "OpenAlex API",
    "ScienceDirect": "Semantic Scholar Graph API",
    "Clarivate": "OpenAlex API",
    "DOAJ": "DOAJ API",
    "arXiv": "arXiv API",
    "bioRxiv": "bioRxiv API",
    "medRxiv": "medRxiv API",
    "CORE": "OpenAlex API",
    "Zenodo": "Zenodo API",
    "HAL": "OpenAlex API",
    "SSRN": "OpenAlex API",
    "BASE": "OpenAlex API",
    "Crossref": "Crossref API",
    "OpenAIRE": "OpenAIRE API",
    "CiteSeerX": "OpenAlex API",
    "dblp": "DBLP API",
    "IACR": "OpenAlex API",
    "Unpaywall": "OpenAlex API",
    "WHO IRIS": "OpenAlex API",
    "Prospero": "OpenAlex API",
    "scite.ai": "OpenAlex API",
    "paper-search-mcp": "OpenAlex API",
  };
  return mapping[uiDatabase] || uiDatabase;
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
      supportedDatabases: ["PubMed", "OpenAlex", "Europe PMC", "ERIC", "Google Scholar", "semantic scholar", "arXiv", "bioRxiv"],
      notes: "PubMed and Europe PMC provide direct API access; arXiv/bioRxiv require separate fetch layers",
    },
    {
      skill: "paper-search-mcp",
      supportedDatabases: ["arXiv", "PubMed", "bioRxiv", "medRxiv", "Google Scholar", "IACR", "Semantic Scholar", "Crossref", "OpenAlex", "PubMed Central (PMC)", "CORE", "Europe PMC", "dblp", "OpenAIRE", "CiteSeerX", "DOAJ", "BASE", "Zenodo", "HAL", "SSRN", "Unpaywall"],
      notes: "Unified multi-source search via openags/paper-search-mcp (MCP server / CLI). Requires Python 3.10+; optional API keys for Semantic Scholar, CORE, DOAJ, Zenodo.",
    },
    {
      skill: "biomedical-search",
      supportedDatabases: ["PubMed", "bioRxiv", "medRxiv", "ClinicalTrials.gov", "FDA drug labels"],
      notes: "Requires Valyu API key for semantic search layer",
    },
    {
      skill: "clinicaltrials-database",
      supportedDatabases: ["ClinicalTrials.gov"],
      notes: "Direct API v2 support; currently routed through Europe PMC with clinical trial filter",
    },
    {
      skill: "literature-deep-research",
      supportedDatabases: ["PubMed", "Europe PMC", "OpenAlex", "Semantic Scholar", "PMC", "bioRxiv"],
      notes: "Citation chaining and full-text verification supported via PubMed/Europe PMC",
    },
    {
      skill: "gwas-database",
      supportedDatabases: ["GWAS Catalog (NHGRI-EBI)"],
      notes: "Requires dedicated API endpoint integration",
    },
    {
      skill: "gene-enrichment",
      supportedDatabases: ["PANTHER", "STRING", "Reactome"],
      notes: "Requires pathway analysis service integration",
    },
  ];
}

export async function validateDoiViaCrossref(doi: string): Promise<{ valid: boolean; title?: string; message: string }> {
  if (!doi || doi.length < 5) return { valid: false, message: "Missing or invalid DOI" };

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { valid: false, message: `DOI not found (HTTP ${res.status})` };
    const data = await res.json();
    const work = data.message;
    const title = work.title?.[0] || "";
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

export function generateMockLegacy(query: string, dbs: string[]): Paper[] {
  const papers: Paper[] = [];
  const count = dbs.length > 0 ? Math.min(dbs.length * 15, 200) : 30;
  for (let i = 0; i < count; i++) {
      const db = dbs.length > 0 ? dbs[i % dbs.length] : "unknown";
    papers.push({
      id: `paper-${Date.now()}-${i}`,
      title: `${query}: A comprehensive ${["review", "study", "analysis", "investigation"][i % 4]} — ${db} result ${i + 1}`,
      authors: `Author ${String.fromCharCode(65 + (i % 26))}${i > 25 ? String.fromCharCode(65 + Math.floor(i / 26)) : ""}, Author ${String.fromCharCode(66 + (i % 26))} et al.`,
      journal: `Journal of ${query.replace(/[^a-zA-Z ]/g, "").trim() || "Research"}`,
      year: 2015 + (i % 11),
      doi: `10.1000/${query.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}.${db.toLowerCase().replace(/[^a-z0-9]/g, "")}${i}`,
      abstract: `This study examines ${query} using mixed methods across multiple settings. Key findings indicate significant associations between ${query} and various outcomes. Limitations include sample size constraints and geographical bias. This paper contributes to the evidence base for systematic review synthesis.`,
      database: db,
      studyType: STUDY_TYPES[1 + (i % (STUDY_TYPES.length - 1))],
      selected: false,
    });
  }
  return papers;
}

export async function webSearchPapers(query: string, maxResults: number = 10): Promise<Paper[]> {
  const res = await fetch("/api/web-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, maxResults }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Web search failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.papers || []).map((p: any) => ({
    id: p.id || `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: p.title || "Untitled",
    authors: p.authors || "Unknown authors",
    journal: p.journal || "Web Search",
    year: p.year || new Date().getFullYear(),
    doi: p.doi || "",
    abstract: (p.abstract || "No abstract available.").substring(0, 3000),
    database: "Web Search",
    studyType: p.studyType || "Observational Study",
    selected: false,
    url: p.url,
    sourceBackend: "Tavily Web Search",
    sources: ["web-search"],
  }));
}

export async function quickSearch(query: string, maxResults: number = 8): Promise<Paper[]> {
  try {
    const papers = await fetchOpenAlex(query, undefined, undefined, undefined);
    return papers.slice(0, maxResults);
  } catch {
    return [];
  }
}

export async function fetchClinicalTrialsGov(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({
    "query.term": query,
    format: "json",
    pageSize: "100",
  });
  const url = `https://clinicaltrials.gov/api/v2/studies?${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`ClinicalTrials.gov error: ${res.status}`);
  const data = await res.json();
  const studies = data.studies || [];
  const papers: Paper[] = studies.map((s: any) => {
    const ps = s.protocolSection || {};
    const idModule = ps.identificationModule || {};
    const descModule = ps.descriptionModule || {};
    const sponsorModule = ps.sponsorCollaboratorsModule || {};
    const designModule = ps.designModule || {};
    const statusModule = ps.statusModule || {};
    const title = idModule.briefTitle || idModule.officialTitle || "Untitled";
    const nctId = idModule.nctId || "";
    const authors = sponsorModule.leadSponsor?.name || "Unknown sponsor";
    const abstract = descModule.briefSummary || descModule.detailedDescription || "No abstract available.";
    const year = parseInt(statusModule.lastUpdatePostDateStruct?.date || statusModule.lastKnownPhase?.date || new Date().getFullYear().toString()) || new Date().getFullYear();
    const phase = (designModule.phases || []).join(", ") || "Not specified";
    const studyType = designModule.studyType || "Clinical Trial";
    return {
      id: `ctg-${nctId || Math.random().toString(36).slice(2, 8)}`,
      title,
      authors,
      journal: "ClinicalTrials.gov",
      year,
      doi: "",
      abstract: abstract.substring(0, 3000),
      database: "ClinicalTrials.gov",
      studyType: studyType === "Clinical Trial" ? classifyStudyType(title, abstract) : studyType,
      selected: false,
      url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : `https://clinicaltrials.gov/expert-search?query=${encodeURIComponent(query)}`,
      sourceBackend: "ClinicalTrials.gov API v2",
      sources: ["ClinicalTrials.gov"],
      pmid: nctId,
    };
  });

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }

  return papers.slice(0, 50);
}

export async function fetchCochraneLibrary(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    const res = await fetch("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `site:cochranelibrary.com ${query}`,
        maxResults: 20,
      }),
    });
    if (!res.ok) throw new Error(`Cochrane Library web search failed: ${res.status}`);
    const data = await res.json();
    const papers: Paper[] = (data.papers || [])
      .filter((p: any) => p.url && (p.url.includes("cochranelibrary.com") || p.journal === "Cochrane Library"))
      .map((p: any) => ({
        id: `cochrane-${Math.random().toString(36).slice(2, 8)}`,
        title: p.title || "Untitled",
        authors: p.authors || "Unknown authors",
        journal: "Cochrane Library",
        year: p.year || new Date().getFullYear(),
        doi: p.doi || "",
        abstract: (p.abstract || "No abstract available.").substring(0, 3000),
        database: "Cochrane Library",
        studyType: p.studyType || classifyStudyType(p.title || "", p.abstract || ""),
        selected: false,
        url: p.url,
        sourceBackend: "Web Search (cochranelibrary.com)",
        sources: ["Cochrane Library"],
      }));
    let filtered = papers;
    if (yearFrom || yearTo) {
      const yFrom = yearFrom ? parseInt(yearFrom) : 0;
      const yTo = yearTo ? parseInt(yearTo) : 9999;
      filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
    }
    if (studyType && studyType !== "All Study Types") {
      const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
      const typeFiltered = filtered.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
      return typeFiltered.length > 0 ? typeFiltered : filtered;
    }
    return filtered;
  } catch (err: any) {
    throw new Error(`Cochrane Library search failed: ${err?.message || String(err)}`);
  }
}

export async function fetchPubMedBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=200&term=${encodeURIComponent(query)}`;
  const searchRes = await fetchWithTimeout(searchUrl);
  const searchText = await searchRes.text();
  const idMatches = searchText.match(/<Id>(\d+)<\/Id>/g) || [];
  const pmids = idMatches.map((m) => m.replace(/<Id>|<\/Id>/g, "").trim()).filter(Boolean);
  if (pmids.length === 0) return [];
  const chunkSize = 50;
  const papers: Paper[] = [];
  for (let i = 0; i < pmids.length; i += chunkSize) {
    const chunk = pmids.slice(i, i + chunkSize).join(",");
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${chunk}&rettype=abstract`;
    const res = await fetchWithTimeout(fetchUrl);
    const xml = await res.text();
    const entries = xml.split("<PubmedArticle>").slice(1);
    for (const entry of entries) {
      const titleMatch = entry.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const abstractMatch = entry.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
      const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, "").trim() : "No abstract available.";
      const authorsMatch = entry.match(/<AuthorList>([\s\S]*?)<\/AuthorList>/);
      let authors = "Unknown authors";
      if (authorsMatch) {
        const lastNameMatches = authorsMatch[1].matchAll(/<LastName>([^<]+)<\/LastName>/g);
        const names = Array.from(lastNameMatches).map((m) => m[1]);
        if (names.length > 0) authors = names.slice(0, 6).join(", ") + (names.length > 6 ? " et al." : "");
      }
      const journalMatch = entry.match(/<Title>([^<]+)<\/Title>/);
      const journal = journalMatch ? journalMatch[1] : "Unknown Journal";
      const yearMatch = entry.match(/<Year>(\d{4})<\/Year>/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      const pmidMatch = entry.match(/<PMID>(\d+)<\/PMID>/);
      const pmid = pmidMatch ? pmidMatch[1] : "";
      const doiMatch = entry.match(/<ArticleId[^>]*doi[^>]*>([^<]+)<\/ArticleId>/i) || entry.match(/<ELocationID[^>]*doi[^>]*>([^<]+)<\/ELocationID>/i);
      const doi = doiMatch ? doiMatch[1].trim() : "";
      if (!title || title.length < 3) continue;
      papers.push({
        id: `pubmed-${pmid || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors,
        journal,
        year,
        doi,
        abstract: abstract.substring(0, 3000),
        database: "PubMed",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (doi ? `https://doi.org/${doi}` : ""),
        pmid,
        sourceBackend: "PubMed E-utilities",
        sources: ["PubMed"],
      });
    }
  }
  if (papers.length === 0) {
    throw new Error("No PubMed results found via E-utilities");
  }
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchGoogleScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue&limit=20`;
  const res = await fetchWithTimeout(searchUrl, 25000);
  const data = await res.json();
  const papers: Paper[] = (data.data || [])
    .filter((p: any) => p.title && p.title.length > 5)
    .map((p: any) => {
      const authors = (p.authors || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown authors";
      const doi = p.externalIds?.DOI || "";
      const year = typeof p.year === "number" ? p.year : new Date().getFullYear();
      return {
        id: `scholar-${p.paperId || Math.random().toString(36).slice(2, 8)}`,
        title: p.title,
        authors: authors.substring(0, 300),
        journal: p.venue || "Google Scholar",
        year,
        doi,
        abstract: (p.abstract || "No abstract available.").substring(0, 3000),
        database: "Google Scholar",
        studyType: classifyStudyType(p.title, p.abstract || ""),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${p.paperId}`,
        sourceBackend: "Semantic Scholar Graph API",
        sources: ["Google Scholar", "Semantic Scholar"],
      };
    });
  if (papers.length === 0) throw new Error("No Google Scholar results found via Semantic Scholar");
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchSemanticScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue&limit=20`;
  const res = await fetchWithTimeout(url, 25000);
  const data = await res.json();
  const papers: Paper[] = (data.data || [])
    .filter((p: any) => p.title && p.title.length > 5)
    .map((p: any) => {
      const authors = (p.authors || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown authors";
      const doi = p.externalIds?.DOI || "";
      const year = typeof p.year === "number" ? p.year : new Date().getFullYear();
      return {
        id: `ss-${p.paperId || Math.random().toString(36).slice(2, 8)}`,
        title: p.title,
        authors: authors.substring(0, 300),
        journal: p.venue || "Semantic Scholar",
        year,
        doi,
        abstract: (p.abstract || "No abstract available.").substring(0, 3000),
        database: "Semantic Scholar",
        studyType: classifyStudyType(p.title, p.abstract || ""),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${p.paperId}`,
        sourceBackend: "Semantic Scholar Graph API",
        sources: ["Semantic Scholar"],
      };
    });
  if (papers.length === 0) throw new Error("No Semantic Scholar results found");
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchScienceDirectBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query + " ScienceDirect Elsevier")}&fields=title,authors,year,abstract,externalIds,venue&limit=20`;
  const res = await fetchWithTimeout(searchUrl, 25000);
  const data = await res.json();
  const papers: Paper[] = (data.data || [])
    .filter((p: any) => p.title && p.title.length > 5)
    .map((p: any) => {
      const authors = (p.authors || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown authors";
      const doi = p.externalIds?.DOI || "";
      const year = typeof p.year === "number" ? p.year : new Date().getFullYear();
      return {
        id: `sd-${p.paperId || Math.random().toString(36).slice(2, 8)}`,
        title: p.title,
        authors: authors.substring(0, 300),
        journal: p.venue || "ScienceDirect",
        year,
        doi,
        abstract: (p.abstract || "No abstract available.").substring(0, 3000),
        database: "ScienceDirect",
        studyType: classifyStudyType(p.title, p.abstract || ""),
        selected: false,
        url: doi ? `https://doi.org/${doi}` : `https://www.sciencedirect.com/search?q=${encodeURIComponent(p.title)}`,
        sourceBackend: "Semantic Scholar Graph API",
        sources: ["ScienceDirect", "Semantic Scholar"],
      };
    });
  if (papers.length === 0) throw new Error("No ScienceDirect results found");
  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}
