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
  enrichPapersWithDois,
  verifyCitations,
  generateMockLegacy,
} from "@/lib/database-apis";
import { filterPapersByMedspacyRelevance } from "@/lib/medspacy-relevance";
import { expandQueryWithMesh } from "@/lib/mesh-expansion";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  searchLogic?: string;
  semanticSearch?: boolean;
  medspacyFilter?: boolean;
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

/** Extract significant keywords from a query (strip stop words, operators). */
function extractQueryKeywords(query: string): string[] {
  const stop = new Set([
    "and","or","not","the","a","an","of","in","on","at","to","for","with","by","from","as","is","are","was","were",
    "be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","can",
    "this","that","these","those","i","me","my","we","our","you","your","it","its","they","them","their","he","she",
    "his","her","what","which","who","whom","where","when","why","how","if","then","else","all","each","few","more",
    "most","other","some","such","no","nor","only","own","same","so","than","too","very","just","don","now"
  ]);
  return query
    .toLowerCase()
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

/** Require at least one significant query keyword in title or abstract. */
function filterByKeywordPresence(papers: any[], keywords: string[]): any[] {
  if (keywords.length === 0) return papers;
  return papers.filter((p) => {
    const text = `${p.title || ""} ${p.abstract || ""}`.toLowerCase();
    return keywords.some((k) => text.includes(k));
  });
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
    const medspacyFilter = body.medspacyFilter === true;

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    // MeSH expansion + ATM + truncation wildcard expansion (applied to both
    // the main research pipeline and the systematic review pipeline).
    // Expands initial keywords into MeSH synonyms/narrower terms, maps lay
    // terms to canonical terms (ATM), and supports truncation wildcards (*).
    const meshResult = expandQueryWithMesh(query);
    const meshExpandedQuery = meshResult.expandedQuery || query;

    // Semantic mode: strip boolean operators so retrieval matches on meaning
    // across the broad area of research rather than exact keyword co-occurrence.
    const semanticQuery = semanticSearch
      ? meshExpandedQuery.replace(/\b(AND|OR|NOT)\b/gi, " ").replace(/\s+/g, " ").trim() || meshExpandedQuery
      : meshExpandedQuery;

    // Default databases if none selected — all 14 supported databases
    const defaultDbs = ["PubMed", "OpenAlex", "Europe PMC", "DOAJ", "bioRxiv", "medRxiv", "Crossref", "arXiv", "OpenAIRE", "dblp", "Zenodo", "Google Scholar", "Semantic Scholar", "ClinicalTrials.gov"];
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

    // DOI enrichment: find missing DOIs via Crossref title/author lookup
    let citationResults = new Map<string, { valid: boolean; title?: string; message: string }>();
    try {
      const doiEnriched = await enrichPapersWithDois(enriched as any);
      // Replace enriched in-place with DOI-enriched papers
      (enriched as any[]).splice(0, enriched.length, ...doiEnriched);
    } catch {
      /* DOI enrichment failed — papers keep their existing DOI status */
    }

    // DOI verification: validate every DOI against Crossref (no cap — all papers verified)
    try {
      citationResults = await verifyCitations(enriched);
    } catch {
      /* citation verification failed — results map stays empty */
    }

    // Apply verification results to each paper
    const verifiedPapers = enriched.map((p) => {
      if (!p.doi) {
        return { ...p, citationStatus: "no-doi" as const, citationMessage: "No DOI available" };
      }
      const k = p.doi.toLowerCase();
      const r = citationResults.get(k);
      if (r?.valid) {
        return { ...p, citationStatus: "verified" as const, citationMessage: r.message || "DOI verified via Crossref" };
      }
      return { ...p, citationStatus: "unverified" as const, citationMessage: r?.message || "DOI not verified via Crossref" };
    });

    // Medspacy clinical relevance filtering — always applied (mandatory).
    // Removes papers not relevant to the query based on medical concept extraction,
    // negation detection, and targeted rule matching. Applied to both pipelines.
    let medspacyMeta: { enabled: boolean; queryConcepts: string[]; negationTerms: string[]; filteredCount: number; totalCount: number };
    const medResult = filterPapersByMedspacyRelevance(verifiedPapers, query, {
      threshold: 50,
      respectNegation: true,
      respectUncertainty: true,
    });
    medspacyMeta = {
      enabled: true,
      queryConcepts: medResult.queryConcepts,
      negationTerms: medResult.negationTerms,
      filteredCount: medResult.filteredCount,
      totalCount: medResult.totalCount,
    };
    let relevanceFiltered = medResult.papers.length > 0 ? medResult.papers : verifiedPapers;

    // Strict keyword-in-title/abstract filter: at least one significant query keyword
    // must appear in the paper's title or abstract for it to be shown to the user.
    const keywords = extractQueryKeywords(query);
    if (keywords.length > 0) {
      const beforeKeywordCount = relevanceFiltered.length;
      relevanceFiltered = filterByKeywordPresence(relevanceFiltered, keywords);
      const keywordFilteredCount = beforeKeywordCount - relevanceFiltered.length;
      if (keywordFilteredCount > 0) {
        (medspacyMeta as any).keywordFilteredCount = keywordFilteredCount;
      }
    }

    // If no papers survived relevance filtering, fall back to verified papers so
    // users aren't left with nothing, but mark them as low-relevance.
    let finalPapers: any[];
    if (relevanceFiltered.length === 0 && verifiedPapers.length > 0) {
      finalPapers = verifiedPapers.map((p) => ({ ...p, _lowRelevance: true }));
    } else {
      finalPapers = relevanceFiltered;
    }

    const verifiedCount = finalPapers.filter((p) => p.citationStatus === "verified").length;
    const unverifiedCount = finalPapers.filter((p) => p.citationStatus === "unverified").length;
    const noDoiCount = finalPapers.filter((p) => p.citationStatus === "no-doi").length;

    const citationValidationResults: Record<string, { valid: boolean; title?: string; message: string }> = {};
    citationResults.forEach((v, k) => { citationValidationResults[k] = v; });

    // If no papers were returned, provide mock data as fallback
    if (finalPapers.length === 0 && succeeded.length === 0) {
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
          medspacy: medspacyMeta,
          meshExpansion: {
            originalQuery: query,
            expandedQuery: meshExpandedQuery,
            meshTerms: meshResult.meshTerms,
            atmMappings: meshResult.atmMappings,
            wildcardRoots: meshResult.wildcardRoots,
          },
        },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      {
        query,
        total: finalPapers.length,
        papers: finalPapers,
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
        medspacy: medspacyMeta,
        meshExpansion: {
          originalQuery: query,
          expandedQuery: meshExpandedQuery,
          meshTerms: meshResult.meshTerms,
          atmMappings: meshResult.atmMappings,
          wildcardRoots: meshResult.wildcardRoots,
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
