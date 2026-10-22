import type { ChapterFile, ThesisPaper } from "@/lib/thesis-types";

export interface ScholarCopilotInput {
  chapters: ChapterFile[];
  papers: ThesisPaper[];
  config: {
    topic: string;
    level: string;
    style: string;
  };
  /** Chapter number -> word target taken from the NurseStack dissertation plan. */
  wordTargets?: Record<number, number>;
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
}

export interface ChapterWordBudget {
  chapterNumber: number;
  title: string;
  target: number;
  actual: number;
  /** "on-target" | "short" | "over" | "no-target" */
  status: "on-target" | "short" | "over" | "no-target";
}

export interface ScholarCopilotOutput {
  chapters: ChapterFile[];
  fullThesis: string;
  subResult: { ok: boolean; error?: string };
  /** Per-chapter word budget after the copilot pass. */
  wordBudget: ChapterWordBudget[];
  /** True when every targeted chapter landed within ±12% of its word target. */
  wordBudgetMet: boolean;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function budgetStatus(target: number, actual: number): ChapterWordBudget["status"] {
  if (!target) return "no-target";
  if (actual < target * 0.88) return "short";
  if (actual > target * 1.12) return "over";
  return "on-target";
}

function refinePrompt(chapter: ChapterFile, papers: ThesisPaper[], cfg: any): string {
  const refs = papers.map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n");

  return `You are a senior academic editor. Refine and expand the chapter below. Validate every inline citation against the grounding papers.

TOPIC: ${cfg.topic}
LEVEL: ${cfg.level}
STYLE: ${cfg.style}
CHAPTER: ${chapter.chapterTitle}

GROUNDING PAPERS:
${refs}

CHAPTER CONTENT:
${chapter.content}

TASK:
1. Expand thin sections to meet the chapter's academic depth.
2. Ensure every inline (Author, Year) citation maps to a paper in the grounding list above; remove or flag unsupported citations.
3. Improve flow, tone, and academic rigor. Keep markdown structure.
4. Preserve headings, lists, and tables. Do not wrap the entire output in code fences.

Return ONLY a JSON object:
{
  "content": "refined markdown chapter text",
  "citations": ["Author 2020", "..."]
}`;
}

/**
 * Adjusts a chapter to its word budget. Used by the copilot when a chapter
 * came out shorter (or much longer) than the NurseStack plan requires.
 */
function wordBudgetPrompt(chapter: ChapterFile, papers: ThesisPaper[], cfg: any, target: number, actual: number): string {
  const refs = papers.map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n");
  const direction = actual < target ? "expand" : "condense";

  return `You are a senior academic editor working to a strict word budget.

TOPIC: ${cfg.topic}
LEVEL: ${cfg.level}
CHAPTER: ${chapter.chapterTitle}
CURRENT WORD COUNT: ${actual}
REQUIRED WORD COUNT: ${target} words (this chapter's allocation in the dissertation plan)

GROUNDING PAPERS (cite inline as (Author, Year)):
${refs}

CHAPTER CONTENT:
${chapter.content}

TASK:
1. ${direction === "expand" ? "Expand" : "Condense"} the chapter to ${Math.round(target * 0.95)}–${Math.round(target * 1.05)} words.
2. ${direction === "expand" ? "Add depth, evidence-linked analysis and clinical critical appraisal — never padding or repetition" : "Tighten the prose without dropping findings, citations or headings"}.
3. Keep every existing heading, table and list; keep inline citations that map to the grounding papers; never invent citations.
4. Keep markdown structure and do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "chapter text at the required length",
  "citations": ["Author 2020", "..."]
}`;
}

function parseChapterResponse(text: string): { content?: string; citations?: string[] } {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        /* fall through */
      }
    }
  }
  return {};
}

export async function scholarCopilot(input: ScholarCopilotInput): Promise<ScholarCopilotOutput> {
  const { chapters, papers, config, wordTargets, aiFn, onProgress } = input;
  const refined: ChapterFile[] = [];
  const wordBudget: ChapterWordBudget[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    onProgress?.(`Refining chapter ${i + 1} of ${chapters.length}: ${chapter.chapterTitle}`);

    let refinedContent = chapter.content;
    let citations = chapter.citations;
    try {
      const text = await aiFn(refinePrompt(chapter, papers, config));
      const parsed = parseChapterResponse(text);
      if (parsed.content) refinedContent = parsed.content;
      if (Array.isArray(parsed.citations)) citations = parsed.citations;
    } catch {
      /* keep original */
    }

    // Word-budget pass: the NurseStack plan allocates a word count per chapter,
    // so a chapter that came out short (or bloated) is adjusted to it.
    const target = wordTargets?.[chapter.chapterNumber] ?? 0;
    if (target > 0) {
      const actual = countWords(refinedContent);
      const status = budgetStatus(target, actual);
      if (status === "short" || status === "over") {
        onProgress?.(
          `Chapter ${chapter.chapterNumber} is ${status} (${actual}/${target} words); adjusting to the plan budget...`
        );
        try {
          const text = await aiFn(wordBudgetPrompt(chapter, papers, config, target, actual));
          const parsed = parseChapterResponse(text);
          if (parsed.content) refinedContent = parsed.content;
          if (Array.isArray(parsed.citations)) citations = parsed.citations;
        } catch {
          /* keep the refined version */
        }
      }
      wordBudget.push({
        chapterNumber: chapter.chapterNumber,
        title: chapter.chapterTitle,
        target,
        actual: countWords(refinedContent),
        status: budgetStatus(target, countWords(refinedContent)),
      });
    } else {
      wordBudget.push({
        chapterNumber: chapter.chapterNumber,
        title: chapter.chapterTitle,
        target: 0,
        actual: countWords(refinedContent),
        status: "no-target",
      });
    }

    refined.push({
      ...chapter,
      content: refinedContent,
      citations,
      wordCount: countWords(refinedContent),
    });
  }

  const fullThesis = refined
    .map((c) => `# Chapter ${c.chapterNumber}: ${c.chapterTitle}\n\n${c.content}\n`)
    .join("\n---\n\n");

  const targeted = wordBudget.filter((w) => w.status !== "no-target");
  const wordBudgetMet = targeted.length > 0 && targeted.every((w) => w.status === "on-target");

  return {
    chapters: refined,
    fullThesis,
    subResult: { ok: true },
    wordBudget,
    wordBudgetMet,
  };
}
