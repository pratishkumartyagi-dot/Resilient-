import { NextResponse } from "next/server";
import { spawn } from "child_process";

export const runtime = "nodejs";

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

// @turbopack-ignore
const MEDICAL_MCP_BINARY = process.env.MEDICAL_MCP_BIN || eval('"/usr/local/bin/medical-mcp"');

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
      console.warn("[medical-mcp stderr]", data.toString().slice(0, 500));
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
    const maxResults: number = Math.min(body.maxResults || 50, 200);

    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400, headers: corsHeaders() });
    }

    const proc = spawn("node", [MEDICAL_MCP_BINARY], {
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
        name: "search-medical-literature",
        arguments: {
          query,
          maxResults,
        },
      });

      const content = toolResult?.content || [];
      const textItem = content.find((c: any) => c.type === "text");
      const text = textItem ? textItem.text : "";

      let papers: any[] = [];
      let parsedTotal = 0;

      // Try structured JSON first (some MCP servers return { papers: [...] })
      try {
        const parsed = JSON.parse(text);
        if (parsed.papers && Array.isArray(parsed.papers)) {
          papers = parsed.papers;
          parsedTotal = parsed.total || papers.length;
        } else {
          throw new Error("not structured");
        }
      } catch {
        // Parse formatted text output: "Found N article(s)\n\n1. **Title.**\n   Authors: ...\n   Journal: ...\n   Publication Date: ...\n   PMID: ...\n   Abstract: ...\n   URL: ..."
        const countMatch = text.match(/Found\s+(\d+)\s+article/);
        parsedTotal = countMatch ? parseInt(countMatch[1], 10) : 0;

        // Split into individual article blocks
        const articleBlocks = text.split(/\n(?=\d+\.\s+\*\*)/);
        for (const block of articleBlocks) {
          const titleMatch = block.match(/\d+\.\s+\*\*(.*?)\*\*/);
          const authorsMatch = block.match(/Authors:\s*([\s\S]*?)(?=\n\s+Journal:|\n\s*$)/);
          const journalMatch = block.match(/Journal:\s*(.*?)(?=\n|\s*$)/);
          const dateMatch = block.match(/Publication Date:\s*(.*?)(?=\n|\s*$)/);
          const pmidMatch = block.match(/PMID:\s*(.*?)(?=\n|\s*$)/);
          const abstractMatch = block.match(/Abstract:\s*([\s\S]*?)(?=\n\s+URL:|\n\s*$)/);
          const urlMatch = block.match(/URL:\s*(.*?)(?=\n|\s*$)/);

          if (titleMatch) {
            papers.push({
              id: `medical-mcp-${pmidMatch?.[1]?.trim() || Math.random().toString(36).slice(2, 8)}`,
              title: titleMatch[1].trim().replace(/\.$/, ""),
              authors: authorsMatch?.[1]?.trim() || "Unknown authors",
              journal: journalMatch?.[1]?.trim() || "Unknown Journal",
              year: dateMatch?.[1]?.trim() ? parseInt(dateMatch[1].trim().slice(0, 4)) : new Date().getFullYear(),
              doi: "",
              abstract: abstractMatch?.[1]?.trim() || "No abstract available.",
              database: "medical-mcp",
              studyType: "Journal Article",
              selected: false,
              url: urlMatch?.[1]?.trim() || "",
              sourceBackend: "JamesANZ/medical-mcp",
              sources: ["medical-mcp"],
            });
          }
        }
      }

      return NextResponse.json({
        query,
        total: parsedTotal || papers.length,
        papers,
        sourceBreakdown: {},
        sourcesUsed: ["medical-mcp"],
        errors: {},
      }, { headers: corsHeaders() });

    } finally {
      proc.kill("SIGKILL");
    }

  } catch (err: any) {
    console.error("[medical-mcp API route error]:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
