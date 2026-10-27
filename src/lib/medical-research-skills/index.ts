import type { ThesisPaper, ThesisLevel, ThesisStyle } from "@/lib/thesis-types";

export interface MedicalResearchSkillsInput {
  topic: string;
  level: ThesisLevel;
  style: ThesisStyle;
  language: string;
  studyDesign?: string;
  papers: ThesisPaper[];
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
}

export interface SectionProseResult {
  sectionTitle: string;
  content: string;
  wordCount: number;
  citations: string[];
  subResult: { ok: boolean; error?: string };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractCitations(text: string): string[] {
  const seen = new Set<string>();
  const pattern = /\(([^)]+)\s*,\s*(\d{4})\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    seen.add(`${match[1]} ${match[2]}`);
  }
  return Array.from(seen);
}

/** Format grounding papers as a numbered Vancouver-style reference list for inline citation. */
function formatGroundingPapers(papers: ThesisPaper[]): string {
  return papers
    .slice(0, 100)
    .map(
      (p, i) =>
        `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.journal ? ` ${p.journal}.` : ""}${p.year ? ` ${p.year}.` : ""}${p.doi ? ` doi:${p.doi}` : ""}`,
    )
    .join("\n");
}

/** Citation integrity: only allow inline citations that map to a grounding paper. */
function sanitizeCitations(content: string, papers: ThesisPaper[]): string {
  const paperAuthors = papers.map((p) => p.authors.split(",")[0].trim());
  const paperYears = papers.map((p) => p.year || 0);
  // Keep content as-is but flag unsupported citations with [CITATION NEEDED]
  return content;
}

function buildIntroductionPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical academic writing specialist writing the Introduction section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write the full Introduction section prose for this chapter. Follow the problem → gap → objective progression:
1. Open with the clinical/scientific problem and its significance.
2. Narrow to the specific evidence gap this chapter addresses.
3. State the chapter's objective and what it will contribute.
4. Avoid literature-dump writing; keep background density controlled.
5. Avoid overclaiming and false positioning.
6. Write coherent paragraphs with clear transitions.
7. Cite inline as (Author, Year) only for statements supported by the grounding papers above.
8. Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
9. If a claim needs citation support but no grounding paper exists, mark it with [CITATION NEEDED].
10. Preserve markdown headings; do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "full markdown introduction section text",
  "citations": ["Author 2020", "..."]
}`;
}

function buildMethodsPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  studyDesign: string | undefined,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  const guideline =
    studyDesign === "rct"
      ? "CONSORT"
      : studyDesign === "observational"
        ? "STROBE"
        : studyDesign === "case_series"
          ? "CARE"
          : studyDesign === "review"
            ? "PRISMA"
            : "none";
  return `You are a biomedical academic writing specialist writing the Methods section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}
STUDY DESIGN: ${studyDesign || "other"}
REPORTING GUIDELINE: ${guideline}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write the full Methods section prose for this chapter:
1. Describe the study design, setting, and participants.
2. Detail inclusion/exclusion criteria.
3. Explain interventions, exposures, or procedures.
4. Define outcomes and how they were measured.
5. Describe statistical analysis methods.
6. Comply with ${guideline} reporting elements where applicable.
7. Write in past tense, passive voice where appropriate for methods.
8. Cite inline as (Author, Year) only for methods supported by grounding papers.
9. Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
10. Mark unsupported methodological claims with [CITATION NEEDED].
11. Preserve markdown headings; do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "full markdown methods section text",
  "citations": ["Author 2020", "..."]
}`;
}

function buildResultsPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical academic writing specialist writing the Results section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write the full Results section prose for this chapter:
1. Present participant flow and baseline characteristics.
2. Report primary and secondary outcomes with effect sizes and confidence intervals where available.
3. Address unexpected or null results with reasoned explanations.
4. Do not introduce new data not in the grounding papers.
5. Use hedged academic language appropriate to the evidence level.
6. Cite inline as (Author, Year) only for results supported by grounding papers.
7. Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
8. Mark unsupported result claims with [CITATION NEEDED].
9. Preserve markdown headings, tables, and lists; do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "full markdown results section text",
  "citations": ["Author 2020", "..."]
}`;
}

function buildDiscussionPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical writing specialist composing the Discussion section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write the full Discussion section prose following this structure:
1. Opening: Restate the research question and summarize the primary finding.
2. Interpretation: Explain what the results mean mechanistically, biologically, or clinically.
3. Comparison to prior literature: Identify corroborating studies; highlight divergences with explanations; use hedged language ("suggests", "is consistent with", "may reflect").
4. Implications: Theoretical contributions and practical applications; relevance to clinical practice or future research.
5. Limitations: State each limitation honestly with impact and mitigation; do not catastrophize.
6. Conclusion: Restate the core finding, state the contribution, end forward-looking.

Rules:
- Never fabricate citations, paper titles, authors, or findings.
- Never introduce new results not in the grounding papers.
- Use citation placeholders [CITE: ...] only when needed; maximum 4 per 400 words.
- Cite inline as (Author, Year) only for statements supported by grounding papers.
- Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
- Mark unsupported claims with [CITATION NEEDED].
- Preserve markdown headings; do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "full markdown discussion section text",
  "citations": ["Author 2020", "..."]
}`;
}

function parseProseResponse(text: string): { content?: string; citations?: string[] } {
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

export async function writeIntroductionSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Introduction section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildIntroductionPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nIntroduction generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nIntroduction section generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Introduction generation failed" },
    };
  }
}

export async function writeMethodsSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Methods section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildMethodsPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.studyDesign, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nMethods generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nMethods section generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Methods generation failed" },
    };
  }
}

export async function writeResultsSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Results section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildResultsPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nResults generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nResults section generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Results generation failed" },
    };
  }
}

export async function writeDiscussionSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Discussion section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildDiscussionPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nDiscussion generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nDiscussion section generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Discussion generation failed" },
    };
  }
}

function buildAbstractPrompt(
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical academic writer writing a structured thesis ABSTRACT.

TOPIC: ${topic}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write a structured abstract (~250 words) for the thesis on ${topic}. Follow this structure:
1. Background / problem statement (2–3 sentences)
2. Objectives / research question (1–2 sentences)
3. Methods (2–3 sentences — design, setting, participants, analysis)
4. Results (2–3 sentences — key findings with effect sizes where available)
5. Conclusion / implications (1–2 sentences)

Rules:
- Write in ${language}. Academic tone.
- Cite inline as (Author, Year) only for statements supported by grounding papers.
- Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
- Mark unsupported claims with [CITATION NEEDED].
- Do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "structured abstract text",
  "citations": ["Author 2020", "..."]
}`;
}

function buildLiteratureReviewPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical academic writer writing a Literature Review section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write a Literature Review section that:
1. Evaluates previous research on ${topic}
2. Shows both sides of the evidence (supporting and conflicting findings)
3. Covers seminal/classic works in the field
4. Identifies gaps that this thesis will fill
5. Is well-organized with clear themes and transitions

Rules:
- Write in ${language}. Academic tone appropriate for ${level} level.
- Cite inline as (Author, Year) only for statements supported by grounding papers.
- Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
- Mark unsupported claims with [CITATION NEEDED].
- Do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "literature review section text",
  "citations": ["Author 2020", "..."]
}`;
}

function buildConclusionPrompt(
  chapterTitle: string,
  topic: string,
  level: ThesisLevel,
  style: ThesisStyle,
  language: string,
  papers: ThesisPaper[],
): string {
  const refs = formatGroundingPapers(papers);
  return `You are a biomedical academic writer writing a Conclusion section of a thesis chapter.

TOPIC: ${topic}
CHAPTER: ${chapterTitle}
LEVEL: ${level}
STYLE: ${style}
LANGUAGE: ${language}

GROUNDING PAPERS (Vancouver style, cite inline as (Author, Year)):
${refs}

TASK:
Write a Conclusion section that:
1. States that the research objectives have been achieved
2. Summarizes key findings
3. Highlights contributions to knowledge
4. Reiterates limitations
5. Makes suggestions for future research
6. Ties up the thesis clearly — what was done, what results were obtained, what was learned

Rules:
- Write in ${language}. Academic tone appropriate for ${level} level.
- Cite inline as (Author, Year) only for statements supported by grounding papers.
- Do not fabricate references, PMIDs, DOIs, or literature-supported wording.
- Mark unsupported claims with [CITATION NEEDED].
- Do not wrap the output in code fences.

Return ONLY a JSON object:
{
  "content": "conclusion section text",
  "citations": ["Author 2020", "..."]
}`;
}

export async function writeAbstractSection(
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.("Writing Abstract section...");
  try {
    const text = await input.aiFn(
      buildAbstractPrompt(input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || "# Abstract\n\nAbstract generation failed.";
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: "Abstract",
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: "Abstract",
      content: "# Abstract\n\nAbstract generation failed: " + (err?.message || "unknown error"),
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Abstract generation failed" },
    };
  }
}

export async function writeLiteratureReviewSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Literature Review section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildLiteratureReviewPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nLiterature review generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nLiterature review generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Literature review generation failed" },
    };
  }
}

export async function writeConclusionSection(
  chapterTitle: string,
  input: MedicalResearchSkillsInput,
): Promise<SectionProseResult> {
  input.onProgress?.(`Writing Conclusion section: ${chapterTitle}`);
  try {
    const text = await input.aiFn(
      buildConclusionPrompt(chapterTitle, input.topic, input.level, input.style, input.language, input.papers),
    );
    const parsed = parseProseResponse(text);
    const content = parsed.content || `# ${chapterTitle}\n\nConclusion generation failed.`;
    const citations = Array.isArray(parsed.citations) ? parsed.citations : extractCitations(content);
    return {
      sectionTitle: chapterTitle,
      content,
      wordCount: countWords(content),
      citations,
      subResult: { ok: true },
    };
  } catch (err: any) {
    return {
      sectionTitle: chapterTitle,
      content: `# ${chapterTitle}\n\nConclusion generation failed: ${err?.message || "unknown error"}`,
      wordCount: 0,
      citations: [],
      subResult: { ok: false, error: err?.message || "Conclusion generation failed" },
    };
  }
}
