import { NextRequest, NextResponse } from "next/server";

const RESEARCHER_BASE = process.env.NEXT_PUBLIC_RESEARCHER_URL || "http://127.0.0.1:6082";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint = "/research", method = "POST", ...rest } = body as {
      endpoint?: string;
      method?: string;
      [key: string]: unknown;
    };

    const url = `${RESEARCHER_BASE}${endpoint}`;
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rest),
    };

    const upstream = await fetch(url, opts);

    const contentType = upstream.headers.get("content-type") || "application/json";
    const text = await upstream.text();

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Researcher service unreachable: ${message}` }, { status: 502 });
  }
}
