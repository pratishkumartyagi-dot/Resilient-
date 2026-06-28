import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, prompt, apiKey, test = false } = body as {
      provider: "gemini" | "groq" | "deepseek";
      prompt: string;
      apiKey: string;
      test?: boolean;
    };

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "Missing apiKey or prompt" }, { status: 400 });
    }

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Gemini API error: ${res.status} — ${text}` }, { status: res.status });
      }

      const data = await res.json();
      const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidate) {
        return NextResponse.json({ error: "Gemini returned empty content" }, { status: 502 });
      }
      return NextResponse.json({ content: candidate });
    }

    if (provider === "groq" || provider === "deepseek") {
      const model = provider === "deepseek" ? "deepseek-r1-distill-llama-70b" : "deepseek-r1-distill-llama-70b";
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Groq API error: ${res.status} — ${text}` }, { status: res.status });
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        return NextResponse.json({ error: "Groq returned empty content" }, { status: 502 });
      }
      return NextResponse.json({ content });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
