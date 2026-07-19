import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";

interface Paper {
  doi?: string;
  title: string;
  authors?: string;
}

interface ValidationResult {
  doi: string;
  title: string;
  valid: boolean;
  sources_checked: string[];
  message: string;
  verified_title?: string;
}

interface ValidationResponse {
  success: boolean;
  results: ValidationResult[];
  total: number;
  valid_count: number;
  error?: string;
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

    const scriptPath = path.join(process.cwd(), "scripts", "validate-citations.py");
    const input = JSON.stringify({ papers });

    const processResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn("python3", [scriptPath], {
        timeout: 120000,
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
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });

    const { stdout, stderr } = processResult;

    if (stderr) {
      console.warn("[citation-validation] stderr:", stderr);
    }

    let result: ValidationResponse;
    try {
      result = JSON.parse(stdout);
    } catch (parseErr) {
      console.error("[citation-validation] Failed to parse Python output:", stdout);
      return NextResponse.json(
        { error: "Failed to parse validation results", raw: stdout.slice(0, 500) },
        { status: 500, headers: corsHeaders() }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Validation failed", results: result.results },
        { status: 500, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      {
        results: result.results,
        total: result.total,
        valid_count: result.valid_count,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    console.error("[citation-validation] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
