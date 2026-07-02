import { NextRequest, NextResponse } from "next/server";

const RESEARCHER_BASE = process.env.RESEARCHER_URL || process.env.NEXT_PUBLIC_RESEARCHER_URL || "http://127.0.0.1:8080";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const entries: [string, unknown][] = [];
    formData.forEach((value, key) => entries.push([key, value]));
    const upstream = new Request(`${RESEARCHER_BASE}/run-autoprognosis`, {
      method: "POST",
      body: formData as unknown as BodyInit,
      headers: {
        ...(request.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : {}),
      },
    });

    const resp = await fetch(upstream);
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
    const base = process.env.RESEARCHER_URL || process.env.NEXT_PUBLIC_RESEARCHER_URL || "http://127.0.0.1:8080";
    return NextResponse.json(
      { error: `Could not reach researcher service at ${base}: ${message}` },
      { status: 502 }
    );
  }
}
