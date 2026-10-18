import type { ThesisChapter, ThesisSection, ThesisPaper, ArgumentAudit, ChapterFile } from "@/lib/thesis-types";
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
  const target = chapter.wordTarget || 2000;

  // Include section titles + word targets so the writer covers every section.
  const sectionsBlock = (chapter.sections || [])
    .map((s: any, si: number) => `- ${s.title || `Section ${si + 1}`}${s.wordTarget ? ` (~${s.wordTarget} words)` : ""}`)
    .join("\n") || "(no sections defined)";

  return `You are an academic writer. Write the full prose for ONE chapter of a thesis.

TOPIC: ${cfg.topic}
LEVEL: ${cfg.level}
STYLE: ${cfg.style}
LANGUAGE: ${cfg.language}
REPORTING GUIDELINE: ${guideline}
CHAPTER: ${chapter.title} (Chapter ${index})
CHAPTER WORD TARGET: ${target} words (prose only; references excluded)

SECTIONS TO COVER:
${sectionsBlock}

GROUNDING PAPERS (Vancouver style, cite inline as Author Year):
${refs}

TASK:
Write academic prose for every section listed above. Requirements:
- Write inline citations using (Author, Year) format, matching the numbered references above.
- Aim for ≥ 90% of the chapter word target (${Math.round(target * 0.9)}–${Math.round(target * 1.1)} words).
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
    onProgress?.(`Writing chapter ${i + 1} of ${chapterList.length}: ${chapter.title}`);

    let retries = 0;
    let chapterContent: any = null;
    while (retries < 2) {
      try {
        const text = await aiFn(chapterPrompt(chapter, papers, config, i + 1));
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("ThesisGenerator returned invalid JSON");
          parsed = JSON.parse(jsonMatch[0]);
        }

        const target = chapter.wordTarget || 2000;
        const wordCount = typeof parsed.wordCount === "number" ? parsed.wordCount : (parsed.content || "").split(/\s+/).length;

        // Word-count retry: if under 85% of target, retry demanding ≥ target words.
        if (wordCount < target * 0.85 && retries === 0) {
          retries++;
          onProgress?.(`Chapter ${chapter.title} below target (${wordCount}/${target}); retrying...`);
          continue;
        }

        chapterContent = parsed;
        break;
      } catch (err: any) {
        retries++;
        if (retries >= 2) {
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
