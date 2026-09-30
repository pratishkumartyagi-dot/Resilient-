const CHAT_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), CHAT_TIMEOUT_MS));
  return Promise.race([promise, timeout]);
}

export interface AICallOptions {
  searchQuery?: string;
  searchEnabled?: boolean;
}

// NOTE: Always use a relative URL so API calls follow whatever host/port the
// preview is actually served on (3000, custom --port, LAN IP, hosted preview
// URL). A hardcoded "http://localhost:3000" breaks the preview whenever the
// dev/prod server runs on any other port.

async function postChat(provider: "gemini" | "groq", apiKey: string, prompt: string, options?: AICallOptions): Promise<{ content: string; searchPerformed: boolean }> {
  const res = await withTimeout(fetch(`/api/chat`, {
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
