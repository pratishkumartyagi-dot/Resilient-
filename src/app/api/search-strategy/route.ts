import { NextResponse } from "next/server";
import {
  extractTerms,
  createDFM,
  createNetwork,
  findCutoff,
  reduceGraph,
  getKeywords,
  writeSearch,
  writePubMedSearch,
  writeEuropePMCSearch,
  checkRecall,
  type SearchDialect,
  type WriteSearchOptions,
  type CheckRecallOutput,
} from "@/lib/search-strategy";

export const runtime = "nodejs";
export const maxDuration = 300;

interface SearchStrategyRequestBody {
  texts: Array<{ title: string; abstract?: string }>;
  termExtraction?: {
    method?: "fakerake" | "rake" | "ngram" | "all";
    minFreq?: number;
    minNgram?: number;
    maxNgram?: number;
    language?: string;
  };
  network?: {
    minStudies?: number;
    minOcc?: number;
  };
  cutoff?: {
    percent?: number;
  };
  groups?: string[][]; // manually curated concept groups
  dialect?: SearchDialect;
  stemming?: boolean;
  exactPhrase?: boolean;
  goldStandard?: string[]; // known-relevant titles for recall check
  retrieved?: Array<{ title: string }>;
}

function corsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as SearchStrategyRequestBody;
    const { texts, termExtraction, network, cutoff, groups, dialect, stemming, exactPhrase, goldStandard, retrieved } = body || {};

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: "texts array is required (naive search results with title/abstract)" }, { status: 400, headers: corsHeaders() });
    }

    // Step 1: Combine titles + abstracts for term extraction
    const docTexts = texts.map((t) => `${t.title}${t.abstract ? " " + t.abstract : ""}`);
    const docLabels = texts.map((t) => t.title);

    // Step 2: Extract terms
    const extracted = extractTerms(docTexts, {
      method: termExtraction?.method ?? "all",
      minFreq: termExtraction?.minFreq ?? 2,
      minNgram: termExtraction?.minNgram ?? 1,
      maxNgram: termExtraction?.maxNgram ?? 3,
      language: termExtraction?.language,
    });

    // Step 3: Build DFM from extracted terms
    const features = extracted.map((t) => t.term);
    const dfm = createDFM(docLabels, features);

    // Step 4: Build co-occurrence network
    const networkResult = createNetwork(dfm, {
      minStudies: network?.minStudies ?? 1,
      minOcc: network?.minOcc ?? 1,
    });

    // Step 5: Find cutoff
    const cutoffResult = findCutoff(networkResult, {
      percent: cutoff?.percent ?? 0.80,
    });

    // Step 6: Reduce graph to important keywords
    const reduced = reduceGraph(networkResult, cutoffResult.nodesAbove);
    const keywords = getKeywords(reduced);

    // Step 7: Write boolean search (use curated groups if provided, else keywords as single group)
    const searchGroups = groups && groups.length > 0 ? groups : [keywords];
    const searchString = writeSearch(searchGroups, {
      dialect: dialect ?? "generic",
      stemming: stemming ?? true,
      exactPhrase: exactPhrase ?? true,
    });

    const pubmedSearch = writePubMedSearch(searchGroups);
    const europePmcSearch = writeEuropePMCSearch(searchGroups);

    // Step 8: Recall check against gold standard
    let recall: CheckRecallOutput | null = null;
    if (goldStandard && goldStandard.length > 0 && retrieved && retrieved.length > 0) {
      recall = checkRecall(goldStandard, retrieved);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalDocs: texts.length,
        totalTermsExtracted: extracted.length,
        totalNetworkNodes: networkResult.nodes.length,
        totalNetworkEdges: networkResult.edges.length,
        keywordsAboveCutoff: keywords.length,
        cutoffPercent: cutoff?.percent ?? 0.80,
        recallRate: recall?.recallRate ?? null,
        foundCount: recall?.foundCount ?? null,
        totalGoldStandard: recall?.totalCount ?? null,
      },
      extractedTerms: extracted.slice(0, 100), // cap for response size
      network: {
        nodes: networkResult.nodes,
        edges: networkResult.edges,
      },
      cutoff: {
        cutoff: cutoffResult.cutoff,
        nodesAbove: cutoffResult.nodesAbove,
        strength: Object.fromEntries(cutoffResult.strength),
      },
      keywords,
      search: {
        generic: searchString,
        pubmed: pubmedSearch,
        europepmc: europePmcSearch,
      },
      recall,
    }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Search strategy development failed" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
