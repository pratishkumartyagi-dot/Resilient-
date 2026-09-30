import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// doi-mcp is a GitHub-only dependency (github:tfscharff/doi-mcp) with no npm
// tarball. Builders that install with a different package manager (bun) or a
// lockfile that doesn't pin the git ref can end up WITHOUT node_modules/doi-mcp,
// which used to crash this route's module load and fail the whole build's
// route collection — the preview then hung at "Your app is being built"
// forever. So: load doi-mcp lazily at request time and degrade gracefully to a
// direct doi.org + Crossref lookup when it's unavailable.

interface Paper {
  doi?: string;
  title: string;
  authors?: string;
  year?: number;
  journal?: string;
}

interface VerificationResult {
  verified: boolean;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  source?: string;
  confidence?: string;
  message: string;
}

function corsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

interface DoiMcpResponse {
  isError?: boolean;
  content: Array<{ text: string }>;
}

type DoiMcpBatchFn = (args: { citations: Array<Record<string, unknown>> }) => Promise<DoiMcpResponse>;

/**
 * Lazy-load doi-mcp at request time. Returns null when the package isn't
 * installed (e.g. builder installed from bun.lock without the git dep), so
 * the route can fall back to a direct doi.org lookup instead of crashing
 * the build's route collection.
 */
async function loadDoiMcp(): Promise<DoiMcpBatchFn | null> {
  try {
    const mod = await import(
      /* webpackIgnore: true */ "doi-mcp/dist/tools/batchVerifyCitations.js"
    );
    // Cast: the git dep ships no usable TS types for this deep path.
    return (mod.batchVerifyCitations ?? null) as DoiMcpBatchFn | null;
  } catch {
    return null;
  }
}

/** Direct doi.org resolution — no dependencies, always available. */
async function resolveViaDoiOrg(doi: string): Promise<VerificationResult | null> {
  try {
    const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    const res = await fetch(`https://doi.org/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/vnd.citationstyles.csl+json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const meta = await res.json();
    const authors: string[] = Array.isArray(meta.author)
      ? meta.author.map((a: { given?: string; family?: string }) =>
          [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean)
      : [];
    return {
      verified: true,
      doi: meta.DOI || clean,
      title: Array.isArray(meta.title) ? meta.title[0] : meta.title,
      authors,
      year: meta.issued?.["date-parts"]?.[0]?.[0] ?? meta.published?.["date-parts"]?.[0]?.[0],
      journal: Array.isArray(meta["container-title"])
        ? meta["container-title"][0]
        : meta["container-title"] || meta.publisher,
      source: "DOI.org",
      confidence: "high",
      message: `Verified via DOI.org (${meta.DOI || clean})`,
    };
  } catch {
    return null;
  }
}

/** Verify all citations: doi-mcp when present, doi.org fallback otherwise. */
async function verifyViaDoiMcp(citations: Array<Record<string, unknown>>): Promise<DoiMcpResponse> {
  const batchVerifyCitations = await loadDoiMcp();
  if (batchVerifyCitations) {
    return batchVerifyCitations({ citations });
  }
  // Fallback: resolve each supplied DOI directly via doi.org.
  const results = await Promise.all(
    citations.map(async (c, i) => {
      const id = (c.id as string) || `paper-${i}`;
      const doi = typeof c.doi === "string" ? c.doi : "";
      if (doi && doi.trim().length > 5) {
        const hit = await resolveViaDoiOrg(doi);
        if (hit) {
          return { id, verified: true, paper: hit, source: "DOI.org", confidence: "high" as const, message: hit.message };
        }
        return {
          id,
          verified: false,
          paper: { title: c.title },
          source: "DOI.org",
          confidence: "high" as const,
          message: "Supplied DOI does not resolve",
        };
      }
      return {
        id,
        verified: false,
        paper: { title: c.title },
        source: "doi-mcp-unavailable",
        confidence: "low" as const,
        message: "Title-only verification unavailable (doi-mcp not installed)",
      };
    })
  );
  return {
    isError: false,
    content: [{ text: JSON.stringify({ results }) }],
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const papers: Paper[] = body.papers || [];

    if (!papers.length) {
      return NextResponse.json(
        { error: "No papers provided" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const citations = papers.map((p, idx) => ({
      id: `paper-${idx}`,
      title: p.title,
      authors: p.authors ? p.authors.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
      year: p.year,
      doi: p.doi,
      journal: p.journal,
    }));

    const response = await verifyViaDoiMcp(citations);

    if (response.isError) {
      return NextResponse.json(
        { error: "Verification failed", details: response.content[0]?.text },
        { status: 500, headers: corsHeaders() }
      );
    }

    // doi-mcp returns { summary, results } — NOT a bare array. Previous code
    // checked Array.isArray(parsed) first, so results were silently dropped
    // and every paper came back unverified with empty metadata.
    //
    // Guard: when the caller supplies a DOI, the returned record must resolve
    // to that SAME DOI. doi-mcp's fuzzy path can return verified:true with a
    // different DOI (e.g. bogus input "10.9999/..." matched to "10.2307/...")
    // or verified:true from Crossref title search while doi.org resolution
    // failed. Both are false positives, so force verified=false there.
    const results: VerificationResult[] = [];
    try {
      const parsed = JSON.parse(response.content[0].text);
      const arr = Array.isArray(parsed) ? parsed : parsed.results;
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const r = arr[i];
          const paper = r.paper || {};
          const suppliedDoi = (papers[i]?.doi || "").trim().toLowerCase();
          const resolvedDoi = (paper.doi || paper.DOI || "").toLowerCase();
          const doiMismatch =
            suppliedDoi.length > 5 &&
            (!resolvedDoi || resolvedDoi !== suppliedDoi);
          const verified = (r.verified || false) && !doiMismatch;
          results.push({
            id: r.id,
            verified,
            doi: paper.doi || paper.DOI,
            title: paper.title,
            authors: paper.authors,
            year: paper.year,
            journal: paper.journal,
            source: r.source,
            confidence: r.confidence,
            message: doiMismatch
              ? `Supplied DOI does not resolve${resolvedDoi ? ` (closest record: ${resolvedDoi})` : ""}`
              : r.message
                || (verified ? `Verified via ${r.source || "DOI.org"}` : "Not verified"),
          } as VerificationResult & { id?: string });
        }
      }
    } catch (parseErr) {
      console.error("[doi-verification] Failed to parse response:", response.content[0].text);
      return NextResponse.json(
        { error: "Failed to parse verification results" },
        { status: 500, headers: corsHeaders() }
      );
    }

    const mappedResults = papers.map((paper, idx) => {
      const result = results[idx] || results.find((r: any) => r.id === `paper-${idx}`);
      return {
        doi: paper.doi || result?.doi || "",
        title: result?.title || paper.title,
        valid: result?.verified || false,
        verified_title: result?.title,
        verified_authors: result?.authors?.join(", "),
        verified_year: result?.year,
        verified_journal: result?.journal,
        source: result?.source,
        confidence: (result as VerificationResult)?.confidence,
        message: result?.message || "Not verified",
      };
    });

    return NextResponse.json(
      {
        results: mappedResults,
        total: mappedResults.length,
        valid_count: mappedResults.filter((r) => r.valid).length,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    console.error("[doi-verification] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
