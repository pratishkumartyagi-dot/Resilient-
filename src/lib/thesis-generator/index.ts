import type { ThesisChapter, ThesisSection, ThesisPaper, ArgumentAudit, ChapterFile } from "@/lib/thesis-types";
import { LEVEL_WORD_RANGES } from "@/lib/thesis-types";
import { extractCitations } from "@/lib/references";

export interface ThesisGeneratorInput {
  outline: any;
  papers: ThesisPaper[];
  config: {
    topic: string;
    level: string;
    style: string;
    language: string;
    studyDesign?: string;
    targetWordCount?: number;
    maxReferences?: number;
  };
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
}

export interface ThesisGeneratorOutput {
  chapters: ChapterFile[];
  subResult: { ok: boolean; error?: string };
}

/**
 * Time budget for one chapter. A provider that never answers must not stall
 * the whole thesis: the chapter fails, the deterministic local generator takes
 * over and the pipeline moves on.
 */
const CHAPTER_TIMEOUT_MS = 180_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const REPORTING_GUIDELINES: Record<string, string> = {
  rct: "CONSORT",
  observational: "STROBE",
  case_series: "CARE",
  review: "PRISMA",
  other: "none",
};

function chapterPrompt(chapter: any, papers: ThesisPaper[], cfg: any, index: number): string {
  const refs = papers.map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n");
  const guideline = REPORTING_GUIDELINES[cfg.studyDesign || "other"] || "none";
  const range = LEVEL_WORD_RANGES[cfg.level as keyof typeof LEVEL_WORD_RANGES] ?? LEVEL_WORD_RANGES.master;
  const levelTarget = Math.round((range.min + range.max) / 2);
  const chapterTarget = chapter.wordTarget || Math.floor(levelTarget / Math.max((cfg as any).outline?.chapters?.length || 1, 1)) || 2000;
  const totalTarget = cfg.targetWordCount || levelTarget;

  return `You are an academic writer. Write the full prose for ONE chapter of a thesis.

TOPIC: ${cfg.topic}
LEVEL: ${cfg.level}
STYLE: ${cfg.style}
LANGUAGE: ${cfg.language}
REPORTING GUIDELINE: ${guideline}
CHAPTER: ${chapter.title} (Chapter ${index})
CHAPTER WORD TARGET: ${chapterTarget} words (prose only; references excluded)
TOTAL THESIS TARGET: ${totalTarget} words (${range.min}–${range.max} acceptable range)

GROUNDING PAPERS (Vancouver style, cite inline as Author Year):
${refs}

TASK:
Write academic prose for every section of this chapter. Requirements:
- Write inline citations using (Author, Year) format, matching the numbered references above.
- Aim for ≥ 90% of the chapter word target (${Math.round(chapterTarget * 0.9)}–${Math.round(chapterTarget * 1.1)} words).
- Target < 2% plagiarism; write originally, do not copy abstracts.
- Markdown-only output. Use headings for sections.
- Include at least one summary table and one figure placeholder per chapter where data permit (e.g., | Characteristic | Value | ... | and ![Figure 1: ...](...) ).
- Preserve any headings/lists/tables exactly; do not wrap the whole chapter in code fences.

Return ONLY a JSON object (no markdown fences, no extra text):
{
  "content": "full markdown chapter text",
  "sections": [{ "id": "string", "title": "string", "content": "string" }],
  "wordCount": number,
  "citations": ["Author 2020", "..."]
}`;
}

function auditPrompt(chapter: any, content: string): string {
  return `You are a thesis editor. Audit the chapter below and return an argument audit.

CHAPTER: ${chapter.title}

CONTENT:
${content}

Return ONLY a JSON object:
{
  "claims": ["claim 1", "claim 2"],
  "evidenceGaps": ["gap 1", "gap 2"],
  "logicalFlowScore": 0-100,
  "citationCoverage": 0-100,
  "recommendations": ["rec 1", "rec 2"]
}`;
}

export async function generateThesis(input: ThesisGeneratorInput): Promise<ThesisGeneratorOutput> {
  const { outline, papers, config, aiFn, onProgress } = input;
  const chapters: ChapterFile[] = [];

  const chapterList: any[] = outline.chapters || [];
  for (let i = 0; i < chapterList.length; i++) {
    const chapter = chapterList[i];
    const target = chapter.wordTarget || 2000;
    onProgress?.(
      `Writing chapter ${i + 1} of ${chapterList.length}: ${chapter.title} (target ${target.toLocaleString()} words)`
    );

    let retries = 0;
    let chapterContent: any = null;
    while (retries < 2) {
      try {
        const text = await withTimeout(
          aiFn(chapterPrompt(chapter, papers, config, i + 1)),
          CHAPTER_TIMEOUT_MS,
          `Chapter ${chapter.title} timed out after ${Math.round(CHAPTER_TIMEOUT_MS / 1000)}s`
        );
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("ThesisGenerator returned invalid JSON");
          parsed = JSON.parse(jsonMatch[0]);
        }

        const wordCount = typeof parsed.wordCount === "number" ? parsed.wordCount : (parsed.content || "").split(/\s+/).length;

        // Word-count retry: if under target, retry (up to 3 times) demanding ≥ target words.
        if (wordCount < target * 0.9 && retries < 3) {
          retries++;
          onProgress?.(
            `Chapter ${chapter.title} below target (${wordCount}/${target} words); expanding… (attempt ${retries})`
          );
          continue;
        }

        chapterContent = parsed;
        break;
      } catch (err: any) {
        retries++;
        if (retries >= 3) {
          onProgress?.(`Chapter ${chapter.title} failed: ${err?.message || "unknown"}`);
          chapterContent = { content: `# ${chapter.title}\n\nGeneration failed.`, sections: [], wordCount: 0, citations: [] };
        }
      }
    }

    if (!chapterContent) continue;

    // Argument audit per chapter
    let audit: ArgumentAudit = {
      claims: [],
      evidenceGaps: [],
      logicalFlowScore: 0,
      citationCoverage: 0,
      recommendations: [],
    };
    try {
      const auditText = await aiFn(auditPrompt(chapter, chapterContent.content || ""));
      const cleaned = auditText.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }
      audit = {
        claims: Array.isArray(parsed.claims) ? parsed.claims : [],
        evidenceGaps: Array.isArray(parsed.evidenceGaps) ? parsed.evidenceGaps : [],
        logicalFlowScore: typeof parsed.logicalFlowScore === "number" ? parsed.logicalFlowScore : 0,
        citationCoverage: typeof parsed.citationCoverage === "number" ? parsed.citationCoverage : 0,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch {
      /* keep default audit */
    }

    const citations = extractCitations(chapterContent.content || "");
    chapters.push({
      chapterNumber: chapter.number || i + 1,
      chapterTitle: chapter.title || `Chapter ${i + 1}`,
      content: chapterContent.content || "",
      sections: (chapterContent.sections || []).map((s: any) => ({
        id: s.id || `s${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        title: s.title || "Section",
        wordTarget: s.wordTarget,
        content: s.content,
      })),
      wordCount: typeof chapterContent.wordCount === "number" ? chapterContent.wordCount : (chapterContent.content || "").split(/\s+/).length,
      citations,
      argumentAudit: audit,
    });
  }

  return { chapters, subResult: { ok: chapters.length > 0, error: chapters.length === 0 ? "No chapters generated" : undefined } };
}
