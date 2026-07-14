import { NextResponse } from "next/server";
import {
  fetchOpenAlex,
  fetchDoaj,
  fetcharXiv,
  fetchBioRxiv,
  fetchMedRxiv,
  fetchZenodo,
  fetchCrossref,
  fetchOpenAIRE,
  fetchDblp,
  fetchClinicalTrialsGov,
  fetchCochraneLibrary,
  deduplicatePapers,
  verifyCitations,
  fetchPubMedBrowserless,
  fetchGoogleScholarBrowserless,
  fetchSemanticScholarBrowserless,
  fetchScienceDirectBrowserless,
} from "@/lib/database-apis";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  mode?: "standard" | "seerai";
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
    const mode = body.mode || "standard";

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }
    if (databases.length === 0) {
      return NextResponse.json({ error: "No databases selected" }, { status: 400, headers: corsHeaders() });
    }

    const apiMap: Record<string, (() => Promise<any[]>) | undefined> = {
      "PubMed": () => fetchPubMedBrowserless(query, yearFrom, yearTo, studyType),
      "OpenAlex": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
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
      "HAL": () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc", filter: "host_venue.name_search:HAL" }),
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
          if (mode === "seerai") {
            try {
              const fallbackPapers = await fetchSemanticScholarBrowserless(query, yearFrom, yearTo, studyType);
              return {
                database: db,
                status: fallbackPapers.length > 0 ? "success" : "empty",
                count: fallbackPapers.length,
                papers: fallbackPapers.map(p => ({ ...p, sources: [...(p.sources || []), db] })),
                error: message,
              };
            } catch (fallbackErr: any) {
              return {
                database: db,
                status: "failed",
                count: 0,
                error: message,
              };
            }
          }
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

    let citationValidationResults: Record<string, { valid: boolean; title?: string; message: string }> = {};
    try {
      const verified = await verifyCitations(deduped);
      citationValidationResults = Object.fromEntries(verified);
    } catch (err: any) {
      console.warn("[literature-search] Citation validation failed:", err?.message || String(err));
    }

    const enriched = deduped.map((p) => {
      const doiKey = (p.doi || "").toLowerCase();
      const validation = doiKey ? citationValidationResults[doiKey] : undefined;
      return {
        ...p,
        citationStatus: validation?.valid ? "verified" : (p.doi && p.doi.length > 3 ? "unverified" : "no-doi"),
        citationMessage: validation?.message,
      };
    });

    const verifiedCount = enriched.filter((p) => p.citationStatus === "verified").length;
    const unverifiedCount = enriched.filter((p) => p.citationStatus === "unverified").length;
    const noDoiCount = enriched.filter((p) => p.citationStatus === "no-doi").length;

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
          results: citationValidationResults,
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
