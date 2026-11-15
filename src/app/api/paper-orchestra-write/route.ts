import { NextRequest, NextResponse } from "next/server";
import { orchestratePaperOrchestra, type PaperOrchestraContext } from "@/lib/paper-orchestra";

export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 60_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Single provider call (gemini or groq), mirroring /api/chat so the same
 *  credentials and models are used server-side. */
async function callProvider(provider: "gemini" | "groq", apiKey: string, prompt: string): Promise<string> {
  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error: ${res.status} — ${text}`);
    }
    const data = await res.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) throw new Error("Gemini returned empty content");
    return candidate;
  }
  if (provider === "groq") {
    const groqModel = "openai/gpt-oss-120b";
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error: ${res.status} — ${text}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned empty content");
    return content;
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, apiKey, topic, reviewType, papers, ...rest } = body as {
      provider: "gemini" | "groq";
      apiKey: string;
      topic: string;
      reviewType: string;
      papers: Array<{
        id: string;
        authors: string;
        year: number;
        title: string;
        journal: string;
        doi?: string;
      }>;
      [k: string]: unknown;
    };

    if (!apiKey || !provider || !topic) {
      return NextResponse.json({ error: "Missing apiKey, provider, or topic" }, { status: 400 });
    }

    const ctx: PaperOrchestraContext = {
      topic,
      reviewType,
      papers: (papers || []).map((p: any) => ({
        id: p.id,
        authors: p.authors,
        year: p.year,
        title: p.title,
        journal: p.journal || "Unknown journal",
        doi: p.doi || undefined,
      })),
      synthesisOutput: (rest.synthesisOutput as string) || undefined,
      effectSizes: (rest.effectSizes as any[]) || undefined,
      robAssessments: (rest.robAssessments as Record<string, any>) || undefined,
      robTool: (rest.robTool as string) || undefined,
      robMode: (rest.robMode as "robvis" | "probast") || undefined,
      prismaCounts: (rest.prismaCounts as any) || undefined,
      selectedDbs: (rest.selectedDbs as string[]) || undefined,
      query: (rest.query as string) || undefined,
      requirements: (rest.requirements as string) || undefined,
      instructions: (rest.instructions as string) || undefined,
      literatureSections: (rest.literatureSections as any) || undefined,
    };

    const callModel = (prompt: string): Promise<string> => callProvider(provider, apiKey, prompt);

    const result = await orchestratePaperOrchestra(callModel, ctx);

    return NextResponse.json({
      outline: result.outline,
      literatureSections: result.literatureSections,
      manuscript: result.manuscript,
      citations: result.citations,
      agentLog: result.agentLog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
