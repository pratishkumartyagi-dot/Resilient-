import { NextRequest, NextResponse } from "next/server";

const RESEARCHER_BASE = process.env.NEXT_PUBLIC_RESEARCHER_URL || "http://127.0.0.1:6082";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = `${RESEARCHER_BASE}/run-autoprognosis`;

    const resp = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const contentType = resp.headers.get("content-type") || "application/json";
    const text = await resp.text();

    return new NextResponse(text, {
      status: resp.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Researcher service unreachable: ${message}` }, { status: 502 });
  }
}
