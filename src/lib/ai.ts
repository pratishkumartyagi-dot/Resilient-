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

export async function callOpenRouter(apiKey: string, prompt: string, model = "gpt-oss-120b"): Promise<string> {
  const provider = model === "deepseek/deepseek-r1" ? "deepseek" : "openrouter";
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, prompt, apiKey, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `OpenRouter request failed: ${res.status}`);
  return data.content as string;
}

export async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  return callOpenRouter(apiKey, prompt, "deepseek/deepseek-r1");
}

export async function testGeminiKey(apiKey: string): Promise<boolean> {
  try {
    await callGemini(apiKey, "Hello, this is a test message. Please respond with OK.");
    return true;
  } catch {
    return false;
  }
}

export async function testOpenRouterKey(apiKey: string): Promise<boolean> {
  try {
    await callOpenRouter(apiKey, "Hello, this is a test message. Please respond with OK.");
    return true;
  } catch {
    return false;
  }
}

export async function testDeepSeekKey(apiKey: string): Promise<boolean> {
  try {
    await callDeepSeek(apiKey, "Hello, this is a test message. Please respond with OK.");
    return true;
  } catch {
    return false;
  }
}
