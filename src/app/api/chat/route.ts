import { NextRequest, NextResponse } from "next/server";
import { quickSearch } from "@/lib/database-apis";

export const runtime = "nodejs";

async function performSearch(query: string): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const results: string[] = [];

  if (tavilyKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 3, search_depth: "basic" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        const summaries = (data.results || [])
          .slice(0, 3)
          .map((r: any) => (r.content || r.title || "").trim())
          .filter(Boolean);
        if (summaries.length) {
          results.push("### Web Search Results\n" + summaries.map((s: string, i: number) => `[${i + 1}] ${s}`).join("\n\n"));
        }
      }
    } catch {
      // ignore search failure
    }
  }

  try {
    const papers = await quickSearch(query, 5);
    if (papers.length > 0) {
      const summary = papers
        .map((p, i) => `[${i + 1}] ${p.authors} (${p.year}). ${p.title}. ${p.abstract.substring(0, 180)}...`)
        .join("\n\n");
      results.push("### Academic Search Results\n" + summary);
    }
  } catch {
    // ignore search failure
  }

  return results.join("\n\n---\n\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, prompt, apiKey, test = false, searchQuery, searchEnabled = false } = body as {
      provider: "gemini" | "groq" | "openrouter";
      prompt: string;
      apiKey: string;
      test?: boolean;
      searchQuery?: string;
      searchEnabled?: boolean;
    };

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "Missing apiKey or prompt" }, { status: 400 });
    }

    let finalPrompt = prompt;
    let searchPerformed = false;

    if (searchEnabled && searchQuery && searchQuery.trim().length > 0) {
      const searchResults = await performSearch(searchQuery.trim());
      if (searchResults) {
        finalPrompt = `[Supplementary Search Context]\n${searchResults}\n\n[Research Program Instructions]\n- Search results are provided as grounded evidence. Synthesize from both the user's selected papers and these supplementary results.\n- Grade findings by evidence strength (T1 Mechanistic, T2 Functional, T3 Associational, T4 Mention).\n- If evidence is insufficient, explicitly state what is missing rather than speculate.\n\n[Original Prompt]\n${prompt}`;
        searchPerformed = true;
      }
    }

    if (provider === "gemini") {
       const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;
       const res = await fetch(url, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: finalPrompt }] }] }),
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
      return NextResponse.json({ content: candidate, searchPerformed });
    }

    if (provider === "groq") {
      const groqModel = "llama-3.3-70b-versatile";
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: finalPrompt }] }),
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
      return NextResponse.json({ content: groqContent, searchPerformed });
    }

    if (provider === "openrouter") {
      const model = "openrouter/perplexity/sonar-pro-search";
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: finalPrompt }],
        }),
      });

      if (!openRouterRes.ok) {
        const text = await openRouterRes.text();
        return NextResponse.json({ error: `OpenRouter API error: ${openRouterRes.status} — ${text}` }, { status: openRouterRes.status });
      }

      const openRouterData = await openRouterRes.json();
      const openRouterContent = openRouterData?.choices?.[0]?.message?.content;
      if (!openRouterContent) {
        return NextResponse.json({ error: "OpenRouter returned empty content" }, { status: 502 });
      }
      return NextResponse.json({ content: openRouterContent, searchPerformed: true });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
