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

    const apiMap: Record<string, () => Promise<any[]>> = {
      OpenAlex: () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
      PubMed: () => fetchPubMed(query, yearFrom, yearTo, studyType),
      "Europe PMC": () => fetchEuropePMC(query, yearFrom, yearTo, studyType),
      ERIC: () => fetchEuropePMC(`education research ${query}`, yearFrom, yearTo, studyType),
      "Google Scholar": () => fetchOpenAlex(`scholarly articles ${query}`, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc" }),
      Shodhganga: () => fetchOpenAlex(`theses dissertations ${query}`, yearFrom, yearTo, studyType, { filter: "type:dissertation,authorships.institutions.country_code:IN" }),
      "CTRI – India": () => fetchEuropePMC(`clinical trials India ${query}`, yearFrom, yearTo, studyType),
      "scite.ai": () => fetchOpenAlex(`${query} citation analysis`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
      "WHO IRIS": () => fetchEuropePMC(`WHO health guidelines ${query}`, yearFrom, yearTo, studyType),
      "Semantic Scholar": () => fetchOpenAlex(`AI machine learning ${query}`, yearFrom, yearTo, studyType, { sort: "publication_year:desc" }),
      ClinicalTrials: () => fetchEuropePMC(`clinical trials registry ${query}`, yearFrom, yearTo, studyType),
      DOAJ: () => fetchDoaj(query, yearFrom, yearTo, studyType),
      Prospero: () => fetchEuropePMC(`systematic review protocol ${query}`, yearFrom, yearTo, studyType),
      ScienceDirect: () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "publication_year:desc", filter: "host_venue:publisher:Elsevier" }),
      Clarivate: () => fetchOpenAlex(query, yearFrom, yearTo, studyType, { sort: "cited_by_count:desc", filter: "has_doi:true" }),
      "paper-search-mcp": () => fetchPaperSearchMcp(query, "paper-search-mcp", yearFrom, yearTo, studyType),
      arXiv: () => fetchPaperSearchMcp(query, "arXiv", yearFrom, yearTo, studyType),
      bioRxiv: () => fetchPaperSearchMcp(query, "bioRxiv", yearFrom, yearTo, studyType),
      medRxiv: () => fetchPaperSearchMcp(query, "medRxiv", yearFrom, yearTo, studyType),
      CORE: () => fetchPaperSearchMcp(query, "CORE", yearFrom, yearTo, studyType),
      Zenodo: () => fetchPaperSearchMcp(query, "Zenodo", yearFrom, yearTo, studyType),
      HAL: () => fetchPaperSearchMcp(query, "HAL", yearFrom, yearTo, studyType),
      SSRN: () => fetchPaperSearchMcp(query, "SSRN", yearFrom, yearTo, studyType),
      BASE: () => fetchPaperSearchMcp(query, "BASE", yearFrom, yearTo, studyType),
      Crossref: () => fetchPaperSearchMcp(query, "Crossref", yearFrom, yearTo, studyType),
      OpenAIRE: () => fetchPaperSearchMcp(query, "OpenAIRE", yearFrom, yearTo, studyType),
      CiteSeerX: () => fetchPaperSearchMcp(query, "CiteSeerX", yearFrom, yearTo, studyType),
      dblp: () => fetchPaperSearchMcp(query, "dblp", yearFrom, yearTo, studyType),
      IACR: () => fetchPaperSearchMcp(query, "IACR", yearFrom, yearTo, studyType),
      Unpaywall: () => fetchPaperSearchMcp(query, "Unpaywall", yearFrom, yearTo, studyType),
      "Semantic Scholar (raw)": () => fetchPaperSearchMcp(query, "Semantic Scholar", yearFrom, yearTo, studyType),
    };

    const selectedApis = databases.filter((db) => apiMap[db]);
    if (selectedApis.length === 0) {
      return NextResponse.json({ error: "No supported databases selected" }, { status: 400, headers: corsHeaders() });
    }

    const allPapers: any[] = [];
    const sourceBreakdown: Record<string, number> = {};
    const errors: Record<string, string> = {};
    const succeeded: string[] = [];
    const failed: string[] = [];

    const results = await Promise.allSettled(
      selectedApis.map(async (db) => {
        const fetchFn = apiMap[db];
        const papers = await fetchFn();
        return { database: db, papers };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { database, papers } = result.value;
        if (papers.length > 0) {
          succeeded.push(database);
          sourceBreakdown[database] = papers.length;
          allPapers.push(...papers);
        } else {
          succeeded.push(database);
          sourceBreakdown[database] = 0;
        }
      } else {
        failed.push(result.reason?.database || "unknown");
        errors[result.reason?.database || "unknown"] = result.reason?.message || String(result.reason);
      }
    }

    const totalBeforeDedup = allPapers.length;
    const deduped = deduplicatePapers(allPapers);
    const dedupedCount = totalBeforeDedup - deduped.length;
    const enriched = await enrichPapersWithDois(deduped);

    return NextResponse.json(
      {
        query,
        total: enriched.length,
        papers: enriched,
        sourceBreakdown,
        sourcesUsed: succeeded,
        errors,
        failedDatabases: failed,
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
