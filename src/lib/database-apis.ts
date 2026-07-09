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
  const CHUNK_SIZE = 20;
  const updated = new Map<string, string>();
  for (let i = 0; i < withoutDoi.length; i += CHUNK_SIZE) {
    const chunk = withoutDoi.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (p) => {
        const found = await findDoiByTitleAuthor(p.title, p.authors);
        return { id: p.id, doi: found.doi };
      })
    );
    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value.doi) {
        updated.set(r.value.id, r.value.doi);
      }
    });
  }
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
      ?.map((a: any) => [a.author?.display_name, (a.institutions?.map((i: any) => i.display_name) || []).join(", ")].filter(Boolean).join(" (" + ")").trim())
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

async function fetchOpenAlex(
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

  for (let page = 0; page < 100; page++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(cursorUrl);
    } catch {
      break;
    }
    if (!res.ok) break;
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

async function fetchPubMed(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const dateParts: string[] = [];
  if (yearFrom) dateParts.push(`(${yearFrom}[Date - Publication] : ${yearTo || new Date().getFullYear()}[Date - Publication])`);
  const pubDateFilter = dateParts.join(" AND ");

  const searchQuery = pubDateFilter ? `(${query}) AND ${pubDateFilter}` : query;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=10000&term=${encodeURIComponent(searchQuery)}`;

  const searchRes = await fetchWithTimeout(searchUrl);
  if (!searchRes.ok) throw new Error(`PubMed search error: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const pmids: string[] = searchData.esearchresult?.idlist || [];
  if (pmids.length === 0) return [];

  const papers: Paper[] = [];
  const BATCH = 200;
  for (let i = 0; i < pmids.length; i += BATCH) {
    const batch = pmids.slice(i, i + BATCH);
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${batch.join(",")}`;
    const fetchRes = await fetchWithTimeout(fetchUrl);
    if (!fetchRes.ok) continue;
    const xmlText = await fetchRes.text();

    const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let match: RegExpExecArray | null;

    while ((match = articleRegex.exec(xmlText)) !== null) {
      const articleXml = match[1];
      const pmid = (articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || "";
      const titleMatch = articleXml.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
      const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
      const authors: string[] = [];
      const authorRegex = /<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<ForeName>([^<]+)<\/ForeName>[\s\S]*?<\/Author>/g;
      let authorMatch: RegExpExecArray | null;
      while ((authorMatch = authorRegex.exec(articleXml)) !== null && authors.length < 8) {
        authors.push(`${authorMatch[2]} ${authorMatch[1]}`);
      }
      const journalMatch = articleXml.match(/<Title[^>]*>([^<]+)<\/Title>/) || articleXml.match(/<ISOAbbreviation[^>]*>([^<]+)<\/ISOAbbreviation>/);
      const yearMatch = articleXml.match(/<Year[^>]*>(\d{4})<\/Year>/);
      const doiMatch = articleXml.match(/<ELocationID EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/);

      if (!titleMatch) continue;

      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const abstract = abstractMatch
        ? abstractMatch.map((a) => a.replace(/<[^>]+>/g, "").trim()).join(" ")
        : "No abstract available.";
      const paper: Paper = {
        id: `pubmed-${pmid || Math.random().toString(36).slice(2, 8)}`,
        title,
        authors: authors.length > 0 ? authors.join(", ") + (authors.length >= 8 ? " et al." : "") : "Unknown authors",
        journal: journalMatch ? journalMatch[1].trim() : "Unknown Journal",
        year: yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear(),
        doi: doiMatch ? doiMatch[1].replace("https://doi.org/", "") : "",
        abstract: abstract.substring(0, 3000),
        database: "PubMed",
        studyType: classifyStudyType(title, abstract),
        selected: false,
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
        pmid,
      };
      papers.push(paper);
    }
  }

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  return papers;
}


async function fetchWithTimeout(url: string, ms = 20000): Promise<Response> {
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

async function fetchEuropePMC(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const yearFilter = yearFrom || yearTo ? `(FIRST_DATE:[${yearFrom || "1000"} TO ${yearTo || "9999"}]) AND ` : "";
  const papers: Paper[] = [];
  let cursorMark: string | undefined;

  for (let page = 0; page < 200; page++) {
    const qs = new URLSearchParams({
      query: yearFilter + query,
      resultType: "core",
      pageSize: "100",
      format: "json",
    });
    if (cursorMark) qs.set("cursorMark", cursorMark);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${qs.toString()}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(url);
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = await res.json();
    const results = data.resultList?.result || [];
    if (results.length === 0) break;
    results.forEach((r: any) => {
      if (!r.title || r.title.length <= 10) return;
      const authors = (r.authorList?.author || [])
        .slice(0, 8)
        .map((a: any) => `${a.firstName || ""} ${a.lastName || ""}`.trim())
        .join(", ");
      papers.push({
        id: `epmc-${r.id || Math.random().toString(36).slice(2, 8)}`,
        title: r.title,
        authors: authors || "Unknown",
        journal: r.journalInfo?.journal?.title || r.source || "Unknown Journal",
        year: parseInt(r.pubYear || r.firstPublicationDate?.slice(0, 4)) || new Date().getFullYear(),
        doi: r.doi || "",
        abstract: r.abstractText || r.abstract || "No abstract available.",
        database: "Europe PMC",
        studyType: classifyStudyType(r.title, r.abstractText || r.abstract || ""),
        selected: false,
        url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.id}`,
        pmid: r.pmid,
      });
    });
    cursorMark = data.nextCursorMark;
    if (!cursorMark) break;
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

async function fetchDoaj(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const qs = new URLSearchParams({
    search: query,
    pageSize: "100",
    page: "1",
  });
  const url = `https://doaj.org/api/v2/search/articles/${qs.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`DOAJ error: ${res.status}`);
  const data = await res.json();
  const results = data.results || [];
  const papers: Paper[] = results.map((r: any) => {
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
    return typeFiltered.length > 0 ? typeFiltered : filtered.slice(0, 20);
  }

  return filtered;
}

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

async function fetchPaperSearchMcp(query: string, source: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const body: Record<string, any> = {
    query,
    maxResults: 20,
    sources: source === "paper-search-mcp" ? "all" : source.toLowerCase(),
  };

  if (yearFrom || yearTo) {
    body.year = yearTo ? `${yearFrom}-${yearTo}` : yearFrom;
  }

  const res = await fetch(`${API_BASE}/api/paper-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `paper-search-mcp API error: ${res.status}`);
  }

  const data = await res.json();
  const papers: Paper[] = (data.papers || []).map((p: any) => ({
    id: p.id || `psm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: p.title || "Untitled",
    authors: p.authors || "Unknown authors",
    journal: p.journal || p.categories || "Unknown Journal",
    year: p.year || new Date().getFullYear(),
    doi: p.doi || "",
    abstract: (p.abstract || "No abstract available.").substring(0, 3000),
    database: "paper-search-mcp",
    studyType: classifyStudyType(p.title || "", p.abstract || ""),
    selected: false,
    url: p.url,
    pmid: p.pmid,
    sourceBackend: "openags/paper-search-mcp",
    sources: [p.source || "paper-search-mcp"],
  }));

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  return papers;
}

export async function fetchRealPapers(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const allPapers: Paper[] = [];
  const failedDbs: string[] = [];
  const succeededDbs: string[] = [];

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "PubMed": () => fetchPubMed(query, yearFrom, yearTo, studyType),
    "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
    "ERIC": () => fetchEuropePMC(`education research ${query}`, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchOpenAlex(`scholarly articles ${query}`, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "Shodhganga": () => fetchOpenAlex(`theses dissertations ${query}`, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
    "CTRI – India": () => fetchEuropePMC(`clinical trials India ${query}`, yearFrom, yearTo, studyType),
    "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "WHO IRIS": () => fetchEuropePMC(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchOpenAlex(`AI machine learning ${query}`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "ClinicalTrials.gov": () => fetchEuropePMC(`clinical trials registry ${query}`, yearFrom, yearTo, studyType),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "Prospero": () => fetchEuropePMC(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
    "ScienceDirect": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc", filter: "host_venue:publisher:Elsevier" }),
    "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
    "paper-search-mcp": () => fetchPaperSearchMcp(query, "paper-search-mcp", yearFrom, yearTo, studyType),
    "arXiv": () => fetchPaperSearchMcp(query, "arXiv", yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchPaperSearchMcp(query, "bioRxiv", yearFrom, yearTo, studyType),
    "medRxiv": () => fetchPaperSearchMcp(query, "medRxiv", yearFrom, yearTo, studyType),
    "CORE": () => fetchPaperSearchMcp(query, "CORE", yearFrom, yearTo, studyType),
    "Zenodo": () => fetchPaperSearchMcp(query, "Zenodo", yearFrom, yearTo, studyType),
    "HAL": () => fetchPaperSearchMcp(query, "HAL", yearFrom, yearTo, studyType),
    "SSRN": () => fetchPaperSearchMcp(query, "SSRN", yearFrom, yearTo, studyType),
    "BASE": () => fetchPaperSearchMcp(query, "BASE", yearFrom, yearTo, studyType),
    "Crossref": () => fetchPaperSearchMcp(query, "Crossref", yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchPaperSearchMcp(query, "OpenAIRE", yearFrom, yearTo, studyType),
    "CiteSeerX": () => fetchPaperSearchMcp(query, "CiteSeerX", yearFrom, yearTo, studyType),
    "dblp": () => fetchPaperSearchMcp(query, "dblp", yearFrom, yearTo, studyType),
    "IACR": () => fetchPaperSearchMcp(query, "IACR", yearFrom, yearTo, studyType),
    "Unpaywall": () => fetchPaperSearchMcp(query, "Unpaywall", yearFrom, yearTo, studyType),
    "Semantic Scholar (raw)": () => fetchPaperSearchMcp(query, "Semantic Scholar", yearFrom, yearTo, studyType),
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
    "PubMed": () => fetchPubMed(query, yearFrom, yearTo, studyType),
    "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
    "ERIC": () => fetchEuropePMC(`education research ${query}`, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchOpenAlex(`scholarly articles ${query}`, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
    "Shodhganga": () => fetchOpenAlex(`theses dissertations ${query}`, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
    "CTRI – India": () => fetchEuropePMC(`clinical trials India ${query}`, yearFrom, yearTo, studyType),
    "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "WHO IRIS": () => fetchEuropePMC(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchOpenAlex(`AI machine learning ${query}`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
    "ClinicalTrials.gov": () => fetchEuropePMC(`clinical trials registry ${query}`, yearFrom, yearTo, studyType),
    "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
    "Prospero": () => fetchEuropePMC(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
    "ScienceDirect": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc", filter: "host_venue:publisher:Elsevier" }),
    "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
    "paper-search-mcp": () => fetchPaperSearchMcp(query, "paper-search-mcp", yearFrom, yearTo, studyType),
    "arXiv": () => fetchPaperSearchMcp(query, "arXiv", yearFrom, yearTo, studyType),
    "bioRxiv": () => fetchPaperSearchMcp(query, "bioRxiv", yearFrom, yearTo, studyType),
    "medRxiv": () => fetchPaperSearchMcp(query, "medRxiv", yearFrom, yearTo, studyType),
    "CORE": () => fetchPaperSearchMcp(query, "CORE", yearFrom, yearTo, studyType),
    "Zenodo": () => fetchPaperSearchMcp(query, "Zenodo", yearFrom, yearTo, studyType),
    "HAL": () => fetchPaperSearchMcp(query, "HAL", yearFrom, yearTo, studyType),
    "SSRN": () => fetchPaperSearchMcp(query, "SSRN", yearFrom, yearTo, studyType),
    "BASE": () => fetchPaperSearchMcp(query, "BASE", yearFrom, yearTo, studyType),
    "Crossref": () => fetchPaperSearchMcp(query, "Crossref", yearFrom, yearTo, studyType),
    "OpenAIRE": () => fetchPaperSearchMcp(query, "OpenAIRE", yearFrom, yearTo, studyType),
    "CiteSeerX": () => fetchPaperSearchMcp(query, "CiteSeerX", yearFrom, yearTo, studyType),
    "dblp": () => fetchPaperSearchMcp(query, "dblp", yearFrom, yearTo, studyType),
    "IACR": () => fetchPaperSearchMcp(query, "IACR", yearFrom, yearTo, studyType),
    "Unpaywall": () => fetchPaperSearchMcp(query, "Unpaywall", yearFrom, yearTo, studyType),
    "Semantic Scholar (raw)": () => fetchPaperSearchMcp(query, "Semantic Scholar", yearFrom, yearTo, studyType),
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
    "PubMed": "NCBI E-utilities",
    "Europe PMC": "Europe PMC REST API",
    "ERIC": "Europe PMC REST API",
    "Google Scholar": "OpenAlex API",
    "Shodhganga": "OpenAlex API",
    "CTRI – India": "Europe PMC REST API",
    "scite.ai": "OpenAlex API",
    "WHO IRIS": "Europe PMC REST API",
    "Semantic Scholar": "OpenAlex API",
    "ClinicalTrials.gov": "Europe PMC REST API",
    "DOAJ": "OpenAlex API",
    "Prospero": "Europe PMC REST API",
    "ScienceDirect": "OpenAlex API",
    "Clarivate": "OpenAlex API",
    "arXiv": "openags/paper-search-mcp",
    "bioRxiv": "openags/paper-search-mcp",
    "medRxiv": "openags/paper-search-mcp",
    "CORE": "openags/paper-search-mcp",
    "Zenodo": "openags/paper-search-mcp",
    "HAL": "openags/paper-search-mcp",
    "SSRN": "openags/paper-search-mcp",
    "BASE": "openags/paper-search-mcp",
    "Crossref": "openags/paper-search-mcp",
    "OpenAIRE": "openags/paper-search-mcp",
    "CiteSeerX": "openags/paper-search-mcp",
    "dblp": "openags/paper-search-mcp",
    "IACR": "openags/paper-search-mcp",
    "Unpaywall": "openags/paper-search-mcp",
    "Semantic Scholar (raw)": "openags/paper-search-mcp",
    "paper-search-mcp": "openags/paper-search-mcp",
  };
  return mapping[uiDatabase] || uiDatabase;
}

function deduplicatePapers(papers: Paper[]): Paper[] {
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

  await Promise.allSettled(
    dois.map(async (doi) => {
      const result = await validateDoiViaCrossref(doi);
      results.set(doi.toLowerCase(), result);
    })
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
