import { NextRequest, NextResponse } from "next/server";
import { quickSearch } from "@/lib/database-apis";
import { callDeepSeekWithTimeout, LOCAL_MODEL_TIMEOUT_MS } from "@/lib/ai";

export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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

/** Call the Gemini API directly (server-side, no /api/chat round-trip). */
async function callGeminiDirect(apiKey: string, prompt: string): Promise<string> {
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
  if (!candidate) {
    throw new Error("Gemini returned empty content");
  }
  return candidate;
}

/** Call the Groq API directly (server-side, no /api/chat round-trip). */
async function callGroqDirect(apiKey: string, prompt: string): Promise<string> {
  const groqModel = "llama-3.3-70b-versatile";
  const groqRes = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: prompt }] }),
  });

  if (!groqRes.ok) {
    const text = await groqRes.text();
    throw new Error(`Groq API error: ${groqRes.status} — ${text}`);
  }

  const groqData = await groqRes.json();
  const groqContent = groqData?.choices?.[0]?.message?.content;
  if (!groqContent) {
    throw new Error("Groq returned empty content");
  }
  return groqContent;
}

function isExhaustedError(message: string): boolean {
  return /(quota|rate[ _-]?limit|resource[ _]?exceeded|exceeded your current quota|insufficient[ _]quota|billing|credit balance|payment required|too many requests|quota exceeded|free tier|daily limit|429|402)/i.test(message || "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      provider, 
      prompt, 
      apiKey, 
      geminiApiKey, 
      groqApiKey, 
      test = false, 
      searchQuery, 
      searchEnabled = false 
    } = body as {
      provider: "gemini" | "groq";
      prompt: string;
      apiKey: string;
      geminiApiKey?: string;
      groqApiKey?: string;
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

    // Build the provider fallback chain: requested provider → other cloud provider → local model.
    const primary: { name: "gemini" | "groq"; key: string } = { name: provider, key: apiKey };
    const fallbackCloud: Array<{ name: "gemini" | "groq"; key: string }> = [];
    if (provider !== "gemini" && geminiApiKey) fallbackCloud.push({ name: "gemini", key: geminiApiKey });
    if (provider !== "groq" && groqApiKey) fallbackCloud.push({ name: "groq", key: groqApiKey });

    const callProvider = (p: { name: "gemini" | "groq"; key: string }) =>
      p.name === "gemini" ? callGeminiDirect(p.key, finalPrompt) : callGroqDirect(p.key, finalPrompt);

    let lastError: string | null = null;

    // 1) Primary cloud provider
    try {
      const content = await callProvider(primary);
      return NextResponse.json({ content, searchPerformed });
    } catch (err: any) {
      lastError = err?.message || String(err);
      // If the primary failed with a non-quota error, still try fallbacks.
    }

    // 2) Fallback cloud provider(s)
    for (const fb of fallbackCloud) {
      try {
        const content = await callProvider(fb);
        return NextResponse.json({ content, searchPerformed });
      } catch (err: any) {
        lastError = err?.message || String(err);
        continue;
      }
    }

    // 3) Local in-browser model as final backup (server-side attempt;
    //    if it cannot load/run here, the error below is returned).
    try {
      const localContent = await callDeepSeekWithTimeout(finalPrompt, LOCAL_MODEL_TIMEOUT_MS);
      return NextResponse.json({ content: localContent, searchPerformed });
    } catch {
      // Local model unavailable on server — fall through to error.
    }

    return NextResponse.json(
      { error: `All AI providers failed. Last error: ${lastError || "unknown"}` },
      { status: 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
