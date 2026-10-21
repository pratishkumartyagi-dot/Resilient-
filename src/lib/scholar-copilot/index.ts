import type { ChapterFile, ThesisPaper } from "@/lib/thesis-types";

export interface ScholarCopilotInput {
  chapters: ChapterFile[];
  papers: ThesisPaper[];
  config: {
    topic: string;
    level: string;
    style: string;
  };
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
}

export interface ScholarCopilotOutput {
  chapters: ChapterFile[];
  fullThesis: string;
  subResult: { ok: boolean; error?: string };
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

export async function scholarCopilot(input: ScholarCopilotInput): Promise<ScholarCopilotOutput> {
  const { chapters, papers, config, aiFn, onProgress } = input;
  const refined: ChapterFile[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    onProgress?.(`Refining chapter ${i + 1} of ${chapters.length}: ${chapter.chapterTitle}`);

    let refinedContent = chapter.content;
    let citations = chapter.citations;
    try {
      const text = await aiFn(refinePrompt(chapter, papers, config));
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }
      if (parsed.content) refinedContent = parsed.content;
      if (Array.isArray(parsed.citations)) citations = parsed.citations;
    } catch {
      /* keep original */
    }

    refined.push({
      ...chapter,
      content: refinedContent,
      citations,
      wordCount: (refinedContent.split(/\s+/).length),
    });
  }

  const fullThesis = refined
    .map((c) => `# Chapter ${c.chapterNumber}: ${c.chapterTitle}\n\n${c.content}\n`)
    .join("\n---\n\n");

  return {
    chapters: refined,
    fullThesis,
    subResult: { ok: true },
  };
}
