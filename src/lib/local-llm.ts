import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

// A small, browser-runnable instruct model with real ONNX weights.
// NOTE: Transformers.js only supports ONNX models (NOT GGUF). The previous
// GGUF model could never load in the browser. Qwen2.5-0.5B-Instruct is the
// canonical Transformers.js browser LLM and runs on WebGPU (with a WASM
// fallback for browsers without GPU access).
const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
export const LOCAL_MODEL_LABEL = "Qwen2.5 0.5B Instruct (in-browser)";

type Device = "webgpu" | "wasm";

let generator: any = null;
let loadPromise: Promise<unknown> | null = null;
let isLoading = false;
let loadingProgress = 0;
let loadingStatus = "";
let activeDevice: Device | null = null;
let progressCallbacks: Array<(progress: number, status: string) => void> = [];

export function onModelProgress(callback: (progress: number, status: string) => void) {
  progressCallbacks.push(callback);
  if (generator) {
    callback(100, "Model ready");
  } else if (isLoading) {
    callback(loadingProgress, loadingStatus);
  }
  return () => {
    progressCallbacks = progressCallbacks.filter((cb) => cb !== callback);
  };
}

function notifyProgress(progress: number, status: string) {
  loadingProgress = Math.max(0, Math.min(100, Math.round(progress)));
  loadingStatus = status;
  progressCallbacks.forEach((cb) => cb(loadingProgress, loadingStatus));
}

/**
 * Detects whether a usable WebGPU adapter is available. `navigator.gpu`
 * merely means the API exists; a locked-down VM or old GPU can still fail to
 * return an adapter, so we must actually request one.
 */
async function hasUsableWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined") return false;
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter !== null && adapter !== undefined;
  } catch {
    return false;
  }
}

function handleDownloadProgress(data: any) {
  const status = data?.status;
  if (status === "progress") {
    const pct = typeof data.progress === "number" ? data.progress : 0;
    const file = data.file ? ` ${String(data.file).split("/").pop()}` : "";
    // Map raw 0-100 download percentage into a 8-92 band so the bar always
    // shows some early motion and reserves headroom for warm-up.
    notifyProgress(8 + pct * 0.84, `Downloading model${file} — ${Math.round(pct)}%`);
  } else if (status === "initiate" || status === "download") {
    const file = data.file ? ` ${String(data.file).split("/").pop()}` : "";
    notifyProgress(Math.max(loadingProgress, 6), `Fetching model files${file}...`);
  } else if (status === "done") {
    notifyProgress(Math.max(loadingProgress, 92), "Preparing model...");
  } else if (status === "ready") {
    notifyProgress(96, "Warming up...");
  }
}

async function createPipeline(device: Device) {
  const dtype = device === "webgpu" ? "q4f16" : "q4";
  return pipeline("text-generation", MODEL_ID, {
    device,
    dtype,
    progress_callback: handleDownloadProgress,
  });
}

export async function loadModel() {
  if (generator) return generator;
  if (loadPromise) return loadPromise;

  if (typeof window === "undefined") {
    throw new Error("The local model can only run in the browser.");
  }

  isLoading = true;
  notifyProgress(2, "Initializing local model...");

  loadPromise = (async () => {
    const preferWebGPU = await hasUsableWebGPU();
    activeDevice = preferWebGPU ? "webgpu" : "wasm";
    notifyProgress(4, activeDevice === "webgpu" ? "Using WebGPU acceleration..." : "Using CPU (WASM) — this may be slow...");

    try {
      generator = await createPipeline(activeDevice);
    } catch (webgpuError) {
      // If WebGPU pipeline creation fails, retry once on WASM which works everywhere.
      if (activeDevice === "webgpu") {
        console.warn("WebGPU pipeline failed, falling back to WASM:", webgpuError);
        activeDevice = "wasm";
        notifyProgress(4, "WebGPU unavailable — falling back to CPU (WASM)...");
        generator = await createPipeline("wasm");
      } else {
        throw webgpuError;
      }
    }

    notifyProgress(100, "Model ready");
    isLoading = false;
    return generator;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    isLoading = false;
    loadPromise = null;
    generator = null;
    notifyProgress(0, `Error: ${error instanceof Error ? error.message : "Failed to load model"}`);
    throw new Error(
      `Local model failed to load: ${error instanceof Error ? error.message : "unknown error"}. ` +
        `Add a Gemini or Groq API key in Settings for reliable AI generation.`,
    );
  }
}

export async function generateLocal(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    systemPrompt?: string;
  } = {},
): Promise<string> {
  const {
    // Keep generation bounded so in-browser inference stays responsive.
    maxTokens = 1024,
    temperature = 0.7,
    topP = 0.9,
    systemPrompt = "You are a rigorous medical research assistant. Provide accurate, well-structured, evidence-based responses. Follow the requested output format precisely.",
  } = options;

  const model = await loadModel();

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const output = await model(messages, {
    max_new_tokens: Math.min(maxTokens, 1536),
    temperature,
    top_p: topP,
    do_sample: true,
    return_full_text: false,
  });

  const generated = output?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    return generated.at(-1)?.content ?? "";
  }
  if (typeof generated === "string") {
    return generated;
  }
  return "";
}

export function isModelLoaded(): boolean {
  return generator !== null;
}

export function getModelStatus(): {
  loaded: boolean;
  loading: boolean;
  progress: number;
  status: string;
  device: Device | null;
} {
  return {
    loaded: generator !== null,
    loading: isLoading,
    progress: loadingProgress,
    status: loadingStatus,
    device: activeDevice,
  };
}
