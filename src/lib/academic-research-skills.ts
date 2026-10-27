/**
 * Academic Research Skills (ARS) module
 * Based on https://github.com/Imbad0202/academic-research-skills
 *
 * Implements:
 * - Academic Paper writing pipeline (world top 5 scientific journal format)
 * - Academic Paper Reviewer pipeline (multi-perspective peer review)
 * - Journal profiles for top-tier scientific journals
 * - Citation integrity: only actual retrieved papers are cited (no hallucination)
 * - Style calibration and writing quality checks
 * - Human-in-the-loop at every stage
 */

import type { ThesisPaper } from "@/lib/thesis-types";

/** World top 5 scientific journal profiles with their formatting requirements. */
const TOP_JOURNALS: Record<
  string,
  {
    name: string;
    publisher: string;
    field: string[];
    wordLimit?: number;
    referenceLimit?: number;
    abstractLimit?: number;
    citationStyle: "apa" | "vancouver" | "ieee" | "mla" | "harvard";
    structure: string[];
    formatting: string[];
  }
> = {
  "New England Journal of Medicine": {
    name: "New England Journal of Medicine",
    publisher: "Massachusetts Medical Society",
    field: ["Medicine", "Clinical Research"],
    wordLimit: 3500,
    referenceLimit: 40,
    abstractLimit: 250,
    citationStyle: "vancouver",
    structure: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
    formatting: ["Structured abstract", "IMRaD structure", "Numbered references (Vancouver)", "Clinical trial registration if applicable"],
  },
  Lancet: {
    name: "The Lancet",
    publisher: "Elsevier",
    field: ["Medicine", "Global Health", "Clinical Research"],
    wordLimit: 3500,
    referenceLimit: 35,
    abstractLimit: 250,
    citationStyle: "vancouver",
    structure: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
    formatting: ["Structured abstract", "IMRaD structure", "Numbered references (Vancouver)", "Trial registration number"],
  },
  JAMA: {
    name: "JAMA - The Journal of the American Medical Association",
    publisher: "American Medical Association",
    field: ["Medicine", "Clinical Research", "Public Health"],
    wordLimit: 3500,
    referenceLimit: 40,
    abstractLimit: 250,
    citationStyle: "vancouver",
    structure: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
    formatting: ["Structured abstract", "IMRaD structure", "Numbered references (Vancouver)", "Clinical trial registration"],
  },
  BMJ: {
    name: "BMJ - British Medical Journal",
    publisher: "BMJ Publishing Group",
    field: ["Medicine", "Primary Care", "Public Health"],
    wordLimit: 3000,
    referenceLimit: 30,
    abstractLimit: 250,
    citationStyle: "vancouver",
    structure: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
    formatting: ["Structured abstract", "IMRaD structure", "Numbered references (Vancouver)", "Trial registration"],
  },
  "PLOS Medicine": {
    name: "PLOS Medicine",
    publisher: "Public Library of Science",
    field: ["Medicine", "Global Health", "Clinical Research"],
    wordLimit: 3500,
    referenceLimit: 50,
    abstractLimit: 250,
    citationStyle: "vancouver",
    structure: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
    formatting: ["Structured abstract", "IMRaD structure", "Numbered references (Vancouver)", "Open access"],
  },
};

/** Available top-tier journal options for paper writing. */
export const JOURNAL_OPTIONS = Object.entries(TOP_JOURNALS).map(([key, journal]) => ({
  id: key,
  name: journal.name,
  publisher: journal.publisher,
  field: journal.field.join(", "),
  wordLimit: journal.wordLimit,
  referenceLimit: journal.referenceLimit,
  abstractLimit: journal.abstractLimit,
  citationStyle: journal.citationStyle,
}));

/** ARS paper writing modes (per academic-research-skills). */
export const PAPER_WRITING_MODES = [
  { id: "full", label: "Full Paper", description: "Complete paper from outline to final manuscript" },
  { id: "plan", label: "Plan", description: "Socratic guided planning of paper structure" },
  { id: "outline-only", label: "Outline Only", description: "Generate detailed paper outline with section word targets" },
  { id: "abstract-only", label: "Abstract Only", description: "Write structured abstract only" },
  { id: "lit-review", label: "Literature Review", description: "Convert to literature review paper format" },
  { id: "revision", label: "Revision", description: "Incorporate reviewer comments into manuscript" },
];

/** ARS paper reviewer modes (per academic-research-skills). */
export const PAPER_REVIEWER_MODES = [
  { id: "full", label: "Full Review", description: "Complete peer review: journal-fit + R1/R2/R3 + Devil's Advocate" },
  { id: "quick", label: "Quick Assessment", description: "Rapid quality assessment of the manuscript" },
  { id: "methodology-focus", label: "Methodology Focus", description: "Focused review of methods and statistics" },
  { id: "guided", label: "Guided Improvement", description: "Step-by-step guidance to improve the paper" },
];

/** Reviewer lenses (per academic-research-skills 7 perspectives). */
export const REVIEWER_LENSES = [
  { id: "journal-fit", label: "Journal-Fit Reviewer", description: "Assesses fit with target journal scope and standards" },
  { id: "methods", label: "Methods Reviewer", description: "Reviews study design, methods, and statistics" },
  { id: "statistics", label: "Statistics Reviewer", description: "Reviews statistical analysis and reporting" },
  { id: "clinical-translation", label: "Clinical Translation Reviewer", description: "Reviews clinical relevance and translation" },
  { id: "ethics-equity", label: "Ethics & Equity Reviewer", description: "Reviews ethical considerations and health equity" },
  { id: "presentation", label: "Presentation Reviewer", description: "Reviews writing quality, structure, and clarity" },
  { id: "devils-advocate", label: "Devil's Advocate", description: "Challenges assumptions and identifies weaknesses" },
];

/** Supported citation formats (per academic-research-skills). */
export const CITATION_FORMATS = [
  { id: "apa", label: "APA 7.0", description: "American Psychological Association 7th Edition" },
  { id: "vancouver", label: "Vancouver", description: "International Committee of Medical Journal Editors" },
  { id: "ieee", label: "IEEE", description: "Institute of Electrical and Electronics Engineers" },
  { id: "mla", label: "MLA", description: "Modern Language Association" },
  { id: "harvard", label: "Harvard", description: "Harvard referencing style" },
];

/** Word count presets for different academic levels. */
export const WORD_COUNT_PRESETS = [
  { id: "short", label: "Short Communication", min: 1500, max: 2500, description: "Brief research communication (1,500-2,500 words)" },
  { id: "standard", label: "Standard Article", min: 3000, max: 5000, description: "Standard research article (3,000-5,000 words)" },
  { id: "extended", label: "Extended Article", min: 5000, max: 8000, description: "Extended research article (5,000-8,000 words)" },
  { id: "custom", label: "Custom", min: 1000, max: 15000, description: "Custom word count range" },
];

/** Get journal profile by key. */
export function getJournalProfile(journalId: string) {
  return TOP_JOURNALS[journalId] || TOP_JOURNALS["PLOS Medicine"];
}

/** Build the Academic Paper writing prompt (per ARS academic-paper skill). */
export function buildAcademicPaperPrompt(input: {
  topic: string;
  journalId: string;
  citationStyle: string;
  language: string;
  targetWordCount?: number;
  minWordCount?: number;
  maxWordCount?: number;
  yearFrom?: number;
  yearTo?: number;
  studyDesign?: string;
  papers: ThesisPaper[];
  mode?: string;
}): string {
  const journal = getJournalProfile(input.journalId);
  const { targetWordCount, minWordCount, maxWordCount } = input;
  const wordRange = `Target: ${targetWordCount ?? (journal.wordLimit ?? 3500)} words`;
  const yearRange = input.yearFrom && input.yearTo ? `${input.yearFrom}–${input.yearTo}` : "any";
  const paperList = input.papers
    .slice(0, 50)
    .map(
      (p, i) =>
        `${i + 1}. ${p.authors} (${p.year || "n.d."}). ${p.title}.${p.journal ? ` ${p.journal}.` : ""}${p.year ? ` ${p.year}.` : ""}${p.doi ? ` doi:${p.doi}` : ""}`,
    )
    .join("\n");

  return `You are an expert biomedical academic writer specializing in ${journal.name} format.

TARGET JOURNAL: ${journal.name} (${journal.publisher})
FIELD: ${journal.field.join(", ")}
CITATION STYLE: ${input.citationStyle.toUpperCase()}
LANGUAGE: ${input.language}
TOPIC: ${input.topic}
YEAR INTERVAL: ${yearRange}
WORD COUNT: ${wordRange}
STUDY DESIGN: ${input.studyDesign || "other"}
MODE: ${input.mode || "full"}

GROUNDING PAPERS (numbered, cite inline as [1], [2], etc.):
${paperList}

TASK:
Write a complete academic paper manuscript for submission to ${journal.name}.

STRUCTURE (${journal.structure.join(" → ")}):
1. Title - informative, specific, includes key variables
2. Abstract - structured, ${journal.abstractLimit || 250} words max, background/objectives/methods/results/conclusions
3. Introduction - problem statement, significance, gap, research question/hypothesis
4. Methods - study design, setting, participants, interventions/exposures, outcomes, statistical analysis
5. Results - participant flow, baseline characteristics, primary/secondary outcomes with effect sizes and CIs
6. Discussion - interpretation, comparison to literature, implications, limitations, conclusion
7. References - numbered ${input.citationStyle} style, only actual retrieved papers above

RULES (non-negotiable):
- Cite inline using [1], [2], [3] format referring to the numbered grounding papers above.
- Do NOT fabricate references, PMIDs, DOIs, journal names, or literature-supported wording.
- Only cite papers from the grounding list above. If a claim needs support but no paper exists, mark it [CITATION NEEDED].
- Do not introduce new data not present in the grounding papers.
- Follow ${journal.name} formatting: ${journal.formatting.join(", ")}.
- Write in ${input.language}. Use academic tone appropriate for ${journal.name}.
- Respect word count: approximately ${wordRange}.
- Structure with clear markdown headings (# Title, ## Sections).
- Do not wrap output in code fences.

Return ONLY the paper manuscript in markdown format.
`;
}

/** Build the Academic Paper Reviewer prompt (per ARS academic-paper-reviewer skill). */
export function buildReviewerPrompt(input: {
  paperText: string;
  journalId: string;
  citationStyle: string;
  language: string;
  reviewerLens?: string;
  mode?: string;
}): string {
  const journal = getJournalProfile(input.journalId);
  const lens = input.reviewerLens || "journal-fit";

  return `You are an expert peer reviewer for ${journal.name}.

TARGET JOURNAL: ${journal.name} (${journal.publisher})
CITATION STYLE: ${input.citationStyle.toUpperCase()}
LANGUAGE: ${input.language}
REVIEWER LENS: ${lens}
MODE: ${input.mode || "full"}

MANUSCRIPT TO REVIEW:
${input.paperText}

TASK:
Provide a comprehensive peer review of the manuscript above for submission to ${journal.name}.

REVIEW STRUCTURE:
1. Summary - brief overview of the paper's contribution
2. Major Issues - critical concerns that must be addressed
3. Minor Issues - suggestions for improvement
4. Journal Fit - assessment of suitability for ${journal.name}
5. Recommendation - Accept / Minor Revision / Major Revision / Reject
6. Specific Comments - line-by-line or section-by-section feedback

REVIEWER LENS PERSPECTIVE (${lens}):
${getLensGuidance(lens)}

RULES:
- Be constructive and specific; cite section names and quote text where relevant.
- Do not fabricate references or claim the paper cites works it does not.
- Assess methodology, statistics, clarity, and contribution fairly.
- Consider ${journal.name}'s scope and standards.
- Write in ${input.language}.
- Do not wrap output in code fences.

Return ONLY the peer review report in markdown format.
`;
}

/** Get guidance for a specific reviewer lens. */
function getLensGuidance(lens: string): string {
  const guidance: Record<string, string> = {
    "journal-fit": "Assess whether the paper's scope, novelty, and contribution match ${journal.name}'s audience and standards.",
    methods: "Evaluate study design appropriateness, sampling, data collection, intervention/exposure definition, and analytical approach.",
    statistics: "Review statistical methods, sample size justification, effect sizes, confidence intervals, p-values, and appropriate tests.",
    "clinical-translation": "Assess clinical relevance, applicability to practice, patient impact, and implementation feasibility.",
    "ethics-equity": "Review ethical approval, informed consent, health equity considerations, vulnerable populations, and conflicts of interest.",
    presentation: "Evaluate writing clarity, logical flow, structure, grammar, table/figure quality, and readability.",
    "devils-advocate": "Challenge assumptions, identify potential weaknesses, alternative explanations, and threats to validity.",
  };
  return guidance[lens] || guidance["journal-fit"];
}

/** Sanitize citations: ensure only papers from the grounding list are cited. */
export function sanitizeCitations(content: string, papers: ThesisPaper[]): string {
  const paperCount = papers.length;
  // Replace [CITATION NEEDED] markers as-is; flag any out-of-range numbered citations
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 1 || n > paperCount) {
      return "[CITATION NEEDED]";
    }
    return match;
  });
}

/** Format references for the paper end section per citation style. */
export function formatPaperReferences(
  papers: ThesisPaper[],
  style: string,
): string {
  if (papers.length === 0) return "No references available.";
  return papers
    .map(
      (p, i) => {
        const authors = p.authors || "Unknown authors";
        const year = p.year || "n.d.";
        const title = p.title || "Untitled";
        const journal = p.journal ? `. ${p.journal}` : "";
        const yr = p.year ? `. ${p.year}` : "";
        const doi = p.doi ? ` doi:${p.doi}` : "";
        switch (style) {
          case "vancouver":
            return `${i + 1}. ${authors}. ${title}${journal}${yr}${doi}`;
          case "apa":
            return `${authors} (${year}). ${title}${journal}${yr}${doi}`;
          case "ieee":
            return `[${i + 1}] ${authors}, "${title}", ${journal}, ${yr}${doi}.`;
          case "mla":
            return `${authors}. "${title}". ${journal}. ${yr}${doi}.`;
          case "harvard":
            return `${authors} (${year}) '${title}', ${journal}${yr}${doi}`;
          default:
            return `${i + 1}. ${authors}. ${title}${journal}${yr}${doi}`;
        }
      },
    )
    .join("\n");
}

/** ARS pipeline stages (10-stage orchestrator). */
export const ARS_PIPELINE_STAGES = [
  { id: "plan", label: "Plan", description: "Socratic planning of paper structure and RQ" },
  { id: "research", label: "Deep Research", description: "Literature search and evidence gathering" },
  { id: "write", label: "Write", description: "Draft manuscript sections" },
  { id: "integrity-2.5", label: "Integrity Check 2.5", description: "Pre-review citation and claim verification" },
  { id: "review", label: "Peer Review", description: "Multi-perspective reviewer panel" },
  { id: "integrity-4.5", label: "Integrity Check 4.5", description: "Post-revision verification" },
  { id: "revise", label: "Revise", description: "Incorporate reviewer feedback" },
  { id: "format", label: "Format", description: "Journal-specific formatting and citation conversion" },
  { id: "finalize", label: "Finalize", description: "Final manuscript and process summary" },
];
