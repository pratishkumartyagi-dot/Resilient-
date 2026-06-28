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

    if (provider === "deepseek") {
      const deepseekModel = "deepseek-reasoner";
      const deepseekUrl = "https://api.deepseek.com/v1/chat/completions";
      const deepseekRes = await fetch(deepseekUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: deepseekModel, messages: [{ role: "user", content: prompt }] }),
      });

      if (!deepseekRes.ok) {
        const text = await deepseekRes.text();
        return NextResponse.json({ error: `DeepSeek API error: ${deepseekRes.status} — ${text}` }, { status: deepseekRes.status });
      }

      const deepseekData = await deepseekRes.json();
      const deepseekContent = deepseekData?.choices?.[0]?.message?.content;
      if (!deepseekContent) {
        return NextResponse.json({ error: "DeepSeek returned empty content" }, { status: 502 });
      }
      return NextResponse.json({ content: deepseekContent });
    }

    if (provider === "groq") {
      const groqModel = "deepseek-r1-distill-llama-70b";
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
