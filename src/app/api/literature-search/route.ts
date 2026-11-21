import { NextResponse } from "next/server";
import {
  searchDatabases,
  DATABASE_IDS,
  DATABASE_DEFINITIONS,
  AVAILABLE_DATABASE_IDS,
  getUnavailableReason,
  extractSearchConcepts,
  buildConceptAwareTerm,
  type Paper,
} from "@/lib/database-apis";
import { expandQueryWithMesh } from "@/lib/mesh-expansion";

export const runtime = "nodejs";

interface LiteratureSearchRequestBody {
  query: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  studyType?: string;
  maxResults?: number;
  timeoutMs?: number;
  semanticSearch?: boolean;
  /** Run the scispacy-style concept extractor (MeSH + synonyms per concept,
   *  concepts AND-ed) so a natural-language question is turned into a
   *  librarian-style query instead of AND-ing every content word. */
  keywordExtract?: boolean;
  /** Concept blocks for systematic review search (A=Condition, B=Predictor/Exposure, C=Outcome/Design). */
  conceptBlocks?: {
    A: string;
    B: string;
    C: string;
  };
  /** Maximum number of papers per database (unlimited when not set). */
  maxPapers?: number;
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

const DEFAULT_DATABASES = AVAILABLE_DATABASE_IDS;

/**
 * Catalogue of the databases the client can search. Sources that are switched
 * off upstream (or that need an API key which is not configured) are reported
 * as unavailable instead of being offered and then failing.
 */
export async function GET() {
  const databases = DATABASE_DEFINITIONS.map((d) => {
    const reason = getUnavailableReason(d);
    return {
      id: d.id,
      label: d.label,
      url: d.url,
      description: d.description,
      available: reason === undefined,
      reason: reason ?? null,
      requiresKey: d.requiresKey ?? null,
    };
  });

  return NextResponse.json(
    {
      databases,
      available: databases.filter((d) => d.available).map((d) => d.id),
      unavailable: databases.filter((d) => !d.available).map((d) => ({ id: d.id, reason: d.reason })),
    },
    { headers: corsHeaders() }
  );
}

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as LiteratureSearchRequestBody;
    const query = (body.query || "").trim();
    const databases = Array.isArray(body.databases) ? body.databases.filter((d) => typeof d === "string" && d.trim()) : [];
    const yearFrom = body.yearFrom?.trim() || undefined;
    const yearTo = body.yearTo?.trim() || undefined;
    const studyType = body.studyType && body.studyType !== "All Study Types" ? body.studyType : undefined;
    const maxResults = typeof body.maxResults === "number" ? body.maxResults : undefined;
    const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : undefined;
    const semanticSearch = body.semanticSearch === true;
    const keywordExtract = body.keywordExtract === true;
    const conceptBlocks = body.conceptBlocks;
    const maxPapers = typeof body.maxPapers === "number" ? body.maxPapers : undefined;

    if (!query && !conceptBlocks) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    // Semantic mode broadens the query with MeSH/ATM concept expansion and
    // drops boolean operators, so retrieval matches on meaning instead of
    // exact keyword co-occurrence.
    const meshResult = expandQueryWithMesh(query);

    // Keyword-extract mode (scispacy-style): recognise the concepts in the
    // natural-language question. The expanded query is reported in the
    // response metadata; the actual per-database translation is handled by
    // each database fetcher via resolveEffectiveTerm, so PubMed-specific
    // syntax ([Title/Abstract], [MeSH Terms]) is never leaked to Europe PMC,
    // Crossref, arXiv, etc.
    const keywordConcepts = keywordExtract ? extractSearchConcepts(query) : [];
    const keywordExpandedQuery = keywordConcepts.length > 0
      ? buildConceptAwareTerm(query, { yearFrom, yearTo, studyType })
      : undefined;

    const queryMode = semanticSearch ? "semantic" : keywordExtract ? "natural" : conceptBlocks ? "concept-blocks" : undefined;

    const dbsToSearch = databases.length > 0 ? databases : DEFAULT_DATABASES;

    const outcome = await searchDatabases(dbsToSearch, {
      query,
      yearFrom,
      yearTo,
      studyType,
      limitPerDatabase: maxResults ?? maxPapers,
      timeoutMs,
      queryMode,
      keywordExtract,
      semanticSearch,
      conceptBlocks,
      maxPapers,
    });

    const papers = outcome.papers;

    const enriched: Paper[] = papers.map((p) => ({
      ...p,
      citationStatus: p.doi ? ("unverified" as const) : ("no-doi" as const),
      citationMessage: p.doi ? "Pending verification in Step 2" : "No DOI available",
    }));

    const succeeded = outcome.outcomes.filter((o) => o.status === "success");
    const empty = outcome.outcomes.filter((o) => o.status === "empty");
    const failed = outcome.outcomes.filter((o) => o.status === "failed");
    const skipped = dbsToSearch.filter((db) => !DATABASE_IDS.includes(db));
    // Databases that answered the request (with or without hits).
    const responded = succeeded.length + empty.length;

    const payload = {
      query,
      total: enriched.length,
      papers: enriched,
      sourceBreakdown: Object.fromEntries(succeeded.map((o) => [o.database, o.count])),
      sourcesUsed: [...succeeded.map((o) => o.database), ...empty.map((o) => o.database)],
      errors: outcome.errors,
      failedDatabases: failed.map((o) => o.database).filter((db) => !skipped.includes(db)),
      skippedDatabases: skipped,
      perDatabaseResults: outcome.outcomes.map((o) => ({
        database: o.database,
        status: o.status,
        count: o.count,
        rawCount: o.rawCount,
        error: o.error,
        note: o.note,
        elapsedMs: o.elapsedMs,
      })),
      databasesRequested: dbsToSearch.length,
      databasesProcessed: outcome.outcomes.length,
      databasesSucceeded: succeeded.length,
      databasesEmpty: empty.length,
      databasesFailed: failed.length,
      databasesSkipped: skipped.length,
      dedupedCount: outcome.dedupedCount,
      totalBeforeDedup: outcome.totalBeforeDedup,
      elapsedMs: Date.now() - started,
      meshExpansion: {
        expandedQuery: meshResult.expandedQuery || query,
        meshTerms: meshResult.meshTerms,
        atmMappings: meshResult.atmMappings,
        wildcardRoots: meshResult.wildcardRoots,
      },
      keywordExtraction: {
        enabled: keywordExtract,
        concepts: keywordConcepts.map((c) => ({
          id: c.id,
          role: c.role,
          label: c.label,
          required: c.required,
          meshTerms: c.meshTerms,
          synonyms: c.synonyms,
        })),
        expandedQuery: keywordExtract ? keywordExpandedQuery : undefined,
      },
      citationValidation: {
        verified: 0,
        unverified: enriched.filter((p) => p.citationStatus === "unverified").length,
        noDoi: enriched.filter((p) => p.citationStatus === "no-doi").length,
        results: {},
      },
    };

    // No database could be reached at all: the search could not be performed.
    // No substitute data is returned — the client gets the real failure detail.
    if (responded === 0 && dbsToSearch.length > 0) {
      return NextResponse.json(
        {
          ...payload,
          error: `All ${dbsToSearch.length} selected database(s) failed. No records could be retrieved — see perDatabaseResults for the upstream reason.`,
        },
        { status: 502, headers: corsHeaders() }
      );
    }

    return NextResponse.json(payload, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
