import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface CrossrefRequestBody {
  query?: string;
  rows?: number;
  cursor?: string;
  filter?: string;
  timeoutMs?: number;
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

const CONTACT_EMAIL = process.env.RESEARCH_CONTACT_EMAIL || process.env.OPENALEX_MAILTO || "research@example.com";
const USER_AGENT = `ResilientResearchApp/1.0 (systematic-review-pipeline; mailto:${CONTACT_EMAIL})`;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 12000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoffDelay(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  return Math.min(MAX_BACKOFF_MS, 750 * Math.pow(2, attempt));
}

/**
 * GET/POST a URL with a timeout, a descriptive User-Agent and exponential
 * backoff for rate-limited / temporarily unavailable upstreams.
 *
 * Crossref is queried through this route (rather than from the browser
 * directly) because a raw `fetch` cannot honour `Retry-After` or back off
 * gracefully: the shared-IP daily budget answers HTTP 429 and the retry
 * layer here turns that into a retried request with the real upstream status
 * reported instead of a generic network error.
 */
async function httpRequest(url: string, options: { timeoutMs?: number; retries?: number; method?: string; body?: string } = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const retries = options.retries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.5",
        },
        body: options.body,
        signal: controller.signal,
      });

      if (res.ok) return res;

      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      const error = new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
      (error as any).status = res.status;
      (error as any).retryAfterMs = retryAfterMs;
      if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) throw error;
      lastError = error;
      await sleep(backoffDelay(attempt, retryAfterMs));
    } catch (err: any) {
      if (err?.status !== undefined) {
        if (!RETRYABLE_STATUS.has(err.status) || attempt === retries) throw err;
        lastError = err;
        await sleep(backoffDelay(attempt, err.retryAfterMs));
        continue;
      }
      const aborted = err?.name === "AbortError";
      lastError = new Error(
        aborted ? `Request timed out after ${timeoutMs}ms` : `Network error: ${err?.message || String(err)}`
      );
      if (attempt === retries) throw lastError;
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Proxy for the Crossref REST API (`https://api.crossref.org/works`).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CrossrefRequestBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    const qs = new URLSearchParams({ query, rows: String(body.rows ?? 100) });
    if (body.cursor) qs.set("cursor", body.cursor);
    if (body.filter) qs.set("filter", body.filter);

    const res = await httpRequest(`https://api.crossref.org/works?${qs.toString()}`, {
      timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : 30000,
      retries: 3,
    });
    const data = await res.json();
    return NextResponse.json(data, { headers: corsHeaders() });
  } catch (err: any) {
    const status = err?.status && Number.isFinite(err.status) ? err.status : 502;
    return NextResponse.json(
      { error: err?.message || "Crossref request failed", status },
      { status, headers: corsHeaders() }
    );
  }
}