import { NextResponse } from "next/server";
import {
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
  fetchScienceDirectBrowserless,
  fetchClinicalTrialsGov,
  deduplicatePapers,
  enrichPapersWithDois,
  verifyCitations,
  generateMockLegacy,
  STUDY_TYPE_KEYWORDS,
} from "@/lib/database-apis";
import { filterPapersByMedspacyRelevance } from "@/lib/medspacy-relevance";
import { expandQueryWithMesh } from "@/lib/mesh-expansion";
import {
  compileQueryPlan,
  summarizePlan,
  type CompiledQuery,
} from "@/lib/query-compiler";
import type { ConceptBlock } from "@/lib/concept-extraction";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  /** Legacy single study type. */
  studyType?: string;
  /** Multi-select study types — combined with OR. */
  studyTypes?: string[];
  searchLogic?: string;
  semanticSearch?: boolean;
  medspacyFilter?: boolean;
  /** Concepts extracted from the broad research area. */
  concepts?: ConceptBlock[];
  /** Use the per-track compiled query plan instead of one flat query. */
  useCompiledQueries?: boolean;
  /** Deduplicate across databases (Step 2 does the DedupEndNote pass instead). */
  deduplicate?: boolean;
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

/**
 * Restrict records to the selected study types (OR logic).
 *
 * Only applied to databases that cannot filter by publication type natively
 * — PubMed and ClinicalTrials.gov already apply it inside the query.
 */
function filterByStudyTypes(papers: any[], studyTypes: string[]): any[] {
  if (studyTypes.length === 0) return papers;
  const keywordSets = studyTypes
    .map((st) => STUDY_TYPE_KEYWORDS[st] || [])
    .filter((keywords) => keywords.length > 0);
  // A study type with no keyword mapping cannot be enforced locally.
  if (keywordSets.length === 0) return papers;
  return papers.filter((p) => {
    const text = `${p.title || ""} ${p.abstract || ""}`.toLowerCase();
    return keywordSets.some((keywords) =>
      keywords.some((keyword) => text.includes(keyword))
    );
  });
}

/** Remove repeats of the same record returned by several fan-out queries. */
function dedupeWithinDatabase(papers: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const paper of papers) {
    const doi = (paper.doi || "").trim().toLowerCase();
    const title = (paper.title || "").toLowerCase().trim().slice(0, 80);
    const key = doi || title;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(paper);
  }
  return out;
}

/**
 * Drop records that mention an excluded concept.
 *
 * Track 1 databases express NOT inside the query; the simpler databases do
 * not support it, so the exclusion is applied locally instead.
 */
function filterNegatedConcepts(papers: any[], negatedTerms: string[]): any[] {
  if (negatedTerms.length === 0) return papers;
  const terms = negatedTerms.map((t) => t.toLowerCase()).filter((t) => t.length > 2);
  if (terms.length === 0) return papers;
  return papers.filter((p) => {
    const text = `${p.title || ""} ${p.abstract || ""}`.toLowerCase();
    return !terms.some((term) => text.includes(term));
  });
}

interface FetchContext {
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  studyTypeArea?: string;
}

type Fetcher = (query: string, ctx: FetchContext) => Promise<any[]>;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LiteratureSearchRequestBody;
    const query = (body.query || "").trim();
    const databases = Array.isArray(body.databases) ? body.databases : [];
    const yearFrom = body.yearFrom;
    const yearTo = body.yearTo;
    const semanticSearch = body.semanticSearch === true;
    const medspacyFilter = body.medspacyFilter === true;
    const shouldDeduplicate = body.deduplicate !== false;
    const useCompiledQueries = body.useCompiledQueries === true;
    const concepts: ConceptBlock[] = Array.isArray(body.concepts) ? body.concepts : [];

    const studyTypes: string[] = Array.isArray(body.studyTypes)
      ? body.studyTypes.filter((t) => t && t !== "All Study Types")
      : body.studyType && body.studyType !== "All Study Types"
        ? [body.studyType]
        : [];

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    // MeSH expansion + ATM + truncation wildcard expansion (applied to both
    // the main research pipeline and the systematic review pipeline).
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

    // ---------------------------------------------------------------------
    // Per-track query plan
    // ---------------------------------------------------------------------
    const plan =
      useCompiledQueries && concepts.length > 0
        ? compileQueryPlan({
            concepts,
            studyTypes,
            databases: dbsToSearch,
            searchLogic:
              body.searchLogic === "OR" ? "OR" : body.searchLogic === "NOT" ? "NOT" : "AND",
            rawQuery: query,
          })
        : null;

    const compiledByDatabase = new Map<string, CompiledQuery[]>();
    if (plan) {
      for (const compiled of plan.all) {
        const list = compiledByDatabase.get(compiled.database) || [];
        list.push(compiled);
        compiledByDatabase.set(compiled.database, list);
      }
    }

    // Databases whose study-type restriction is already inside the query.
    const nativelyFilteredDatabases = new Set<string>();
    if (plan) {
      for (const compiled of plan.all) {
        if (compiled.studyTypeFilteredNatively) {
          nativelyFilteredDatabases.add(compiled.database);
        }
      }
    }

    // Terms excluded with NOT — applied locally for every database that cannot
    // express the exclusion in its own query language.
    const negatedTerms = concepts
      .filter((c) => c.negated)
      .flatMap((c) => [c.label, ...(c.synonyms || [])])
      .filter((t) => t && t.length > 2);
    const track1Databases = new Set(["PubMed", "ClinicalTrials.gov"]);

    const apiMap: Record<string, Fetcher | undefined> = {
      "PubMed": (q, o) => fetchPubMedBrowserless(q, o.yearFrom, o.yearTo, o.studyType),
      "OpenAlex": (q, o) => fetchOpenAlex(q, o.yearFrom, o.yearTo, o.studyType),
      "Europe PMC": (q, o) => fetchEuropePMC(q, o.yearFrom, o.yearTo, o.studyType),
      "pyEuropePMC": (q, o) => fetchEuropePMC(q, o.yearFrom, o.yearTo, o.studyType),
      "DOAJ": (q, o) => fetchDoaj(q, o.yearFrom, o.yearTo, o.studyType),
      "bioRxiv": (q, o) => fetchBioRxiv(q, o.yearFrom, o.yearTo, o.studyType),
      "medRxiv": (q, o) => fetchMedRxiv(q, o.yearFrom, o.yearTo, o.studyType),
      "Crossref": (q, o) => fetchCrossref(q, o.yearFrom, o.yearTo, o.studyType),
      "arXiv": (q, o) => fetcharXiv(q, o.yearFrom, o.yearTo, o.studyType),
      "OpenAIRE": (q, o) => fetchOpenAIRE(q, o.yearFrom, o.yearTo, o.studyType),
      "dblp": (q, o) => fetchDblp(q, o.yearFrom, o.yearTo, o.studyType),
      "Zenodo": (q, o) => fetchZenodo(q, o.yearFrom, o.yearTo, o.studyType),
      "Google Scholar": (q, o) => fetchGoogleScholarBrowserless(q, o.yearFrom, o.yearTo, o.studyType),
      "Semantic Scholar": (q, o) => fetchSemanticScholarBrowserless(q, o.yearFrom, o.yearTo, o.studyType),
      "ScienceDirect": (q, o) => fetchScienceDirectBrowserless(q, o.yearFrom, o.yearTo, o.studyType),
      "ClinicalTrials.gov": (q, o) =>
        fetchClinicalTrialsGov(q, o.yearFrom, o.yearTo, o.studyType, o.studyTypeArea),
    };

    const selectedApis = dbsToSearch.filter((db) => apiMap[db]);
    const skippedDatabases = dbsToSearch.filter((db) => !apiMap[db]);

    const allPapers: any[] = [];
    const perDatabaseResults: PerDatabaseResult[] = [];
    const perDatabaseErrors: Record<string, string> = {};
    const rawRecordsPerDatabase: Record<string, number> = {};
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
          const compiled = compiledByDatabase.get(db) || [];
          const queries: string[] = compiled.length > 0 ? compiled.map((c) => c.query) : [semanticQuery];
          const nativeStudyType = compiled.find((c) => c.nativeStudyType)?.nativeStudyType;
          const nativeFiltered = nativelyFilteredDatabases.has(db);

          const collected: any[] = [];
          for (const singleQuery of queries) {
            const papers = await fetchFn(singleQuery, {
              yearFrom,
              yearTo,
              // The study-type restriction is applied by the database for
              // Track 1 databases; elsewhere it is enforced below with OR
              // semantics across every selected type.
              studyType: nativeFiltered
                ? undefined
                : studyTypes.length === 1
                  ? studyTypes[0]
                  : undefined,
              studyTypeArea: nativeStudyType,
            });
            collected.push(...papers);
          }

          let records = dedupeWithinDatabase(collected);
          if (!nativeFiltered) {
            records = filterByStudyTypes(records, studyTypes);
          }
          if (negatedTerms.length > 0 && !track1Databases.has(db)) {
            records = filterNegatedConcepts(records, negatedTerms);
          }
          records.forEach((p: any) => {
            if (!p.database) p.database = db;
            p.sourceBackend = p.sourceBackend || db;
            p.sources = Array.from(new Set([...(p.sources || []), db]));
          });
          return {
            database: db,
            status: records.length > 0 ? "success" : "empty",
            count: records.length,
            papers: records,
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
        rawRecordsPerDatabase[database] = count;
        if (status === "success") {
          succeeded.push(database);
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

    // Records identified by the database searches — the PRISMA starting point.
    const rawRecordCount = allPapers.length;
    const totalBeforeDedup = rawRecordCount;

    let workingPapers = allPapers;
    if (shouldDeduplicate) {
      workingPapers = deduplicatePapers(workingPapers);
    }
    const dedupedCount = totalBeforeDedup - workingPapers.length;

    const enriched = workingPapers.map((p) => ({
      ...p,
      citationStatus: p.doi ? ("unverified" as const) : ("no-doi" as const),
      citationMessage: p.doi ? "Pending verification in Step 2" : "No DOI available",
    }));

    // DOI enrichment: find missing DOIs via Crossref title/author lookup
    let citationResults = new Map<string, { valid: boolean; title?: string; message: string }>();
    try {
      const doiEnriched = await enrichPapersWithDois(enriched as any);
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
      const k = p.doi.trim().toLowerCase();
      const r = citationResults.get(k);
      if (r?.valid) {
        return { ...p, citationStatus: "verified" as const, citationMessage: r.message || "DOI verified via Crossref" };
      }
      return { ...p, citationStatus: "unverified" as const, citationMessage: r?.message || "DOI not verified via Crossref" };
    });

    // Automated clinical relevance filtering (medspacy-inspired).
    // Only applied when the user keeps the filter enabled — "Show All Results"
    // must genuinely return every record the databases returned.
    let medspacyMeta: {
      enabled: boolean;
      queryConcepts: string[];
      negationTerms: string[];
      filteredCount: number;
      totalCount: number;
      keywordFilteredCount?: number;
    };
    let relevanceFiltered: any[];

    if (medspacyFilter) {
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
      relevanceFiltered = medResult.papers.length > 0 ? medResult.papers : verifiedPapers;

      // Strict keyword-in-title/abstract filter: at least one significant
      // query keyword must appear in the paper's title or abstract.
      const keywords = extractQueryKeywords(query);
      if (keywords.length > 0) {
        const beforeKeywordCount = relevanceFiltered.length;
        relevanceFiltered = filterByKeywordPresence(relevanceFiltered, keywords);
        const keywordFilteredCount = beforeKeywordCount - relevanceFiltered.length;
        if (keywordFilteredCount > 0) {
          medspacyMeta.keywordFilteredCount = keywordFilteredCount;
        }
      }
    } else {
      medspacyMeta = {
        enabled: false,
        queryConcepts: [],
        negationTerms: [],
        filteredCount: 0,
        totalCount: verifiedPapers.length,
      };
      relevanceFiltered = verifiedPapers;
    }

    // If no papers survived relevance filtering, fall back to verified papers so
    // users aren't left with nothing, but mark them as low-relevance.
    let finalPapers: any[];
    if (medspacyFilter && relevanceFiltered.length === 0 && verifiedPapers.length > 0) {
      finalPapers = verifiedPapers.map((p) => ({ ...p, _lowRelevance: true }));
    } else {
      finalPapers = relevanceFiltered;
    }

    const relevanceFilteredCount = finalPapers.length;

    const verifiedCount = finalPapers.filter((p) => p.citationStatus === "verified").length;
    const unverifiedCount = finalPapers.filter((p) => p.citationStatus === "unverified").length;
    const noDoiCount = finalPapers.filter((p) => p.citationStatus === "no-doi").length;

    const citationValidationResults: Record<string, { valid: boolean; title?: string; message: string }> = {};
    citationResults.forEach((v, k) => { citationValidationResults[k] = v; });

    const compiledPlan = plan
      ? plan.all.map((c) => ({
          database: c.database,
          track: c.track,
          query: c.query,
          label: c.label,
        }))
      : [];
    const planSummary = plan ? summarizePlan(plan) : [];

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
          rawRecordCount: 0,
          rawRecordsPerDatabase: {},
          relevanceFilteredCount: mockEnriched.length,
          citationValidation: { verified: 0, unverified: mockEnriched.length, noDoi: 0, results: {} },
          medspacy: medspacyMeta,
          compiledPlan,
          planSummary,
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
        rawRecordCount,
        rawRecordsPerDatabase,
        relevanceFilteredCount,
        citationValidation: {
          verified: verifiedCount,
          unverified: unverifiedCount,
          noDoi: noDoiCount,
          results: citationValidationResults,
        },
        medspacy: medspacyMeta,
        compiledPlan,
        planSummary,
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
