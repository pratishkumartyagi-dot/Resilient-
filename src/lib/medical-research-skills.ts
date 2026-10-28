import type { ThesisPaper, ChapterFile } from "@/lib/thesis-types";

export interface MedicalResearchSkillsInput {
  chapter: {
    number: number;
    title: string;
    sections?: Array<{ id: string; title: string; wordTarget?: number }>;
    wordTarget?: number;
  };
  papers: ThesisPaper[];
  config: {
    topic: string;
    level: string;
    style: string;
    language: string;
    studyDesign?: string;
    targetWordCount?: number;
  };
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
}

export interface MedicalResearchSkillsOutput {
  chapter: ChapterFile;
  subResult: { ok: boolean; error?: string };
}

function buildPrompt(input: MedicalResearchSkillsInput): string {
  const refs = input.papers
    .map((p, i) => `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.doi ? ` doi:${p.doi}` : ""}`)
    .join("\n");
  const chapterTarget = input.chapter.wordTarget || 2000;
  const sections = input.chapter.sections?.map((s) => `- ${s.title} (target ~${s.wordTarget || Math.round(chapterTarget / (input.chapter.sections?.length || 1))} words)`).join("\n") || "";

  return `You are using medical-research-skills methodology for evidence-based academic writing.

Write ONLY the prose for this chapter using ONLY the provided grounding papers. DO NOT invent references, citations, or studies.

TOPIC: ${input.config.topic}
LEVEL: ${input.config.level}
STYLE: ${input.config.style}
LANGUAGE: ${input.config.language}
CHAPTER ${input.chapter.number}: ${input.chapter.title}
CHAPTER WORD TARGET: ${chapterTarget} words

GROUNDING PAPERS (cite inline as (Author, Year) - ONLY from this list):
${refs}

SECTIONS:
${sections}

STRICT REQUIREMENTS:
- Write full academic prose for all sections. Aim for 90-110% of the chapter word target.
- Only cite papers from the grounding list above. Every (Author, Year) must correspond exactly to an entry.
- Do not add references not in the grounding list.
- Use evidence-based language, avoid speculation beyond what papers support.
- Include critical appraisal where relevant.
- Write in proper academic tone for ${input.config.level} level.
- Return ONLY the markdown chapter content with proper headings. No JSON, no code fences wrapping everything.`;
}

export async function generateChapterWithMedicalSkills(input: MedicalResearchSkillsInput): Promise<MedicalResearchSkillsOutput> {
  try {
    input.onProgress?.(`Writing ${input.chapter.title} with medical-research-skills...`);
    const text = await input.aiFn(buildPrompt(input));
    const content = text.replace(/```markdown/g, "").replace(/```/g, "").trim();
    
    const chapter: ChapterFile = {
      chapterNumber: input.chapter.number,
      chapterTitle: input.chapter.title,
      content,
      sections: input.chapter.sections || [],
      wordCount: content.split(/\s+/).filter(Boolean).length,
      citations: [],
      argumentAudit: { claims: [], evidenceGaps: [], logicalFlowScore: 0, citationCoverage: 0, recommendations: [] },
    };
    
    return { chapter, subResult: { ok: true } };
  } catch (err: any) {
    return { chapter: { chapterNumber: input.chapter.number, chapterTitle: input.chapter.title, content: "", sections: input.chapter.sections || [], wordCount: 0, citations: [], argumentAudit: { claims: [], evidenceGaps: [], logicalFlowScore: 0, citationCoverage: 0, recommendations: [] } }, subResult: { ok: false, error: err?.message } };
  }
}
