import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const PYTHON_SCRIPT = path.join(process.cwd(), "scripts", "slr_engine", "slr_wrapper.py");

function runPython(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const pythonProcess = spawn("python3", [PYTHON_SCRIPT, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: path.join(process.cwd(), "scripts") },
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });

    pythonProcess.on("error", (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const protocolId = searchParams.get("protocolId");

  try {
    switch (action) {
      case "list-protocols": {
        const result = await runPython(["list-protocols"]);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        const protocols = result.stdout.trim().split("\n").filter(Boolean).map(line => {
          const [id, ...titleParts] = line.split(": ");
          return { id, title: titleParts.join(": "), status: "draft" };
        });
        return NextResponse.json({ protocols });
      }

      case "get-protocol": {
        if (!protocolId) {
          return NextResponse.json({ error: "protocolId required" }, { status: 400 });
        }
        const result = await runPython(["status", "--protocol-id", protocolId]);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ output: result.stdout });
      }

      case "get-papers": {
        if (!protocolId) {
          return NextResponse.json({ error: "protocolId required" }, { status: 400 });
        }
        const stage = searchParams.get("stage") || "";
        const result = await runPython(["get-papers", "--protocol-id", protocolId, "--stage", stage]);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ output: result.stdout });
      }

      case "get-prisma": {
        if (!protocolId) {
          return NextResponse.json({ error: "protocolId required" }, { status: 400 });
        }
        const result = await runPython(["get-prisma", "--protocol-id", protocolId]);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ output: result.stdout });
      }

      case "export": {
        if (!protocolId) {
          return NextResponse.json({ error: "protocolId required" }, { status: 400 });
        }
        const format = searchParams.get("format") || "all";
        const result = await runPython(["export", "--protocol-id", protocolId, "--format", format]);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ output: result.stdout });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case "create-protocol": {
        const { id, title, questions, inclusion, exclusion, databases } = params;
        const args = [
          "create-protocol",
          "--id", id,
          "--title", title,
          "--questions", ...questions,
          "--inclusion", ...inclusion,
          "--exclusion", ...exclusion,
          "--databases", ...(databases || ["pubmed", "ieee", "acm"]),
        ];
        const result = await runPython(args);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ success: true, protocolId: id });
      }

      case "search": {
        const { protocolId, mock = true } = params;
        const args = ["search", "--protocol-id", protocolId];
        if (mock) args.push("--mock");
        const result = await runPython(args);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ success: true, output: result.stdout });
      }

      case "screen": {
        const { protocolId, paperId, stage, decision, notes } = params;
        const args = [
          "screen",
          "--protocol-id", protocolId,
          "--paper-id", paperId,
          "--stage", stage,
          "--decision", decision,
        ];
        if (notes) args.push("--notes", notes);
        const result = await runPython(args);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      case "extract": {
        const { protocolId, paperId, field, value } = params;
        const args = [
          "extract",
          "--protocol-id", protocolId,
          "--paper-id", paperId,
          "--field", field,
          "--value", value,
        ];
        const result = await runPython(args);
        if (result.code !== 0) {
          return NextResponse.json({ error: result.stderr }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}