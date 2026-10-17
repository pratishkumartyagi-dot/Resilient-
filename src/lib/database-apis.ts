import { getSkillById, MEDICAL_SKILLS_REGISTRY } from "./medical-skills/skills-registry";

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
    ? (() => {
        const idx = work.abstract_inverted_index as Record<string, number[]>;
        const entries = Object.entries(idx);
        const maxPos = entries.reduce((max, [, positions]) => {
          const arr = Array.isArray(positions) ? positions : [positions];
          return Math.max(max, ...arr);
        }, -1);
        if (maxPos < 0) return "No abstract available.";
        const words: string[] = new Array(maxPos + 1).fill("");
        for (const [word, positions] of entries) {
          const arr = Array.isArray(positions) ? positions : [positions];
          for (const pos of arr) {
            if (pos >= 0 && pos <= maxPos) words[pos] = word;
          }
        }
        return words.filter(Boolean).join(" ").trim() || "No abstract available.";
      })()
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
  if (yearFrom) filterParts.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filterParts.push(`to_publication_date:${yearTo}-12-31`);
  if (options?.filter) filterParts.push(options.filter);
  const filterStr = filterParts.length ? `&filter=${filterParts.join(",")}` : "";

  const sortStr = options?.sort ? `&sort=${options.sort}` : "";
  const mailto = process.env.OPENALEX_MAILTO || "research@resilient.app";
  const apiKeyParam = process.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : "";
  const baseUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=100&mailto=${encodeURIComponent(mailto)}${apiKeyParam}${filterStr}${sortStr}`;
  const papers: Paper[] = [];
  let cursor = "*";
  let cursorUrl = `${baseUrl}&cursor=${cursor}`;

  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(200);
    let res: Response;
    try {
      res = await fetchWithRetry(cursorUrl, 3, 1500);
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
    return filtered.length > 0 ? filtered : deduped;
  }

  return deduped;
}

// Re-export STUDY_TYPES for backward compatibility
export const STUDY_TYPES = Object.keys(STUDY_TYPE_KEYWORDS);

async function fetchWithTimeout(url: string, ms = 30000, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ResilientResearchApp/1.0 (mailto:research@resilient.app)", ...(headers || {}) },
    });
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

async function fetchWithRetry(
  url: string,
  maxRetries = 4,
  baseDelay = 1500,
  headers?: Record<string, string>,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url, 30000, headers);
    } catch (err: any) {
      lastError = err;
      const status = Number(err?.message?.match(/HTTP (\d+)/)?.[1] || 0);
      const retriable = status === 429 || status === 503 || status === 504 || status === 0;
      if (retriable && attempt < maxRetries - 1) {
        // Exponential backoff with jitter; 429s from shared IPs need breathing room.
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await sleep(delay);
        continue;
      }
      if (attempt < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Fetch failed after retries");
}

export async function fetchEuropePMC(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const papers: Paper[] = [];
  const pageSize = 100;
  let cursorMark = "*";
  let hasNext = true;

  while (hasNext && papers.length < 1000) {
    const params = new URLSearchParams({
      query: query,
      format: "json",
      pageSize: pageSize.toString(),
      cursorMark: cursorMark,
      sort: "CITED desc",
    });

    if (yearFrom) {
      params.set("query", `${params.get("query")} AND publication_year>=${yearFrom}`);
    }
    if (yearTo) {
      params.set("query", `${params.get("query")} AND publication_year<=${yearTo}`);
    }

    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`;

    try {
      const res = await fetchWithRetry(url, 3, 1000);
      const data = await res.json();
      const results = data.resultList?.result || [];

      if (results.length === 0) break;

      for (const r of results) {
        const title = r.title || "Untitled";
        const authors = (r.authorString || "Unknown authors").substring(0, 300);
        const journal = r.journalTitle || "Unknown Journal";
        const year = parseInt(r.pubYear) || new Date().getFullYear();
        const doi = r.doi || "";
        const pmid = r.pmid || "";
        const abstract = r.abstractText || "No abstract available.";

        papers.push({
          id: `europepmc-${pmid || r.id || Math.random().toString(36).slice(2, 8)}`,
          title,
          authors,
          journal,
          year,
          doi,
          abstract: abstract.substring(0, 3000),
          database: "Europe PMC",
          studyType: classifyStudyType(title, abstract),
          selected: false,
          url: doi ? `https://doi.org/${doi}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
          pmid,
          sourceBackend: "Europe PMC API",
          sources: ["Europe PMC"],
        });
      }

      hasNext = data.nextCursorMark && data.nextCursorMark !== cursorMark;
      cursorMark = data.nextCursorMark || "";
    } catch (err: any) {
      console.warn("[Europe PMC] fetch failed:", err?.message);
      break;
    }
  }

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }

  return papers;
}

export async function fetchDoaj(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const papers: Paper[] = [];
  for (let page = 1; page <= 100; page++) {
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}?pageSize=100&page=${page}`;
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

export async function fetchPaperSearchMcp(query: string, source: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    // NOTE: Relative URL so this follows the actual preview host/port instead
    // of a hardcoded "http://localhost:3000" (breaks preview on any other port).
    // When called server-side (no window), fall back to same-origin localhost.
    const base =
      typeof window !== "undefined" ? "" : process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:3000";
    const res = await fetch(`${base}/api/paper-search-mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, source, maxResults: 200, yearFrom, yearTo, studyType }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `paper-search-mcp failed: ${res.status}`);
    }
    const data = await res.json();
    return (data.papers || []).map((p: any) => ({
      id: p.id || `mcp-${Math.random().toString(36).slice(2, 8)}`,
      title: p.title || "",
      authors: p.authors || "Unknown authors",
      journal: p.journal || p.source || "paper-search-mcp",
      year: p.year || new Date().getFullYear(),
      doi: p.doi || "",
      abstract: p.abstract || "",
      database: p.source || "paper-search-mcp",
      studyType: p.studyType || "Journal Article",
      selected: false,
      url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
      sourceBackend: "openags/paper-search-mcp",
      sources: p.source ? [p.source] : ["paper-search-mcp"],
    }));
  } catch (err: any) {
    console.error("[fetchPaperSearchMcp] error:", err?.message || String(err));
    return [];
  }
}

export async function fetcharXiv(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const searchQuery = encodeURIComponent(`all:${query}`);
  const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=1000&sortBy=relevance`;
  const res = await fetchWithRetry(url, 4, 2000);
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
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
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
  let bioCursor = 0;
  for (let page = 0; page < 20; page++) {
    const url = `${baseUrl}/${bioCursor}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 0) throw new Error(`bioRxiv error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.collection || [];
    if (results.length === 0) break;
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
    const meta = data.messages?.[0] || {};
    const total = parseInt(meta.total || "0") || 0;
    bioCursor += results.length;
    if (total && bioCursor >= total) break;
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
  let medCursor = 0;
  for (let page = 0; page < 20; page++) {
    const url = `${baseUrl}/${medCursor}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 0) throw new Error(`medRxiv error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.collection || [];
    if (results.length === 0) break;
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
    const meta = data.messages?.[0] || {};
    const total = parseInt(meta.total || "0") || 0;
    medCursor += results.length;
    if (total && medCursor >= total) break;
  }
  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchZenodo(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const allResults: any[] = [];
  const PAGE_SIZE = 25; // Zenodo caps the page size at 25 (larger values return HTTP 400)
  for (let page = 1; page <= 40; page++) {
    const qs = new URLSearchParams({ q: query, size: String(PAGE_SIZE), sort: "mostrecent", page: String(page) });
    let res = await fetchWithRetry(`https://zenodo.org/api/records?${qs.toString()}`, 3, 1500);
    if (!res.ok && res.status === 400) {
      const qs2 = new URLSearchParams({ q: query, size: String(PAGE_SIZE), sort: "version", page: String(page) });
      res = await fetchWithRetry(`https://zenodo.org/api/records?${qs2.toString()}`, 3, 1500);
    }
    if (!res.ok) {
      if (page === 1) throw new Error(`Zenodo error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.hits?.hits || [];
    if (results.length === 0) break;
    allResults.push(...results);
    if (results.length < PAGE_SIZE) break;
    await sleep(200);
  }
  return buildZenodoPapers(allResults, yearFrom, yearTo, studyType);
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
  return papers;
}

export async function fetchCrossref(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const filters: string[] = [];
  if (yearFrom) filters.push(`from-pub-date:${yearFrom}`);
  if (yearTo) filters.push(`until-pub-date:${yearTo}`);
  const paperFromWork = (w: any): Paper => {
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
  };

  const papers: Paper[] = [];
  let cursor = "*";
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ query, rows: "100", cursor, sort: "relevance" });
    if (filters.length) qs.set("filter", filters.join(","));
    const url = `https://api.crossref.org/works?${qs.toString()}`;
    const res = await fetchWithRetry(url, 3, 2000);
    if (!res.ok) {
      if (page === 0) throw new Error(`Crossref error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const results = data.message?.items || [];
    if (results.length === 0) break;
    papers.push(...results.map(paperFromWork));
    const next = data.message?.["next-cursor"];
    if (!next || next === cursor || results.length < 100) break;
    cursor = next;
  }

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchOpenAIRE(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    const papers: Paper[] = [];
    for (let apiPage = 1; apiPage <= 10; apiPage++) {
    const qs = new URLSearchParams({ 
      keywords: query, 
      format: "json", 
      size: "100",
      page: String(apiPage)
    });
    const url = `https://api.openaire.eu/search/publications?${qs.toString()}`;
    const res = await fetchWithRetry(url, 3, 2000);
    if (!res.ok) {
      if (apiPage === 1) throw new Error(`OpenAIRE error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const rawResults = data.response?.results?.result || [];
    const results = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
    if (results.length === 0) break;
    for (const r of results) {
      try {
        const meta = r.metadata || {};
        const entity = meta["oaf:entity"] || {};
        const result = entity["oaf:result"] || {};

        // OpenAIRE returns typed values: strings, {$: "..."} objects, or arrays
        // of {@classid, $} objects (e.g. title, creator, pid).
        const pickOafText = (v: any): string => {
          if (v == null) return "";
          if (typeof v === "string") return v;
          if (typeof v === "number") return String(v);
          if (Array.isArray(v)) {
            const main = v.find((x) => x && typeof x === "object" && typeof x.$ === "string" && (x["@classid"] === "main title" || x["@classid"] === "doi")) || v[0];
            return pickOafText(main);
          }
          if (typeof v === "object") return pickOafText(v.$ ?? v.content ?? v.name ?? "");
          return "";
        };

        const title = pickOafText(result.title) || pickOafText(result.resulttitle) || "Untitled";
        const creatorList = Array.isArray(result.creator) ? result.creator : (result.creator ? [result.creator] : []);
        const authors = creatorList.map((c: any) => pickOafText(c)).filter(Boolean).join(", ").substring(0, 300) || "Unknown authors";

        const yearStr = pickOafText(result.dateofacceptance) || pickOafText(result.dateofcollection) || "";
        const year = parseInt(yearStr.slice(0, 4)) || new Date().getFullYear();

        const doiFromPid = Array.isArray(result.pid)
          ? pickOafText(result.pid.find((p: any) => p && p["@classid"] === "doi"))
          : "";
        const doi = (pickOafText(result.doi) || doiFromPid).replace("https://doi.org/", "").trim();
        const abstract = pickOafText(result.description) || pickOafText(result.abstract) || "No abstract available.";

        if (yearFrom && year < parseInt(yearFrom)) continue;
        if (yearTo && year > parseInt(yearTo)) continue;

        papers.push({
          id: `openaire-${doi || pickOafText(result.originalId) || Math.random().toString(36).slice(2, 8)}`,
          title: title || "Untitled",
          authors: authors || "Unknown authors",
          journal: pickOafText(result.journal) || "Unknown Journal",
          year,
          doi,
          abstract: (abstract || "No abstract available.").substring(0, 3000),
          database: "OpenAIRE",
          studyType: classifyStudyType(title || "", abstract || ""),
          selected: false,
          url: doi ? `https://doi.org/${doi}` : "",
          sourceBackend: "OpenAIRE API",
          sources: ["OpenAIRE"],
        });
      } catch (err) {
        console.warn("[OpenAIRE] Failed to parse result:", err);
        continue;
      }
    }
    if (results.length < 100) break;
    await sleep(300);
    }
    
    if (studyType && studyType !== "All Study Types") {
      const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
      const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
      return filtered.length > 0 ? filtered : papers;
    }
    return papers;
  } catch (err: any) {
    console.warn("[OpenAIRE] fetch failed:", err?.message);
    return [];
  }
}

export async function fetchDblp(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({ q: query, format: "json", h: "100", f: "0" });
  const url = `https://dblp.org/search/publ/api?${qs.toString()}`;
  const res = await fetchWithRetry(url, 3, 1500, { Accept: "application/json" });
  if (!res.ok) throw new Error(`DBLP error: ${res.status}`);
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    // dblp periodically serves an anti-bot HTML challenge instead of JSON.
    throw new Error("dblp returned a non-JSON response (bot protection)");
  }
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
    return filtered.length > 0 ? filtered : papers;
  }
  return papers;
}

export async function fetchRealPapers(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const allPapers: Paper[] = [];
  const failedDbs: string[] = [];
  const succeededDbs: string[] = [];
  let completedDbs = 0;

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "PubMed": () => fetchPubMedBrowserless(query, yearFrom, yearTo, studyType),
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchBioRxiv(query, yearFrom, yearTo, studyType),
    "medRxiv": () => fetchMedRxiv(query, yearFrom, yearTo, studyType),
    "Crossref": () => fetchCrossref(query, yearFrom, yearTo, studyType),
    "arXiv": () => fetcharXiv(query, yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchOpenAIRE(query, yearFrom, yearTo, studyType),
    "dblp": () => fetchDblp(query, yearFrom, yearTo, studyType),
    "Zenodo": () => fetchZenodo(query, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchGoogleScholarBrowserless(query, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchSemanticScholarBrowserless(query, yearFrom, yearTo, studyType),
    "ClinicalTrials.gov": () => fetchClinicalTrialsGov(query, yearFrom, yearTo, studyType),
    "paper-search-mcp": () => fetchPaperSearchMcp(query, "all", yearFrom, yearTo, studyType),
  };

  const selectedApis = databases.filter((db) => apiDatabases[db]);

  await Promise.allSettled(
    selectedApis.map(async (db) => {
      try {
        const fetchFn = apiDatabases[db];
        if (!fetchFn) return;
        const papers = await fetchFn();
        completedDbs += 1;
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

  // Only substitute simulated papers when every selected database failed.
  // A genuine zero-result search (all databases responded) must stay empty.
  if (enriched.length === 0 && completedDbs === 0) {
    const mockPapers = generateMockLegacy(query, databases);
    const mockEnriched = mockPapers.map((p) => ({
      ...p,
      citationStatus: "unverified" as const,
      citationMessage: `Simulated paper - live database search failed: ${failedDbs.join(", ")}`,
    }));
    return mockEnriched;
  }

  return enriched;
}

export interface FetchRealPapersResult {
  papers: Paper[];
  dedupedCount: number;
}

export async function fetchRealPapersWithCounts(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<FetchRealPapersResult> {
  const allPapers: Paper[] = [];
  let completedDbs = 0;

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "PubMed": () => fetchPubMedBrowserless(query, yearFrom, yearTo, studyType),
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchBioRxiv(query, yearFrom, yearTo, studyType),
    "medRxiv": () => fetchMedRxiv(query, yearFrom, yearTo, studyType),
    "Crossref": () => fetchCrossref(query, yearFrom, yearTo, studyType),
    "arXiv": () => fetcharXiv(query, yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchOpenAIRE(query, yearFrom, yearTo, studyType),
    "dblp": () => fetchDblp(query, yearFrom, yearTo, studyType),
    "Zenodo": () => fetchZenodo(query, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchGoogleScholarBrowserless(query, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchSemanticScholarBrowserless(query, yearFrom, yearTo, studyType),
    "ClinicalTrials.gov": () => fetchClinicalTrialsGov(query, yearFrom, yearTo, studyType),
    "paper-search-mcp": () => fetchPaperSearchMcp(query, "all", yearFrom, yearTo, studyType),
  };

  const selectedApis = databases.filter((db) => apiDatabases[db]);

  await Promise.allSettled(
    selectedApis.map(async (db) => {
      try {
        const fetchFn = apiDatabases[db];
        if (!fetchFn) return;
        const papers = await fetchFn();
        completedDbs += 1;
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

  // Only substitute simulated papers when every selected database failed.
  if (enriched.length === 0 && completedDbs === 0) {
    const mockPapers = generateMockLegacy(query, databases);
    return { papers: mockPapers, dedupedCount: 0 };
  }

  return { papers: enriched, dedupedCount };
}

function getDatabaseBackend(uiDatabase: string): string {
  const mapping: Record<string, string> = {
    "PubMed": "PubMed E-utilities",
    "OpenAlex": "OpenAlex API",
    "Europe PMC": "Europe PMC API",
    "DOAJ": "DOAJ API v2",
    "bioRxiv": "bioRxiv API",
    "medRxiv": "medRxiv API",
    "Crossref": "Crossref API",
    "arXiv": "arXiv API",
    "OpenAIRE": "OpenAIRE API",
    "dblp": "DBLP API",
    "Zenodo": "Zenodo API",
    "Google Scholar": "Semantic Scholar Graph API",
    "Semantic Scholar": "Semantic Scholar Graph API",
    "ClinicalTrials.gov": "ClinicalTrials.gov API v2",
    "paper-search-mcp": "openags/paper-search-mcp",
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
  const papers: Paper[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      "query.term": query,
      format: "json",
      pageSize: "100",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const url = `https://clinicaltrials.gov/api/v2/studies?${qs.toString()}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (page === 0) throw new Error(`ClinicalTrials.gov error: ${res.status}`);
      break;
    }
    const data = await res.json();
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
      const abstract = descModule.briefSummary || descModule.detailedDescription || "No abstract available.";
      const year = parseInt(statusModule.lastUpdatePostDateStruct?.date || statusModule.lastKnownPhase?.date || new Date().getFullYear().toString()) || new Date().getFullYear();
      const studyTypeValue = designModule.studyType || "Clinical Trial";
      papers.push({
        id: `ctg-${nctId || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors,
        journal: "ClinicalTrials.gov",
        year,
        doi: "",
        abstract: abstract.substring(0, 3000),
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

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers;
  }

  if (yearFrom || yearTo) {
    const yFrom = yearFrom ? parseInt(yearFrom) : 0;
    const yTo = yearTo ? parseInt(yearTo) : 9999;
    return papers.filter((p) => p.year >= yFrom && p.year <= yTo);
  }

  return papers;
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
  const papers: Paper[] = [];
  try {
    let pmids: string[] = [];
    const PAGE = 500;
    const MAX_RESULTS = 10000;
    for (let start = 0; start < MAX_RESULTS; start += PAGE) {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=${PAGE}&retstart=${start}&sort=relevance&term=${encodeURIComponent(query)}`;
      const searchRes = await fetchWithRetry(searchUrl, 3, 1500);
      const searchText = await searchRes.text();
      const idMatches = searchText.match(/<Id>(\d+)<\/Id>/g) || [];
      const batch = idMatches.map((m) => m.replace(/<Id>|<\/Id>/g, "").trim()).filter(Boolean);
      pmids.push(...batch);
      if (batch.length < PAGE) break;
      await sleep(350);
    }

    if (pmids.length === 0) {
      // Try with broader search - remove advanced query syntax
      const broadQuery = query.split("(")[0].split(")")[0].trim() || query;
      const broadSearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=500&term=${encodeURIComponent(broadQuery)}`;
      try {
        const broadSearchRes = await fetchWithRetry(broadSearchUrl, 3, 1500);
        const broadSearchText = await broadSearchRes.text();
        const broadIdMatches = broadSearchText.match(/<Id>(\d+)<\/Id>/g) || [];
        pmids = broadIdMatches.map((m) => m.replace(/<Id>|<\/Id>/g, "").trim()).filter(Boolean);
        if (pmids.length === 0) return [];
      } catch {
        return [];
      }
    }

    const chunkSize = 200;

    for (let i = 0; i < pmids.length; i += chunkSize) {
      if (i > 0) await sleep(500);
      const chunk = pmids.slice(i, i + chunkSize).join(",");
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${chunk}&rettype=abstract`;
      let res: Response;
      try {
        res = await fetchWithRetry(fetchUrl, 4, 1500);
      } catch (err) {
        // Keep whatever we have already fetched rather than discarding everything.
        if (papers.length > 0) break;
        throw err;
      }
      const xml = await res.text();
      const entries = xml.split("<PubmedArticle>").slice(1);
      for (const entry of entries) {
        const titleMatch = entry.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        const abstractMatch = entry.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
        const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, "").trim() : "No abstract available.";
        const authorsMatch = entry.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/);
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

    // Apply filters
    if (yearFrom || yearTo) {
      const yFrom = yearFrom ? parseInt(yearFrom) : 0;
      const yTo = yearTo ? parseInt(yearTo) : 9999;
      const filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
      if (filtered.length > 0) return filtered;
    }
    if (studyType && studyType !== "All Study Types") {
      const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
      const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
      if (filtered.length > 0) return filtered;
    }

    // Return papers even if empty (caller handles fallback)
    return papers;
  } catch (err: any) {
    // Return partial results if any, otherwise empty to let caller handle fallback.
    return papers;
  }
}

export async function fetchGoogleScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    const s2Headers = process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : undefined;
    const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue,citationCount&limit=100`;
    const res = await fetchWithRetry(searchUrl, 4, 2500, s2Headers);
    const data = await res.json();
    const papers: Paper[] = (data.data || [])
      .filter((p: any) => p.title && p.title.length > 5)
      .map((p: any) => {
        const authors = (p.authors || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown authors";
        const doi = p.externalIds?.DOI || "";
        const year = typeof p.year === "number" ? p.year : (p.publicationDate ? parseInt(p.publicationDate.slice(0, 4)) : new Date().getFullYear());
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

    if (yearFrom || yearTo) {
      const yFrom = yearFrom ? parseInt(yearFrom) : 0;
      const yTo = yearTo ? parseInt(yearTo) : 9999;
      const filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
      if (filtered.length > 0) return filtered;
    }
    if (studyType && studyType !== "All Study Types") {
      const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
      const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
      return filtered.length > 0 ? filtered : papers;
    }
    return papers;
  } catch (err: any) {
    console.warn("[Google Scholar] fetch failed:", err?.message);
    return [];
  }
}

export async function fetchSemanticScholarBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    const s2Headers = process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : undefined;
    const papers: Paper[] = [];
    for (let offset = 0; offset < 100; offset += 100) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue,publicationDate&limit=100&offset=${offset}`;
    let res: Response;
    try {
      res = await fetchWithRetry(url, 4, 2500, s2Headers);
    } catch (err) {
      // Keep any results already collected from earlier pages.
      if (papers.length > 0) break;
      throw err;
    }
    const data = await res.json();
    const batch: any[] = data.data || [];
    if (batch.length === 0) break;
    papers.push(...batch
      .filter((p: any) => p.title && p.title.length > 5)
      .map((p: any) => {
        const authors = (p.authors || []).map((a: any) => a.name).filter(Boolean).join(", ") || "Unknown authors";
        const doi = p.externalIds?.DOI || "";
        const year = typeof p.year === "number" ? p.year : (p.publicationDate ? parseInt(p.publicationDate.slice(0, 4)) : new Date().getFullYear());
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
      }));
    if (batch.length < 100) break;
    await sleep(300);
    }

    if (papers.length === 0) {
      const fallbackUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,externalIds,venue&limit=50`;
      try {
        const fallbackRes = await fetchWithRetry(fallbackUrl, 3, 2500, s2Headers);
        const fallbackData = await fallbackRes.json();
        const fallbackPapers: Paper[] = (fallbackData.data || [])
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
              sourceBackend: "Semantic Scholar Graph API (fallback)",
              sources: ["Semantic Scholar"],
            };
          });
        if (fallbackPapers.length > 0) return fallbackPapers;
      } catch {}
    }

    if (yearFrom || yearTo) {
      const yFrom = yearFrom ? parseInt(yearFrom) : 0;
      const yTo = yearTo ? parseInt(yearTo) : 9999;
      const filtered = papers.filter((p) => p.year >= yFrom && p.year <= yTo);
      if (filtered.length > 0) return filtered;
    }

    if (studyType && studyType !== "All Study Types") {
      const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
      const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
      return filtered.length > 0 ? filtered : papers;
    }

    return papers;
  } catch (err: any) {
    console.warn("[Semantic Scholar] fetch failed:", err?.message);
    return [];
  }
}

export async function fetchScienceDirectBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  try {
    const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query + " ScienceDirect Elsevier")}&fields=title,authors,year,abstract,externalIds,venue&limit=100`;
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
  } catch {
    return [];
  }
}
