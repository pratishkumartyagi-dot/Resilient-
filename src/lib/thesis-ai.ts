import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import { fetchRealPapersWithCounts, type Paper } from "@/lib/database-apis";
import { formatVancouverReference } from "@/lib/references";
import type { ThesisPaper } from "@/lib/thesis-types";

export type ThesisAiProvider = "gemini" | "groq" | "qwen" | "mlc";

export function buildThesisAiFn(
  provider: ThesisAiProvider,
  apiKey: string,
): (prompt: string, opts?: AICallOptions) => Promise<string> {
  const callGeminiFn = (p: string, o?: AICallOptions) => callGemini(apiKey, p, o);
  const callGroqFn = (p: string, o?: AICallOptions) => callGroq(apiKey, p, o);
  const callQwenFn = (p: string, o?: AICallOptions) => callDeepSeek(p, o);

  // Try the selected provider first, then fall back to others.
  const ordered: Array<() => Promise<(p: string, o?: AICallOptions) => Promise<string>>> = [];
  if (provider === "gemini") {
    ordered.push(async () => callGeminiFn, async () => callGroqFn, async () => callQwenFn);
  } else if (provider === "groq") {
    ordered.push(async () => callGroqFn, async () => callGeminiFn, async () => callQwenFn);
  } else {
    ordered.push(async () => callQwenFn, async () => callGeminiFn, async () => callGroqFn);
  }

  return async (prompt: string, opts?: AICallOptions): Promise<string> => {
    let lastError: unknown;
    for (const getFn of ordered) {
      try {
        const fn = await getFn();
        return await fn(prompt, opts);
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    throw lastError || new Error("All AI providers failed");
  };
}

export interface ThesisSearchOptions {
  query: string;
  databases: string[];
  yearFrom?: number;
  yearTo?: number;
  studyDesign?: string;
}

export async function searchThesisPapers(opts: ThesisSearchOptions): Promise<Paper[]> {
  const databases = opts.databases.length > 0
    ? opts.databases
    : ["PubMed", "OpenAlex", "Europe PMC", "DOAJ", "bioRxiv", "medRxiv", "Crossref", "arXiv", "OpenAIRE", "Semantic Scholar"];

  const { papers } = await fetchRealPapersWithCounts(
    opts.query,
    databases,
    opts.yearFrom?.toString(),
    opts.yearTo?.toString(),
    opts.studyDesign || undefined,
  );

  return papers;
}

export function toThesisPaper(p: Paper): ThesisPaper {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors,
    journal: p.journal,
    year: p.year,
    doi: p.doi,
    abstract: p.abstract,
    database: p.database,
    studyType: p.studyType,
    url: p.url,
  };
}

export function vancouverRef(p: ThesisPaper): string {
  return formatVancouverReference({
    authors: p.authors,
    title: p.title,
    journal: p.journal,
    year: p.year,
    doi: p.doi,
  });
}
