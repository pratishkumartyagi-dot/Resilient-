import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Citation verification with ZERO repository dependencies.
//
// Previously this route imported `doi-mcp`, a GitHub-only dependency
// (github:tfscharff/doi-mcp). Declaring it forced the builder to CLONE a
// repository from GitHub during `bun install`; when that clone failed the
// whole build stalled at "Your app is being built". It is now implemented
// directly against doi.org (CSL-JSON content negotiation) and the Crossref
// REST API, so no repository is cloned at install time.

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
  score?: number;
  message: string;
}

interface CslAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CslMeta {
  DOI?: string;
  title?: string | string[];
  author?: CslAuthor[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string | string[];
  publisher?: string;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: CslAuthor[];
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  publisher?: string;
}

const CITATION_UA =
  "ResilientResearcher/1.0 (citation-verification; mailto:noreply@kilo.app)";
const FETCH_TIMEOUT_MS = 15_000;

function corsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractAuthors(authors?: CslAuthor[]): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .map((a) => a.name || [a.given, a.family].filter(Boolean).join(" "))
    .filter((s): s is string => Boolean(s && s.trim()));
}

function extractYear(meta: {
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
}): number | undefined {
  const parts =
    meta.issued?.["date-parts"]?.[0]?.[0] ?? meta.published?.["date-parts"]?.[0]?.[0];
  return typeof parts === "number" ? parts : undefined;
}

function titleTokens(title: string): Set<string> {
  return new Set(
    (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Resolve a supplied DOI via doi.org content negotiation, then Crossref. */
async function resolveDoi(rawDoi: string): Promise<VerificationResult | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;

  // 1) doi.org content negotiation (authoritative CSL-JSON metadata).
  try {
    const res = await fetch(`https://doi.org/${encodeURIComponent(doi)}`, {
      headers: {
        Accept: "application/vnd.citationstyles.csl+json",
        "User-Agent": CITATION_UA,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const meta = (await res.json()) as CslMeta;
      const resolved = (meta.DOI || doi).toLowerCase();
      return {
        verified: true,
        doi: meta.DOI || doi,
        title: firstString(meta.title),
        authors: extractAuthors(meta.author),
        year: extractYear(meta),
        journal: firstString(meta["container-title"]) || meta.publisher,
        source: "DOI.org",
        confidence: "high",
        message: `Verified via DOI.org (${resolved})`,
      };
    }
  } catch {
    // fall through to Crossref
  }

  // 2) Crossref works lookup (covers DOIs doi.org content negotiation misses).
  try {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=noreply@kilo.app`,
      { headers: { "User-Agent": CITATION_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (res.ok) {
      const data = (await res.json()) as { message?: CrossrefItem };
      const meta = data.message;
      if (meta) {
        return {
          verified: true,
          doi: meta.DOI || doi,
          title: firstString(meta.title),
          authors: extractAuthors(meta.author),
          year: extractYear(meta),
          journal: firstString(meta["container-title"]) || meta.publisher,
          source: "Crossref",
          confidence: "high",
          message: `Verified via Crossref (${(meta.DOI || doi).toLowerCase()})`,
        };
      }
    }
  } catch {
    // unrecoverable; report unverified below
  }

  return null;
}

/** Fuzzy title lookup via Crossref; only high-similarity matches count. */
async function searchByTitle(
  title: string,
  authors?: string,
): Promise<{ result: VerificationResult; score: number } | null> {
  if (!title || title.trim().length < 8) return null;
  const query = authors ? `${title} ${authors.split(",")[0] ?? ""}` : title;

  try {
    const res = await fetch(
      `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
        query,
      )}&rows=5&select=DOI,title,author,issued,container-title,publisher&mailto=noreply@kilo.app`,
      { headers: { "User-Agent": CITATION_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { items?: CrossrefItem[] } };
    const items = data.message?.items ?? [];
    const wanted = titleTokens(title);

    let best: CrossrefItem | null = null;
    let bestScore = 0;
    for (const item of items) {
      const score = jaccard(wanted, titleTokens(firstString(item.title) || ""));
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (!best || bestScore < 0.7) return null;

    const confidence = bestScore >= 0.85 ? "high" : "medium";
    return {
      score: Number(bestScore.toFixed(2)),
      result: {
        verified: true,
        doi: best.DOI,
        title: firstString(best.title),
        authors: extractAuthors(best.author),
        year: extractYear(best),
        journal: firstString(best["container-title"]) || best.publisher,
        source: "Crossref",
        confidence,
        score: Number(bestScore.toFixed(2)),
        message: `Matched title in Crossref (similarity ${Math.round(bestScore * 100)}%)`,
      },
    };
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { papers?: Paper[] };
    const papers = body.papers ?? [];

    if (papers.length === 0) {
      return NextResponse.json(
        { error: "No papers provided" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const results: VerificationResult[] = await Promise.all(
      papers.map(async (paper): Promise<VerificationResult> => {
        const suppliedDoi = (paper.doi || "").trim();

        // Path A: a DOI was supplied — it must resolve to that same DOI.
        if (suppliedDoi.length > 5) {
          const resolved = await resolveDoi(suppliedDoi);
          if (resolved) return resolved;
          return {
            verified: false,
            doi: suppliedDoi,
            title: paper.title,
            source: "DOI.org",
            confidence: "high",
            message: "Supplied DOI does not resolve",
          };
        }

        // Path B: title-only — fuzzy Crossref match with a similarity gate.
        const match = await searchByTitle(paper.title, paper.authors);
        if (match) return match.result;
        return {
          verified: false,
          title: paper.title,
          source: "Crossref",
          confidence: "low",
          message: "No confident title match found",
        };
      }),
    );

    const mappedResults = papers.map((paper, idx) => {
      const result = results[idx];
      return {
        doi: paper.doi || result?.doi || "",
        title: result?.title || paper.title,
        valid: result?.verified || false,
        verified_title: result?.title,
        verified_authors: result?.authors?.join(", "),
        verified_year: result?.year,
        verified_journal: result?.journal,
        source: result?.source,
        confidence: result?.confidence,
        score: result?.score,
        message: result?.message || "Not verified",
      };
    });

    return NextResponse.json(
      {
        results: mappedResults,
        total: mappedResults.length,
        valid_count: mappedResults.filter((r) => r.valid).length,
      },
      { headers: corsHeaders() },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[doi-verification] Error:", err);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders() });
  }
}
