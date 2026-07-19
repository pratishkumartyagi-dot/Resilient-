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
import { spawn } from "child_process";
import path from "path";

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

    // Default databases if none selected
    const defaultDbs = ["PubMed", "OpenAlex", "Semantic Scholar", "Crossref", "arXiv", "bioRxiv"];
    const dbsToSearch = databases.length > 0 ? databases : defaultDbs;

    const apiMap: Record<string, (() => Promise<any[]>) | undefined> = {
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

    let citationValidationResults: Record<string, { valid: boolean; title?: string; message: string }> = {};
    try {
      const scriptPath = path.join(process.cwd(), "scripts", "validate-citations.py");
      const papersToValidate = deduped.slice(0, 50).map((p) => ({
        doi: p.doi || "",
        title: p.title,
        authors: p.authors || "",
      }));

      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn("python3", [scriptPath], {
          timeout: 120000,
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Process exited with code ${code}: ${stderr}`));
          }
        });

        proc.on("error", (err) => {
          reject(err);
        });

        proc.stdin.write(JSON.stringify({ papers: papersToValidate }));
        proc.stdin.end();
      });

      const result = JSON.parse(stdout);
      if (result.success && result.results) {
        result.results.forEach((r: any) => {
          if (r.doi) {
            citationValidationResults[r.doi.toLowerCase()] = {
              valid: r.valid,
              title: r.verified_title,
              message: r.message,
            };
          }
        });
      }
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
