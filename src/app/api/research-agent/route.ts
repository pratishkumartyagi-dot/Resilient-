import { NextRequest, NextResponse } from "next/server";
import { runResearchAgent, type ResearchAgentInput } from "@/lib/research-agent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      query?: string;
      references?: string;
      apiKey?: string;
      provider?: "gemini" | "groq";
    };

    const { query, references, apiKey, provider } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json({ error: "Missing apiKey — configure a Gemini/Groq key in Settings" }, { status: 400 });
    }

    const input: ResearchAgentInput = {
      query,
      references: references || "",
      apiKey,
      provider,
    };

    const output = await runResearchAgent(input);
    return NextResponse.json(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research agent failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
