import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(require("child_process").exec);

export const runtime = "nodejs";

interface PaperSearchResult {
  paper_id: string;
  title: string;
  authors: string;
  abstract: string;
  doi: string;
  published_date: string;
  pdf_url: string;
  url: string;
  source: string;
  updated_date: string;
  categories: string;
  keywords: string;
  citations: number;
  references: string;
  extra: string;
}

interface PaperSearchResponse {
  query: string;
  sources_used: string[];
  source_results: Record<string, number>;
  errors: Record<string, string>;
  total: number;
  papers: PaperSearchResult[];
}

function extractYear(dateStr: string): number {
  if (!dateStr) return 0;
  const match = dateStr.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

function normalizePaper(p: PaperSearchResult, database: string): {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  abstract: string;
  url: string;
  pmid?: string;
  pmcid?: string;
  database: string;
  studyType: string;
  citationCount: number;
  source: string;
  categories: string;
  keywords: string;
  pdfUrl: string;
} {
  const year = extractYear(p.published_date);
  const source = p.source || database;
  return {
    id: `${source}-${p.paper_id}`,
    title: p.title,
    authors: p.authors,
    year,
    journal: p.categories || source,
    doi: p.doi,
    abstract: p.abstract,
    url: p.url || `https://doi.org/${p.doi}`,
    database,
    studyType: source === "pubmed" ? "Journal Article" : source === "openalex" ? "Journal Article" : "Preprint/Article",
    citationCount: p.citations || 0,
    source,
    categories: p.categories,
    keywords: p.keywords,
    pdfUrl: p.pdf_url,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query: string = body.query || "";
    const maxResults: number = Math.min(body.maxResults || 10, 50);
    const sources: string = body.sources || "all";
    const year: string = body.year || "";

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    const args = [
      "search",
      query,
      "-n",
      String(maxResults),
      "-s",
      sources,
    ];

    if (year) {
      args.push("-y", year);
    }

    const command = `/usr/local/bin/paper-search ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

    if (stderr && !stderr.includes("No CORE API key") && !stderr.includes("No DOAJ API key") && !stderr.includes("UNPAYWALL_EMAIL")) {
      console.warn("[paper-search API route stderr]:", stderr);
    }

    let parsed: PaperSearchResponse;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from paper-search CLI", raw: stdout.slice(0, 500) },
        { status: 500, headers: corsHeaders() }
      );
    }

    const papers = parsed.papers.map((p) => normalizePaper(p, p.source));
    const sourceBreakdown: Record<string, number> = {};
    for (const p of papers) {
      sourceBreakdown[p.source] = (sourceBreakdown[p.source] || 0) + 1;
    }

    return NextResponse.json({
      query: parsed.query,
      total: parsed.total,
      papers,
      sourceBreakdown,
      sourcesUsed: parsed.sources_used,
      errors: parsed.errors,
    }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
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
