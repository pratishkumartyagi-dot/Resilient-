import { NextResponse } from "next/server";
import { batchVerifyCitations } from "doi-mcp/dist/tools/batchVerifyCitations.js";

export const runtime = "nodejs";

interface Paper {
  doi?: string;
  title: string;
  authors?: string;
  year?: number;
  journal?: string;
}

interface VerificationResult {
  verified: boolean;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  source?: string;
  message: string;
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

    const citations = papers.map((p, idx) => ({
      id: `paper-${idx}`,
      title: p.title,
      authors: p.authors ? p.authors.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
      year: p.year,
      doi: p.doi,
      journal: p.journal,
    }));

    const response = await batchVerifyCitations({ citations });
    
    if (response.isError) {
      return NextResponse.json(
        { error: "Verification failed", details: response.content[0]?.text },
        { status: 500, headers: corsHeaders() }
      );
    }

    const results: VerificationResult[] = [];
    try {
      const parsed = JSON.parse(response.content[0].text);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else if (parsed.results && Array.isArray(parsed.results)) {
        results.push(...parsed.results);
      }
    } catch (parseErr) {
      console.error("[doi-verification] Failed to parse response:", response.content[0].text);
      return NextResponse.json(
        { error: "Failed to parse verification results" },
        { status: 500, headers: corsHeaders() }
      );
    }

    const mappedResults = papers.map((paper, idx) => {
      const result = results[idx] || results.find((r: any) => r.id === `paper-${idx}`);
      return {
        doi: paper.doi || "",
        title: paper.title,
        valid: result?.verified || false,
        verified_title: result?.title,
        verified_authors: result?.authors?.join(", "),
        verified_year: result?.year,
        verified_journal: result?.journal,
        source: result?.source,
        message: result?.message || "Not verified",
      };
    });

    return NextResponse.json(
      {
        results: mappedResults,
        total: mappedResults.length,
        valid_count: mappedResults.filter((r) => r.valid).length,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    console.error("[doi-verification] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
