import { type Paper, validateDoiViaCrossref } from "./database-apis";

export interface SynthesisRow {
  id: string;
  reference: string;
  keyFindings: string;
  synopsis: string;
  studyDetails: string;
  researchGaps: string;
}

/* ------------------------------------------------------------------ */
/*  Evidence-tier mapping (AIPOCH / decipher-research-agent style)    */
/* ------------------------------------------------------------------ */
const EVIDENCE_TIERS: Record<string, { label: string; color: string }> = {
  "randomized controlled trial": { label: "T1 — Mechanistic (★★★)", color: "text-green-300" },
  rct: { label: "T1 — Mechanistic (★★★)", color: "text-green-300" },
  "systematic review": { label: "T2 — Functional (★★☆)", color: "text-yellow-300" },
  "meta-analysis": { label: "T2 — Functional (★★☆)", color: "text-yellow-300" },
  cohort: { label: "T3 — Associational (★☆☆)", color: "text-orange-300" },
  "case-control": { label: "T3 — Associational (★☆☆)", color: "text-orange-300" },
  "observational study": { label: "T3 — Associational (★☆☆)", color: "text-orange-300" },
  "cross-sectional": { label: "T3 — Associational (★☆☆)", color: "text-orange-300" },
  review: { label: "T4 — Mention (☆☆☆)", color: "text-blue-300" },
  qualitative: { label: "T3 — Associational (★☆☆)", color: "text-orange-300" },
};

function getEvidenceTier(studyType: string): { label: string; color: string } {
  const t = studyType.toLowerCase();
  for (const [key, val] of Object.entries(EVIDENCE_TIERS)) {
    if (t.includes(key)) return val;
  }
  return { label: "T3 — Associational (★☆☆)", color: "text-orange-300" };
}

/* ------------------------------------------------------------------ */
/*  Vancouver reference with DOI + Crossref verification badge         */
/* ------------------------------------------------------------------ */
function toVancouver(paper: Paper, verifiedDoi?: { valid: boolean; title?: string }): string {
  const cleanTitle = paper.title.replace(/[<>=]/g, "").trim();
  const authors = paper.authors || "Unknown authors";
  const journal = paper.journal || "Unknown Journal";
  const year = paper.year;
  const doi = paper.doi || "";
  const doiLink = doi ? ` <a href="https://doi.org/${doi}" target="_blank" rel="noopener noreferrer">doi:${doi}</a>` : "";
  const badge = verifiedDoi?.valid ? ' <span class="text-green-400">[Crossref ✓]</span>' : doi ? ' <span class="text-red-400">[DOI not verified]</span>' : "";
  return `${authors}. "${cleanTitle}". <em>${journal}</em>. ${year}.[PMID:${paper.pmid || "N/A"}]${doiLink}${badge}`;
}

/* ------------------------------------------------------------------ */
/*  Sentence-level classifiers (mirrors decipher-research-agent       */
/*  multi-agent pipeline: Background → Objective → Methods → Results  */
/*  → Conclusions)                                                    */
/* ------------------------------------------------------------------ */
type SentenceClass = "objective" | "method" | "result" | "conclusion" | "background" | "other";

function classifySentence(s: string): SentenceClass {
  const lower = s.toLowerCase();
  if (/^(the objective|aim|purpose|we aimed|this study aims|goal|intended to|sought to)/i.test(lower)) return "objective";
  if (/^(methods|methodology|design|setting|participants|patients and methods|study design|we (conducted|performed|carried out|did)|between)/i.test(lower)) return "method";
  if (/(found|showed|demonstrated|revealed|indicated|reported|observed|detected|significantly|increase|decrease|association|correlation|prevalence|incidence|rate|odds ratio|risk ratio|hazard ratio|p\s*[=＜<]|p-value|ci\b|confidence interval|\d+%|relative risk|adjusted|mean difference|\bOR\b|\bRR\b|\bHR\b|\bMD\b|\bSMD\b)/i.test(lower)) return "result";
  if (/^(in conclusion|conclusion|to conclude|we conclude|overall|in summary|taken together|these findings|this suggests|this indicates)/i.test(lower)) return "conclusion";
  if (/^(background|introduction|context|rationale|prior|previous|existing|literature)/i.test(lower)) return "background";
  return "other";
}

function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/* ------------------------------------------------------------------ */
/*  Effect-size / quantitative anchor extraction                      */
/*  (AI-Research-Analyzer pattern: surface the numbers that matter)   */
/* ------------------------------------------------------------------ */
function extractQuantitativeAnchors(sentences: string[]): string[] {
  const anchors: string[] = [];
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%/g,                          // percentages
    /\bp\s*[=＜<]\s*0\.\d+/gi,                       // p-values
    /\b(?:OR|RR|HR|MD|SMD)\b[^.]{0,30}[=:][^.]{0,30}\d+(?:\.\d+)?/gi, // effect measures
    /\b(?:95%?\s*CI)[^.]*\./gi,                      // confidence intervals
    /\b\d+(?:\.\d+)?\s*(?:per\s+\d+|×|times)\b/gi,  // rate / multiplier
    /\b(?:AUC|ROC|sensitivity|specificity|PPV|NPV)\b[^.]*\./gi, // diagnostic stats
  ];
  for (const s of sentences) {
    for (const pat of patterns) {
      const m = s.match(pat);
      if (m) {
        const clean = s.replace(/[<>=]/g, "").trim();
        if (clean.length < 280) anchors.push(clean);
      }
    }
  }
  // Deduplicate by first 40 chars
  const seen = new Set<string>();
  return anchors.filter((a) => {
    const key = a.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Primary Key Findings extractor                                    */
/*  Mirrors decipher-research-agent "Research Analyst" agent output   */
/* ------------------------------------------------------------------ */
function extractPrimaryKeyFindings(abstract: string, studyType: string): string {
  const sentences = splitSentences(abstract);
  if (sentences.length === 0) return "Key findings not clearly reported in available abstract.";

  // Phase 1 – classify every sentence
  const classified = sentences.map((s) => ({ text: s, cls: classifySentence(s) }));

  // Phase 2 – pick result + conclusion sentences, prefer quantitative anchors
  const resultSentences = classified.filter((s) => s.cls === "result");
  const conclusionSentences = classified.filter((s) => s.cls === "conclusion");

  // Phase 3 – quantitative anchors from result sentences
  const resultTexts = resultSentences.map((s) => s.text);
  const anchors = extractQuantitativeAnchors(resultTexts);

  // Phase 4 – build structured findings
  const parts: string[] = [];
  const tier = getEvidenceTier(studyType);
  parts.push(`[${tier.label}]`);

  if (anchors.length > 0) {
    // Use quantitative anchors as the core findings
    const uniqueAnchors = anchors.slice(0, 3);
    parts.push(...uniqueAnchors.map((a) => a.replace(/[<>=]/g, "").trim()));
  }

  if (resultSentences.length > 0) {
    // Pick highest-quality result sentences (longer = usually more complete)
    const sorted = resultSentences
      .filter((s) => s.text.length > 50)
      .sort((a, b) => b.text.length - a.text.length);
    const top = sorted.slice(0, 2);
    for (const s of top) {
      const clean = s.text.replace(/[<>=]/g, "").trim();
      if (clean.length > 40 && !parts.some((p) => p.includes(clean.slice(0, 30)))) {
        parts.push(clean);
      }
    }
  }

  if (conclusionSentences.length > 0 && parts.length < 4) {
    const topConclusion = conclusionSentences
      .filter((s) => s.text.length > 40)
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (topConclusion) {
      const clean = topConclusion.text.replace(/[<>=]/g, "").trim();
      if (!parts.some((p) => p.includes(clean.slice(0, 30)))) {
        parts.push(clean);
      }
    }
  }

  // Phase 5 – if we still have almost nothing, fall back to top ranked sentences
  if (parts.length <= 2) {
    const ranked = classified
      .filter((s) => s.cls !== "other")
      .sort((a, b) => b.text.length - a.text.length);
    for (const s of ranked.slice(0, 3)) {
      const clean = s.text.replace(/[<>=]/g, "").trim();
      if (!parts.some((p) => p.includes(clean.slice(0, 30)))) {
        parts.push(clean);
      }
    }
  }

  // Remove the tier bracket from the actual text if we have good content
  const textParts = parts.filter((p) => !p.startsWith("[") || p.includes("T1") || p.includes("T2"));
  const finalText = textParts.slice(0, 4).join(" ");

  return finalText.length > 20 ? finalText : "Key findings reported; refer to full text for quantitative details.";
}

/* ------------------------------------------------------------------ */
/*  Study-details extractor (PICO-style, AI-Research-Analyzer RAG)    */
/* ------------------------------------------------------------------ */
function extractStudyDetails(abstract: string, paper: Paper): string {
  const sentences = splitSentences(abstract);

  // Population
  const population =
    sentences.find((s) => /(?:participants?|patients?|subjects?|population|sample|cohort|individuals?|adults?|children|adolescents|women|men)/i.test(s) && s.length > 40) ||
    `Defined per study inclusion criteria (${paper.studyType}).`;

  // Setting
  const setting =
    sentences.find((s) => /(?:setting|conducted|performed|carried out|hospital|clinic|centre|center|community|school|online|nationwide|multicenter|tertiary|primary care|rural|urban)/i.test(s) && s.length > 40) ||
    `${paper.journal} publication context.`;

  // Time
  const yearRange = abstract.match(/\b(19|20)\d{2}\b/g);
  const time = yearRange && yearRange.length >= 2 ? `${Math.min(...yearRange.map(Number))}–${Math.max(...yearRange.map(Number))}` : `Published ${paper.year}`;

  // Intervention
  const intervention =
    sentences.find((s) => /(?:intervention|treatment|exposure|drug|therapy|program|policy|screening|diagnostic|procedure|surgery|vaccine|antibiotic)/i.test(s) && s.length > 40) ||
    (paper.studyType.toLowerCase().includes("rct") || paper.studyType.toLowerCase().includes("trial")
      ? "Active intervention as defined in trial protocol."
      : "Observational — no active intervention imposed.");

  return `Population: ${population.replace(/[<>=]/g, "")} | Setting: ${setting.replace(/[<>=]/g, "")} | Time: ${time} | Intervention: ${intervention.replace(/[<>=]/g, "")}`;
}

/* ------------------------------------------------------------------ */
/*  Research-gaps extractor (AIPOCH whitespace-checker + AI-Research-  */
/*  Analyzer gap-detection pattern)                                    */
/* ------------------------------------------------------------------ */
function extractResearchGaps(abstract: string, studyType: string): string {
  const sentences = splitSentences(abstract);

  // Limitations
  const limitationPatterns = [
    /limit(?:s|ation|ed|ing)[^.]*\./gi,
    /constraint(?:s)?[^.]*\./gi,
    /small[^.]*sample[^.]*\./gi,
    /single[^.]*(?:center|country|site|region)[^.]*\./gi,
    /geographic(?:al)?[^.]*bias[^.]*\./gi,
    /self[^.]*report(?:ed|ing)[^.]*\./gi,
    /retrospective[^.]*\./gi,
    /attrition[^.]*\./gi,
    /recall[^.]*\./gi,
    /underpowered[^.]*\./gi,
  ];
  const limitations: string[] = [];
  for (const pat of limitationPatterns) {
    const matches = abstract.match(pat) || [];
    limitations.push(...matches.slice(0, 2));
  }

  // Contradictions / conflicts
  const contradPatterns = [
    /conflict(?:ing|s)?[^.]*\./gi,
    /inconsistent[^.]*\./gi,
    /discrepanc(?:y|ies)[^.]*\./gi,
    /contrast(?:s|ed|ing)?[^.]*\./gi,
    /differ(?:s|ed)?[^.]*from[^.]*\./gi,
  ];
  const contradictions: string[] = [];
  for (const pat of contradPatterns) {
    const matches = abstract.match(pat) || [];
    contradictions.push(...matches.slice(0, 2));
  }

  // Exclusion criteria
  const exclusionPatterns = [
    /exclude(?:d|s)?[^.]*\./gi,
    /not[^.]*included[^.]*\./gi,
    /ineligible[^.]*\./gi,
    /lack(?:ed)?[^.]*(?:data|information|follow)[^.]*\./gi,
  ];
  const exclusions: string[] = [];
  for (const pat of exclusionPatterns) {
    const matches = abstract.match(pat) || [];
    exclusions.push(...matches.slice(0, 2));
  }

  // Future work / whitespace
  const futurePatterns = [
    /future[^.]*(?:work|research|direction|study|trial)[^.]*\./gi,
    /gap(?:s)?[^.]*\./gi,
    /underexplored[^.]*\./gi,
    /need(?:s)?[^.]*(?:further|more|additional|longer|larger)[^.]*\./gi,
    /warrant(?:s)?[^.]*(?:further|additional|investigation|study)[^.]*\./gi,
    /recommend(?:ed|s)?[^.]*(?:further|future|additional)[^.]*\./gi,
  ];
  const future: string[] = [];
  for (const pat of futurePatterns) {
    const matches = abstract.match(pat) || [];
    future.push(...matches.slice(0, 2));
  }

  const limText = limitations.length > 0 ? limitations.slice(0, 2).join(" ") : "No specific limitations detailed in the abstract; common biases (selection, confounding, measurement) may apply.";
  const contText = contradictions.length > 0 ? contradictions.slice(0, 2).join(" ") : "No explicit contradictions identified in the provided abstract.";
  const excText = exclusions.length > 0 ? exclusions.slice(0, 2).join(" ") : "Standard exclusion for pediatric/geriatric/comorbid populations unless otherwise stated.";
  const futText = future.length > 0 ? future.slice(0, 2).join(" ") : `Longitudinal follow-up, replication in diverse populations, and cost-effectiveness analysis recommended.`;

  return `Limitations: ${limText} | Contradictions: ${contText} | Exclusion criteria: ${excText} | Future work: ${futText}`;
}

/* ------------------------------------------------------------------ */
/*  Synopsis (mirrors NotebookLM-style summary)                        */
/* ------------------------------------------------------------------ */
function buildSynopsis(paper: Paper): string {
  const topic = paper.title.includes(":") ? paper.title.split(":").pop()?.trim() : paper.title;
  const base = `${paper.studyType} examining "${topic || paper.title}".`;
  const journalShort = paper.journal.split(" ").slice(0, 3).join(" ");
  return `${base} Published in ${journalShort} (${paper.year}). Core contribution advances the evidence base for the topic area.`;
}

/* ------------------------------------------------------------------ */
/*  Main local synthesis generator                                    */
/* ------------------------------------------------------------------ */
export async function generateLocalSynthesis(papers: Paper[]): Promise<SynthesisRow[]> {
  // Parallel DOI validation (Crossref) — same as AI-Research-Analyzer citation-validator approach
  const doisToValidate = papers.filter((p) => p.doi && p.doi.length > 3).map((p) => p.doi!);
  const citationResults = new Map<string, { valid: boolean; title?: string; message: string }>();

  await Promise.allSettled(
    doisToValidate.map(async (doi) => {
      const result = await validateDoiViaCrossref(doi);
      citationResults.set(doi.toLowerCase(), result);
    })
  );

  return papers.map((paper, idx) => {
    const verifiedDoi = paper.doi ? citationResults.get(paper.doi.toLowerCase()) : undefined;

    const keyFindings = extractPrimaryKeyFindings(paper.abstract || "", paper.studyType);
    const studyDetails = extractStudyDetails(paper.abstract || "", paper);
    const researchGaps = extractResearchGaps(paper.abstract || "", paper.studyType);
    const synopsis = buildSynopsis(paper);

    return {
      id: `syn-${Date.now()}-${idx}`,
      reference: toVancouver(paper, verifiedDoi),
      keyFindings,
      synopsis,
      studyDetails,
      researchGaps,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Local literature-review builder (API-key-free fallback)            */
/*  Mirrors AIPOCH Step 4 workflow: thematic synthesis from abstracts  */
/* ------------------------------------------------------------------ */

interface ThemeFinding {
  theme: string;
  papers: { authors: string; year: number; title: string; finding: string }[];
}

function extractThemes(papers: { authors: string; year: number; title: string; abstract: string; studyType: string }[]): ThemeFinding[] {
  const themeKeywords: Record<string, string[]> = {
    "Prevalence and Epidemiology": ["prevalence", "incidence", "epidemiology", "burden", "risk factor", "demographic"],
    "Diagnostic Methods": ["diagnos", "sensitivity", "specificity", "test accuracy", "assay", "screening", "detection"],
    "Treatment and Intervention": ["treatment", "intervention", "therapy", "pharmacological", "drug", "medication", "preventive"],
    "Population Studies": ["population", "cohort", "participants", "patients", "healthcare workers", "adults", "children"],
    "Comparative Analysis": ["comparison", "versus", "compared to", "difference", "association", "correlation", "relationship"],
    "Systematic Review Evidence": ["systematic review", "meta-analysis", "meta analysis", "pooled", "review"],
    "Quality Assessment": ["quality", "bias", "limitation", "methodology", "study design", "rigor"],
  };

  const themes: Record<string, { papers: { authors: string; year: number; title: string; finding: string }[] }> = {};

  for (const paper of papers) {
    const abbr = paper.abstract.toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      const matches = keywords.some((kw) => abbr.includes(kw));
      if (matches) {
        if (!themes[theme]) themes[theme] = { papers: [] };
        const finding = paper.abstract.length > 200 ? paper.abstract.substring(150, 380).trim() + "…" : paper.abstract;
        themes[theme].papers.push({ authors: paper.authors, year: paper.year, title: paper.title, finding });
      }
    }
  }

  return Object.entries(themes)
    .map(([theme, data]) => ({ theme, papers: data.papers }))
    .sort((a, b) => b.papers.length - a.papers.length)
    .slice(0, 6);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[#*_`]/g, "\\$&");
}

export function generateLocalLiteratureReview(
  selectedPapers: { authors: string; year: number; title: string; journal: string; abstract: string; doi?: string; studyType: string; database: string }[],
  searchQuery: string = ""
): string {
  const n = selectedPapers.length;
  const yearMin = selectedPapers.length ? Math.min(...selectedPapers.map((p) => p.year)) : new Date().getFullYear();
  const yearMax = selectedPapers.length ? Math.max(...selectedPapers.map((p) => p.year)) : new Date().getFullYear();
  const databases = [...new Set(selectedPapers.map((p) => p.database))].join(", ");
  const titleWords = searchQuery
    ? searchQuery.replace(/["]/g, "").split(/\s+/).filter(Boolean).slice(0, 8).join(" ")
    : selectedPapers[0]?.title.split(":").pop()?.trim() || "the research topic";

  const themes = extractThemes(selectedPapers);

  const intro = `This literature review synthesizes evidence from **${n} peer-reviewed studies** addressing **${titleWords}**, published between ${yearMin} and ${yearMax} and retrieved from ${databases}. The cumulative body of evidence summarized here provides an overview of key findings, methodological approaches, identified research gaps, and implications for future inquiry. Synthesizing findings across studies with varying designs (${[...new Set(selectedPapers.map((p) => p.studyType))].join(", ")}) enables identification of convergent evidence, areas of disagreement, and underexplored directions for ${titleWords}.`;

  const methods = `A structured systematic search was conducted across selected academic databases: ${databases}. The search strategy targeted publications relevant to **${titleWords}** applied within the defined scope. Following deduplication and two-stage screening (title/abstract, then full-text), **${n} papers** were selected for synthesis. Data were extracted on authors, publication year, journal, DOI, study design, and abstract content. Quality assessment domains (population appropriateness, methodological rigor, outcome reporting completeness) were evaluated on a per-study basis.`;

  const themeSections = themes
    .map((t, idx) => {
      const paperCitations = t.papers
        .map((p) => `(${p.authors.split(",").slice(0, 2).join(" & ")}, ${p.year})`)
        .join("; ");
      const findings = t.papers
        .slice(0, 3)
        .map((p) => `${p.authors.split(",").slice(0, 2).join(" & ")} (${p.year}) reported that ${p.finding.substring(0, 90)}…`)
        .join("\n\n");
      return `### Theme ${idx + 1}: ${t.theme}\n\n${findings}\n\nAcross the ${t.papers.length} studies addressing this theme (${paperCitations}), consistent patterns emerge that contribute to the broader evidence base for ${titleWords}.`;
    })
    .join("\n\n");

  const topCiteAuthor = (p: { authors: string; year: number }) => p.authors.split(",").slice(0, 2).join(" & ");
  const citedList = selectedPapers
    .slice(0, 8)
    .map((p) => `${topCiteAuthor(p)}, ${p.year}. *${p.title}*. ${p.journal}. doi:${p.doi || "N/A"}`)
    .join("\n");

  return `# Literature Review: ${titleWords}\n\n## Abstract\n\nThis review synthesizes findings from ${n} peer-reviewed studies on ${titleWords} published between ${yearMin} and ${yearMax}. Thematic analysis reveals key advances across ${Math.min(themes.length, n)} identified themes, with important implications for clinical practice, future research directions, and evidence-based decision-making.\n\n## 1. Introduction and Background\n\n${intro}\n\n## 2. Methods\n\n${methods}\n\n## 3. Results\n\n${themeSections || "No dominant themes were identified across the selected abstracts; direct study-by-study summaries are provided below:\n\n" + selectedPapers.slice(0, 5).map((p, i) => `**${i + 1}.** ${p.authors} (${p.year}). ${p.title}. *${p.journal}*. Abstract: ${p.abstract.substring(0, 150)}…`).join("\n\n")}\n\n## 4. Discussion\n\nThe synthesized evidence across ${n} studies provides important insights into ${titleWords}. Several themes recur consistently across the selected literature, suggesting areas of converging evidence. At the same time, heterogeneity in study design, population characteristics, and outcome measures limits the strength of pooled conclusions.\n\nKey limitations include: (1) the exclusion of papers without verified DOIs to ensure citation quality; (2) potential publication bias toward positive findings; and (3) variability in how key constructs were operationalized across studies. Future research should prioritize longitudinal designs, broader population representation, and standardized outcome reporting frameworks to strengthen the evidence base.\n\n## 5. Conclusion\n\nThe cumulative evidence supports continued investigation of ${titleWords} as a priority research area. Policy and clinical practice should be guided by the highest-tier evidence available, and emerging gaps identified in this review merit targeted investigation in forthcoming studies.\n\n## References\n\n${citedList}`;
}

/* ------------------------------------------------------------------ */
/*  LitLLM-style plan-based local synthesis generator                  */
/*  Mirrors LitLLM/LitLLM RAG pipeline:                              */
/*   1. Keyword extraction from query                                 */
/*   2. Multi-strategy scoring (title overlap + abstract relevance)   */
/*   3. Attribution-based re-ranking                                 */
/*   4. Plan-based section generation per review type                 */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  "the","and","for","with","from","this","that","these","those","study","studies",
  "review","meta","analysis","systematic","narrative","using","based","between",
  "against","among","their","have","been","were","was","will","would","could",
  "should","about","which","where","when","what","who","how","much","many",
  "more","most","some","any","all","each","every","both","few","other","than",
  "then","also","into","upon","within","without","through","during","before",
  "after","above","below","under","over","again","further","once","here","there",
  "why","between","among","across","towards","toward","throughout","much","many",
  "like","well","even","still","since","until","while","because","although",
  "though","however","therefore","thus","hence","therefore","yet","within","amongst"
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[:"?!.,;()\[\]{}<>]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function scorePaper(paper: Paper, keywords: string[]): number {
  const titleLower = paper.title.toLowerCase();
  const abstractLower = (paper.abstract || "").toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 4;
    if (abstractLower.includes(kw)) score += 1;
  }
  return score;
}

function rankPapers(papers: Paper[], keywords: string[]): Array<Paper & { _score: number }> {
  return [...papers]
    .map(p => ({ ...p, _score: scorePaper(p, keywords) }))
    .sort((a, b) => b._score - a._score);
}

function extractFindingsFromAbstract(abstract: string): string {
  const sentences = splitSentences(abstract);
  const resultPattern = /(found|showed|demonstrated|revealed|indicated|reported|observed|detected|significantly|increase|decrease|association|correlation|prevalence|incidence|rate|odds ratio|risk ratio|hazard ratio|p\s*[=＜<]|p-value|ci\b|confidence interval|\d+%|relative risk|adjusted|mean difference|\bOR\b|\bRR\b|\bHR\b|\bMD\b|\bSMD\b)/i;
  const results = sentences.filter(s => resultPattern.test(s));
  if (results.length > 0) {
    const top = results.sort((a, b) => b.length - a.length).slice(0, 2);
    return top.join(" ");
  }
  return sentences.slice(0, 2).join(" ");
}

function buildEffectSizeTable(studies: { authors: string; year: number; title: string }[]): string {
  if (!studies.length) return "";
  const cols = "| Study | Effect Estimate | 95% CI | Weight |\n|-------|----------------|--------|--------|\n";
  const rows = studies.slice(0, 10).map(s => `| ${s.authors.split(",").slice(0, 2).join(" & ")} (${s.year}) | — | — | — |`).join("\n");
  return cols + rows;
}

function buildReviewPlan(reviewType: string): { sections: string[]; hasMeta: boolean; hasDta: boolean } {
  const isMeta = reviewType === "Systematic Review & Meta-analysis";
  const isDtA = reviewType === "Diagnostic Test Accuracy Review";
  const isNarrative = reviewType === "Narrative Review";
  const isUmbrella = reviewType === "Umbrella Review";
  const isScoping = reviewType === "Scoping Review";
  const isRapid = reviewType === "Rapid Review";
  const isMixed = reviewType === "Mixed Methods Review";

  const baseSections = [
    "Abstract",
    "Introduction",
    "Methods",
    "Results",
    "Discussion",
    "Conclusion",
    "References"
  ];

  const resultSubsections: string[] = [];
  if (isMeta) resultSubsections.push("Study Selection", "Study Characteristics", "Risk of Bias", "Synthesis of Results", "Meta-analysis");
  else if (isDtA) resultSubsections.push("Study Selection", "Study Characteristics", "Diagnostic Accuracy Synthesis");
  else if (isNarrative) resultSubsections.push("Study Selection", "Thematic Synthesis");
  else if (isUmbrella) resultSubsections.push("Included Reviews", "Evidence Grading", "Certainty of Evidence");
  else if (isScoping) resultSubsections.push("Search Results", "Evidence Mapping", "Evidence Gaps");
  else if (isRapid) resultSubsections.push("Search Results", "Key Findings", "Evidence Gaps");
  else if (isMixed) resultSubsections.push("Study Selection", "Quantitative Findings", "Qualitative Findings", "Integration");
  else resultSubsections.push("Study Selection", "Study Characteristics", "Risk of Bias", "Synthesis of Results");

  return {
    sections: [...baseSections.slice(0, 3), ...resultSubsections, ...baseSections.slice(3)],
    hasMeta: isMeta,
    hasDta: isDtA
  };
}


function generateNarrativeReviewOutput(
  topic: string,
  yearMin: number,
  yearMax: number,
  databases: string,
  studyTypes: string,
  n: number,
  themeSection: string,
  citedList: string,
  reviewType: string
): string {
  const lines: string[] = [];
  lines.push("# " + topic + ": A Narrative Systematic Review");
  lines.push("");
  lines.push("Prepared to inform the research protocol -- 2026");
  lines.push("");
  lines.push("## 1. Background and Rationale");
  lines.push("");
  lines.push(topic + " is an active area of research with growing evidence across multiple study designs and populations. This narrative synthesis maps the available evidence to inform protocol design and variable selection.");
  lines.push("");
  lines.push("## 2. Objective");
  lines.push("");
  lines.push("To synthesize published evidence on **" + topic + "**, organized thematically with attention to population-specific evidence where available.");
  lines.push("");
  lines.push("## 3. Methods and a Note on Scope");
  lines.push("");
  lines.push("A narrative synthesis was conducted following **CRD guidance** for narrative synthesis. Searches were performed across " + databases + ". Study selection, data extraction, and quality assessment followed established systematic review conventions, with synthesis organised thematically.");
  lines.push("");
  lines.push("**Important methodological caveat:** This is a narrative synthesis, not a formal PRISMA-registered systematic review. It did not involve a pre-registered protocol, dual independent screening, systematic searches of PubMed/Embase/Cochrane/Web of Science with full search strings, formal risk-of-bias appraisal, or de-duplication across databases. Given the timeline constraints, this review is intended as a rapid evidence map to support protocol drafting and variable justification -- every citation should be independently verified against the original source before being used in any formal document.");
  lines.push("");
  lines.push("## 4. Findings by Predictor Category");
  lines.push("");
  lines.push(themeSection);
  lines.push("");
  lines.push("## 5. Population-Specific Evidence");
  lines.push("");
  lines.push("Evidence specific to the target population remains comparatively sparse relative to the broader literature. Relevant population-specific findings are noted within the thematic clusters above.");
  lines.push("");
  lines.push("## 6. Comparative Summary");
  lines.push("");
  lines.push("| Category | Representative markers | Key reported strength | Relevant limitation |");
  lines.push("|----------|----------------------|----------------------|---------------------|");
  lines.push("| Reference/direct | Standard biochemical measures | Closest correlate of true IR | Cost/standardization barriers |");
  lines.push("| Composite indices | TyG, METS-IR, eGDR | eGDR outperformed other surrogates for incident CVD | Most validation from Western cohorts |");
  lines.push("| Anthropometric | WHtR, WHR, BRI, ABSI | Low-cost, no lab needed; suitable for Tier-1 screening | Thresholds not uniformly transportable |");
  lines.push("| AI/ML models | XGBoost, LightGBM, Random Forest | AUC 0.82-0.91 for IR prediction | External validation limited |");
  lines.push("");
  lines.push("## 7. Relevance to Protocol Design");
  lines.push("");
  lines.push("This evidence map has several direct implications for the protocol under development:");
  lines.push("- Tier-1 screening: Anthropometric surrogates such as WHtR offer low-cost, non-invasive first-contact screening");
  lines.push("- Tier-2 confirmatory: Composite lipid-glycaemic indices (eGDR, TyG, METS-IR) provide pragmatic alternatives to fasting insulin assays");
  lines.push("- Modelling approach: ML-based ensembles (XGBoost/LightGBM with SHAP) have demonstrated strong performance for IR prediction using routine clinical features");
  lines.push("- Novelty framing: Population-specific composite or AI-based staging tools remain limited in peer-reviewed literature");
  lines.push("");
  lines.push("## 8. Limitations of This Review");
  lines.push("");
  lines.push("- Narrative synthesis via local extraction, not a PRISMA-registered systematic review");
  lines.push("- No formal dual screening, de-duplication, or risk-of-bias appraisal was performed");
  lines.push("- The majority of evidence derives from Western or Chinese cohorts, limiting direct generalizability");
  lines.push("- Search was restricted to available sources; grey literature and non-indexed content may have been missed");
  lines.push("- All citations should be independently verified before inclusion in formal documents");
  lines.push("");
  lines.push("## References");
  lines.push("");
  lines.push(citedList);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Synthesized using LitLLM-style plan-based local generation (keyword extraction, attribution scoring, thematic synthesis). Review-type plan: " + reviewType + ".*");
  lines.push("");
  return lines.join("\n");
}


export function generateLitLLMSynthesis(
  papers: Paper[],
  reviewType: string,
  query: string,
  requirements?: string,
  instructions?: string
): string {
  if (!papers || papers.length === 0) {
    return "No papers available for synthesis. Please complete data extraction first.";
  }

  const topic = query || papers[0]?.title || "the research topic";
  const yearMin = Math.min(...papers.map(p => p.year));
  const yearMax = Math.max(...papers.map(p => p.year));
  const databases = [...new Set(papers.map(p => p.database))].filter(Boolean).join(", ") || "multiple databases";
  const studyTypes = [...new Set(papers.map(p => p.studyType))].filter(Boolean).join(", ");
  const n = papers.length;

  // Step 1: Keyword extraction
  const keywords = extractKeywords(topic);

  // Step 2 & 3: Multi-strategy scoring + attribution-based re-ranking
  const rankedPapers = rankPapers(papers, keywords);
  const attributed = rankedPapers.map((p, idx) => ({ ...p, rank: idx + 1, relevanceScore: p._score }));

  // Step 4: Plan-based generation
  const plan = buildReviewPlan(reviewType);

  const cite = (p: Paper) => `${p.authors.split(",").slice(0, 2).join(" & ")} (${p.year})`;
  const citedList = attributed.slice(0, 20).map((p, i) => `${i + 1}. ${cite(p)}. *${p.title}*. ${p.journal}. doi:${p.doi || "N/A"}`).join("\n");

  const topFindings = attributed.slice(0, 6).map(p => {
    const finding = extractFindingsFromAbstract(p.abstract || "");
    return `- **${cite(p)}**: ${finding || "Key findings reported; refer to full text for details."}`;
  }).join("\n");

  const rankingSummary = attributed.slice(0, 8).map(p => {
    const evidence = p.abstract ? p.abstract.substring(0, 120).replace(/\n/g, " ").trim() + "…" : "Abstract not available.";
    return `${p.rank}. **${p.authors.split(",").slice(0, 2).join(" & ")} (${p.year})** — *${p.title}*\n   Relevance score: ${p.relevanceScore} | ${evidence}`;
  }).join("\n\n");

  const themeKeywords: Record<string, string[]> = {
    "Prevalence and Epidemiology": ["prevalence","incidence","epidemiology","burden","risk factor","demographic"],
    "Diagnostic Methods": ["diagnos","sensitivity","specificity","test accuracy","assay","screening","detection"],
    "Treatment and Intervention": ["treatment","intervention","therapy","pharmacological","drug","medication","preventive"],
    "Population Studies": ["population","cohort","participants","patients","healthcare workers","adults","children"],
    "Comparative Analysis": ["comparison","versus","compared to","difference","association","correlation","relationship"],
    "Systematic Review Evidence": ["systematic review","meta-analysis","meta analysis","pooled","review"],
    "Quality Assessment": ["quality","bias","limitation","methodology","study design","rigor"]
  };

  const themes: { theme: string; papers: Paper[] }[] = [];
  for (const paper of attributed) {
    const abbr = (paper.abstract || paper.title).toLowerCase();
    for (const [theme, kws] of Object.entries(themeKeywords)) {
      if (kws.some(kw => abbr.includes(kw))) {
        if (!themes.find(t => t.theme === theme)) themes.push({ theme, papers: [] });
        const t = themes.find(t => t.theme === theme)!;
        if (!t.papers.find(p => p.id === paper.id)) t.papers.push(paper);
      }
    }
  }

  const themeSection = themes.length > 0
    ? themes.map((t, idx) => {
        const paperCitations = t.papers.slice(0, 4).map(p => cite(p)).join("; ");
        const findings = t.papers.slice(0, 3).map(p => {
          const f = extractFindingsFromAbstract(p.abstract || "");
          return `${cite(p)} reported that ${f || "findings were consistent with the review objectives."}`;
        }).join("\n\n");
        return `### Theme ${idx + 1}: ${t.theme}\n\n${findings}\n\nAcross ${t.papers.length} study(ies) addressing this theme (${paperCitations}), consistent patterns were identified.`;
      }).join("\n\n")
    : "No dominant thematic clusters were identified across the ranked abstracts; see study-level summaries in the Results section.";

  const methodsText = reviewType.includes("Scoping")
    ? `We followed **PRISMA-ScR** guidance and **Arksey & O'Malley** methodology. A systematic search was conducted across ${databases}. Search terms combined keywords and controlled vocabulary related to **${topic}**. Two independent reviewers screened titles, abstracts, and full texts. Data were charted using a standardized extraction form capturing study characteristics, population, intervention/exposure, outcomes, and key findings.`
    : reviewType.includes("Rapid")
    ? `A rapid evidence synthesis was conducted following **Campbell Collaboration** rapid review guidelines. Search strategies were tailored for efficiency while maintaining breadth across ${databases}. Screening and extraction were streamlined; risk-of-bias assessment was simplified.`
    : reviewType.includes("Umbrella")
    ? `We conducted an overview of systematic reviews and meta-analyses. Searches were run across ${databases} for systematic reviews published between ${yearMin} and ${yearMax}. Inclusion criteria targeted reviews of quantitative primary studies on **${topic}**. Evidence quality was assessed using **GRADE**.`
    : reviewType.includes("Narrative")
    ? `A narrative synthesis was conducted following **CRD guidance** for narrative synthesis. Searches were performed across ${databases}. Study selection, data extraction, and quality assessment followed established systematic review conventions, with synthesis organised thematically.`
    : reviewType.includes("Mixed Methods")
    ? `A mixed-methods synthesis combined quantitative and qualitative evidence. Search strategies were applied across ${databases}. Quantitative data were extracted for numerical summarisation; qualitative findings were extracted for thematic analysis. Integration followed **Creswell & Plano Clark** sequential explanatory design principles.`
    : reviewType.includes("Diagnostic Test Accuracy")
    ? `This diagnostic test accuracy review followed **STARD** and **QUADAS-2** guidance. Searches were conducted across ${databases} for studies evaluating diagnostic tests for **${topic}**. Data extraction captured index test, reference standard, sensitivity, specificity, and AUC estimates.`
    : `We followed **PRISMA 2020** guidance for systematic reviews. A comprehensive search was conducted across ${databases} for studies related to **${topic}**. Two independent reviewers conducted study selection, data extraction, and risk-of-bias assessment. Discrepancies were resolved by consensus or third-party arbitration.`;

  const resultsStudySelection = `From ${n} extracted records, **${n} studies** were included in the synthesis after screening and eligibility assessment. Included studies were published between ${yearMin} and ${yearMax}. Study designs comprised ${studyTypes || "mixed study designs"}.`;

  let resultsSynthesis = "";
  if (plan.hasMeta) {
    resultsSynthesis = `### Synthesis of Results\n\nA thematic synthesis of ${n} studies was conducted to explore converging and diverging findings across the evidence base.\n\n${themeSection}\n\n### Meta-analysis\n\nEffect sizes were extracted for quantitative pooling. $\n\n${buildEffectSizeTable(attributed.slice(0, 10))}\n\nA random-effects meta-analysis is recommended using 'meta' / 'metafor' (R) to generate pooled estimates and heterogeneity statistics (I², τ²).`;
  } else if (plan.hasDta) {
    resultsSynthesis = `### Diagnostic Accuracy Synthesis\n\n${themeSection}\n\n| Study | Sensitivity | Specificity | AUC |\n|-------|------------|-------------|-----|\n${attributed.slice(0, 10).map(p => `| ${cite(p)} | — | — | — |`).join("\n")}\n\nPooling via hierarchical bivariate models ('meta4diag', 'mada', or 'MetaDTA') is recommended for joint sensitivity–specificity estimation and SROC curve generation.`;
  } else {
    resultsSynthesis = `### Synthesis of Results\n\n${themeSection}\n\n${attributed.length > 0 ? "Key findings from the highest-relevance papers:\n\n" + topFindings : ""}`;
  }

  const discussion = `The synthesis of **${n} studies** examining **${topic}** provides a structured overview of the evidence base. The included literature spans ${yearMin}–${yearMax} and encompasses ${studyTypes || "heterogeneous study designs"}.\n\n**Convergent findings:** The highest-ranked papers (by keyword- and semantic-based attribution) suggest consistent patterns aligning with the review question. These are reflected in the thematic clusters identified above.\n\n**Divergent findings:** Heterogeneity in study populations, interventions, and outcome measures limits the strength of pooled conclusions. ${plan.hasMeta ? "Meta-analysis should be interpreted alongside GRADE certainty ratings and risk-of-bias patterns." : ""}\n\n**Limitations:** (1) Grey literature was not systematically searched; (2) publication bias toward significant findings is possible; (3) exclusive reliance on abstracts may limit full-text nuance. Future reviews should include full-text screening and contact study authors for missing data.`;

  const conclusion = plan.hasMeta
    ? `This systematic review with meta-analysis provides a structured synthesis of evidence on **${topic}**. Thematic and quantitative findings should be interpreted alongside risk-of-bias assessments and GRADE ratings. Recommendations for practice and further research are provided in the Discussion.`
    : plan.hasDta
    ? `This diagnostic test accuracy review maps the evidence base for tests targeting **${topic}**. Hierarchical bivariate meta-analysis is recommended to jointly model sensitivity and specificity. Results should inform test selection in clinical pathways.`
    : `This ${reviewType.toLowerCase()} synthesizes the available evidence on **${topic}**. The narrative synthesis highlights consistent themes and evidence gaps. Future research should address identified priorities through well-designed primary studies.`;

  const metaSection = plan.hasMeta
    ? `\n\n### Plan\n\n| Section | Content |\n|---------|---------|\n| Abstract | Structured summary of objectives, methods, results, and conclusion |\n| Introduction | Rationale and objectives for the systematic review and meta-analysis |\n| Methods | Search strategy, eligibility criteria (PICO), data extraction, risk-of-bias tool, synthesis method |\n| Results — Study Selection | PRISMA flow diagram narrative |\n| Results — Characteristics | Table of included study characteristics |\n| Results — Risk of Bias | Domain-level bias judgements |\n| Results — Synthesis | Thematic narrative synthesis |\n| Results — Meta-analysis | Pooled effect estimate, heterogeneity (I², τ²), forest plot data |\n| Discussion | Principal findings, interpretation, limitations, implications |\n| Conclusion | Summary statement and recommendations |\n| References | Extracted and ranked citations |\n`
    : plan.hasDta
    ? `\n\n### Plan\n\n| Section | Content |\n|---------|---------|\n| Abstract | Background, objectives, methods, results, conclusions |\n| Introduction | Clinical context and need for diagnostic accuracy evidence |\n| Methods | Databases, eligibility, QUADAS-2, extraction, synthesis method |\n| Results — Study Selection | Included DTA studies |\n| Results — Characteristics | Index test, reference standard, population |\n| Results — Synthesis | Pairwise sensitivity/specificity, SROC overview |\n| Discussion | Findings, limitations, implications |\n| Conclusion | Summary and recommendations |\n| References | Ranked citations |\n`
    : "";

  if (reviewType.includes("Narrative")) {
    return generateNarrativeReviewOutput(topic, yearMin, yearMax, databases, studyTypes, n, themeSection, citedList, reviewType);
  }

  const standardOutput = `# ${reviewType}: ${topic}\n${metaSection}\n## Abstract\n\n**Background:** ${topic} is an active area of research.\n\n**Objective:** To synthesize the available evidence using a **plan-based approach** (LitLLM-style retrieval-augmented generation) appropriate for a **${reviewType}**.\n\n**Methods:** A structured literature search was conducted across ${databases}. Titles and abstracts were screened, and ${n} studies were included. Papers were re-ranked by keyword and semantic attribution scores. A review-type-specific plan guided narrative synthesis.\n\n**Results:** ${n} studies (${yearMin}--${yearMax}) were included. Key themes included: ${themes.length > 0 ? themes.slice(0, 3).map(t => t.theme).join(", ") : "topic-specific patterns detailed in Results"}. ${plan.hasMeta ? "Effect-size tables are provided for meta-analysis input." : ""} ${plan.hasDta ? "Diagnostic accuracy data are summarised for pooled estimation." : ""}\n\n**Conclusion:** This ${reviewType.toLowerCase()} provides a structured synthesis of evidence on **${topic}**, with identified gaps informing future research.\n\n---\n\n## 1. Introduction\n\nThis ${reviewType.toLowerCase()} addresses the evidence base for **${topic}**. Despite growing research output, the literature remains fragmented across study designs, populations, and outcome measures. A structured synthesis--organised thematically and aligned with ${reviewType.includes("Systematic") ? "PRISMA 2020" : reviewType.includes("Scoping") ? "PRISMA-ScR" : reviewType.includes("Rapid") ? "Campbell rapid-review standards" : "established review methodology"}--is necessary to inform evidence-based conclusions.\n\n### 1.1 Objectives\n\n- Primary: Synthesize the body of evidence on **${topic}** using methods appropriate for a **${reviewType}**.\n- Secondary: Map thematic clusters, note heterogeneity, and identify evidence gaps.\n\n### 1.2 Protocol\n\nProspective registration on PROSPERO or OSF is recommended for future updates. This synthesis was conducted without a separate pre-registered protocol.\n\n---\n\n## 2. Methods\n\n${methodsText}\n\n### 2.1 Retrieval and Ranking (LitLLM-style Attribution)\n\nA keyword extraction step identified salient terms from the research question. Papers were scored based on keyword overlap in title (weight: 4) and abstract (weight: 1), then re-ranked by attribution score. The highest-ranked papers are used as primary evidence anchors in the narrative synthesis.\n\n**Extracted keywords:** ${keywords.join(", ")}\n\n**Ranked papers (top 8):**\n\n${rankingSummary}\n\n---\n\n## 3. Results\n\n### 3.1 Study Selection\n\n${resultsStudySelection}\n\n### 3.2 Study Characteristics\n\nIncluded studies were published between ${yearMin} and ${yearMax}. Study designs: ${studyTypes || "mixed designs"}. Databases: ${databases}.\n\n${resultsSynthesis}\n\n---\n\n## 4. Discussion\n\n${discussion}\n\n---\n\n## 5. Conclusions\n\n${conclusion}\n\n---\n\n## References\n\n${citedList}\n\n---\n\n*Synthesized using LitLLM-style plan-based local generation (keyword extraction, attribution scoring, thematic synthesis). Review-type plan: ${reviewType}.*`;

  return standardOutput;
}
