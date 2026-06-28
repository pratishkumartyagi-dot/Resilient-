const CHAT_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), CHAT_TIMEOUT_MS));
  return Promise.race([promise, timeout]);
}

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await withTimeout(fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "gemini", prompt, apiKey }),
  }));
  if (!res.ok) {
    let message = `Gemini request failed: ${res.status}`;
    try { const data = await res.json(); message = data?.error || message; } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  const data = await res.json();
  return data.content as string;
}

export async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const res = await withTimeout(fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "groq", prompt, apiKey }),
  }));
  if (!res.ok) {
    let message = `Groq request failed: ${res.status}`;
    try { const data = await res.json(); message = data?.error || message; } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  const data = await res.json();
  return data.content as string;
}

export async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  const res = await withTimeout(fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "deepseek", prompt, apiKey }),
  }));
  if (!res.ok) {
    let message = `DeepSeek request failed: ${res.status}`;
    try { const data = await res.json(); message = data?.error || message; } catch { /* ignore parse errors */ }
    throw new Error(message);
  }
  const data = await res.json();
  return data.content as string;
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

export async function testDeepSeekKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callDeepSeek(apiKey, "Hello, this is a test message. Please respond with OK.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
