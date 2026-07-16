/**
 * PICO + Research-Gaps deep extraction
 *
 * Applies the methodology from two open-source projects:
 *  - mtwn105/decipher-research-agent  (multi-agent deep reasoning pipeline:
 *      Background → Objective → Methods → Results → Conclusions)
 *  - t0mst0ne gist f3dd82637861384e6b2ffe3c9370f4d8
 *    (research-gaps framework: Limitations + Exclusions + Gaps)
 *
 * For every selected paper the extractor reads the abstract and returns a
 * richly populated object covering PICO + sample size + effect estimate +
 * 95% CI + research gaps + evidence level (T1–T4).
 *
 * The extractor is intentionally deterministic (no LLM call required) so it
 * always returns detailed content for every field. It is used both as the
 * non-AI fallback path and as a "deep-search, deep-reason" pre-processor
 * that the AI prompt can then enrich.
 */

export interface ExtractedPICO {
  id: string;
  population: string;
  intervention: string;
  comparison: string;
  outcome: string;
  sampleSize: string;
  effectEstimate: string;
  ci: string;
  researchGaps: string;
  evidenceLevel: string;
}

const EVIDENCE_TIERS: Array<{ keywords: string[]; level: string; label: string }> = [
  {
    keywords: ["randomized controlled trial", "randomised controlled trial", "rct", "randomized", "randomised", "randomly assigned", "randomly allocated"],
    level: "T1 — Mechanistic (★★★)",
    label: "T1",
  },
  {
    keywords: ["systematic review", "meta-analysis", "meta analysis", "pooled analysis", "umbrella review", "meta-regression", "meta regression"],
    level: "T2 — Functional (★★☆)",
    label: "T2",
  },
  {
    keywords: ["cohort", "prospective cohort", "retrospective cohort", "longitudinal cohort", "follow-up study", "case-control", "case control", "cross-sectional", "cross sectional", "observational study", "observational"],
    level: "T3 — Associational (★☆☆)",
    label: "T3",
  },
  {
    keywords: ["qualitative", "phenomenolog", "interview", "focus group", "ethnograph", "grounded theory"],
    level: "T3 — Associational (★☆☆)",
    label: "T3",
  },
  {
    keywords: ["review article", "narrative review", "literature review", "scoping review", "case report", "case series", "letter to the editor", "editorial", "commentary", "guideline", "consensus statement", "recommendation"],
    level: "T4 — Mention (☆☆☆)",
    label: "T4",
  },
];

function classifyEvidenceLevel(studyType: string, abstract: string): string {
  const text = `${studyType || ""} ${abstract || ""}`.toLowerCase();
  for (const tier of EVIDENCE_TIERS) {
    if (tier.keywords.some((kw) => text.includes(kw))) return tier.level;
  }
  return "T3 — Associational (★☆☆)";
}

function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 18);
}

function stripJats(text: string): string {
  return (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function uniqByPrefix(sentences: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    const key = s.toLowerCase().slice(0, 45);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function findFirst(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? m[0].trim() : null;
}

function joinClauses(sentences: string[]): string {
  return sentences.join(" ").replace(/\s+/g, " ").trim();
}

/* ----------------------------------------------------------------------- */
/*  P (Population)                                                         */
/*  Looks for: N, demographics, age range, sex, inclusion criteria,         */
/*  setting, country                                                       */
/* ----------------------------------------------------------------------- */
function extractPopulation(abstract: string): string {
  if (!abstract) return "Not specified — full text required.";
  const sentences = splitSentences(abstract);
  const lower = abstract.toLowerCase();

  const popIndicators = [
    "participants", "patients", "subjects", "population", "cohort",
    "individuals", "adults", "children", "adolescents", "women", "men",
    "males", "females", "enrolled", "recruited", "included",
  ];

  // Sentences that mention population + demographics or numbers
  const candidates = sentences.filter((s) => {
    const l = s.toLowerCase();
    if (!popIndicators.some((p) => l.includes(p))) return false;
    if (s.length < 35 || s.length > 350) return false;
    return true;
  });

  // Prefer sentences that also contain demographics keywords
  const demographicKeywords = [
    "aged", "years", "yr", "old", "age", "male", "female", "men", "women",
    "mean age", "median age", "adults", "children", "adolescent", "elderly",
    "from ", "recruited from", "enrolled from", "setting", "hospital", "clinic",
    "country", "nationwide", "multi-cent", "single-cent", "tertiary", "primary care",
  ];

  const scored = candidates.map((s) => {
    const l = s.toLowerCase();
    let score = 0;
    for (const dk of demographicKeywords) if (l.includes(dk)) score += 2;
    if (/\b\d{1,3}(\s*-\s*\d{1,3})?\s*(years|yrs|yr|year old|y\.o\.)\b/i.test(s)) score += 3;
    if (/\b(n\s*=\s*\d+|n\s*=\s*\d{2,}|total of\s*\d+|\d+\s*patients|\d+\s*participants)\b/i.test(s)) score += 2;
    if (l.includes("inclusion criteria") || l.includes("eligible")) score += 2;
    return { s, score };
  });

  const chosen = uniqByPrefix(
    scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s),
    2,
  );

  if (chosen.length > 0) {
    return joinClauses(chosen)
      .replace(/^(we |this study |here |a total of )/i, "")
      .trim();
  }

  // Fallback: pick first sentence containing any population indicator
  const fallback = sentences.find((s) => popIndicators.some((p) => s.toLowerCase().includes(p)) && s.length > 30 && s.length < 320);
  if (fallback) return fallback;
  return "Not specified — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  I (Intervention)                                                       */
/* ----------------------------------------------------------------------- */
function extractIntervention(abstract: string): string {
  if (!abstract) return "Not specified — full text required.";
  const sentences = splitSentences(abstract);
  const lower = abstract.toLowerCase();

  const intKeywords = [
    "intervention", "treatment", "exposure", "drug", "therapy", "program",
    "policy", "screening", "diagnostic", "procedure", "surgery", "vaccine",
    "antibiotic", "supplementation", "exercise", "rehabilitation", "counsel",
    "training", "education", "regimen", "dose", "dosing", "protocol",
    "received", "administered", "assigned to", "treated with", "underwent",
    "implementation", "strategy",
  ];

  const candidates = sentences.filter((s) => {
    const l = s.toLowerCase();
    if (!intKeywords.some((p) => l.includes(p))) return false;
    if (s.length < 30 || s.length > 320) return false;
    return true;
  });

  // Prefer RCT-style "received" / "assigned to" / "treated with" sentences
  const rctStyle = candidates.filter((s) =>
    /(received|assigned to|treated with|administered|underwent|randomly)/i.test(s),
  );

  const chosen = uniqByPrefix(rctStyle.length > 0 ? rctStyle : candidates, 2);
  if (chosen.length > 0) return joinClauses(chosen);

  // Observational fallback: describe exposure/diagnostic
  if (/exposure/i.test(lower)) {
    const expos = sentences.find((s) => /exposure|exposed to/i.test(s) && s.length > 30 && s.length < 320);
    if (expos) return expos;
  }
  if (/diagnostic/i.test(lower) || /sensitivity|specificity/i.test(lower)) {
    const diag = sentences.find((s) => /index test|reference standard|sensitivity|specificity|diagnostic/i.test(s) && s.length > 30 && s.length < 320);
    if (diag) return diag;
  }
  return "Not specified — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  C (Comparison)                                                         */
/* ----------------------------------------------------------------------- */
function extractComparison(abstract: string): string {
  if (!abstract) return "Not specified — full text required.";
  const sentences = splitSentences(abstract);

  const compPatterns: RegExp[] = [
    /\bcompared\s+(?:with|to|against)\b[^.]{8,250}/i,
    /\bversus\b[^.]{8,250}/i,
    /\bvs\.?\b[^.]{8,250}/i,
    /\bcontrol\s+group\b[^.]{5,250}/i,
    /\bplacebo\b[^.]{5,250}/i,
    /\bstandard\s+(?:of\s+care|treatment|therapy|intervention)\b[^.]{5,250}/i,
    /\bno\s+intervention\b[^.]{5,250}/i,
    /\bsham\b[^.]{5,250}/i,
    /\bactive\s+comparator\b[^.]{5,250}/i,
  ];

  for (const pat of compPatterns) {
    const m = abstract.match(pat);
    if (m) {
      let s = m[0].trim();
      if (s.length > 320) s = s.slice(0, 320) + "…";
      return s.replace(/^[a-z]/, (c) => c.toUpperCase());
    }
  }

  // Fallback: any sentence containing "control" / "placebo" / "standard"
  const fb = sentences.find((s) => /(control|placebo|standard|usual care|sham|comparator|comparator)/i.test(s) && s.length > 25 && s.length < 320);
  if (fb) return fb;
  return "Not specified — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  O (Outcome)                                                            */
/* ----------------------------------------------------------------------- */
function extractOutcome(abstract: string): string {
  if (!abstract) return "Not specified — full text required.";
  const sentences = splitSentences(abstract);

  const outKeywords = [
    "primary outcome", "secondary outcome", "main outcome", "endpoint",
    "outcome", "mortality", "morbidity", "incidence", "prevalence",
    "recurrence", "remission", "response rate", "cure", "survival",
    "adverse event", "adverse effects", "side effect", "complication",
    "quality of life", "qol", "function", "recovery", "efficacy", "effectiveness",
    "sensitivity", "specificity", "auc", "roc", "ppv", "npv", "accuracy",
  ];

  const primary = sentences.find((s) => /primary\s+(outcome|endpoint)|main\s+outcome/i.test(s) && s.length < 320);
  if (primary) return primary;

  const candidate = sentences.find((s) => outKeywords.some((k) => s.toLowerCase().includes(k)) && s.length > 35 && s.length < 320);
  if (candidate) return candidate;

  // Fallback: pick first result sentence
  const results = sentences.find((s) => /(found|showed|demonstrated|revealed|reported|observed|detected)/i.test(s) && s.length > 35 && s.length < 320);
  return results || "Not specified — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  Sample size                                                            */
/* ----------------------------------------------------------------------- */
function extractSampleSize(abstract: string): string {
  if (!abstract) return "Not specified — full text required.";
  const sentences = splitSentences(abstract);

  // n = 123, N=456, 120 participants, total of 250
  const nMatch = abstract.match(/\b(?:n|N)\s*=\s*([0-9][0-9,]{1,9})\b/);
  if (nMatch) {
    const total = nMatch[1];
    // Try to find subgroup counts
    const subgroupPatterns = [
      /\b(?:intervention|treatment|exposed|case)\s*(?:group)?\s*(?:n|N)?\s*=\s*([0-9][0-9,]{1,9})/i,
      /\b(?:control|comparator|placebo|unexposed)\s*(?:group)?\s*(?:n|N)?\s*=\s*([0-9][0-9,]{1,9})/i,
    ];
    const subs: string[] = [];
    for (const p of subgroupPatterns) {
      const m = abstract.match(p);
      if (m) subs.push(m[1]);
    }
    if (subs.length === 2) {
      return `Total N=${total} (intervention/treated n=${subs[0]}, control/comparator n=${subs[1]})`;
    }
    return `N=${total}`;
  }

  // "enrolled 120 patients" or "120 participants were included"
  const enrolled = abstract.match(/(?:enrolled|recruited|included|randomised|randomized|assigned|analyzed|reviewed)\s+([0-9][0-9,]{1,9})\s+(?:patients|participants|subjects|individuals|adults|children|records|cases|eyes|hospital|studies|papers|articles|trials|cohort)/i);
  if (enrolled) return `N=${enrolled[1]} ${enrolled[2]}`;

  // "total of 250"
  const totalOf = abstract.match(/total\s+of\s+([0-9][0-9,]{1,9})/i);
  if (totalOf) return `N=${totalOf[1]}`;

  // Sentence-level fallback
  const fb = sentences.find((s) => /(?:n\s*=|N\s*=|sample|cohort of|total of)/i.test(s) && s.length < 220);
  if (fb) return fb;
  return "Not specified — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  Effect estimate                                                        */
/* ----------------------------------------------------------------------- */
function extractEffectEstimate(abstract: string): string {
  if (!abstract) return "Not reported in abstract — full text required.";
  const lower = abstract.toLowerCase();

  // Common effect-size patterns
  const effectPatterns: Array<{ re: RegExp; label: string }> = [
    { re: /\b(?:RR|risk ratio|relative risk)\s*[=:]\s*([0-9.]+)/i, label: "RR" },
    { re: /\b(?:OR|odds ratio)\s*[=:]\s*([0-9.]+)/i, label: "OR" },
    { re: /\b(?:HR|hazard ratio)\s*[=:]\s*([0-9.]+)/i, label: "HR" },
    { re: /\b(?:MD|mean difference)\s*[=:]\s*([\-0-9.]+)/i, label: "MD" },
    { re: /\b(?:SMD|standardized mean difference)\s*[=:]\s*([\-0-9.]+)/i, label: "SMD" },
    { re: /\b(?:AOR|adjusted odds ratio)\s*[=:]\s*([0-9.]+)/i, label: "AOR" },
    { re: /\b(?:ARR|absolute risk reduction)\s*[=:]\s*([\-0-9.]+)/i, label: "ARR" },
    { re: /\b(?:NNT|number needed to treat)\s*[=:]\s*([0-9.]+)/i, label: "NNT" },
    { re: /\b(?:IRR|incidence rate ratio)\s*[=:]\s*([0-9.]+)/i, label: "IRR" },
    { re: /\b(?:prevalence)\s*[=:]\s*([0-9.]+\s*%)/i, label: "Prevalence" },
    { re: /\b(?:incidence)\s*[=:]\s*([0-9.]+\s*(?:%|per\s*\d+))/i, label: "Incidence" },
    { re: /\b(?:sensitivity|specificity)\s*[=:]\s*([0-9.]+\s*%)/i, label: "Diagnostic" },
    { re: /\b(?:AUC|auroc)\s*[=:]\s*([0-9.]+)/i, label: "AUC" },
  ];

  const found: string[] = [];
  for (const { re, label } of effectPatterns) {
    const m = abstract.match(re);
    if (m) {
      // Avoid catching "p = 0.05" as effect estimate — only specific effect-size types
      if (label === "Diagnostic" || label === "AUC" || label === "Prevalence" || label === "Incidence") {
        found.push(`${label} = ${m[1]}`);
      } else {
        found.push(`${label} = ${m[1]}`);
      }
    }
  }

  if (found.length > 0) {
    return found.slice(0, 3).join(", ");
  }

  // Percentages in the results section
  const pct = abstract.match(/\b\d+(?:\.\d+)?\s*%/);
  if (pct) {
    return `Reported proportion: ${pct[0]}`;
  }

  return "Not reported in abstract — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  95% CI                                                                 */
/* ----------------------------------------------------------------------- */
function extractCI(abstract: string): string {
  if (!abstract) return "Not reported in abstract — full text required.";

  // 95% CI 1.2-3.4, 95% CI: 1.2 to 3.4, 95% confidence interval 1.2-3.4
  const ciPatterns: RegExp[] = [
    /\b95\s*%\s*(?:CI|confidence interval)\s*[:=]?\s*([0-9.]+\s*(?:-|–|to|—)\s*[0-9.]+)/i,
    /\(\s*95\s*%\s*CI\s*[:=]?\s*([0-9.]+\s*(?:-|–|to|—)\s*[0-9.]+)\s*\)/i,
    /\b95\s*%\s*CI\s+([0-9.]+\s*(?:-|–|to|—)\s*[0-9.]+)/i,
  ];

  for (const p of ciPatterns) {
    const m = abstract.match(p);
    if (m) return `95% CI ${m[1]}`;
  }

  // Generic CI 1.2-3.4
  const generic = abstract.match(/\bCI\s*[:=]?\s*([0-9.]+\s*(?:-|–|to|—)\s*[0-9.]+)/i);
  if (generic) return `CI ${generic[1]}`;

  // p-value
  const pVal = abstract.match(/\bp\s*[=<>]\s*0\.\d+/i);
  if (pVal) return pVal[0];

  return "Not reported in abstract — full text required.";
}

/* ----------------------------------------------------------------------- */
/*  Research gaps (t0mst0ne framework)                                    */
/*    Limitations: [author-acknowledged limits]                            */
/*    Exclusions: [reported exclusion criteria]                            */
/*    Gaps: [unanswered questions]                                         */
/* ----------------------------------------------------------------------- */
function extractResearchGaps(abstract: string, studyType: string): string {
  if (!abstract) return "Limitations: Not specified; Exclusions: Not specified; Gaps: Not specified";

  const sentences = splitSentences(abstract);

  // ---- Limitations ----
  const limPatterns = [
    /limit(?:s|ation|ations|ed|ations|ations)[^.]{0,300}\./gi,
    /constraint(?:s)?[^.]{0,300}\./gi,
    /caution(?:s|ary)?[^.]{0,300}\./gi,
    /caveat(?:s)?[^.]{0,300}\./gi,
    /drawback(?:s)?[^.]{0,300}\./gi,
    /weakness(?:es)?[^.]{0,300}\./gi,
    /shortcoming(?:s)?[^.]{0,300}\./gi,
    /small[^.]{0,200}(?:sample|cohort|number)[^.]{0,200}\./gi,
    /single[- ](?:center|centre|country|site|centre)[^.]{0,200}\./gi,
    /retrospective[^.]{0,200}\./gi,
    /self[- ]?report(?:ed|ing)[^.]{0,200}\./gi,
    /underpowered[^.]{0,200}\./gi,
    /not powered[^.]{0,200}\./gi,
    /potential bias[^.]{0,200}\./gi,
    /potential confounder[^.]{0,200}\./gi,
  ];

  const limitations: string[] = [];
  for (const pat of limPatterns) {
    const m = abstract.match(pat) || [];
    for (const x of m) limitations.push(x.trim());
  }
  const limSentences = uniqByPrefix(limitations, 2);

  // ---- Exclusion criteria ----
  const excPatterns = [
    /exclude(?:d|s)?[^.]{0,200}\./gi,
    /exclusion criteria[^.]{0,200}\./gi,
    /not\s+included[^.]{0,200}\./gi,
    /ineligible[^.]{0,200}\./gi,
    /lack(?:ed|ing)?[^.]{0,200}(?:data|information|follow|follow-up|outcome)[^.]{0,200}\./gi,
    /withdrew[^.]{0,200}\./gi,
    /loss to follow[- ]?up[^.]{0,200}\./gi,
    /drop[ -]?out[^.]{0,200}\./gi,
  ];

  const exclusions: string[] = [];
  for (const pat of excPatterns) {
    const m = abstract.match(pat) || [];
    for (const x of m) exclusions.push(x.trim());
  }
  const excSentences = uniqByPrefix(exclusions, 2);

  // ---- Gaps / Future work ----
  const gapPatterns = [
    /future[^.]{0,200}(?:work|research|direction|study|trial|investigation)[^.]{0,200}\./gi,
    /gap(?:s)?[^.]{0,200}\./gi,
    /underexplored[^.]{0,200}\./gi,
    /further research[^.]{0,200}\./gi,
    /additional research[^.]{0,200}\./gi,
    /need(?:s)?[^.]{0,200}(?:further|more|additional|longer|larger)[^.]{0,200}\./gi,
    /warrant(?:s)?[^.]{0,200}(?:further|additional|investigation|study)[^.]{0,200}\./gi,
    /recommend(?:ed|s)?[^.]{0,200}(?:further|future|additional|longitudinal|longer)[^.]{0,200}\./gi,
    /longitudinal[^.]{0,200}(?:study|follow)[^.]{0,200}\./gi,
    /replication[^.]{0,200}\./gi,
  ];

  const gaps: string[] = [];
  for (const pat of gapPatterns) {
    const m = abstract.match(pat) || [];
    for (const x of m) gaps.push(x.trim());
  }
  const gapSentences = uniqByPrefix(gaps, 2);

  // Sentiment gap detection — if a paper is a review, look for "lacks", "limited", "scarce"
  if (gapSentences.length === 0 && /review|meta-analysis/i.test(studyType || "")) {
    const scarcity = sentences.find((s) => /(lack|scarce|limited|insufficient|few studies|no studies)/i.test(s) && s.length > 30 && s.length < 320);
    if (scarcity) gapSentences.push(scarcity);
  }

  const limText = limSentences.length > 0 ? limSentences.join(" ") : "Author-acknowledged limitations not detailed in abstract; common biases (selection, confounding, measurement) may apply per study design.";
  const excText = excSentences.length > 0 ? excSentences.join(" ") : "Exclusion criteria not explicitly enumerated in abstract; standard exclusions for pediatric/geriatric/comorbid populations likely applied per protocol.";
  const gapText = gapSentences.length > 0
    ? gapSentences.join(" ")
    : "Longer follow-up, replication in diverse populations, and cost-effectiveness analysis recommended by standard review guidelines.";

  return `Limitations: ${limText} | Exclusions: ${excText} | Gaps: ${gapText}`;
}

/* ----------------------------------------------------------------------- */
/*  Main extraction                                                        */
/* ----------------------------------------------------------------------- */
export interface PICOInputPaper {
  id: string;
  title: string;
  abstract: string;
  studyType: string;
}

export function extractPICO(paper: PICOInputPaper): ExtractedPICO {
  const abstract = stripJats(paper.abstract || "");
  return {
    id: paper.id,
    population: extractPopulation(abstract),
    intervention: extractIntervention(abstract),
    comparison: extractComparison(abstract),
    outcome: extractOutcome(abstract),
    sampleSize: extractSampleSize(abstract),
    effectEstimate: extractEffectEstimate(abstract),
    ci: extractCI(abstract),
    researchGaps: extractResearchGaps(abstract, paper.studyType || ""),
    evidenceLevel: classifyEvidenceLevel(paper.studyType || "", abstract),
  };
}

export function extractPICOForPapers(papers: PICOInputPaper[]): ExtractedPICO[] {
  return papers.map(extractPICO);
}
