import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF";

let generator: any = null;
let isLoading = false;
let loadingProgress = 0;
let loadingStatus = "";
let progressCallbacks: Array<(progress: number, status: string) => void> = [];

export function onModelProgress(callback: (progress: number, status: string) => void) {
  progressCallbacks.push(callback);
  if (generator) {
    callback(100, "Model ready");
  } else if (isLoading) {
    callback(loadingProgress, loadingStatus);
  }
  return () => {
    progressCallbacks = progressCallbacks.filter(cb => cb !== callback);
  };
}

function notifyProgress(progress: number, status: string) {
  loadingProgress = progress;
  loadingStatus = status;
  progressCallbacks.forEach(cb => cb(progress, status));
}

export async function loadModel() {
  if (generator) return generator;
  if (isLoading) {
    return new Promise((resolve) => {
      const unsub = onModelProgress((progress, status) => {
        if (progress === 100) {
          unsub();
          resolve(generator);
        }
      });
    });
  }

  isLoading = true;
  notifyProgress(0, "Loading DeepSeek R1 model...");

  try {
    notifyProgress(10, "Initializing model pipeline...");
    
    generator = await pipeline("text-generation", MODEL_ID, {
      dtype: "q4f16",
      progress_callback: (data: any) => {
        if (data.status === "progress") {
          const pct = data.progress || 0;
          notifyProgress(10 + pct * 0.8, `Downloading: ${Math.round(pct)}%`);
        } else if (data.status === "ready") {
          notifyProgress(95, "Initializing...");
        }
      },
    });

    notifyProgress(100, "Model ready");
    isLoading = false;
    return generator;
  } catch (error) {
    isLoading = false;
    notifyProgress(0, `Error: ${error instanceof Error ? error.message : "Failed to load model"}`);
    throw error;
  }
}

export async function generateLocal(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    systemPrompt?: string;
  } = {}
): Promise<string> {
  const {
    maxTokens = 2048,
    temperature = 0.7,
    topP = 0.9,
    systemPrompt,
  } = options;

  const model = await loadModel();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const output = await model(messages, {
    max_new_tokens: maxTokens,
    temperature,
    top_p: topP,
    do_sample: true,
  });

  return output[0]?.generated_text?.slice(-1)[0]?.content || "";
}

export function isModelLoaded(): boolean {
  return generator !== null;
}

export function getModelStatus(): { loaded: boolean; loading: boolean; progress: number; status: string } {
  return {
    loaded: generator !== null,
    loading: isLoading,
    progress: loadingProgress,
    status: loadingStatus,
  };
}
