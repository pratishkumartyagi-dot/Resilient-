import { type Paper, validateDoiViaCrossref } from "./database-apis";

export interface SynthesisRow {
  id: string;
  reference: string;
  keyFindings: string;
  synopsis: string;
  studyDetails: string;
  researchGaps: string;
}

const EVIDENCE_TIERS: Record<string, { label: string; stars: string }> = {
  rct: { label: "T1 (★★★) Mechanistic", stars: "★★★" },
  "systematic review": { label: "T2 (★★☆) Functional", stars: "★★☆" },
  "meta-analysis": { label: "T2 (★★☆) Functional", stars: "★★☆" },
  "observational study": { label: "T3 (★☆☆) Association", stars: "★☆☆" },
  cohort: { label: "T3 (★☆☆) Association", stars: "★☆☆" },
  "case-control": { label: "T3 (★☆☆) Association", stars: "★☆☆" },
  review: { label: "T4 (☆☆☆) Mention", stars: "☆☆☆" },
};

function getEvidenceTier(studyType: string): { label: string; stars: string } {
  const t = studyType.toLowerCase();
  for (const [key, val] of Object.entries(EVIDENCE_TIERS)) {
    if (t.includes(key)) return val;
  }
  return { label: "T3 (★☆☆) Association", stars: "★☆☆" };
}

function toVancouver(paper: Paper, verifiedDoi?: { valid: boolean; title?: string }): string {
  const cleanTitle = paper.title.replace(/[<>=]/g, "").trim();
  const authors = paper.authors || "Unknown authors";
  const journal = paper.journal || "Unknown Journal";
  const year = paper.year;
  const doi = paper.doi || "";
  const doiLink = doi ? ` <a href="https://doi.org/${doi}" target="_blank" rel="noopener noreferrer">doi:${doi}</a>` : "";
  const verified = verifiedDoi?.valid ? " ✓" : "";
  return `${authors}. "${cleanTitle}". <em>${journal}</em>. ${year}.${doiLink}${verified}`;
}

function extractLimitations(abstract: string): string {
  const limitPatterns = [
    /limit(?:s|ation|ed)?[^.]*\./gi,
    /constraint(?:s)?[^.]*\./gi,
    /small[^.]*sample[^.]*\./gi,
    /single[^.]*(?:center|country|site)[^.]*\./gi,
    /geographic(?:al)?[^.]*bias[^.]*\./gi,
    /self[^.]*report(?:ed)?[^.]*\./gi,
  ];
  const matches: string[] = [];
  for (const pat of limitPatterns) {
    const m = abstract.match(pat);
    if (m) matches.push(...m);
  }
  return matches.length > 0 ? matches.slice(0, 3).join(" ") : "Generalizability limited by sample characteristics and study scope.";
}

function extractIntervention(abstract: string, studyType: string): string {
  if (studyType.toLowerCase().includes("rct") || studyType.toLowerCase().includes("trial")) {
    const m = abstract.match(/(?:intervention|treatment|exposure|drug|therapy)[^.]*\./i);
    return m ? m[0].replace(/[<>]/g, "") : "Protocol-driven intervention as described in methods.";
  }
  return "Observational — no active intervention imposed.";
}

function extractTimePeriod(abstract: string, year: number): string {
  const yearRange = abstract.match(/\b(19|20)\d{2}\b/g);
  if (yearRange && yearRange.length >= 2) {
    const years = yearRange.map(Number).sort((a, b) => a - b);
    return `${years[0]}–${years[years.length - 1]}`;
  }
  return `Data collected through ${year}.`;
}

function extractGapsAndContradictions(abstract: string): { gaps: string; contradictions: string } {
  const gapPatterns = [
    /gap(?:s)?[^.]*\./gi,
    /future[^.]*(?:work|research|direction)[^.]*\./gi,
    /underexplored[^.]*\./gi,
    /need(?:s)?[^.]*(?:further|more)[^.]*\./gi,
  ];
  const gapMatches: string[] = [];
  for (const pat of gapPatterns) {
    const m = abstract.match(pat);
    if (m) gapMatches.push(...m);
  }

  const contradPatterns = [
    /conflict(?:ing|s)?[^.]*\./gi,
    /inconsistent[^.]*\./gi,
    /discrepanc(?:y|ies)[^.]*\./gi,
    /contrast(?:s|ed|ing)?[^.]*\./gi,
  ];
  const contradMatches: string[] = [];
  for (const pat of contradPatterns) {
    const m = abstract.match(pat);
    if (m) contradMatches.push(...m);
  }

  return {
    gaps: gapMatches.length > 0 ? gapMatches.slice(0, 2).join(" ") : "Further longitudinal and cross-cultural replication warranted.",
    contradictions: contradMatches.length > 0 ? contradMatches.slice(0, 2).join(" ") : "No explicit contradictions identified in abstract.",
  };
}

function buildKeyFindings(abstract: string, studyType: string): { findings: string; tier: { label: string; stars: string } } {
  const sentences = abstract.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 30);
  const significantSentences = sentences.filter((s) =>
    /significant|association|correlation|effective|reduce|increase|prevalence|outcome|result|finding|difference|impact|risk|factor/i.test(s)
  );

  const findingsPool = significantSentences.length >= 2 ? significantSentences.slice(0, 3) : sentences.slice(0, 2);
  const findingsText = findingsPool.join(" ").replace(/[<>=]/g, "").trim();
  const tier = getEvidenceTier(studyType);

  return {
    findings: `(${tier.label}) ${findingsText || "Key findings reported in study. Refer to full text for detailed quantitative results."}`,
    tier,
  };
}

export async function generateLocalSynthesis(papers: Paper[]): Promise<SynthesisRow[]> {
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
    const { findings, tier } = buildKeyFindings(paper.abstract, paper.studyType);
    const gapsAndContrads = extractGapsAndContradictions(paper.abstract);
    const limitations = extractLimitations(paper.abstract);
    const fullGaps = `Limitations: ${limitations} Contradictions: ${gapsAndContrads.contradictions} Future work: ${gapsAndContrads.gaps}`;

    return {
      id: `local-syn-${Date.now()}-${idx}`,
      reference: toVancouver(paper, verifiedDoi),
      keyFindings: findings,
      synopsis: `${paper.studyType} examining ${paper.title.split(":").pop()?.trim() || "the stated topic"}. Core contribution advances the evidence base for ${paper.journal.split(" ").slice(0, 2).join(" ")}.`,
      studyDetails: `Population: as defined in study inclusion criteria. Setting: ${paper.journal}. Time: ${extractTimePeriod(paper.abstract, paper.year)}. Hypothesis: tested in study design. Intervention: ${extractIntervention(paper.abstract, paper.studyType)}`,
      researchGaps: fullGaps,
    };
  });
}
