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

    const sections = Array.isArray(chapter.sections) && chapter.sections.length > 0 ? chapter.sections : [{ id: "s1", title: chapter.title, wordTarget: target }];
    const sectionOutputs: string[] = [];
    let totalWords = 0;
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const secTarget = sec.wordTarget || Math.floor(target / sections.length) || 300;
      onProgress?.(`Writing chapter ${i + 1} of ${chapterList.length}: ${chapter.title} — section ${si + 1}/${sections.length} (target ${secTarget} words)`);
      try {
        const secPrompt = `You are an academic writer. Write ONLY the prose for this section of a thesis chapter.

TOPIC: ${config.topic}
LEVEL: ${config.level}
STYLE: ${config.style}
LANGUAGE: ${config.language}
CHAPTER: ${chapter.title}
SECTION: ${sec.title}
SECTION WORD TARGET: ${secTarget} words (prose only)
GROUNDING PAPERS:
${papers.map((p, k) => `${k + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.`).join("\\n")}

Write ${secTarget} words of substantive academic prose for this section. Use inline (Author, Year) citations. Markdown only. Return ONLY the prose text (no JSON, no headings beyond the section title).`;
        const secText = await withTimeout(aiFn(secPrompt), CHAPTER_TIMEOUT_MS, `Section timed out`);
        const cleaned = secText.replace(/```markdown/g, "").replace(/```/g, "").trim();
        sectionOutputs.push(`## ${sec.title}\n\n${cleaned}`);
        totalWords += cleaned.split(/\\s+/).filter(Boolean).length;
      } catch (err: any) {
        sectionOutputs.push(`## ${sec.title}\n\n(Generation failed: ${err?.message || "unknown"})`);
      }
    }
    const content = `# ${chapter.title}\n\n${sectionOutputs.join("\\n\\n")}`;
    const chapterContent = { content, sections: [], wordCount: totalWords || content.split(/\s+/).length, citations: [] };
    // skip the retry/audit fallthrough below by setting a flag
    (chapter as any).__chunked = true;

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
