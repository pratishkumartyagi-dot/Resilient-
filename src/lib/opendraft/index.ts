import type { ThesisOutline, ThesisChapter, ThesisSection, ThesisLevel, ThesisPipelineStats } from "@/lib/thesis-types";

const LEVEL_WORD_RANGES: Record<ThesisLevel, { min: number; max: number }> = {
  research_paper: { min: 3000, max: 5000 },
  case_series: { min: 1500, max: 2500 },
  bachelor: { min: 8000, max: 15000 },
  master: { min: 15000, max: 40000 },
  phd: { min: 60000, max: 100000 },
};

export interface OpenDraftInput {
  topic: string;
  level: ThesisLevel;
  style: string;
  language: string;
  papers: Array<{ title: string; authors: string; year?: number; doi?: string }>;
  aiFn: (prompt: string) => Promise<string>;
}

export interface OpenDraftOutput {
  outline: ThesisOutline;
  markdownOutline: string;
  subResult: { ok: boolean; error?: string };
}

function rangeForLevel(level: ThesisLevel): { min: number; max: number } {
  return LEVEL_WORD_RANGES[level] ?? LEVEL_WORD_RANGES.master;
}

function buildPrompt(input: OpenDraftInput): string {
  const range = rangeForLevel(input.level);
  const paperList = input.papers
    .slice(0, 20)
    .map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`)
    .join("\n");

  return `You are an expert academic editor. Create a detailed thesis outline for the topic below.

TOPIC: ${input.topic}
LEVEL: ${input.level}
STYLE: ${input.style}
LANGUAGE: ${input.language}
TARGET WORD RANGE: ${range.min}–${range.max} words (body only, references excluded)

AVAILABLE GROUNDING PAPERS:
${paperList}

TASK:
Produce a thesis outline with:
1. A working title
2. An abstract (~250 words)
3. Chapters, each with:
   - chapter number
   - chapter title
   - sections (each with a title and an indicative word target)
   - a chapter-level word target

Distribute the total word target across chapters proportionally. Typical chapters: Introduction, Literature Review, Methodology, Results, Discussion, Conclusion, References (references excluded from word count).

Return ONLY a JSON object (no markdown fences, no extra text) with this exact schema:
{
  "title": "string",
  "abstract": "string",
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "wordTarget": number,
      "sections": [
        { "id": "s1-1", "title": "string", "wordTarget": number }
      ]
    }
  ]
}`;
}

export async function openDraft(input: OpenDraftInput): Promise<OpenDraftOutput> {
  const start = Date.now();
  try {
    const text = await input.aiFn(buildPrompt(input));
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("OpenDraft returned invalid JSON");
      parsed = JSON.parse(jsonMatch[0]);
    }

    const chapters: ThesisChapter[] = (parsed.chapters || []).map((c: any, idx: number) => ({
      number: c.number ?? idx + 1,
      title: c.title || `Chapter ${idx + 1}`,
      wordTarget: typeof c.wordTarget === "number" ? c.wordTarget : 0,
      sections: (c.sections || []).map((s: any, sidx: number) => ({
        id: s.id ?? `c${c.number ?? idx + 1}-s${sidx + 1}`,
        title: s.title || `Section ${sidx + 1}`,
        wordTarget: typeof s.wordTarget === "number" ? s.wordTarget : 0,
      })),
    }));

    const outline: ThesisOutline = {
      title: parsed.title || input.topic,
      abstract: parsed.abstract || "",
      chapters,
    };

    const markdownOutline = `# ${outline.title}\n\n## Abstract\n\n${outline.abstract}\n\n` +
      outline.chapters.map((c) => `## Chapter ${c.number}: ${c.title}\n` +
        c.sections.map((s) => `### ${s.title}\n`).join("\n")).join("\n");

    return {
      outline,
      markdownOutline,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      outline: { title: input.topic, abstract: "", chapters: [] },
      markdownOutline: `# ${input.topic}\n\n## Abstract\n\nOutline generation failed.\n`,
      subResult: { ok: false, error: err?.message || "OpenDraft failed" },
    };
  } finally {
    // no-op; timing captured by caller
  }
}
