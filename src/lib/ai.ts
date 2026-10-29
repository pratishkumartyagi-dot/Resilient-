const CHAT_TIMEOUT_MS = 60_000;
/** Time budget for the in-browser model (including the one-off model load). */
const LOCAL_MODEL_TIMEOUT_MS = 120_000;

export interface AICallOptions {
  searchQuery?: string;
  searchEnabled?: boolean;
}

export type AiProviderName = "gemini" | "groq" | "local";

export interface AiFallbackEvent {
  /** Provider whose output was actually used. */
  provider: AiProviderName;
  /** Provider that failed first (undefined when the first choice worked). */
  failedProvider?: AiProviderName;
  /** The upstream error message. */
  reason?: string;
  /** True when the failure looked like an exhausted quota / rate limit. */
  exhausted: boolean;
  at: number;
}

/**
 * Error raised by a provider call. It keeps the upstream HTTP status so the
 * caller can tell "the quota is used up" from "the request was malformed".
 */
export class AiProviderError extends Error {
  provider: AiProviderName;
  status?: number;
  exhausted: boolean;

  constructor(provider: AiProviderName, message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.provider = provider;
    this.status = status;
    this.exhausted = isExhaustedMessage(message, status);
  }
}

const EXHAUSTED_PATTERN =
  /(quota|rate[ _-]?limit|resource[ _]?exhausted|exceeded your current quota|insufficient[ _]quota|billing|credit balance|payment required|too many requests|quota exceeded|free tier|daily limit|429|402)/i;

/** True when the message/status looks like an exhausted quota or rate limit. */
export function isExhaustedMessage(message: string, status?: number): boolean {
  if (status === 429 || status === 402) return true;
  return EXHAUSTED_PATTERN.test(message || "");
}

export function isProviderExhausted(error: unknown): boolean {
  if (error instanceof AiProviderError) return error.exhausted;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return isExhaustedMessage(message);
}

// ---------------------------------------------------------------------------
// Provider registry + fallback bookkeeping
// ---------------------------------------------------------------------------

interface AiKeys {
  gemini?: string;
  groq?: string;
}

let registeredKeys: AiKeys = {};

/**
 * Registers the API keys that are configured in the app so that a failing
 * provider can be replaced by the other one (and finally by the local model).
 */
export function configureAiKeys(keys: AiKeys): void {
  registeredKeys = { ...keys };
}

/** Providers that recently ran out of quota are skipped for a while. */
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const cooldowns = new Map<AiProviderName, number>();

function isCoolingDown(provider: AiProviderName): boolean {
  const until = cooldowns.get(provider);
  if (!until) return false;
  if (Date.now() < until) return true;
  cooldowns.delete(provider);
  return false;
}

function markExhausted(provider: AiProviderName): void {
  cooldowns.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}

export function getAiProviderStatus(): Record<AiProviderName, "ok" | "exhausted" | "unknown"> {
  const status: Record<AiProviderName, "ok" | "exhausted" | "unknown"> = { gemini: "unknown", groq: "unknown", local: "ok" };
  for (const provider of ["gemini", "groq"] as const) {
    if (isCoolingDown(provider)) status[provider] = "exhausted";
    else if (registeredKeys[provider]) status[provider] = "ok";
  }
  return status;
}

const fallbackListeners = new Set<(event: AiFallbackEvent) => void>();

export function subscribeAiFallback(listener: (event: AiFallbackEvent) => void): () => void {
  fallbackListeners.add(listener);
  return () => {
    fallbackListeners.delete(listener);
  };
}

function emitFallback(event: AiFallbackEvent): void {
  fallbackListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* a broken listener must not break the AI call */
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ai-fallback", { detail: event }));
  }
}

// NOTE: Always use a relative URL so API calls follow whatever host/port the
// preview is actually served on (3000, custom --port, LAN IP, hosted preview
// URL). A hardcoded "http://localhost:3000" breaks the preview whenever the
// dev/prod server runs on any other port.

async function postChat(provider: "gemini" | "groq", apiKey: string, prompt: string, options?: AICallOptions): Promise<{ content: string; searchPerformed: boolean }> {
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
    if (controller.signal.aborted) throw new AiProviderError(provider, "AI request timed out");
    throw new AiProviderError(provider, e instanceof Error ? e.message : "AI request failed");
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    let message = `AI request failed: ${res.status}`;
    try { const data = await res.json(); message = data?.error || message; } catch { /* ignore parse errors */ }
    throw new AiProviderError(provider, message, res.status);
  }
  const data = await res.json();
  return { content: data.content as string, searchPerformed: data.searchPerformed || false };
}

/** Raw provider call — no fallback. Used for key testing. */
async function callProvider(
  provider: "gemini" | "groq",
  apiKey: string,
  prompt: string,
  options?: AICallOptions
): Promise<string> {
  if (!apiKey) {
    throw new AiProviderError(provider, `No ${provider} API key is configured`);
  }
  const result = await postChat(provider, apiKey, prompt, options);
  return result.content;
}

export async function callDeepSeek(prompt: string, options?: AICallOptions): Promise<string> {
  // Lazy-load the in-browser model only when this fallback is actually used,
  // so @huggingface/transformers never enters the initial preview bundle.
  const { generateLocal, isModelLoaded, loadModel } = await import("./local-llm");
  if (!isModelLoaded()) {
    emitFallback({
      provider: "local",
      failedProvider: "local",
      reason: "Loading the in-browser model (Qwen2.5 1.5B) — this happens once and is then cached",
      exhausted: false,
      at: Date.now(),
    });
    await loadModel();
  }
  return await generateLocal(prompt, {
    maxTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
  });
}

/**
 * Runs the in-browser model with a hard time limit. Loading the model can take
 * minutes on a slow connection, and a long-form generation would exceed any
 * sensible budget, so the local model is only used when it answers in time —
 * otherwise the caller falls back to a deterministic local generator.
 */
export async function callDeepSeekWithTimeout(
  prompt: string,
  timeoutMs = LOCAL_MODEL_TIMEOUT_MS,
  options?: AICallOptions
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      callDeepSeek(prompt, options),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AiProviderError("local", `The local model did not answer within ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface FallbackOptions {
  /** Provider order to try. Defaults to gemini -> groq -> local. */
  order?: AiProviderName[];
  /** Skip the in-browser model and fail instead (used by key tests). */
  noFallback?: boolean;
  /** Keys to use instead of the registered ones. */
  keys?: AiKeys;
}

/**
 * Calls the AI with a backup chain.
 *
 * When Gemini or Groq runs out of quota (HTTP 429 / "quota exceeded") the
 * request is automatically retried with the other provider and finally with
 * the local in-browser model, so an AI job never simply dies on an exhausted
 * key. The fallback that was used is reported to the UI.
 */
export async function callAiWithFallback(
  prompt: string,
  options?: AICallOptions,
  config?: FallbackOptions
): Promise<string> {
  const order: AiProviderName[] = config?.order ?? ["gemini", "groq", "local"];
  const keys: AiKeys = { ...registeredKeys, ...(config?.keys || {}) };
  const failures: Array<{ provider: AiProviderName; error: AiProviderError }> = [];

  for (const provider of order) {
    if (provider !== "local" && isCoolingDown(provider)) {
      failures.push({
        provider,
        error: new AiProviderError(provider, `${provider} is in a cooldown after an exhausted quota`),
      });
      continue;
    }

    try {
      let content: string;
      if (provider === "gemini") {
        content = await callProvider("gemini", keys.gemini || "", prompt, options);
      } else if (provider === "groq") {
        content = await callProvider("groq", keys.groq || "", prompt, options);
      } else {
        content = await callDeepSeekWithTimeout(prompt, LOCAL_MODEL_TIMEOUT_MS, options);
      }

      if (failures.length > 0) {
        const first = failures[0]!;
        emitFallback({
          provider,
          failedProvider: first.provider,
          reason: first.error.message,
          exhausted: first.error.exhausted,
          at: Date.now(),
        });
      }
      return content;
    } catch (error) {
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(provider, error instanceof Error ? error.message : String(error));
      if (providerError.exhausted) markExhausted(provider);
      failures.push({ provider, error: providerError });
    }
  }

  const summary = failures
    .map((f) => `${f.provider}: ${f.error.message}`)
    .join(" | ");
  const exhausted = failures.some((f) => f.error.exhausted);
  throw new AiProviderError(
    "local",
    exhausted
      ? `Every AI provider is exhausted and the local backup could not be used. ${summary}`
      : `All AI providers failed. ${summary}`,
    failures[0]?.error.status
  );
}

/**
 * Gemini call. If Gemini fails (most often: the quota is used up) the request
 * is served by Groq and finally by the local in-browser model.
 */
export async function callGemini(apiKey: string, prompt: string, options?: AICallOptions): Promise<string> {
  try {
    return await callProvider("gemini", apiKey, prompt, options);
  } catch (error) {
    const providerError =
      error instanceof AiProviderError ? error : new AiProviderError("gemini", error instanceof Error ? error.message : String(error));
    if (providerError.exhausted) markExhausted("gemini");
    const backupOrder: AiProviderName[] = ["groq", "local"];
    if (!registeredKeys.groq) backupOrder.splice(0, 1);
    try {
      const content = await callAiWithFallback(prompt, options, { order: backupOrder });
      emitFallback({
        provider: backupOrder.find((p) => p !== "local") || "local",
        failedProvider: "gemini",
        reason: providerError.message,
        exhausted: providerError.exhausted,
        at: Date.now(),
      });
      return content;
    } catch {
      throw providerError;
    }
  }
}

/** Groq call, with the same backup chain (Groq -> Gemini -> local). */
export async function callGroq(apiKey: string, prompt: string, options?: AICallOptions): Promise<string> {
  try {
    return await callProvider("groq", apiKey, prompt, options);
  } catch (error) {
    const providerError =
      error instanceof AiProviderError ? error : new AiProviderError("groq", error instanceof Error ? error.message : String(error));
    if (providerError.exhausted) markExhausted("groq");
    const backupOrder: AiProviderName[] = ["gemini", "local"];
    if (!registeredKeys.gemini) backupOrder.splice(0, 1);
    try {
      const content = await callAiWithFallback(prompt, options, { order: backupOrder });
      emitFallback({
        provider: backupOrder.find((p) => p !== "local") || "local",
        failedProvider: "groq",
        reason: providerError.message,
        exhausted: providerError.exhausted,
        at: Date.now(),
      });
      return content;
    } catch {
      throw providerError;
    }
  }
}

export async function testGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callProvider("gemini", apiKey, "Hello, this is a test message. Please respond with OK.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function testGroqKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callProvider("groq", apiKey, "Hello, this is a test message. Please respond with OK.");
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
