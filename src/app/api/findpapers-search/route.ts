import { NextResponse } from "next/server";
import { promisify } from "util";
import { exec as _exec } from "child_process";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(_exec);

export const runtime = "nodejs";

const FINDAPAPERS_SCRIPT = path.join(process.cwd(), "scripts", "findpapers_search.py");

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
    const body = await request.json().catch(() => ({}));
    const query: string = (body.query || "").trim();
    const maxResults: number = Math.min(body.maxResults || 50, 200);
    const since: string = body.since || "";
    const until: string = body.until || "";
    const sources: string = body.sources || "";

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    if (!fs.existsSync(FINDAPAPERS_SCRIPT)) {
      return NextResponse.json({
        error: "findpapers_search.py not found. Ensure the scripts/findpapers_search.py file exists.",
        papers: [],
        total: 0,
        sourcesUsed: [],
        errors: { findpapers: "Script not found" },
      }, { status: 500, headers: corsHeaders() });
    }

    const args = [
      "--query", query,
      "--max-results", String(maxResults),
    ];
    if (since) args.push("--since", since);
    if (until) args.push("--until", until);
    if (sources) args.push("--sources", sources);

    const command = `python3 "${FINDAPAPERS_SCRIPT}" ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120000,
    });

    if (stderr) {
      console.warn("[findpapers-search API route stderr]:", stderr);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from findpapers_search.py", raw: stdout.slice(0, 1000) },
        { status: 500, headers: corsHeaders() }
      );
    }

    const papers = (parsed.papers || []).map((p: any) => ({
      id: p.id || `findpapers-${Math.random().toString(36).slice(2, 8)}`,
      title: p.title || "",
      authors: p.authors || "Unknown authors",
      year: p.year || new Date().getFullYear(),
      abstract: p.abstract || "",
      doi: p.doi || "",
      url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
      database: p.database || "findpapers",
      studyType: p.studyType || "Journal Article",
      citationCount: p.citationCount || 0,
      keywords: p.keywords || [],
      source: p.source || "findpapers",
    }));

    return NextResponse.json({
      query: parsed.query || query,
      total: parsed.total || papers.length,
      papers,
      sourceBreakdown: {},
      sourcesUsed: parsed.sourcesUsed || [],
      errors: parsed.errors || {},
    }, { headers: corsHeaders() });

  } catch (err: any) {
    console.error("[findpapers-search API route error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
