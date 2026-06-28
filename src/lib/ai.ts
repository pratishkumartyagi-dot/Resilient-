export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "gemini", prompt, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Gemini request failed: ${res.status}`);
  return data.content as string;
}

export async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "groq", prompt, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Groq request failed: ${res.status}`);
  return data.content as string;
}

export async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "deepseek", prompt, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `DeepSeek request failed: ${res.status}`);
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
