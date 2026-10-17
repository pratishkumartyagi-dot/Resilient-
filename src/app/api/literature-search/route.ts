import { NextResponse } from "next/server";
import {
  fetchPaperSearchMcp,
  fetchPubMedBrowserless,
  fetchEuropePMC,
  fetchOpenAlex,
  fetchDoaj,
  fetchBioRxiv,
  fetchMedRxiv,
  fetchCrossref,
  fetcharXiv,
  fetchOpenAIRE,
  fetchDblp,
  fetchZenodo,
  fetchGoogleScholarBrowserless,
  fetchSemanticScholarBrowserless,
  fetchClinicalTrialsGov,
  deduplicatePapers,
  generateMockLegacy,
} from "@/lib/database-apis";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  searchLogic?: string;
  semanticSearch?: boolean;
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
    const semanticSearch = body.semanticSearch === true;

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    // Semantic mode: strip boolean operators so retrieval matches on meaning
    // across the broad area of research rather than exact keyword co-occurrence.
    const semanticQuery = semanticSearch
      ? query.replace(/\b(AND|OR|NOT)\b/gi, " ").replace(/\s+/g, " ").trim() || query
      : query;

    // Default databases if none selected
    const defaultDbs = ["PubMed", "OpenAlex", "Semantic Scholar", "Crossref", "arXiv", "bioRxiv"];
    const baseDbs = databases.length > 0 ? databases : defaultDbs;
    // Semantic Scholar performs true meaning-based retrieval, so ensure it is
    // always queried when semantic search is requested.
    const dbsToSearch = semanticSearch && !baseDbs.includes("Semantic Scholar")
      ? [...baseDbs, "Semantic Scholar"]
      : baseDbs;

    const apiMap: Record<string, (() => Promise<any[]>) | undefined> = {
      "PubMed": () => fetchPubMedBrowserless(semanticQuery, yearFrom, yearTo, studyType),
      "OpenAlex": () => fetchOpenAlex(semanticQuery, yearFrom, yearTo, studyType),
      "Europe PMC": () => fetchEuropePMC(semanticQuery, yearFrom, yearTo, studyType),
      "DOAJ": () => fetchDoaj(semanticQuery, yearFrom, yearTo, studyType),
      "bioRxiv": () => fetchBioRxiv(semanticQuery, yearFrom, yearTo, studyType),
      "medRxiv": () => fetchMedRxiv(semanticQuery, yearFrom, yearTo, studyType),
      "Crossref": () => fetchCrossref(semanticQuery, yearFrom, yearTo, studyType),
      "arXiv": () => fetcharXiv(semanticQuery, yearFrom, yearTo, studyType),
      "OpenAIRE": () => fetchOpenAIRE(semanticQuery, yearFrom, yearTo, studyType),
      "dblp": () => fetchDblp(semanticQuery, yearFrom, yearTo, studyType),
      "Zenodo": () => fetchZenodo(semanticQuery, yearFrom, yearTo, studyType),
      "Google Scholar": () => fetchGoogleScholarBrowserless(semanticQuery, yearFrom, yearTo, studyType),
      "Semantic Scholar": () => fetchSemanticScholarBrowserless(semanticQuery, yearFrom, yearTo, studyType),
      "ClinicalTrials.gov": () => fetchClinicalTrialsGov(semanticQuery, yearFrom, yearTo, studyType),
      "paper-search-mcp": () => fetchPaperSearchMcp(semanticQuery, "all", yearFrom, yearTo, studyType),
    };

    const selectedApis = dbsToSearch.filter((db) => apiMap[db]);
    const skippedDatabases = dbsToSearch.filter((db) => !apiMap[db]);

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
      selectedApis.map(async (db, idx): Promise<PerDatabaseResult & { papers?: any[] }> => {
        // Stagger requests so many databases sharing a provider (or a per-IP
        // rate limit like NCBI/Semantic Scholar) are not all hit at once.
        if (idx > 0) await new Promise((r) => setTimeout(r, Math.min(idx, 8) * 400));
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

    const enriched = deduped.map((p) => ({
      ...p,
      citationStatus: p.doi ? "unverified" as const : "no-doi" as const,
      citationMessage: p.doi ? "Pending verification in Step 2" : "No DOI available",
    }));

    const verifiedCount = 0;
    const unverifiedCount = enriched.filter((p) => p.citationStatus === "unverified").length;
    const noDoiCount = enriched.filter((p) => p.citationStatus === "no-doi").length;

    // If no papers were returned, provide mock data as fallback
    if (enriched.length === 0 && succeeded.length === 0) {
      const mockPapers = generateMockLegacy(query, dbsToSearch);
      const mockEnriched = mockPapers.map((p) => ({
        ...p,
        citationStatus: "unverified" as const,
        citationMessage: "Simulated paper - live database unavailable",
      }));
      return NextResponse.json(
        {
          query,
          total: mockEnriched.length,
          papers: mockEnriched,
          sourceBreakdown: {},
          sourcesUsed: [],
          errors: {
            message: `All ${selectedApis.length} database searches failed. Showing ${mockEnriched.length} simulated results.`,
            ...perDatabaseErrors,
          },
          failedDatabases: failed,
          skippedDatabases,
          perDatabaseResults: perDatabaseResults.map((r) => ({ database: r.database, status: r.status, count: r.count, error: r.error })),
          databasesRequested: dbsToSearch.length,
          databasesProcessed: selectedApis.length,
          databasesSucceeded: 0,
          databasesEmpty: 0,
          databasesFailed: selectedApis.length,
          databasesSkipped: 0,
          dedupedCount: 0,
          totalBeforeDedup: 0,
          citationValidation: { verified: 0, unverified: mockEnriched.length, noDoi: 0, results: {} },
        },
        { headers: corsHeaders() }
      );
    }

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
        citationValidation: {
          verified: verifiedCount,
          unverified: unverifiedCount,
          noDoi: noDoiCount,
          results: {},
        },
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
