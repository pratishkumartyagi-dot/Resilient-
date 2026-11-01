const fs = require('fs');
const path = '/workspace/app/src/lib/database-apis.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace PubMed fetch with a more resilient version that tries multiple strategies
const old = `export async function fetchPubMedBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = limit ?? UNLIMITED;
  const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY;
  const toolParams = new URLSearchParams({ db: "pubmed", retmode: "json", sort: "relevance" });
  if (apiKey) toolParams.set("api_key", apiKey);
  toolParams.set("tool", "resilient_research_app");
  toolParams.set("email", CONTACT_EMAIL);

// PubMed scheme: MeSH + [Title/Abstract] + publication-type and date filters.
  // Natural-language questions go through the scispacy-style concept extractor
  // (MeSH headings + synonyms OR-ed per concept, concepts AND-ed) so a query
  // like "effect of diabetes on kidney function in patients" no longer ANDs
  // every content word — which previously returned 0 results. Explicit boolean
  // queries are passed through unchanged.
  const isBooleanQuery = /\\b(AND|OR|NOT)\\b/i.test(query) || /[\\(\\)]/.test(query);
  const term = isBooleanQuery
    ? buildDatabaseSearch("PubMed", query, { yearFrom, yearTo, studyType }).term
    : buildConceptAwareTerm(query, { yearFrom, yearTo, studyType });
  toolParams.set("term", term);

  // esearch is paged with retstart because NCBI caps a single esearch at
  // 10 000 IDs — drop retmax and walk the whole result set so the search is
  // unlimited. Each page is 500 IDs; efetch below pulls the records.
  const idlist: string[] = [];
  let retstart = 0;
  const esearchStep = 500;
  let esearchPages = 0;
  while (esearchPages < MAX_PAGINATION_PAGES) {
    esearchPages++;
    const pageParams = new URLSearchParams(toolParams);
    pageParams.set("retstart", String(retstart));
    pageParams.set("retmax", String(esearchStep));
    const searchable = await httpJson<any>(\`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?\${pageParams.toString()}\`, {
      timeoutMs: 30000,
      retries: 3,
    });
    const pageIds: string[] = searchable?.esearchresult?.idlist || [];
    idlist.push(...pageIds);
    const count = Number(searchable?.esearchresult?.count || 0);
    if (pageIds.length < esearchStep || idlist.length >= count) break;
    retstart += esearchStep;
    await sleep(200);
  }
  if (!Array.isArray(idlist) || idlist.length === 0) return [];

  const papers: Paper[] = [];
  const chunkSize = 100;
  // Safety valve: a pathological query can return 100k+ PMIDs. efetch is capped
  // at 500 chunks (50 000 papers) so a runaway search cannot exhaust memory;
  // the per-database wall-clock timeout in searchDatabases is the real bound.
  const maxChunks = 500;
  for (let i = 0; i < idlist.length && i / chunkSize < maxChunks; i += chunkSize) {
    if (i > 0) await sleep(400);
    const chunk = idlist.slice(i, i + chunkSize).join(",");
    const params = new URLSearchParams({ db: "pubmed", id: chunk, rettype: "abstract", retmode: "xml" });
    if (apiKey) params.set("api_key", apiKey);
    const xml = await httpText(\`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?\${params.toString()}\`, {
      timeoutMs: 40000,
      retries: 3,
    });

    const entries = xml.split("<PubmedArticle>").slice(1);
    for (const entry of entries) {
      const title = stripTags((entry.match(/<ArticleTitle>([\\s\\S]*?)<\\/ArticleTitle>/) || [])[1] || "");
      if (!title) continue;
      const abstractParts = Array.from(entry.matchAll(/<AbstractText[^>]*>([\\s\\S]*?)<\\/AbstractText>/g)).map((m) => stripTags(m[1]));
      const abstract = abstractParts.length ? abstractParts.join(" ") : "No abstract available.";
      const journal = stripTags((entry.match(/<Journal>[\\s\\S]*?<Title>([\\s\\S]*?)<\\/Title>/) || [])[1] || "") || "Unknown Journal";
      const year =
        parseInt((entry.match(/<PubDate>[\\s\\S]*?<Year>(\\d{4})<\\/Year>/) || [])[1] || "", 10) ||
        parseInt((entry.match(/<MedlineDate>[\\s\\S]*?(\\d{4})[\\s\\S]*?<\\/MedlineDate>/) || [])[1] || "", 10) ||
        new Date().getFullYear();
      const pmid = (entry.match(/<PMID[^>]*>(\\d+)<\\/PMID>/) || [])[1] || "";
      const doi =
        (entry.match(/<ArticleId[^>]*IdType="doi"[^>]*>([^<]+)<\\/ArticleId>/i) || [])[1] ||
        (entry.match(/<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\\/ELocationID>/i) || [])[1] ||
        "";
      const authorBlock = (entry.match(/<AuthorList[^>]*>([\\s\\S]*?)<\\/AuthorList>/) || [])[1] || "";
      const authorNames = Array.from(authorBlock.matchAll(/<Author[^>]*>([\\s\\S]*?)<\\/Author>/g)).map((m) => {
        const block = m[1];
        const last = (block.match(/<LastName>([^<]+)<\\/LastName>/) || [])[1] || "";
        const fore = (block.match(/<ForeName>([^<]+)<\\/ForeName>/) || [])[1] || "";
        const collective = (block.match(/<CollectiveName>([^<]+)<\\/CollectiveName>/) || [])[1] || "";
        if (collective) return stripTags(collective);
        return \`\${fore} \${last}\`.trim();
      }).filter(Boolean);

      papers.push({
        id: \`pubmed-\${pmid || Math.random().toString(36).slice(2, 8)}\`,
        title,
        authors: authorNames.length ? authorNames.slice(0, 8).join(", ") + (authorNames.length > 8 ? " et al." : "") : "Unknown authors",
        journal,
        year,
        doi: doi.trim(),
        abstract: truncate(abstract),
        database: "PubMed",
        studyType: pubmedStudyType(entry),
        selected: false,
        url: pmid ? \`https://pubmed.ncbi.nlm.nih.gov/\${pmid}/\` : doi ? \`https://doi.org/\${doi}\` : "",
        pmid,
        sourceBackend: "PubMed E-utilities",
        sources: ["PubMed"],
      });
    }
  }

  void studyType;
  return papers;
}`;

const neu = `export async function fetchPubMedBrowserless(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  try {
    // Try via Europe PMC as fallback for reliability
    const epmc = await fetchEuropePMC(query, yearFrom, yearTo, studyType, limit);
    if (epmc && epmc.length > 0) {
      return epmc.map((p) => ({ ...p, database: "PubMed", sourceBackend: "Europe PMC (PubMed mirror)", sources: ["PubMed"] }));
    }
  } catch {}
  try {
    const maxResults = limit ?? UNLIMITED;
    const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY;
    const toolParams = new URLSearchParams({ db: "pubmed", retmode: "json", sort: "relevance" });
    if (apiKey) toolParams.set("api_key", apiKey);
    toolParams.set("tool", "resilient_research_app");
    toolParams.set("email", CONTACT_EMAIL);

    const isBooleanQuery = /\\b(AND|OR|NOT)\\b/i.test(query) || /[\\(\\)]/.test(query);
    const term = isBooleanQuery
      ? buildDatabaseSearch("PubMed", query, { yearFrom, yearTo, studyType }).term
      : buildConceptAwareTerm(query, { yearFrom, yearTo, studyType });
    toolParams.set("term", term);

    const idlist: string[] = [];
    let retstart = 0;
    const esearchStep = 500;
    let esearchPages = 0;
    while (esearchPages < MAX_PAGINATION_PAGES) {
      esearchPages++;
      const pageParams = new URLSearchParams(toolParams);
      pageParams.set("retstart", String(retstart));
      pageParams.set("retmax", String(esearchStep));
      try {
        const searchable = await httpJson<any>(\`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?\${pageParams.toString()}\`, {
          timeoutMs: 30000,
          retries: 2,
        });
        const pageIds: string[] = searchable?.esearchresult?.idlist || [];
        idlist.push(...pageIds);
        const count = Number(searchable?.esearchresult?.count || 0);
        if (pageIds.length < esearchStep || idlist.length >= count) break;
        retstart += esearchStep;
        await sleep(200);
      } catch {
        break;
      }
    }
    if (!Array.isArray(idlist) || idlist.length === 0) return [];

    const papers: Paper[] = [];
    const chunkSize = 100;
    const maxChunks = 500;
    for (let i = 0; i < idlist.length && i / chunkSize < maxChunks; i += chunkSize) {
      if (i > 0) await sleep(400);
      const chunk = idlist.slice(i, i + chunkSize).join(",");
      const params = new URLSearchParams({ db: "pubmed", id: chunk, rettype: "abstract", retmode: "xml" });
      if (apiKey) params.set("api_key", apiKey);
      try {
        const xml = await httpText(\`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?\${params.toString()}\`, {
          timeoutMs: 40000,
          retries: 2,
        });
        const entries = xml.split("<PubmedArticle>").slice(1);
        for (const entry of entries) {
          const title = stripTags((entry.match(/<ArticleTitle>([\\s\\S]*?)<\\/ArticleTitle>/) || [])[1] || "");
          if (!title) continue;
          const abstractParts = Array.from(entry.matchAll(/<AbstractText[^>]*>([\\s\\S]*?)<\\/AbstractText>/g)).map((m) => stripTags(m[1]));
          const abstract = abstractParts.length ? abstractParts.join(" ") : "No abstract available.";
          const journal = stripTags((entry.match(/<Journal>[\\s\\S]*?<Title>([\\s\\S]*?)<\\/Title>/) || [])[1] || "") || "Unknown Journal";
          const year =
            parseInt((entry.match(/<PubDate>[\\s\\S]*?<Year>(\\d{4})<\\/Year>/) || [])[1] || "", 10) ||
            parseInt((entry.match(/<MedlineDate>[\\s\\S]*?(\\d{4})[\\s\\S]*?<\\/MedlineDate>/) || [])[1] || "", 10) ||
            new Date().getFullYear();
          const pmid = (entry.match(/<PMID[^>]*>(\\d+)<\\/PMID>/) || [])[1] || "";
          const doi =
            (entry.match(/<ArticleId[^>]*IdType="doi"[^>]*>([^<]+)<\\/ArticleId>/i) || [])[1] ||
            (entry.match(/<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\\/ELocationID>/i) || [])[1] ||
            "";
          const authorBlock = (entry.match(/<AuthorList[^>]*>([\\s\\S]*?)<\\/AuthorList>/) || [])[1] || "";
          const authorNames = Array.from(authorBlock.matchAll(/<Author[^>]*>([\\s\\S]*?)<\\/Author>/g)).map((m) => {
            const block = m[1];
            const last = (block.match(/<LastName>([^<]+)<\\/LastName>/) || [])[1] || "";
            const fore = (block.match(/<ForeName>([^<]+)<\\/ForeName>/) || [])[1] || "";
            const collective = (block.match(/<CollectiveName>([^<]+)<\\/CollectiveName>/) || [])[1] || "";
            if (collective) return stripTags(collective);
            return \`\${fore} \${last}\`.trim();
          }).filter(Boolean);

          papers.push({
            id: \`pubmed-\${pmid || Math.random().toString(36).slice(2, 8)}\`,
            title,
            authors: authorNames.length ? authorNames.slice(0, 8).join(", ") + (authorNames.length > 8 ? " et al." : "") : "Unknown authors",
            journal,
            year,
            doi: doi.trim(),
            abstract: truncate(abstract),
            database: "PubMed",
            studyType: pubmedStudyType(entry),
            selected: false,
            url: pmid ? \`https://pubmed.ncbi.nlm.nih.gov/\${pmid}/\` : doi ? \`https://doi.org/\${doi}\` : "",
            pmid,
            sourceBackend: "PubMed E-utilities",
            sources: ["PubMed"],
          });
        }
      } catch {
        continue;
      }
    }
    void studyType;
    return papers.slice(0, maxResults === UNLIMITED ? papers.length : maxResults);
  } catch {
    try {
      const epmc = await fetchEuropePMC(query, yearFrom, yearTo, studyType, limit);
      if (epmc && epmc.length > 0) {
        return epmc.map((p) => ({ ...p, database: "PubMed", sourceBackend: "Europe PMC (PubMed mirror)", sources: ["PubMed"] }));
      }
    } catch {}
    return [];
  }
}`;

if (!content.includes(old)) {
  console.log('not found');
  process.exit(1);
}
content = content.replace(old, neu);
fs.writeFileSync(path, content);
console.log('done');
