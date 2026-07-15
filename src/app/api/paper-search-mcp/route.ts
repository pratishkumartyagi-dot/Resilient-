import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";

const PAPER_SEARCH_MCP_CANDIDATES = [
  process.env.PAPER_SEARCH_MCP_BIN,
  "/usr/local/bin/paper-search-mcp",
  "/usr/bin/paper-search-mcp",
  "/opt/homebrew/bin/paper-search-mcp",
  path.join(process.env.HOME || "", ".local/bin/paper-search-mcp"),
  path.join(process.env.HOME || "", "paper-search-mcp", "dist", "server.js"),
];

function findPaperSearchMcpBinary(): string | null {
  if (process.env.PAPER_SEARCH_MCP_BIN && process.env.PAPER_SEARCH_MCP_BIN.trim()) {
    return process.env.PAPER_SEARCH_MCP_BIN.trim();
  }
  for (const candidate of PAPER_SEARCH_MCP_CANDIDATES) {
    if (!candidate) continue;
    try {
      if (candidate.endsWith(".js")) {
        if (fs.existsSync(candidate)) return candidate;
        continue;
      }
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
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

const MCP_BINARY = findPaperSearchMcpBinary();

function sendMcpRequest(proc: ReturnType<typeof spawn>, id: number, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    let buffer = "";
    const timeout = setTimeout(() => {
      reject(new Error(`MCP request timeout: ${method}`));
      proc.kill("SIGKILL");
    }, 120000);

    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            clearTimeout(timeout);
            resolve(msg.result || msg);
            return;
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      console.warn("[paper-search-mcp stderr]", data.toString().slice(0, 500));
    });

    proc.on("error", (err: any) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.stdin?.write(payload + "\n");
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query: string = (body.query || "").trim();
    const source: string = (body.source || "all").trim();
    const maxResults: number = Math.min(body.maxResults || 50, 200);

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    if (!MCP_BINARY) {
      return NextResponse.json({
        error: "paper-search-mcp binary not found. Install openags/paper-search-mcp and ensure the binary is in PATH.",
        papers: [],
        total: 0,
        sourcesUsed: [],
        errors: { paper_search_mcp: "Binary not found" },
      }, { status: 500, headers: corsHeaders() });
    }

    const proc = spawn(MCP_BINARY, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    try {
      await sendMcpRequest(proc, 1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "evidence-synthesis-app", version: "1.0.0" },
      });

      const toolResult = await sendMcpRequest(proc, 2, "tools/call", {
        name: "search_papers",
        arguments: {
          query,
          platform: source,
          maxResults,
          sortBy: "relevance",
        },
      });

      const content = toolResult?.content || [];
      const text = content.find((c: any) => c.type === "text")?.text || "{}";

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON from paper-search-mcp tool result", raw: text.slice(0, 1000) },
          { status: 500, headers: corsHeaders() }
        );
      }

      const papers = (parsed.papers || []).map((p: any) => ({
        id: p.paperId || p.id || `mcp-${Math.random().toString(36).slice(2, 8)}`,
        title: p.title || "",
        authors: Array.isArray(p.authors) ? p.authors.join(", ") : (p.authors || "Unknown authors"),
        year: p.year || new Date().getFullYear(),
        abstract: p.abstract || "",
        doi: p.doi || "",
        url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
        database: p.source || "paper-search-mcp",
        studyType: p.paperType || p.studyType || "Journal Article",
        selected: false,
        citationCount: p.citationCount || 0,
        keywords: p.keywords || [],
        sourceBackend: "openags/paper-search-mcp",
        sources: p.source ? [p.source] : ["paper-search-mcp"],
      }));

      return NextResponse.json({
        query: parsed.query || query,
        total: parsed.total || papers.length,
        papers,
        sourceBreakdown: {},
        sourcesUsed: parsed.sourcesUsed || [],
        errors: parsed.errors || {},
      }, { headers: corsHeaders() });

    } finally {
      proc.kill("SIGKILL");
    }

  } catch (err: any) {
    console.error("[paper-search-mcp API route error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
