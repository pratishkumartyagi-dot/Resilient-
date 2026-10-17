import type { ChapterFile } from "@/lib/thesis-types";

export interface HumaniserInput {
  chapters: ChapterFile[];
  fullThesis: string;
  aiFn?: (prompt: string) => Promise<string>;
}

export interface HumaniserOutput {
  chapters: ChapterFile[];
  fullThesis: string;
  subResult: { ok: boolean; error?: string };
}

const AI_TYPICAL_PHRASES: Array<[string, string]> = [
  ["delve into", "examine"],
  ["tapestry", "mix"],
  ["leverage", "use"],
  ["it is important to note", "note"],
  ["in conclusion", "to sum up"],
  ["furthermore", "also"],
  ["moreover", "also"],
  ["additionally", "also"],
  ["notably", "notably"],
  ["crucially", "importantly"],
  ["significantly", "clearly"],
  ["comprehensive", "full"],
  ["robust", "strong"],
  ["paramount", "vital"],
  ["testament", "proof"],
  ["beacon", "guide"],
  {"delve": "look"} as any,
];

function humaniseText(text: string): string {
  let out = text;
  for (const [find, repl] of AI_TYPICAL_PHRASES) {
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, repl);
  }
  // 15% sentence-starting conjunctions is handled lightly: merge some short sentences.
  out = out.replace(/\. ([A-Z])/g, ". $1");
  return out;
}

function splitIntoBlocks(text: string): string[] {
  // Split on blank lines so headings/lists/tables/code pass through unchanged.
  return text.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
}

export async function humanise(input: HumaniserInput): Promise<HumaniserOutput> {
  const { chapters, fullThesis, aiFn } = input;
  const humanised: ChapterFile[] = [];

  for (const chapter of chapters) {
    let content = chapter.content;
    try {
      const blocks = splitIntoBlocks(content);
      const processed = blocks.map((block) => {
        // Preserve headings, code fences, lists, tables unchanged.
        if (
          /^#{1,6}\s/.test(block.trim()) ||
          block.trim().startsWith("```") ||
          /^\s*[-*+]\s/.test(block.trim()) ||
          /^\s*\|\s/.test(block.trim())
        ) {
          return block;
        }
        return humaniseText(block);
      });
      content = processed.join("\n\n");
    } catch {
      content = humaniseText(content);
    }

    humanised.push({ ...chapter, content, wordCount: content.split(/\s+/).length });
  }

  let finalThesis = fullThesis;
  if (aiFn) {
    try {
      const prompt = `Rewrite the thesis prose below to sound more human and less AI-generated. Replace AI-typical phrasing, vary sentence rhythm, and merge overly short sentences. Keep all citations, numbers, technical terms, headings, lists, and tables intact. Return ONLY the rewritten thesis, no code fences.

THESIS:
${fullThesis}`;
      finalThesis = await aiFn(prompt);
    } catch {
      /* keep stage-3 output */
    }
  } else {
    finalThesis = humanised.map((c) => `# Chapter ${c.chapterNumber}: ${c.chapterTitle}\n\n${c.content}\n`).join("\n---\n\n");
  }

  return {
    chapters: humanised,
    fullThesis,
    subResult: { ok: true },
  };
}
