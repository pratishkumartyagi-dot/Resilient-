import sys

path = '/workspace/app/src/lib/database-apis.ts'
with open(path, 'r') as f:
    content = f.read()

# Add CORE fetch before Zenodo section
core_code = '''/* ----------------------------- CORE -------------------------------- */

export async function fetchCore(query: string, yearFrom?: string, yearTo?: string, studyType?: string, limit?: number): Promise<Paper[]> {
  const maxResults = limit ?? UNLIMITED;
  const apiKey = process.env.CORE_API_KEY;
  const papers: Paper[] = [];
  const pageSize = 100;
  let page = 1;
  const maxPages = Math.ceil(Math.min(maxResults === UNLIMITED ? 1000 : maxResults, 1000) / pageSize);

  while (page <= maxPages) {
    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "User-Agent": "resilient-research-app/1.0",
      };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const body = {
        q: query,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };

      const data = await httpJson<any>("https://api.core.ac.uk/v3/search/works", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        timeoutMs: 30000,
        retries: 2,
      });

      const results = data.results || data.data || [];
      if (!Array.isArray(results) || results.length === 0) break;

      for (const item of results) {
        const title = stripTags(item.title || item.name || "");
        if (!title) continue;
        const abstract = truncate(stripTags(item.abstract || item.description || ""));
        const year = parseInt(String(item.yearPublished || item.year || (item.publishedDate || "").slice(0, 4))) || new Date().getFullYear();
        if (yearFrom && year < parseInt(yearFrom)) continue;
        if (yearTo && year > parseInt(yearTo)) continue;
        const doi = (item.doi || item.doiId || "").replace("https://doi.org/", "");
        const authors = Array.isArray(item.authors)
          ? item.authors.map((a: any) => (typeof a === "string" ? a : a.name || a.fullName || "")).filter(Boolean).slice(0, 8).join(", ")
          : "";

        papers.push({
          id: `core-${item.id || item.coreId || Math.random().toString(36).slice(2, 8)}`,
          title,
          authors: authors || "Unknown authors",
          journal: item.publisher || item.journal || "CORE",
          year,
          doi,
          abstract: abstract || "No abstract available.",
          database: "CORE",
          studyType: classifyStudyType(title, abstract),
          selected: false,
          url: doi ? `https://doi.org/${doi}` : item.downloadUrl || item.sourceFulltextUrls?.[0] || item.url || "",
          sourceBackend: "CORE API v3",
          sources: ["CORE"],
        });
        if (papers.length >= (maxResults === UNLIMITED ? Number.MAX_SAFE_INTEGER : maxResults)) break;
      }
      if (papers.length >= (maxResults === UNLIMITED ? Number.MAX_SAFE_INTEGER : maxResults)) break;
      if (results.length < pageSize) break;
      page++;
      await sleep(200);
    } catch (e) {
      break;
    }
  }

  return papers.slice(0, maxResults === UNLIMITED ? papers.length : maxResults);
}

'''

# Insert before Zenodo
marker = '/* ----------------------------- Zenodo ------------------------------ */'
if marker not in content:
    print("MARKER NOT FOUND")
    sys.exit(1)

content = content.replace(marker, core_code + marker)

# Add CORE to DATABASE_DEFINITIONS
old_def = '''  {
    id: "Crossref",
    label: "Crossref",
    url: "https://www.crossref.org/",
    description: "Crossref DOI metadata registry",
    search: (ctx) => fetchCrossref(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },'''
new_def = '''  {
    id: "CORE",
    label: "CORE",
    url: "https://core.ac.uk/",
    description: "CORE aggregated open access research (CORE API v3)",
    requiresKey: "CORE_API_KEY",
    keyHint: "Without a key CORE may rate-limit; set CORE_API_KEY in .env.local.",
    rateLimitHint: "set CORE_API_KEY in .env.local to lift rate limits",
    search: (ctx) => fetchCore(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },
  {
    id: "Crossref",
    label: "Crossref",
    url: "https://www.crossref.org/",
    description: "Crossref DOI metadata registry",
    search: (ctx) => fetchCrossref(ctx.query, ctx.yearFrom, ctx.yearTo, undefined, ctx.limit),
  },'''

if old_def not in content:
    print("DEF NOT FOUND")
    sys.exit(1)

content = content.replace(old_def, new_def)

with open(path, 'w') as f:
    f.write(content)

print("done")
