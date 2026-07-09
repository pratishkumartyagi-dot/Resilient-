import { NextResponse } from "next/server";
import {
  fetchOpenAlex,
  fetchPubMed,
  fetchEuropePMC,
  fetchDoaj,
  fetchPaperSearchMcp,
  deduplicatePapers,
  enrichPapersWithDois,
} from "@/lib/database-apis";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
}

function corsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

interface PerDatabaseResult {
  database: string;
  status: "success" | "empty" | "failed";
  count: number;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LiteratureSearchRequestBody;
    const query = (body.query || "").trim();
    const databases = Array.isArray(body.databases) ? body.databases : [];
    const yearFrom = body.yearFrom;
    const yearTo = body.yearTo;
    const studyType = body.studyType;

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }
    if (databases.length === 0) {
      return NextResponse.json({ error: "No databases selected" }, { status: 400, headers: corsHeaders() });
    }

    const apiMap: Record<string, (() => Promise<any[]>) | undefined> = {
      "PubMed": () => fetchPubMed(query, yearFrom, yearTo, studyType),
      "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
      "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
      "Google Scholar": () => fetchOpenAlex(`scholarly articles ${query}`, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
      "WHO IRIS": () => fetchEuropePMC(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
      "Semantic Scholar": () => fetchOpenAlex(`AI machine learning ${query}`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
      "ClinicalTrials.gov": () => fetchEuropePMC(`clinical trials registry ${query}`, yearFrom, yearTo, studyType),
      "Shodhganga": () => fetchOpenAlex(`theses dissertations ${query}`, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
      "Prospero": () => fetchEuropePMC(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
      "ScienceDirect": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc", filter: "host_venue:publisher:Elsevier" }),
      "Clarivate": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
      "DOAJ": () => fetchDoaj(query, yearFrom, yearTo, studyType),
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
      "ERIC": () => fetchEuropePMC(`education research ${query}`, yearFrom, yearTo, studyType),
      "CTRI – India": () => fetchEuropePMC(`clinical trials India ${query}`, yearFrom, yearTo, studyType),
      "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
      "paper-search-mcp": () => fetchPaperSearchMcp(query, "paper-search-mcp", yearFrom, yearTo, studyType),
      "Semantic Scholar (raw)": () => fetchPaperSearchMcp(query, "Semantic Scholar", yearFrom, yearTo, studyType),
    };

    const selectedApis = databases.filter((db) => apiMap[db]);
    const skippedDatabases = databases.filter((db) => !apiMap[db]);

    const allPapers: any[] = [];
    const perDatabaseResults: PerDatabaseResult[] = [];
    const perDatabaseErrors: Record<string, string> = {};
    const succeeded: string[] = [];
    const failed: string[] = [];

    if (skippedDatabases.length > 0) {
      skippedDatabases.forEach((db) => {
        perDatabaseResults.push({ database: db, status: "failed", count: 0, error: "No fetcher mapped" });
        perDatabaseErrors[db] = "No fetcher mapped for this database";
        failed.push(db);
      });
    }

    const results = await Promise.allSettled(
      selectedApis.map(async (db): Promise<PerDatabaseResult & { papers?: any[] }> => {
        const fetchFn = apiMap[db];
        if (!fetchFn) {
          return { database: db, status: "failed", count: 0, error: "No fetcher mapped" };
        }
        try {
          const papers = await fetchFn();
          return {
            database: db,
            status: papers.length > 0 ? "success" : "empty",
            count: papers.length,
            papers,
          };
        } catch (err: any) {
          const message = err?.message || String(err);
          return {
            database: db,
            status: "failed",
            count: 0,
            error: message,
          };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { database, status, count, papers, error } = result.value;
        perDatabaseResults.push({ database, status, count, error });
        if (status === "success") {
          succeeded.push(database);
          (papers || []).forEach((p: any) => {
            if (!p.database) p.database = database;
            p.sourceBackend = p.sourceBackend || database;
            p.sources = Array.from(new Set([...(p.sources || []), database]));
          });
          allPapers.push(...(papers || []));
        } else if (status === "empty") {
          succeeded.push(database);
        } else {
          failed.push(database);
          perDatabaseErrors[database] = error || "Unknown error";
        }
      } else if (result.status === "rejected") {
        const reason = result.reason;
        const dbName = reason?.database || "unknown";
        const errorMsg = reason?.message || String(reason);
        perDatabaseResults.push({ database: dbName, status: "failed", count: 0, error: errorMsg });
        perDatabaseErrors[dbName] = errorMsg;
        failed.push(dbName);
      }
    }

    const selectedWithResults = perDatabaseResults.filter((r) => r.status === "success");
    const selectedWithoutResults = perDatabaseResults.filter((r) => r.status === "empty");
    const selectedFailed = perDatabaseResults.filter((r) => r.status === "failed");

    const totalBeforeDedup = allPapers.length;
    const deduped = deduplicatePapers(allPapers);
    const dedupedCount = totalBeforeDedup - deduped.length;
    const enriched = await enrichPapersWithDois(deduped);

    return NextResponse.json(
      {
        query,
        total: enriched.length,
        papers: enriched,
        sourceBreakdown: Object.fromEntries(selectedWithResults.map((r) => [r.database, r.count])),
        sourcesUsed: succeeded,
        errors: perDatabaseErrors,
        failedDatabases: failed,
        skippedDatabases,
        skippedReason: skippedDatabases.length > 0 ? "No fetcher mapped for selected database(s)" : undefined,
        perDatabaseResults: perDatabaseResults.map((r) => ({ database: r.database, status: r.status, count: r.count, error: r.error })),
        databasesRequested: databases.length,
        databasesProcessed: selectedApis.length + skippedDatabases.length,
        databasesSucceeded: selectedWithResults.length,
        databasesEmpty: selectedWithoutResults.length,
        databasesFailed: selectedFailed.length,
        databasesSkipped: skippedDatabases.length,
        dedupedCount,
        totalBeforeDedup,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
