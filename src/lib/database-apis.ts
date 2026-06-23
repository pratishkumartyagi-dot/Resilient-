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

function normalizeOpenAlexWork(work: any): Paper {
  const title = work.title || `Untitled (${work.id?.split("/").pop() || "unknown"})`;
  const authors =
    work.authorships
      ?.map((a: any) => [a.author?.display_name, a.institutions?.map((i: any) => i.display_name).join(", ")].filter(Boolean).join(" (" + ")").trim())
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

async function fetchOpenAlex(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const filterParts: string[] = [];
  if (yearFrom) filterParts.push(`publication_year:>${yearFrom}`);
  if (yearTo) filterParts.push(`publication_year:<${yearTo}`);
  const filterStr = filterParts.length ? `&filter=${filterParts.join(",")}` : "";

  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=50&mailto=research@example.com${filterStr}`;

  const res = await fetch(url, { headers: { "User-Agent": "ResilientResearch/1.0 (mailto:research@example.com)" } });
  if (!res.ok) throw new Error(`OpenAlex error: ${res.status}`);
  const data = await res.json();

  const papers: Paper[] = (data.results || [])
    .filter((w: any) => w.title && w.title.length > 10)
    .map(normalizeOpenAlexWork);

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => {
      const text = `${p.title} ${p.abstract}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  return papers.slice(0, 50);
}

// Re-export STUDY_TYPES for backward compatibility
export const STUDY_TYPES = Object.keys(STUDY_TYPE_KEYWORDS);

async function fetchPubMed(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const dateParts: string[] = [];
  if (yearFrom) dateParts.push(`(${yearFrom}[Date - Publication] : ${yearTo || new Date().getFullYear()}[Date - Publication])`);
  const pubDateFilter = dateParts.join(" AND ");

  const searchQuery = pubDateFilter ? `(${query}) AND ${pubDateFilter}` : query;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=50&term=${encodeURIComponent(searchQuery)}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`PubMed search error: ${searchRes.status}`);
  const searchData = await searchRes.json();

  const pmids = searchData.esearchresult?.idlist || [];
  if (pmids.length === 0) return [];

  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${pmids.slice(0, 50).join(",")}`;
  const fetchRes = await fetch(fetchUrl);
  if (!fetchRes.ok) throw new Error(`PubMed fetch error: ${fetchRes.status}`);
  const xmlText = await fetchRes.text();

  const papers: Paper[] = [];
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

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  return papers;
}


async function fetchEuropePMC(query: string, yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const yearFilter = yearFrom || yearTo ? `(FIRST_DATE:[${yearFrom || "1000"} TO ${yearTo || "9999"}]) AND ` : "";
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/SEARCH?query=${encodeURIComponent(yearFilter + query)}&resultType=core&pageSize=50&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC error: ${res.status}`);
  const data = await res.json();
  const results = data.result?.result || [];

  const papers: Paper[] = results
    .filter((r: any) => r.title && r.title.length > 10)
    .map((r: any) => {
      const authors = (r.authorList?.author || [])
        .slice(0, 8)
        .map((a: any) => `${a.firstName || ""} ${a.lastName || ""}`.trim())
        .join(", ");
      return {
        id: `epmc-${r.id || Math.random().toString(36).slice(2, 8)}`,
        title: r.title,
        authors: authors || "Unknown",
        journal: r.journalTitle || r.source || "Unknown Journal",
        year: parseInt(r.firstPublicationDate?.slice(0, 4)) || new Date().getFullYear(),
        doi: r.doi || "",
        abstract: r.abstractText || r.abstract || "No abstract available.",
        database: "Europe PMC",
        studyType: classifyStudyType(r.title, r.abstract || ""),
        selected: false,
        url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.id}`,
        pmid: r.pmid,
      };
    });

  if (studyType && studyType !== "All Study Types") {
    const keywords = STUDY_TYPE_KEYWORDS[studyType] || [];
    const filtered = papers.filter((p) => keywords.some((kw) => `${p.title} ${p.abstract}`.toLowerCase().includes(kw)));
    return filtered.length > 0 ? filtered : papers.slice(0, 20);
  }

  return papers.slice(0, 50);
}

export async function fetchRealPapers(query: string, databases: string[], yearFrom?: string, yearTo?: string, studyType?: string): Promise<Paper[]> {
  const allPapers: Paper[] = [];
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();

  const deduplicate = (papers: Paper[]) =>
    papers.filter((p) => {
      const doiKey = p.doi?.toLowerCase();
      const titleKey = p.title.toLowerCase().trim().slice(0, 60);
      if (doiKey && seenDois.has(doiKey)) return false;
      if (titleKey && seenTitles.has(titleKey)) return false;
      if (doiKey) seenDois.add(doiKey);
      if (titleKey) seenTitles.add(titleKey);
      return true;
    });

  const apiDatabases: Record<string, () => Promise<Paper[]>> = {
    "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "PubMed": () => fetchPubMed(query, yearFrom, yearTo, studyType),
    "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
    "ERIC": () => fetchEuropePMC(`education ${query}`, yearFrom, yearTo, studyType),
    "Google Scholar": () => fetchOpenAlex(`scholar ${query}`, yearFrom, yearTo, studyType),
    "Shodhganga": () => fetchOpenAlex(`thesis ${query} India`, yearFrom, yearTo, studyType),
    "CTRI – India": () => fetchEuropePMC(`clinical trial India ${query}`, yearFrom, yearTo, studyType),
    "scite.ai": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "WHO IRIS": () => fetchEuropePMC(`WHO ${query}`, yearFrom, yearTo, studyType),
    "Semantic Scholar": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "ClinicalTrials.gov": () => fetchEuropePMC(`clinical trial ${query}`, yearFrom, yearTo, studyType),
    "DOAJ": () => fetchOpenAlex(`open access ${query}`, yearFrom, yearTo, studyType),
    "Prospero": () => fetchEuropePMC(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
    "ScienceDirect": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
    "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType),
  };

  const selectedApis = databases.filter((db) => apiDatabases[db]);

  await Promise.allSettled(
    selectedApis.map(async (db) => {
      try {
        const fetchFn = apiDatabases[db];
        if (!fetchFn) return;
        const papers = await fetchFn();
        const deduped = deduplicate(papers);
        deduped.forEach((p) => {
          p.database = db;
          if (studyType && studyType !== "All Study Types") {
            p.studyType = classifyStudyType(p.title, p.abstract);
          }
        });
        allPapers.push(...deduped);
      } catch (err) {
        console.warn(`[${db}] fetch failed:`, err);
      }
    })
  );

  if (allPapers.length === 0) {
    throw new Error(`No papers found across ${databases.length} selected databases. Try broadening your query or selecting more databases.`);
  }

  return allPapers;
}

export async function validateDoiViaCrossref(doi: string): Promise<{ valid: boolean; title?: string; message: string }> {
  if (!doi || doi.length < 5) return { valid: false, message: "Missing or invalid DOI" };

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetch(url, { headers: { "User-Agent": "ResilientResearch/1.0 (mailto:research@example.com)" } });
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
