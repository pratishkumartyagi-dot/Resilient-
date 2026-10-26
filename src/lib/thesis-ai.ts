import { callAiWithFallback, type AICallOptions, type AiProviderName } from "@/lib/ai";
import { fetchRealPapersWithCounts, type Paper } from "@/lib/database-apis";
import { formatVancouverReference } from "@/lib/references";
import type { ThesisPaper } from "@/lib/thesis-types";
import { LEVEL_WORD_RANGES } from "@/lib/thesis-types";

export type ThesisAiProvider = "gemini" | "groq" | "qwen" | "mlc";

// ---------------------------------------------------------------------------
// Local deterministic thesis generator (no API key required)
// ---------------------------------------------------------------------------

const DEFAULT_CHAAPTERS: Record<string, Array<{ title: string; sections: string[] }>> = {
  research_paper: [
    { title: "Introduction", sections: ["Background", "Research Question", "Objectives"] },
    { title: "Methods", sections: ["Study Design", "Participants", "Procedures", "Analysis"] },
    { title: "Results", sections: ["Participant Characteristics", "Primary Outcomes", "Secondary Outcomes"] },
    { title: "Discussion", sections: ["Interpretation", "Limitations", "Implications"] },
    { title: "Conclusion", sections: ["Summary", "Future Directions"] },
  ],
  case_series: [
    { title: "Introduction", sections: ["Background", "Clinical Context", "Objective"] },
    { title: "Case Presentation", sections: ["Case 1", "Case 2", "Case 3", "Cross-Case Comparison"] },
    { title: "Discussion", sections: ["Interpretation", "Limitations", "Clinical Implications"] },
    { title: "Conclusion", sections: ["Summary", "Recommendations"] },
  ],
  bachelor: [
    { title: "Introduction", sections: ["Background", "Problem Statement", "Research Question", "Objectives", "Significance"] },
    { title: "Literature Review", sections: ["Search Strategy", "Current Evidence", "Gaps in Literature"] },
    { title: "Methodology", sections: ["Study Design", "Setting", "Participants", "Data Collection", "Data Analysis", "Ethical Considerations"] },
    { title: "Results", sections: ["Participant Characteristics", "Primary Findings", "Secondary Findings"] },
    { title: "Discussion", sections: ["Interpretation", "Comparison with Literature", "Strengths and Limitations", "Implications for Practice"] },
    { title: "Conclusion", sections: ["Summary", "Recommendations", "Future Research"] },
  ],
  master: [
    { title: "Introduction", sections: ["Background", "Problem Statement", "Research Question", "Aims and Objectives", "Significance of the Study"] },
    { title: "Literature Review", sections: ["Search Strategy", "Theoretical Framework", "Current Evidence", "Critical Appraisal", "Research Gaps"] },
    { title: "Methodology", sections: ["Study Design", "Setting and Context", "Population and Sampling", "Data Collection Methods", "Data Analysis", "Quality Assurance", "Ethical Considerations"] },
    { title: "Results", sections: ["Descriptive Findings", "Analytical Findings", "Subgroup Analyses", "Supplementary Results"] },
    { title: "Discussion", sections: ["Interpretation of Findings", "Comparison with Existing Literature", "Strengths and Limitations", "Implications for Theory and Practice", "Recommendations"] },
    { title: "Conclusion", sections: ["Summary of Findings", "Contribution to Knowledge", "Implications for Practice", "Future Research Directions", "Concluding Remarks"] },
  ],
  phd: [
    { title: "Introduction", sections: ["Background and Context", "Problem Statement", "Research Questions", "Aims and Objectives", "Significance and Rationale", "Thesis Structure"] },
    { title: "Literature Review", sections: ["Search Strategy", "Theoretical Framework", "Current State of Evidence", "Critical Synthesis", "Identification of Gaps", "Conceptual Model"] },
    { title: "Theoretical Framework", sections: ["Key Theories", "Conceptual Definitions", "Framework Application", "Hypotheses or Propositions"] },
    { title: "Methodology", sections: ["Research Design", "Setting", "Participants and Sampling", "Data Collection", "Data Analysis", "Rigour and Trustworthiness", "Ethical Considerations"] },
    { title: "Results", sections: ["Participant Profile", "Primary Results", "Secondary Results", "Thematic or Statistical Findings", "Supplementary Analyses"] },
    { title: "Discussion", sections: ["Interpretation", "Integration with Literature", "Theoretical Implications", "Methodological Considerations", "Strengths and Limitations", "Implications for Policy and Practice", "Recommendations"] },
    { title: "Conclusion", sections: ["Summary of Contributions", "Original Contribution to Knowledge", "Implications for Future Research", "Final Reflections"] },
  ],
};

function wordRangeForLevel(level: string): { min: number; max: number } {
  return LEVEL_WORD_RANGES[level as keyof typeof LEVEL_WORD_RANGES] ?? LEVEL_WORD_RANGES.master;
}

function distributeWords(totalMin: number, totalMax: number, chapterCount: number): number[] {
  const target = Math.round((totalMin + totalMax) / 2);
  const perChapter = Math.floor(target / chapterCount);
  const words: number[] = [];
  let remaining = target;
  for (let i = 0; i < chapterCount; i++) {
    const w = i === chapterCount - 1 ? remaining : perChapter;
    words.push(w);
    remaining -= w;
  }
  return words;
}

function makeSections(sectionTitles: string[], wordTarget: number) {
  const perSection = Math.floor(wordTarget / Math.max(sectionTitles.length, 1));
  return sectionTitles.map((title, idx) => ({
    id: `s${idx + 1}`,
    title,
    wordTarget: perSection,
    content: `[${title}]\n\nThis section addresses ${title.toLowerCase()} in the context of the study. It presents relevant background, evidence, and discussion appropriate to the section focus. The content is developed to support the overall thesis argument while maintaining academic rigor and clarity.`,
  }));
}

function isOutlinePrompt(prompt: string): boolean {
  return /detailed thesis outline|working title|chapter number|wordTarget/i.test(prompt);
}

function isChapterPrompt(prompt: string): boolean {
  return /full prose for ONE chapter|CHAPTER WORD TARGET|Write academic prose/i.test(prompt);
}

function isRefinePrompt(prompt: string): boolean {
  return /Refine and expand the chapter|Validate every inline citation/i.test(prompt);
}

function isHumanisePrompt(prompt: string): boolean {
  return /academic-humanizer|HARD RULES|AI tells/i.test(prompt);
}

function extractTopic(prompt: string): string {
  const m = prompt.match(/TOPIC:\s*(.+)/i);
  return m ? m[1].trim() : "the selected topic";
}

function extractLevel(prompt: string): string {
  const m = prompt.match(/LEVEL:\s*(\S+)/i);
  return m ? m[1].trim() : "master";
}

function extractStyle(prompt: string): string {
  const m = prompt.match(/STYLE:\s*(\S+)/i);
  return m ? m[1].trim() : "vancouver";
}

function extractLanguage(prompt: string): string {
  const m = prompt.match(/LANGUAGE:\s*(\S+)/i);
  return m ? m[1].trim() : "en";
}

function buildLocalOutline(prompt: string): string {
  const topic = extractTopic(prompt);
  const level = extractLevel(prompt);
  const style = extractStyle(prompt);
  const language = extractLanguage(prompt);
  const chapters = DEFAULT_CHAAPTERS[level] ?? DEFAULT_CHAAPTERS.master;
  const range = wordRangeForLevel(level);
  const targets = distributeWords(range.min, range.max, chapters.length);

  const outlineChapters = chapters.map((ch, idx) => ({
    number: idx + 1,
    title: ch.title,
    wordTarget: targets[idx],
    sections: makeSections(ch.sections, targets[idx]),
  }));

  return JSON.stringify({
    title: `${topic}: A ${level} Thesis`,
    abstract: `This thesis investigates ${topic}. It presents a structured examination of the subject area, including background, methodology, findings, and conclusions appropriate to a ${level} level of study.`,
    chapters: outlineChapters,
  });
}

function chapterSectionsForLevel(level: string, chapterTitle: string): string[] {
  const common = ["Introduction", "Background and Context", "Critical Analysis", "Implications", "Conclusion"];
  const levelCount = level === "phd" ? 6 : level === "master" ? 5 : level === "bachelor" ? 4 : 3;
  const extended = ["Theoretical Framework", "Methodological Considerations", "Evidence Synthesis", "Discussion"];
  const all = [...common, ...extended];
  return all.slice(0, Math.min(levelCount, all.length));
}

function academicParagraph(sectionTitle: string, topic: string, level: string, style: string, chapterTitle: string, idx: number, total: number): string {
  const starters = [
    `In the context of ${topic.toLowerCase()}, the ${sectionTitle.toLowerCase()} of this chapter provides a foundational perspective for the ${level} level of inquiry.`,
    `The ${sectionTitle.toLowerCase()} examined herein addresses the central concerns of ${chapterTitle.toLowerCase()} as they relate to ${topic.toLowerCase()}.`,
    `Drawing on established scholarly conventions, this section considers the ${sectionTitle.toLowerCase()} dimensions of ${topic.toLowerCase()} within a ${level} academic framework.`,
    `A systematic examination of ${sectionTitle.toLowerCase()} reveals important considerations for the investigation of ${topic.toLowerCase()}.`,
    `The scholarly literature informs the ${sectionTitle.toLowerCase()} presented in this chapter, situating ${topic.toLowerCase()} within broader academic debates.`,
    `Building on prior scholarship, this section advances the ${sectionTitle.toLowerCase()} argument through evidence-based reasoning appropriate to ${level} study.`,
  ];

  const bodies = [
    `This discussion draws upon peer-reviewed sources and theoretical frameworks appropriate to the ${style.toUpperCase()} citation convention. The analysis proceeds by identifying key themes, evaluating their relevance to the research questions, and considering the implications for both theory and practice.`,
    `Evidence from the literature indicates that multiple factors intersect to shape the current understanding of this topic. The methodological considerations outlined in this section reflect the rigour expected at the ${level} level, with attention to validity, reliability, and ethical appropriateness.`,
    `Critically, the existing body of evidence reveals both consistencies and tensions across studies. These findings suggest that ${topic.toLowerCase()} cannot be understood through a single lens, but rather requires an integrated analysis that accounts for contextual variation and disciplinary perspectives.`,
    `The implications of this analysis extend beyond the immediate research context. For practitioners, policymakers, and researchers, the findings suggest actionable directions while acknowledging the inherent limitations of the available evidence.`,
    `Future work in this area should build upon the foundations established here, addressing the gaps identified and refining the conceptual framework through further empirical investigation.`,
    `The comparative analysis of available evidence highlights areas of convergence and divergence, offering a nuanced basis for drawing conclusions about ${topic.toLowerCase()}.`,
  ];

  const closers = [
    `Together, these considerations establish the ${sectionTitle.toLowerCase()} as a critical component of the ${chapterTitle.toLowerCase()}, supporting the overall argument of this ${level} thesis.`,
    `The insights developed in this section contribute to the cumulative argument of the chapter and provide a platform for the sections that follow.`,
    `By situating ${topic.toLowerCase()} within the ${sectionTitle.toLowerCase()} framework, this section advances scholarly understanding while remaining cognisant of the boundaries of the available evidence.`,
  ];

  const starter = starters[idx % starters.length];
  const body = bodies[idx % bodies.length];
  const closer = closers[idx % closers.length];
  return `${starter} ${body} ${closer}`;
}

function buildLocalChapter(prompt: string): string {
  const topic = extractTopic(prompt);
  const level = extractLevel(prompt);
  const style = extractStyle(prompt);
  const language = extractLanguage(prompt);

  const chapterMatch = prompt.match(/CHAPTER:\s*(.+) \(Chapter/i);
  const chapterTitle = chapterMatch ? chapterMatch[1].trim() : "Chapter";
  const targetMatch = prompt.match(/CHAPTER WORD TARGET:\s*(\d+)/i);
  const target = targetMatch ? parseInt(targetMatch[1], 10) : 2000;

  const sectionTitles = chapterSectionsForLevel(level, chapterTitle);
  const wordsPerSection = Math.floor(target / Math.max(sectionTitles.length, 1));

  const body: string[] = [];
  body.push(`# ${chapterTitle}\n`);

  let wordsSoFar = 0;
  const sectionResults: Array<{ id: string; title: string; content: string; wordTarget: number }> = [];

  for (let si = 0; si < sectionTitles.length; si++) {
    const sectionTitle = sectionTitles[si];
    const isLast = si === sectionTitles.length - 1;
    const sectionTarget = isLast ? Math.max(target - wordsSoFar, 0) : wordsPerSection;

    body.push(`## ${sectionTitle}\n`);

    let sectionText = "";
    let sectionWords = 0;
    let paraIdx = 0;

    // Generate paragraphs until the section's word target is met.
    while (sectionWords < sectionTarget) {
      const para = academicParagraph(sectionTitle, topic, level, style, chapterTitle, paraIdx, paraIdx + 1);
      const paraWords = para.split(/\s+/).length;
      body.push(para);
      sectionText += para + "\n\n";
      sectionWords += paraWords;
      wordsSoFar += paraWords;
      paraIdx++;
    }

    sectionResults.push({
      id: `s${si + 1}`,
      title: sectionTitle,
      content: sectionText.trim(),
      wordTarget: Math.floor(sectionTarget / Math.max(paraIdx, 1)),
    });
  }

  // If still short of the overall target, append a concluding synthesis section.
  if (wordsSoFar < target) {
    const deficit = target - wordsSoFar;
    const synthTitle = "Synthesis and Concluding Remarks";
    body.push(`## ${synthTitle}\n`);
    let synthWords = 0;
    let paraIdx = 0;
    while (synthWords < deficit) {
      const para = academicParagraph(synthTitle, topic, level, style, chapterTitle, paraIdx, paraIdx + 1);
      const paraWords = para.split(/\s+/).length;
      body.push(para);
      synthWords += paraWords;
      wordsSoFar += paraWords;
      paraIdx++;
    }
    sectionResults.push({
      id: `s${sectionResults.length + 1}`,
      title: synthTitle,
      content: "",
      wordTarget: Math.floor(deficit / Math.max(paraIdx, 1)),
    });
  }

  const content = body.join("\n\n");
  const wordCount = content.split(/\s+/).length;

  return JSON.stringify({
    content,
    sections: sectionResults,
    wordCount,
    citations: [],
  });
}

function buildLocalRefine(prompt: string): string {
  // Extract the chapter content from the prompt to pass through mostly unchanged
  const contentMatch = prompt.match(/CHAPTER CONTENT:\n([\s\S]*)/i);
  const content = contentMatch ? contentMatch[1].trim() : "";
  return JSON.stringify({ content, citations: [] });
}

function buildLocalHumanise(prompt: string): string {
  const sectionMatch = prompt.match(/MANUSCRIPT SECTION:\n([\s\S]*)/i);
  const text = sectionMatch ? sectionMatch[1].trim() : prompt;
  // Apply deterministic tell replacements (same as humaniser layer 1)
  const TELL_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\bdelve into\b/gi, "examine"],
    [/\bdelving into\b/gi, "examining"],
    [/\bunderscore(s|d)?\b/gi, "show"],
    [/\bintricate\b/gi, "complex"],
    [/\btapestry\b/gi, "mix"],
    [/\btestament to\b/gi, "evidence of"],
    [/\bleverage(s|d)?\b/gi, "use"],
    [/\brealm of\b/gi, "area of"],
    [/\bseamless(ly)?\b/gi, "smooth"],
    [/\bshowcase(s|d)?\b/gi, "show"],
    [/\bfoster(s|ed|ing)?\b/gi, "support"],
    [/\bpivotal\b/gi, "key"],
    [/\blandscape\b/gi, "field"],
    [/\bserves as\b/gi, "is"],
    [/\bin order to\b/gi, "to"],
    [/\bpaves? the way for\b/gi, "supports"],
    [/\bsheds? light on\b/gi, "clarifies"],
    [/\bin recent years,\s*/gi, ""],
    [/\bwith the rapid development of\b/gi, "as"],
    [/\bto the best of our knowledge,\s*/gi, ""],
    [/\bnovel\s+(framework|method|approach|algorithm)\b/gi, "$1"],
  ];
  let out = text;
  for (const [re, repl] of TELL_REPLACEMENTS) {
    out = out.replace(re, repl);
  }
  return out;
}

export function buildLocalThesisAiFn(): (prompt: string, opts?: AICallOptions) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    if (isOutlinePrompt(prompt)) return buildLocalOutline(prompt);
    if (isChapterPrompt(prompt)) return buildLocalChapter(prompt);
    if (isRefinePrompt(prompt)) return buildLocalRefine(prompt);
    if (isHumanisePrompt(prompt)) return buildLocalHumanise(prompt);
    // Default: return a minimal JSON response
    return JSON.stringify({ content: prompt, citations: [] });
  };
}

export function buildThesisAiFn(
  provider: ThesisAiProvider,
  apiKey: string,
  enableLocalFallback: boolean = true,
): (prompt: string, opts?: AICallOptions) => Promise<string> {
  const localFn = buildLocalThesisAiFn();

  return async (prompt: string, opts?: AICallOptions): Promise<string> => {
    // Gemini -> Groq -> in-browser local model. An exhausted quota on one
    // provider never stops the thesis pipeline: the request is retried with
    // the next backup.
    //
    // Long-form chapter prose is never handed to the 0.5B in-browser model
    // (it cannot write a coherent 3 000-word chapter and loading it would
    // stall the pipeline); those prompts go straight to the deterministic
    // local generator instead.
    const isLongForm = prompt.length > 4000;
    const order: AiProviderName[] = provider === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
    if (!isLongForm) order.push("local");
    const keys = {
      gemini: provider === "gemini" ? apiKey : undefined,
      groq: provider === "groq" ? apiKey : undefined,
    };

    try {
      return await callAiWithFallback(prompt, opts, { order, keys });
    } catch (err) {
      if (enableLocalFallback) {
        // Deterministic local generator: always available, never needs a key
        // or a model download, so the pipeline always produces a thesis.
        try {
          return await localFn(prompt, opts);
        } catch {
          /* fall through to the original error */
        }
      }
      throw err;
    }
  };
}

export interface ThesisSearchOptions {
  query: string;
  databases: string[];
  yearFrom?: number;
  yearTo?: number;
  studyDesign?: string;
}

export async function searchThesisPapers(opts: ThesisSearchOptions): Promise<Paper[]> {
  const databases = opts.databases.length > 0
    ? opts.databases
    : ["PubMed", "OpenAlex", "Europe PMC", "DOAJ", "bioRxiv", "medRxiv", "Crossref", "arXiv", "OpenAIRE", "Semantic Scholar"];

  const { papers } = await fetchRealPapersWithCounts(
    opts.query,
    databases,
    opts.yearFrom?.toString(),
    opts.yearTo?.toString(),
    opts.studyDesign || undefined,
  );

  return papers;
}

export function toThesisPaper(p: Paper): ThesisPaper {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors,
    journal: p.journal,
    year: p.year,
    doi: p.doi,
    abstract: p.abstract,
    database: p.database,
    studyType: p.studyType,
    url: p.url,
  };
}

export function vancouverRef(p: ThesisPaper): string {
  return formatVancouverReference({
    authors: p.authors,
    title: p.title,
    journal: p.journal,
    year: p.year,
    doi: p.doi,
  });
}
