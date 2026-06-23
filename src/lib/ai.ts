export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) throw new Error("Gemini returned empty content");
  return candidate;
}

export async function callOpenRouter(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${encodeURIComponent(apiKey)}`,
    },
    body: JSON.stringify({
      model: "gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content");
  return content;
}

export async function testGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const result = await callGemini(apiKey, "Hello, this is a test message. Please respond with OK.");
    return result.toLowerCase().includes("ok");
  } catch {
    return false;
  }
}

export async function testOpenRouterKey(apiKey: string): Promise<boolean> {
  try {
    const result = await callOpenRouter(apiKey, "Hello, this is a test message. Please respond with OK.");
    return result.toLowerCase().includes("ok");
  } catch {
    return false;
  }
}
