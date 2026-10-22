// Medical Subject Headings (MeSH) expansion + Automatic Term Mapping (ATM)
// and truncation/wildcard support for clinical keyword expansion.
//
// Maps lay/initial keywords to expanded search strings that include:
//   - MeSH synonyms and narrower terms (explosion)
//   - Truncation/wildcard (*) matches for grammatical variations
// Used by /api/literature-search for both the main research pipeline
// and the systematic review & meta-analysis pipeline.

// ---------------------------------------------------------------------------
// MeSH concept dictionaries (term -> { mesh: string[], narrower: string[], synonyms: string[] })
// ---------------------------------------------------------------------------

export const MESH_MAP: Record<string, { mesh: string[]; narrower: string[]; synonyms: string[] }> = {
  cancer: {
    mesh: ["Neoplasms", "Carcinoma", "Malignancy"],
    narrower: ["tumor", "tumour", "carcinoma", "sarcoma", "leukemia", "lymphoma", "melanoma", "glioblastoma", "astrocytoma"],
    synonyms: ["cancer", "cancers", "malignancy", "malignancies", "neoplasm", "neoplasms"],
  },
  hypertension: {
    mesh: ["Hypertension"],
    narrower: ["high blood pressure", "essential hypertension", "secondary hypertension", "pulmonary hypertension", "portal hypertension"],
    synonyms: ["hypertension", "high blood pressure", "elevated blood pressure"],
  },
  diabetes: {
    mesh: ["Diabetes Mellitus"],
    narrower: ["type 1 diabetes", "type 2 diabetes", "gestational diabetes", "diabetic ketoacidosis", "diabetic retinopathy", "diabetic nephropathy", "diabetic neuropathy"],
    synonyms: ["diabetes", "diabetes mellitus", "diabetic", "diabetics"],
  },
  "liver disease": {
    mesh: ["Liver Diseases"],
    narrower: ["hepatitis", "cirrhosis", "fatty liver", "liver cirrhosis", "hepatic encephalopathy", "liver failure", "cholestasis"],
    synonyms: ["liver disease", "liver diseases", "hepatic disease", "hepatic diseases"],
  },
  hepatitis: {
    mesh: ["Hepatitis"],
    narrower: ["hepatitis a", "hepatitis b", "hepatitis c", "hepatitis d", "hepatitis e", "viral hepatitis", "alcoholic hepatitis", "autoimmune hepatitis"],
    synonyms: ["hepatitis", "viral hepatitis", "hepatic inflammation"],
  },
  cirrhosis: {
    mesh: ["Liver Cirrhosis"],
    narrower: ["alcoholic cirrhosis", "biliary cirrhosis", "portal cirrhosis", "micronodular cirrhosis", "macronodular cirrhosis"],
    synonyms: ["cirrhosis", "liver cirrhosis", "hepatic cirrhosis"],
  },
  asthma: {
    mesh: ["Asthma"],
    narrower: ["bronchial asthma", "exercise-induced asthma", "allergic asthma", "intrinsic asthma", "status asthmaticus"],
    synonyms: ["asthma", "bronchial asthma", "wheezing"],
  },
  "chronic obstructive pulmonary disease": {
    mesh: ["Pulmonary Disease, Chronic Obstructive"],
    narrower: ["emphysema", "chronic bronchitis", "COPD exacerbation"],
    synonyms: ["copd", "chronic obstructive pulmonary disease", "chronic obstructive lung disease"],
  },
  tuberculosis: {
    mesh: ["Tuberculosis"],
    narrower: ["pulmonary tuberculosis", "extrapulmonary tuberculosis", "miliary tuberculosis", "latent tuberculosis"],
    synonyms: ["tuberculosis", "tb", "tubercular"],
  },
  hiv: {
    mesh: ["HIV", "HIV Infections"],
    narrower: ["aids", "hiv-1", "hiv-2", "acute hiv infection", "chronic hiv infection"],
    synonyms: ["hiv", "human immunodeficiency virus", "aids"],
  },
  stroke: {
    mesh: ["Stroke"],
    narrower: ["ischemic stroke", "hemorrhagic stroke", "transient ischemic attack", "tia", "cerebral infarction", "intracranial hemorrhage"],
    synonyms: ["stroke", "cerebrovascular accident", "cva", "brain attack"],
  },
  "myocardial infarction": {
    mesh: ["Myocardial Infarction"],
    narrower: ["st-elevation myocardial infarction", "nstemi", "unstable angina", "acute coronary syndrome"],
    synonyms: ["myocardial infarction", "heart attack", "mi"],
  },
  "heart failure": {
    mesh: ["Heart Failure"],
    narrower: ["congestive heart failure", "left ventricular failure", "right ventricular failure", "diastolic heart failure", "systolic heart failure"],
    synonyms: ["heart failure", "cardiac failure", "congestive heart failure", "chf"],
  },
  depression: {
    mesh: ["Depression"],
    narrower: ["major depressive disorder", "dysthymic disorder", "postpartum depression", "seasonal affective disorder"],
    synonyms: ["depression", "depressive disorder", "major depression", "clinical depression"],
  },
  anxiety: {
    mesh: ["Anxiety Disorders"],
    narrower: ["generalized anxiety disorder", "panic disorder", "social anxiety disorder", "phobic disorders", "obsessive-compulsive disorder"],
    synonyms: ["anxiety", "anxiety disorder", "generalized anxiety", "panic attack"],
  },
  obesity: {
    mesh: ["Obesity"],
    narrower: ["morbid obesity", "childhood obesity", "abdominal obesity", "central obesity"],
    synonyms: ["obesity", "obese", "overweight", "adiposity"],
  },
  pneumonia: {
    mesh: ["Pneumonia"],
    narrower: ["viral pneumonia", "bacterial pneumonia", "aspiration pneumonia", "walking pneumonia", "legionnaires disease"],
    synonyms: ["pneumonia", "pneumonic"],
  },
  copd: {
    mesh: ["Pulmonary Disease, Chronic Obstructive"],
    narrower: ["emphysema", "chronic bronchitis"],
    synonyms: ["copd", "chronic obstructive pulmonary disease"],
  },
  dementia: {
    mesh: ["Dementia"],
    narrower: ["alzheimer disease", "vascular dementia", "lewy body dementia", "frontotemporal dementia"],
    synonyms: ["dementia", "alzheimer", "cognitive decline"],
  },
  "alzheimer": {
    mesh: ["Alzheimer Disease"],
    narrower: ["early-onset alzheimer", "late-onset alzheimer", "familial alzheimer"],
    synonyms: ["alzheimer", "alzheimer disease", "alzheimers"],
  },
  parkinson: {
    mesh: ["Parkinson Disease"],
    narrower: ["parkinson disease", "parkinsonism", "secondary parkinsonism"],
    synonyms: ["parkinson", "parkinson disease", "parkinson's"],
  },
  epilepsy: {
    mesh: ["Epilepsy"],
    narrower: ["generalized epilepsy", "focal epilepsy", "temporal lobe epilepsy", "absence seizure", "tonic-clonic seizure"],
    synonyms: ["epilepsy", "seizure disorder", "convulsions"],
  },
  arthritis: {
    mesh: ["Arthritis"],
    narrower: ["rheumatoid arthritis", "osteoarthritis", "psoriatic arthritis", "gout", "ankylosing spondylitis"],
    synonyms: ["arthritis", "rheumatoid arthritis", "osteoarthritis", "joint inflammation"],
  },
  "rheumatoid arthritis": {
    mesh: ["Arthritis, Rheumatoid"],
    narrower: ["juvenile rheumatoid arthritis", "seropositive rheumatoid arthritis", "seronegative rheumatoid arthritis"],
    synonyms: ["rheumatoid arthritis", "ra"],
  },
  "osteoarthritis": {
    mesh: ["Osteoarthritis"],
    narrower: ["knee osteoarthritis", "hip osteoarthritis", "hand osteoarthritis", "spine osteoarthritis"],
    synonyms: ["osteoarthritis", "degenerative joint disease", "oa"],
  },
  pregnancy: {
    mesh: ["Pregnancy"],
    narrower: ["high-risk pregnancy", "teenage pregnancy", "multiple pregnancy", "ectopic pregnancy"],
    synonyms: ["pregnancy", "prenatal", "antenatal", "gestation"],
  },
  infection: {
    mesh: ["Infections"],
    narrower: ["bacterial infection", "viral infection", "fungal infection", "parasitic infection", "sepsis"],
    synonyms: ["infection", "infectious", "infectious disease"],
  },
  sepsis: {
    mesh: ["Sepsis"],
    narrower: ["septic shock", "severe sepsis", "neonatal sepsis", "maternal sepsis"],
    synonyms: ["sepsis", "septicemia", "blood poisoning"],
  },
  pain: {
    mesh: ["Pain"],
    narrower: ["chronic pain", "acute pain", "neuropathic pain", "cancer pain", "postoperative pain"],
    synonyms: ["pain", "analgesia", "pain management"],
  },
  "kidney disease": {
    mesh: ["Kidney Diseases"],
    narrower: ["chronic kidney disease", "acute kidney injury", "renal failure", "end-stage renal disease", "glomerulonephritis"],
    synonyms: ["kidney disease", "renal disease", "ckd", "chronic kidney disease"],
  },
  ckd: {
    mesh: ["Kidney Diseases, Chronic"],
    narrower: ["chronic kidney disease", "end-stage renal disease", "stage 3 ckd", "stage 4 ckd", "stage 5 ckd"],
    synonyms: ["ckd", "chronic kidney disease", "chronic renal failure"],
  },
  stroke_prevention: {
    mesh: ["Stroke"],
    narrower: ["ischemic stroke", "hemorrhagic stroke", "tia", "cerebral infarction"],
    synonyms: ["stroke", "cerebrovascular accident", "cva"],
  },
  "food preferences": {
    mesh: ["Feeding Behavior", "Food"],
    narrower: ["food preference", "food preferences", "dietary preference", "eating behavior", "eating behaviour", "selective eating"],
    synonyms: ["food preference", "food preferences", "dietary preference", "eating habit", "eating habits"],
  },
  feeding: {
    mesh: ["Feeding Behavior"],
    narrower: ["infant feeding", "bottle feeding", "breast feeding", "complementary feeding", "enteral feeding"],
    synonyms: ["feeding", "feed", "eating"],
  },
  nutrition: {
    mesh: ["Nutrition"],
    narrower: ["enteral nutrition", "parenteral nutrition", "clinical nutrition", "sports nutrition", "pediatric nutrition", "geriatric nutrition"],
    synonyms: ["nutrition", "nutritional", "nutrient", "nutrients"],
  },
  diet: {
    mesh: ["Diet"],
    narrower: ["weight reduction diets", "ketogenic diet", "mediterranean diet", "vegetarian diet", "vegan diet", "low carbohydrate diet", "dietary fiber"],
    synonyms: ["diet", "diets", "dieting", "dietary", "eating pattern"],
  },
  "dietary intake": {
    mesh: ["Dietary Intake"],
    narrower: ["energy intake", "caloric intake", "fluid intake", "food intake"],
    synonyms: ["dietary intake", "food intake", "caloric intake", "energy intake"],
  },
  "mental health": {
    mesh: ["Mental Health"],
    narrower: ["mental disorders", "mood disorders", "anxiety disorders", "depressive disorder", "psychological stress"],
    synonyms: ["mental health", "mental wellbeing", "mental well-being", "psychological health"],
  },
  "psychological outcome": {
    mesh: ["Outcome Assessment", "Quality of Life", "Psychological Tests"],
    narrower: ["psychological outcome", "psychological outcomes", "mental health outcome", "emotional outcome", "behavioral outcome", "behavioural outcome"],
    synonyms: ["psychological outcome", "psychological outcomes", "mental health outcome", "emotional outcome"],
  },
  "quality of life": {
    mesh: ["Quality of Life"],
    narrower: ["health related quality of life", "hrqol"],
    synonyms: ["quality of life", "hrqol", "health-related quality of life"],
  },
  emotion: {
    mesh: ["Emotions"],
    narrower: ["fear", "anger", "sadness", "joy", "disgust", "mood"],
    synonyms: ["emotion", "emotions", "emotional", "mood"],
  },
  stress: {
    mesh: ["Stress, Psychological"],
    narrower: ["posttraumatic stress disorder", "chronic stress", "acute stress", "occupational stress"],
    synonyms: ["stress", "psychological stress", "emotional stress"],
  },
};

// Terms that should trigger truncation/wildcard expansion (common clinical roots)
const TRUNCATION_ROOTS: Record<string, string[]> = {
  pediat: ["pediatric", "pediatrics", "pediatrician", "paediatric", "paediatrics", "paediatrician"],
  cardi: ["cardiac", "cardiology", "cardiovascular", "cardiopulmonary"],
  hepat: ["hepatic", "hepatitis", "hepatology", "hepatocellular"],
  nephr: ["nephritis", "nephrology", "nephrotic", "nephrectomy"],
  pulmon: ["pulmonary", "pulmonology", "pulp"],
  onc: ["oncology", "oncologist", "oncogenic"],
  immun: ["immune", "immunity", "immunology", "immunosuppression"],
  inflam: ["inflammation", "inflammatory", "anti-inflammatory"],
  infect: ["infection", "infectious", "infectivity"],
  diagn: ["diagnosis", "diagnostic", "diagnostics"],
  treat: ["treatment", "treating", "treatable"],
  prevent: ["prevention", "preventive", "prevent"],
  manag: ["management", "managing", "manage"],
  screen: ["screening", "screened", "screen"],
  surveil: ["surveillance", "surveilling"],
  epidemiol: ["epidemiology", "epidemiological", "epidemiologist"],
  clinic: ["clinical", "clinician", "clinics"],
  therap: ["therapy", "therapies", "therapeutic"],
  interven: ["intervention", "interventions", "interventional"],
  cohort: ["cohort", "cohorts"],
  longitudinal: ["longitudinal", "longitudinally"],
  prospect: ["prospective", "prospectively"],
  retrospect: ["retrospective", "retrospectively"],
  random: ["randomized", "randomised", "randomization", "randomisation"],
  control: ["control", "controlled", "controls"],
  blind: ["blind", "blinded", "double-blind", "single-blind"],
  placebo: ["placebo", "placebos"],
};

// ---------------------------------------------------------------------------
// Automatic Term Mapping (ATM): lay term -> canonical MeSH-friendly term
// ---------------------------------------------------------------------------

const ATM_MAP: Record<string, string> = {
  "high blood pressure": "hypertension",
  "high bp": "hypertension",
  "blood pressure": "hypertension",
  "sugar": "diabetes",
  "blood sugar": "diabetes mellitus",
  "sugar disease": "diabetes mellitus",
  "liver problem": "liver disease",
  "liver issues": "liver disease",
  "heart attack": "myocardial infarction",
  "heart problem": "heart failure",
  "cardiac arrest": "myocardial infarction",
  "brain stroke": "stroke",
  "brain attack": "stroke",
  "paralysis": "stroke",
  "tb": "tuberculosis",
  "aids": "hiv",
  "hiv aids": "hiv",
  "cancer": "cancer",
  "tumor": "cancer",
  "tumour": "cancer",
  "growth": "cancer",
  "mass": "cancer",
  "breathing problem": "chronic obstructive pulmonary disease",
  "shortness of breath": "chronic obstructive pulmonary disease",
  "copd": "chronic obstructive pulmonary disease",
  "joint pain": "arthritis",
  "knee pain": "osteoarthritis",
  "back pain": "osteoarthritis",
  "sugar level": "diabetes mellitus",
  "thyroid": "thyroid diseases",
  "depression": "depression",
  "anxiety": "anxiety disorders",
  "mental health": "mental disorders",
  "kidney problem": "kidney disease",
  "renal failure": "kidney diseases",
  "infection": "infections",
  "fever": "infections",
  "cough": "respiratory tract infections",
  "cold": "respiratory tract infections",
  "flu": "influenza",
  "vaccine": "vaccination",
  "immunization": "vaccination",
  "screening": "mass screening",
  "diagnosis": "diagnosis",
  "treatment": "therapeutics",
  "medicine": "pharmaceutical preparations",
  "drug": "pharmaceutical preparations",
  "surgery": "surgical procedures",
  "operation": "surgical procedures",
  "food preference": "food preferences",
  "food preferences": "food preferences",
  "eating habit": "food preferences",
  "eating habits": "food preferences",
  "dietary preference": "food preferences",
  "feeding behavior": "feeding",
  "feeding behaviour": "feeding",
  "nutritional": "nutrition",
  "nutrient": "nutrition",
  "dieting": "diet",
  "dietary": "diet",
  "emotional": "emotion",
  "mood": "emotion",
  "psychological": "mental health",
  "psychology": "mental health",
};

// ---------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "and","or","not","the","a","an","of","in","on","at","to","for","with","by","from","as","is","are","was","were",
  "be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","can",
  "this","that","these","those","i","me","my","we","our","you","your","it","its","they","them","their","he","she",
  "his","her","what","which","who","whom","where","when","why","how","if","then","else","all","each","few","more",
  "most","other","some","such","no","nor","only","own","same","so","than","too","very","just","don","now"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\*]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

/** Detect if a token contains a truncation wildcard (*) */
function hasWildcard(token: string): boolean {
  return token.includes("*");
}

/** Expand a wildcard root into its grammatical variations */
function expandWildcard(root: string): string[] {
  const stripped = root.replace(/\*/g, "");
  const known = TRUNCATION_ROOTS[stripped];
  if (known) return known;
  // Generic: return the root with * for databases that support it
  return [stripped];
}

/** Apply ATM: map lay terms to canonical MeSH-friendly terms */
function applyAtm(query: string): string {
  let mapped = query.toLowerCase().trim();
  // Sort by length descending so longer phrases match first
  const sortedTerms = Object.keys(ATM_MAP).sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    mapped = mapped.replace(regex, ATM_MAP[term]);
  }
  return mapped;
}

/** Expand a single keyword with MeSH synonyms and narrower terms */
export function expandKeyword(keyword: string): string[] {
  const results = new Set<string>();
  results.add(keyword);

  const meshEntry = MESH_MAP[keyword];
  if (meshEntry) {
    meshEntry.mesh.forEach((m) => results.add(m));
    meshEntry.narrower.forEach((n) => results.add(n));
    meshEntry.synonyms.forEach((s) => results.add(s));
  }

  // Wildcard expansion
  if (hasWildcard(keyword)) {
    expandWildcard(keyword).forEach((w) => results.add(w));
  }

  return Array.from(results);
}

/**
 * Look up a single *concept* (not a keyword) in the MeSH dictionary.
 *
 * Unlike {@link expandQueryWithMesh} this is deliberately conservative: a
 * compound concept such as "latent tuberculosis infection" must not pull in
 * the whole "Infections" explosion, because that silently widens the search
 * far beyond what the researcher asked for.
 *
 * Rules:
 *   - an exact dictionary hit returns the full expansion for that entry;
 *   - a compound concept matches only the single most specific covering key,
 *     and keeps just the narrower terms that share an "extra" token with the
 *     concept (e.g. "latent" keeps "latent tuberculosis" but not "pulmonary
 *     tuberculosis");
 *   - anything else yields no expansion.
 */
export function lookupConceptExpansion(concept: string): {
  meshTerms: string[];
  narrowerTerms: string[];
  synonyms: string[];
} {
  const empty = { meshTerms: [] as string[], narrowerTerms: [] as string[], synonyms: [] as string[] };
  const normalized = (concept || "").toLowerCase().trim();
  if (!normalized) return empty;

  // 1. The concept is itself a dictionary entry.
  const exact = MESH_MAP[normalized];
  if (exact) {
    return {
      meshTerms: [...exact.mesh],
      narrowerTerms: [...exact.narrower],
      synonyms: [...exact.synonyms],
    };
  }

  // 2. Compound concept — use the most specific covering key only.
  const keys = Object.keys(MESH_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (key.length < 4) continue;
    if (!normalized.includes(key)) continue;
    const entry = MESH_MAP[key];
    const keyTokens = new Set(tokenize(key));
    const extraTokens = tokenize(normalized).filter((t) => !keyTokens.has(t));
    const narrower = entry.narrower.filter((n) => {
      if (extraTokens.length === 0) return true;
      const nTokens = tokenize(n);
      return extraTokens.some((t) => nTokens.includes(t));
    });
    return {
      meshTerms: [...entry.mesh],
      narrowerTerms: narrower,
      synonyms: entry.synonyms.filter((s) => s !== key),
    };
  }

  return empty;
}

/** Expand the full query with MeSH + ATM + truncation */
export function expandQueryWithMesh(query: string): {
  expandedQuery: string;
  meshTerms: string[];
  atmMappings: string[];
  wildcardRoots: string[];
} {
  const atmApplied = applyAtm(query);
  const atmMappings: string[] = [];

  // Detect ATM mappings applied
  const sortedTerms = Object.keys(ATM_MAP).sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(query)) {
      atmMappings.push(`${term} → ${ATM_MAP[term]}`);
    }
  }

  const tokens = tokenize(atmApplied);
  const meshTerms: string[] = [];
  const wildcardRoots: string[] = [];

  const expandedParts: string[] = [];

  for (const token of tokens) {
    if (hasWildcard(token)) {
      wildcardRoots.push(token);
      const expansions = expandWildcard(token);
      expandedParts.push(`(${expansions.map((e) => `"${e}"`).join(" OR ")})`);
      continue;
    }

    const expansions = expandKeyword(token);
    const newTerms = expansions.filter((e) => e !== token);
    meshTerms.push(...newTerms);

    if (expansions.length > 1) {
      expandedParts.push(`(${expansions.map((e) => `"${e}"`).join(" OR ")})`);
    } else {
      expandedParts.push(`"${token}"`);
    }
  }

  const expandedQuery = expandedParts.join(" AND ");

  return {
    expandedQuery,
    meshTerms: [...new Set(meshTerms)],
    atmMappings,
    wildcardRoots,
  };
}
