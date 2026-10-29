import type { ChapterFile, ThesisPaper } from "@/lib/thesis-types";

export interface NotebookSource {
  id: string;
  title: string;
  content: string;
  type: "paper" | "url" | "note" | "excerpt";
  authors?: string;
  year?: number;
  doi?: string;
  url?: string;
  addedAt: number;
}

export interface NotebookState {
  sources: NotebookSource[];
  selectedSourceIds: string[];
}

export function emptyNotebook(): NotebookState {
  return { sources: [], selectedSourceIds: [] };
}

export function addSource(
  notebook: NotebookState,
  source: Omit<NotebookSource, "id" | "addedAt">,
): NotebookState {
  const id = `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...notebook,
    sources: [...notebook.sources, { ...source, id, addedAt: Date.now() }],
  };
}

export function removeSource(notebook: NotebookState, id: string): NotebookState {
  return {
    ...notebook,
    sources: notebook.sources.filter((s) => s.id !== id),
    selectedSourceIds: notebook.selectedSourceIds.filter((sid) => sid !== id),
  };
}

export function selectSource(notebook: NotebookState, id: string, selected: boolean): NotebookState {
  const ids = new Set(notebook.selectedSourceIds);
  if (selected) ids.add(id);
  else ids.delete(id);
  return { ...notebook, selectedSourceIds: Array.from(ids) };
}

export function getSelectedSources(notebook: NotebookState): NotebookSource[] {
  const selected = new Set(notebook.selectedSourceIds);
  return notebook.sources.filter((s) => selected.has(s.id));
}

export function buildNotebookContext(notebook: NotebookState): string {
  const sources = getSelectedSources(notebook);
  if (sources.length === 0) return "";
  const blocks = sources.map((s) => {
    const header = [
      `## ${s.title}`,
      s.type === "paper" && s.authors ? `Authors: ${s.authors}` : null,
      s.type === "paper" && s.year ? `Year: ${s.year}` : null,
      s.doi ? `DOI: ${s.doi}` : null,
      s.url ? `URL: ${s.url}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    return `${header}\n${s.content}\n`;
  });
  return `NOTEBOOK SOURCES:\n${blocks.join("\n---\n\n")}\n`;
}

/**
 * Build an expansion prompt that grounds chapter extension in the selected
 * notebook sources, mirroring Open Notebook's "chat with your sources"
 * capability.
 */
export function expandChapterPrompt(
  chapter: ChapterFile,
  notebookContext: string,
  cfg: { topic: string; level: string; style: string; language: string },
  targetWords: number,
  currentWords: number,
): string {
  const deficit = Math.max(targetWords - currentWords, 1);
  return `You are an academic thesis editor. Expand the chapter below using the notebook sources as evidence, adding substantive detail — never padding.

TOPIC: ${cfg.topic}
LEVEL: ${cfg.level}
STYLE: ${cfg.style}
LANGUAGE: ${cfg.language}
CHAPTER: ${chapter.chapterTitle}
CURRENT WORD COUNT: ${currentWords}
TARGET WORD COUNT: ${targetWords}
ADD APPROXIMATELY ${deficit} WORDS.

NOTEBOOK SOURCES (ground every new claim here; cite inline as (Author, Year)):
${notebookContext}

CHAPTER CONTENT:
${chapter.content}

TASK:
1. Expand thin sections with deeper explanation, evidence-linked analysis, methodological detail, clinical implications, and limitations.
2. Every new factual claim must carry an inline (Author, Year) citation drawn from the notebook sources above.
3. Do not invent citations not present in the notebook sources.
4. Preserve all headings, lists, tables, and existing citations.
5. Return ONLY the expanded markdown chapter text (no code fences, no preamble).

Write in ${cfg.language} academic tone suitable for a ${cfg.level} thesis.`;
}

export function parseChapterResponse(text: string): string {
  const cleaned = text.replace(/```markdown/g, "").replace(/```md/g, "").replace(/```/g, "").trim();
  return cleaned;
}

export interface ExpandChapterOptions {
  targetWords: number;
  maxPasses?: number;
  onProgress?: (msg: string) => void;
}

/**
 * Iteratively expand a chapter until it reaches its word target or maxPasses.
 * Each pass calls the AI with the notebook sources as grounding context.
 */
export async function expandChapter(
  chapter: ChapterFile,
  notebook: NotebookState,
  cfg: { topic: string; level: string; style: string; language: string },
  aiFn: (prompt: string) => Promise<string>,
  opts: ExpandChapterOptions,
): Promise<{ content: string; words: number; passes: number }> {
  const { maxPasses = 3, onProgress } = opts;
  const notebookContext = buildNotebookContext(notebook);
  let content = chapter.content;
  let passes = 0;

  for (let i = 0; i < maxPasses; i++) {
    const words = content.split(/\s+/).filter(Boolean).length;
    if (words >= opts.targetWords) break;

    passes++;
    onProgress?.(`Expanding chapter ${chapter.chapterTitle} (${words}/${opts.targetWords} words)...`);

    try {
      const prompt = expandChapterPrompt(
        { ...chapter, content },
        notebookContext,
        cfg,
        opts.targetWords,
        words,
      );
      const expanded = await aiFn(prompt);
      const next = parseChapterResponse(expanded);
      if (next.length > 0) content = next;
    } catch {
      break;
    }
  }

  const words = content.split(/\s+/).filter(Boolean).length;
  return { content, words, passes };
}

export interface SourceFromPaperInput {
  paper: ThesisPaper;
  excerpt?: string;
}

export function sourceFromPaper(paper: ThesisPaper, excerpt?: string): Omit<NotebookSource, "id" | "addedAt"> {
  const content = excerpt || paper.abstract || paper.title;
  return {
    title: paper.title,
    content,
    type: "paper",
    authors: paper.authors,
    year: paper.year,
    doi: paper.doi,
    url: paper.url,
  };
}
