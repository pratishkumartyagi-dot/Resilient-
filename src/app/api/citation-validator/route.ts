import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type CitationStatus = "valid" | "mismatch" | "unresolved" | "not-found";

export interface CitationCheckInput {
  id: string;
  doi?: string;
  title?: string;
  authors?: string;
  year?: number;
  journal?: string;
}

export interface CitationCheckResult {
  id: string;
  doi: string;
  title: string;
  status: CitationStatus;
  message: string;
  source?: string;
  similarity?: number;
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: Array<{ family?: string; given?: string }>;
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  abstract?: string;
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

function normalizeDoi(doi?: string): string {
  if (!doi) return "";
  return String(doi)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .trim();
}

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function similarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function firstAuthorFamily(authors?: string): string {
  if (!authors) return "";
  const first = authors.split(/,|;|\band\b/i)[0] || "";
  const parts = first.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

async function fetchJson(url: string, timeoutMs = 15000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ResilientResearchApp/1.0 (mailto:research@resilient.app)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a DOI through doi.org content negotiation (CSL-JSON). */
async function resolveViaDoiOrg(doi: string): Promise<CrossrefWork | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://doi.org/${encodeURIComponent(doi)}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "application/vnd.citationstyles.csl+json, application/json;q=0.9",
        "User-Agent": "ResilientResearchApp/1.0 (mailto:research@resilient.app)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object") return null;
    return {
      DOI: data.DOI || doi,
      title: Array.isArray(data.title) ? data.title : data.title ? [data.title] : [],
      author: Array.isArray(data.author)
        ? data.author.map((a: any) => ({
            family: a?.family,
            given: a?.given,
          }))
        : [],
      "container-title": data["container-title"]
        ? [data["container-title"]]
        : [],
      issued: data.issued,
    } as CrossrefWork;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Look a paper up in Crossref by title (and first author when possible). */
async function findByTitleCrossref(
  title: string,
  authors?: string
): Promise<{ work: CrossrefWork; score: number } | null> {
  const params = new URLSearchParams();
  params.set("query.bibliographic", title);
  params.set("rows", "5");
  const family = firstAuthorFamily(authors);
  if (family) params.set("query.author", family);

  const data = await fetchJson(`https://api.crossref.org/works?${params.toString()}`);
  const items: any[] = data?.message?.items || [];
  let best: { work: CrossrefWork; score: number } | null = null;
  for (const item of items) {
    const workTitle = item?.title?.[0] || "";
    if (!workTitle) continue;
    const score = similarity(title, workTitle);
    if (!best || score > best.score) best = { work: item, score };
  }
  if (!best) return null;
  return best;
}

async function checkOne(paper: CitationCheckInput): Promise<CitationCheckResult> {
  const doi = normalizeDoi(paper.doi);
  const title = (paper.title || "").trim();

  const base: CitationCheckResult = {
    id: paper.id,
    doi,
    title,
    status: "not-found",
    message: "",
  };

  if (doi) {
    const work = await resolveViaDoiOrg(doi);
    if (!work) {
      const crossref = await fetchJson(
        `https://api.crossref.org/works/${encodeURIComponent(doi)}`
      );
      const item = crossref?.message;
      if (!item) {
        return {
          ...base,
          status: "unresolved",
          message: "DOI does not resolve in DOI.org or Crossref",
        };
      }
      const resolvedTitle = item.title?.[0] || "";
      const score = title ? similarity(title, resolvedTitle) : 1;
      if (title && score < 0.6) {
        return {
          ...base,
          status: "mismatch",
          message: `DOI resolves to a different article (title similarity ${Math.round(score * 100)}%)`,
          source: "Crossref",
          similarity: score,
        };
      }
      return {
        ...base,
        status: "valid",
        message: "Verified via Crossref",
        source: "Crossref",
        similarity: score,
      };
    }

    const resolvedTitle = work.title?.[0] || "";
    const score = title ? similarity(title, resolvedTitle) : 1;
    if (title && resolvedTitle && score < 0.6) {
      return {
        ...base,
        status: "mismatch",
        message: `DOI resolves to a different article (title similarity ${Math.round(score * 100)}%)`,
        source: "DOI.org",
        similarity: score,
      };
    }
    return {
      ...base,
      status: "valid",
      message: "Verified via DOI.org",
      source: "DOI.org",
      similarity: score,
    };
  }

  if (title) {
    const match = await findByTitleCrossref(title, paper.authors);
    if (match && match.score >= 0.9) {
      return {
        ...base,
        doi: match.work.DOI || "",
        status: "valid",
        message: `Matched in Crossref by title (similarity ${Math.round(match.score * 100)}%)`,
        source: "Crossref",
        similarity: match.score,
      };
    }
    if (match && match.score >= 0.75) {
      return {
        ...base,
        doi: match.work.DOI || "",
        status: "valid",
        message: `Probable Crossref match by title (similarity ${Math.round(match.score * 100)}%)`,
        source: "Crossref",
        similarity: match.score,
      };
    }
  }

  return {
    ...base,
    status: "not-found",
    message: "No DOI and no confident title match found",
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      papers?: CitationCheckInput[];
    };
    const papers = Array.isArray(body.papers) ? body.papers.slice(0, 200) : [];

    if (papers.length === 0) {
      return NextResponse.json(
        { results: [], summary: { total: 0, valid: 0, mismatch: 0, unresolved: 0, notFound: 0 } },
        { headers: corsHeaders() }
      );
    }

    const results: CitationCheckResult[] = [];
    const CONCURRENCY = 8;
    let cursor = 0;

    async function worker() {
      while (cursor < papers.length) {
        const index = cursor++;
        const paper = papers[index];
        if (!paper) return;
        try {
          results[index] = await checkOne(paper);
        } catch (err: any) {
          results[index] = {
            id: paper.id,
            doi: normalizeDoi(paper.doi),
            title: paper.title || "",
            status: "unresolved",
            message: `Verification error: ${err?.message || String(err)}`,
          };
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, papers.length) }, () => worker())
    );

    const summary = {
      total: results.length,
      valid: results.filter((r) => r.status === "valid").length,
      mismatch: results.filter((r) => r.status === "mismatch").length,
      unresolved: results.filter((r) => r.status === "unresolved").length,
      notFound: results.filter((r) => r.status === "not-found").length,
    };

    return NextResponse.json({ results, summary }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Citation validation failed" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
