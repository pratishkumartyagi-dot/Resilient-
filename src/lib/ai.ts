const CHAT_TIMEOUT_MS = 60_000;

export interface AICallOptions {
  searchQuery?: string;
  searchEnabled?: boolean;
}

// Detect server-side (Node) runtime where relative /api/chat URLs cannot resolve.
const IS_SERVER = typeof window === "undefined";

async function callGeminiDirect(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGroqDirect(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function postChat(provider: "gemini" | "groq", apiKey: string, prompt: string, options?: AICallOptions): Promise<{ content: string; searchPerformed: boolean }> {
  // Server-side: call provider APIs directly (relative /api/chat cannot resolve in Node).
  if (IS_SERVER) {
    let content: string;
    if (provider === "gemini") {
      content = await callGeminiDirect(apiKey, prompt);
    } else if (provider === "groq") {
      content = await callGroqDirect(apiKey, prompt);
    } else {
      throw new Error(`Provider ${provider} not available server-side`);
    }
    return { content, searchPerformed: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, prompt, apiKey, searchQuery: options?.searchQuery, searchEnabled: options?.searchEnabled }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new Error("AI request timed out");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    let message = `AI request failed: ${res.status}`;
    try { const data = await res.json(); message = data?.error || message; } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  const data = await res.json();
  return { content: data.content as string, searchPerformed: data.searchPerformed || false };
}

export async function callGemini(apiKey: string, prompt: string, options?: AICallOptions): Promise<string> {
  const result = await postChat("gemini", apiKey, prompt, options);
  return result.content;
}

export async function callGroq(apiKey: string, prompt: string, options?: AICallOptions): Promise<string> {
  const result = await postChat("groq", apiKey, prompt, options);
  return result.content;
}

export async function callDeepSeek(prompt: string, options?: AICallOptions): Promise<string> {
  // Lazy-load the in-browser model only when this fallback is actually used,
  // so @huggingface/transformers never enters the initial preview bundle.
  const { generateLocal, isModelLoaded, loadModel } = await import("./local-llm");
  if (!isModelLoaded()) {
    await loadModel();
  }
  return await generateLocal(prompt, {
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
  });
}

export async function testGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callGemini(apiKey, "Hello, this is a test message. Please respond with OK.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function testGroqKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callGroq(apiKey, "Hello, this is a test message. Please respond with OK.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function testDeepSeekKey(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { generateLocal, loadModel } = await import("./local-llm");
    await loadModel();
    await generateLocal("Hello, this is a test message. Please respond with OK.", { maxTokens: 50 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
