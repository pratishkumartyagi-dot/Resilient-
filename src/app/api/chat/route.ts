import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, prompt, apiKey, test = false } = body as {
      provider: "gemini" | "groq";
      prompt: string;
      apiKey: string;
      test?: boolean;
    };

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "Missing apiKey or prompt" }, { status: 400 });
    }

    if (provider === "gemini") {
       const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
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

    if (provider === "groq") {
      const groqModel = "llama-3.3-70b-versatile";
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: prompt }] }),
      });

      if (!groqRes.ok) {
        const text = await groqRes.text();
        return NextResponse.json({ error: `Groq API error: ${groqRes.status} — ${text}` }, { status: groqRes.status });
      }

      const groqData = await groqRes.json();
      const groqContent = groqData?.choices?.[0]?.message?.content;
      if (!groqContent) {
        return NextResponse.json({ error: "Groq returned empty content" }, { status: 502 });
      }
      return NextResponse.json({ content: groqContent });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
