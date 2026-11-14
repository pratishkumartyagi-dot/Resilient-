import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "researchradar.py");

function runRadar(args: string[]): Promise<{ status: number; data: any }> {
  return new Promise((resolve) => {
    const proc = spawn("python3", [SCRIPT_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      try {
        const data = stdout ? JSON.parse(stdout) : { error: stderr || "No output" };
        resolve({ status: code || 0, data });
      } catch (e) {
        resolve({ status: code || 1, data: { error: "Failed to parse output", stdout, stderr } });
      }
    });

    proc.on("error", (err) => {
      resolve({ status: 1, data: { error: err.message } });
    });

    // 120 second timeout
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ status: 1, data: { error: "Timeout after 120 seconds" } });
    }, 120000);
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "check";

  let result: { status: number; data: any };

  switch (action) {
    case "check":
      result = await runRadar(["check"]);
      break;
    case "sources":
      result = await runRadar(["check"]);
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json(result.data, { status: result.status === 0 ? 200 : 500 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    let args: string[] = [];
    let result: { status: number; data: any };

    switch (action) {
      case "papers":
        args = ["papers", ...(params.query || []), "--limit", String(params.limit || 25)];
        if (params.since) args.push("--since", String(params.since));
        result = await runRadar(args);
        break;

      case "citing":
        if (!params.openalex_id) {
          return NextResponse.json({ error: "openalex_id required" }, { status: 400 });
        }
        args = ["citing", params.openalex_id, "--since", String(params.since || 2020), "--limit", String(params.limit || 25)];
        result = await runRadar(args);
        break;

      case "limits":
        if (!params.arxiv_id) {
          return NextResponse.json({ error: "arxiv_id required" }, { status: 400 });
        }
        args = ["limits", params.arxiv_id];
        result = await runRadar(args);
        break;

      case "neurips":
        if (!params.query || !Array.isArray(params.query) || params.query.length === 0) {
          return NextResponse.json({ error: "query array required" }, { status: 400 });
        }
        args = ["neurips", ...params.query, "--limit", String(params.limit || 12), "--max-chars", String(params.max_chars || 5000)];
        if (params.years) args.push("--years", params.years);
        result = await runRadar(args);
        break;

      case "elife":
        if (!params.query || !Array.isArray(params.query) || params.query.length === 0) {
          return NextResponse.json({ error: "query array required" }, { status: 400 });
        }
        args = ["elife", ...params.query, "--limit", String(params.limit || 8), "--max-chars", String(params.max_chars || 5000)];
        result = await runRadar(args);
        break;

      case "iclr-build":
        args = ["iclr-build"];
        if (params.sample) args.push("--sample");
        if (params.yes_download_2_2gb) args.push("--yes-download-2.2gb");
        result = await runRadar(args);
        break;

      case "iclr":
        if (!params.query || !Array.isArray(params.query) || params.query.length === 0) {
          return NextResponse.json({ error: "query array required" }, { status: 400 });
        }
        args = ["iclr", ...params.query, "--outcome", params.outcome || "both", "--limit", String(params.limit || 10), "--max-chars", String(params.max_chars || 5000)];
        if (params.conference) args.push("--conference", params.conference);
        if (params.since) args.push("--since", String(params.since));
        result = await runRadar(args);
        break;

      case "verify":
        if (!params.file || !params.quote || !Array.isArray(params.quote)) {
          return NextResponse.json({ error: "file and quote array required" }, { status: 400 });
        }
        args = ["verify", params.file, ...params.quote];
        result = await runRadar(args);
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: result.status === 0 ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}