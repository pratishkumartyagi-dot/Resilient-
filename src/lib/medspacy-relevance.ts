// Medspacy-inspired clinical relevance filtering (TypeScript port of medspacy concepts).
// medspacy (https://github.com/medspacy/medspacy) is a Python clinical NLP library built on spaCy.
// This module replicates its core relevance-filtering methodology in TypeScript:
//   - Clinical concept / entity recognition from query and paper text
//   - Negation and uncertainty detection (medspacy.context)
//   - Targeted rule-based matching (medspacy.targeted_rule)
//   - Relevance scoring via concept overlap between query and paper title/abstract
//
// Used to filter out irrelevant papers returned by broad database searches in both
// the main research pipeline and the systematic review pipeline.

export interface MedspacyRelevanceOptions {
  /** Minimum relevance score (0-100) for a paper to be included. Default 40. */
  threshold?: number;
  /** When true, negation in the query excludes matching papers. Default true. */
  respectNegation?: boolean;
  /** When true, uncertainty hedges reduce score. Default true. */
  respectUncertainty?: boolean;
  /** Maximum number of papers to return after filtering. Default no limit. */
  maxResults?: number;
}

export interface MedspacyRelevanceResult {
  papers: any[];
  filteredCount: number;
  totalCount: number;
  queryConcepts: string[];
  negationTerms: string[];
}

// ---------------------------------------------------------------------------
// Clinical concept dictionaries (medspacy-style entity lists)
// ---------------------------------------------------------------------------

const CONDITIONS = [
  "diabetes", "diabetic", "hypertension", "high blood pressure", "hypotension",
  "cancer", "carcinoma", "tumor", "tumour", "neoplasm", "melanoma", "leukemia",
  "lymphoma", "astrocytoma", "glioblastoma", "asthma", "copd", "chronic obstructive pulmonary disease",
  "pneumonia", "tuberculosis", "tb", "hiv", "aids", "hepatitis", "cirrhosis",
  "stroke", "ischemic stroke", "hemorrhagic stroke", "tia", "ischemia",
  "myocardial infarction", "heart attack", "heart failure", "arrhythmia",
  "atrial fibrillation", "angina", "atherosclerosis", "dyslipidemia",
  "alzheimer", "dementia", "parkinson", "epilepsy", "seizure", "migraine",
  "depression", "anxiety", "schizophrenia", "bipolar", "ptsd", "insomnia",
  "arthritis", "rheumatoid arthritis", "osteoarthritis", "osteoporosis",
  "ckd", "chronic kidney disease", "kidney failure", "renal failure",
  "liver disease", "fatty liver", "pancreatitis", "ibs", "crohn",
  "ulcerative colitis", "celiac", "eczema", "psoriasis", "acne",
  "obesity", "overweight", "malnutrition", "anemia", "thrombosis",
  "embolism", "sepsis", "infection", "inflammation", "fever", "pain",
  "headache", "dizziness", "fatigue", "nausea", "vomiting", "diarrhea",
  "constipation", "dyspepsia", "gerd", "reflux", "dysphagia",
];

const TREATMENTS = [
  "treatment", "therapy", "intervention", "medication", "drug", "medicine",
  "pharmacotherapy", "chemotherapy", "radiotherapy", "radiation", "immunotherapy",
  "surgery", "surgical", "operation", "procedure", "intervention",
  "dialysis", "transplant", "transplantation", "biopsy", "resection",
  "aspirin", "ibuprofen", "acetaminophen", "paracetamol", "warfarin", "heparin",
  "metformin", "insulin", "statin", "atorvastatin", "lisinopril", "amlodipine",
  "omeprazole", "antibiotics", "antibiotic", "antiviral", "antifungal",
  "steroid", "corticosteroid", "nsaid", "opioid", "analgesic", "anesthesia",
  "vaccine", "vaccination", "immunization", "placebo", "supplement",
];

const ANATOMY = [
  "heart", "cardiac", "cardiovascular", "lung", "pulmonary", "liver", "hepatic",
  "kidney", "renal", "brain", "cerebral", "neuro", "spinal", "spine",
  "liver", "pancreas", "stomach", "intestinal", "colon", "rectal",
  "breast", "prostate", "ovarian", "uterine", "cervical", "thyroid",
  "bone", "joint", "muscle", "skin", "blood", "vascular", "artery", "vein",
  "lymph", "immune", "hormone", "endocrine", "reproductive",
];

const STUDY_DESIGN = [
  "randomized", "randomised", "controlled trial", "rct", "clinical trial",
  "systematic review", "meta-analysis", "meta analysis", "cohort", "case-control",
  "cross-sectional", "observational", "longitudinal", "prospective", "retrospective",
  "case study", "case report", "case series", "qualitative", "quantitative",
  "mixed methods", "pilot", "feasibility", "diagnostic", "prognostic",
];

// Negation / uncertainty cue phrases (medspacy.context style)
const NEGATION_CUES = [
  "no ", "not ", "without ", "absence of", "absence of ", "denies ", "denied ",
  "rule out", "ruled out", "excluding", "excluded", "non-", "un-",
  "against", "lack of", "lacking", "none of", "never ", "nor ",
  "contraindicat", "refractory to", "resistant to",
];

const UNCERTAINTY_CUES = [
  "possible", "possibly", "probable", "probably", "likely", "may ", "might ",
  "could ", "can ", "suggest", "suggests", "suggested", "indicate", "indicates",
  "appear", "appears", "seem", "seems", "unclear", "uncertain", "equivocal",
  "questionable", "suspected", "suspect", "rule out", "differential",
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
  "were", "will", "with", "the", "and", "or", "but", "if", "then", "else",
  "when", "where", "why", "how", "all", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "don", "now", "i", "me", "my", "myself", "we", "our",
  "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he",
  "him", "his", "himself", "she", "her", "hers", "herself", "it", "itself",
  "they", "them", "their", "theirs", "themselves", "what", "which", "who",
  "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were",
  "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing",
  "would", "could", "should", "may", "might", "must", "shall", "can", "need",
]);

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function removeStopWords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

// ---------------------------------------------------------------------------
// Concept extraction (medspacy.ner / targeted_rule style)
// ---------------------------------------------------------------------------

const ALL_CONCEPTS = [...CONDITIONS, ...TREATMENTS, ...ANATOMY, ...STUDY_DESIGN].sort(
  (a, b) => b.length - a.length
); // longest first for multi-word matching

function extractConcepts(text: string): string[] {
  const norm = normalize(text);
  const found: string[] = [];
  for (const concept of ALL_CONCEPTS) {
    const cNorm = normalize(concept);
    if (norm.includes(cNorm)) {
      found.push(cNorm);
    }
  }
  // Deduplicate: remove concepts that are substrings of other found concepts
  const unique: string[] = [];
  for (const c of found) {
    if (!unique.some((u) => u.includes(c) && u !== c)) {
      unique.push(c);
    }
  }
  return unique;
}

function hasNegation(text: string): boolean {
  const norm = normalize(text);
  return NEGATION_CUES.some((cue) => norm.includes(cue));
}

function hasUncertainty(text: string): boolean {
  const norm = normalize(text);
  return UNCERTAINTY_CUES.some((cue) => norm.includes(cue));
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

function scoreRelevance(
  queryConcepts: string[],
  paperTitle: string,
  paperAbstract: string,
  options: MedspacyRelevanceOptions
): { score: number; matchedConcepts: string[]; isNegated: boolean } {
  const titleNorm = normalize(paperTitle);
  const abstractNorm = normalize(paperAbstract);
  const combinedText = `${titleNorm} ${abstractNorm}`;

  let matchedConcepts: string[] = [];
  let score = 0;

  for (const concept of queryConcepts) {
    if (combinedText.includes(concept)) {
      matchedConcepts.push(concept);
      // Title matches weight more heavily
      const titleWeight = titleNorm.includes(concept) ? 3 : 1;
      const abstractWeight = abstractNorm.includes(concept) ? 2 : 1;
      score += titleWeight * 20 + abstractWeight * 10;
    }
  }

  // Normalize to 0-100
  const maxPossible = queryConcepts.length * 60;
  score = maxPossible > 0 ? Math.min(100, Math.round((score / maxPossible) * 100)) : 0;

  // Negation penalty: if query is negated and paper matches the negated concept
  let isNegated = false;
  if (options.respectNegation && hasNegation(queryConcepts.join(" "))) {
    const queryNegated = hasNegation(queryConcepts.join(" "));
    const paperNegated = hasNegation(combinedText);
    if (queryNegated && matchedConcepts.length > 0) {
      isNegated = paperNegated;
      if (isNegated) {
        score = Math.floor(score * 0.2); // heavily penalize negated matches
      }
    }
  }

  // Uncertainty hedge reduction
  if (options.respectUncertainty && hasUncertainty(combinedText)) {
    score = Math.floor(score * 0.8);
  }

  return { score, matchedConcepts, isNegated };
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------

export function filterPapersByMedspacyRelevance(
  papers: any[],
  query: string,
  options: MedspacyRelevanceOptions = {}
): MedspacyRelevanceResult {
  const {
    threshold = 40,
    respectNegation = true,
    respectUncertainty = true,
    maxResults,
  } = options;

  const queryConcepts = extractConcepts(query);
  const negationTerms = NEGATION_CUES.filter((cue) => normalize(query).includes(cue));

  if (queryConcepts.length === 0) {
    // No medical concepts found — return papers as-is (can't determine relevance)
    return {
      papers: maxResults ? papers.slice(0, maxResults) : papers,
      filteredCount: 0,
      totalCount: papers.length,
      queryConcepts: [],
      negationTerms,
    };
  }

  const scored = papers.map((paper) => {
    const title = paper.title || "";
    const abstract = paper.abstract || "";
    const { score, matchedConcepts, isNegated } = scoreRelevance(
      queryConcepts,
      title,
      abstract,
      { respectNegation, respectUncertainty }
    );
    return { paper, score, matchedConcepts, isNegated };
  });

  // Filter by threshold and negation
  let filtered = scored.filter((s) => {
    if (s.isNegated) return false;
    return s.score >= threshold;
  });

  // Sort by relevance score descending
  filtered.sort((a, b) => b.score - a.score);

  if (maxResults && filtered.length > maxResults) {
    filtered = filtered.slice(0, maxResults);
  }

  return {
    papers: filtered.map((s) => ({ ...s.paper, _medspacyScore: s.score, _medspacyMatched: s.matchedConcepts })),
    filteredCount: scored.length - filtered.length,
    totalCount: scored.length,
    queryConcepts,
    negationTerms,
  };
}
