const CHAT_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), CHAT_TIMEOUT_MS));
  return Promise.race([promise, timeout]);
}

export interface AICallOptions {
  searchQuery?: string;
  searchEnabled?: boolean;
}

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

async function postChat(provider: "gemini" | "groq", apiKey: string, prompt: string, options?: AICallOptions): Promise<{ content: string; searchPerformed: boolean }> {
  const res = await withTimeout(fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, prompt, apiKey, searchQuery: options?.searchQuery, searchEnabled: options?.searchEnabled }),
  }));
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
