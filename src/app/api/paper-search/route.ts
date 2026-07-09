import { NextResponse } from "next/server";
import { promisify } from "util";
import { exec as _exec } from "child_process";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(_exec);

export const runtime = "nodejs";

const PAPER_SEARCH_CANDIDATES = [
  process.env.PAPER_SEARCH_BIN,
  "/usr/local/bin/paper-search",
  "/usr/bin/paper-search",
  "/opt/homebrew/bin/paper-search",
  path.join(process.env.HOME || "", ".local/bin/paper-search"),
];

function findPaperSearchBinary(): string | null {
  if (process.env.PAPER_SEARCH_BIN && process.env.PAPER_SEARCH_BIN.trim()) {
    return process.env.PAPER_SEARCH_BIN.trim();
  }
  for (const candidate of PAPER_SEARCH_CANDIDATES) {
    if (!candidate) continue;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
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

const BINARY = findPaperSearchBinary();

export async function POST(request: Request) {
  try {
    const binary = BINARY || "paper-search";
    if (!BINARY) {
      console.warn("[paper-search API] binary not found in candidates:", PAPER_SEARCH_CANDIDATES.filter(Boolean).join(", "));
    }

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

    const command = `${binary} ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

    if (stderr && !stderr.includes("No CORE API key") && !stderr.includes("No DOAJ API key") && !stderr.includes("UNPAYWALL_EMAIL")) {
      console.warn("[paper-search API route stderr]:", stderr);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from paper-search CLI", raw: stdout.slice(0, 500), binary },
        { status: 500, headers: corsHeaders() }
      );
    }

    const papers: any[] = (parsed.papers || []).map((p: any) => {
      const source = p.source || "unknown";
      return {
        id: `${source}-${p.paper_id}`,
        title: p.title,
        authors: p.authors,
        year: Number.parseInt(String(p.published_date || "").slice(0, 4)) || new Date().getFullYear(),
        journal: p.categories || source,
        doi: p.doi,
        abstract: p.abstract,
        url: p.url || `https://doi.org/${p.doi}`,
        database: source,
        studyType: source === "pubmed" || source === "openalex" ? "Journal Article" : "Preprint/Article",
        citationCount: Number(p.citations) || 0,
        source,
        categories: p.categories,
        keywords: p.keywords,
        pdfUrl: p.pdf_url,
      };
    });

    return NextResponse.json({
      query: parsed.query,
      total: parsed.total,
      papers,
      sourceBreakdown: parsed.source_results || {},
      sourcesUsed: parsed.sources_used || [],
      errors: parsed.errors || {},
    }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error", binary: BINARY || "paper-search" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
