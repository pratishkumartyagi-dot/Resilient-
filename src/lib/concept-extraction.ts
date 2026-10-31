// Concept extraction for systematic review search strategies.
//
// A broad research area such as "latent tuberculosis infection in healthcare
// workers" has to be split into discrete, searchable concepts before a
// database-specific query can be compiled. Each concept carries:
//   - a role (condition / predictor / outcome / design)
//   - whether it is required (AND-ed) or optional (OR-ed)
//   - synonyms and MeSH headings used to widen the search without widening
//     the concept itself.
//
// Gemini is used when an API key is available; a deterministic local parser is
// used as a fallback so the pipeline never blocks on a missing key.

import { callGemini } from "./ai";
import { lookupConceptExpansion } from "./mesh-expansion";

export type ConceptRole = "condition" | "predictor" | "outcome" | "design";

export interface ConceptBlock {
  id: string;
  role: ConceptRole;
  label: string;
  required: boolean;
  synonyms: string[];
  meshTerms: string[];
  /** Concept must NOT appear in the record (from a NOT clause). */
  negated?: boolean;
}

const OUTCOME_HINTS = [
  "mortality",
  "survival",
  "outcome",
  "adherence",
  "prevalence",
  "incidence",
  "efficacy",
  "effectiveness",
  "complication",
  "length of stay",
  "readmission",
  "quality of life",
  "progression",
  "severity",
  "hospitalization",
  "hospitalisation",
  "awareness",
  "knowledge",
  "attitude",
  "coverage",
];

const PREDICTOR_HINTS = [
  "predictor",
  "exposure",
  "risk factor",
  "associated with",
  "among",
  "in patients with",
  "in people with",
  "healthcare worker",
  "health care worker",
  "population",
];

/** Design phrases, matched as a whole so "cohort" in "cohort study" wins. */
const DESIGN_PATTERN =
  /\b(randomi[sz]ed controlled trial|randomi[sz]ed|controlled trials?|cohort stud(?:y|ies)|cohort|case-control stud(?:y|ies)|case-control|cross-sectional stud(?:y|ies)|cross-sectional|qualitative (?:research|study|analysis)|meta-analys(?:is|es)|meta analysis|systematic reviews?|retrospective (?:stud(?:y|ies)|cohort)|prospective (?:stud(?:y|ies)|cohort)|longitudinal (?:stud(?:y|ies)|cohort)|case reports?|case series|pilot stud(?:y|ies)|double-blind|single-blind)\b/i;

export function getRoleLabel(role: ConceptRole): string {
  switch (role) {
    case "condition":
      return "Condition / Population";
    case "predictor":
      return "Predictor / Exposure";
    case "outcome":
      return "Outcome";
    case "design":
      return "Study Design";
    default:
      return "Concept";
  }
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `${base}-${index + 1}` : `concept-${index + 1}`;
}

function containsHint(text: string, hints: string[]): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("ckm") || lower.includes("cardiovascular-kidney-metabolic") || lower.includes("cardiorenal metabolic")) {
    return true;
  }
  return hints.some((hint) => lower.includes(hint));
}

function splitSegments(query: string): Array<{ text: string; negated: boolean }> {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  let parts = cleaned.split(/\s+AND\s+/i);
  if (parts.length === 1) parts = cleaned.split(/\s+OR\s+/i);
  if (parts.length === 1) parts = cleaned.split(/[,;]/);
  return parts
    .map((part) => {
      const negated = /^\s*NOT\s+/i.test(part);
      return {
        text: part.replace(/^\s*NOT\s+/i, "").trim(),
        negated,
      };
    })
    .filter((part) => part.text.length > 1);
}

/**
 * Deterministic concept parser. Understands the shapes users actually type:
 * "A AND B", "effect of A on B", "A in B" and "<design> of A in B".
 */
export function extractConceptsLocally(query: string): ConceptBlock[] {
  const segments = splitSegments(query);
  if (segments.length === 0) return [];

  const blocks: ConceptBlock[] = [];
  const push = (
    role: ConceptRole,
    label: string,
    required: boolean,
    negated = false
  ) => {
    const clean = label.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 2) return;
    if (
      blocks.some(
        (b) => b.label.toLowerCase() === clean.toLowerCase() && b.role === role
      )
    ) {
      return;
    }
    blocks.push({
      id: slugify(clean, blocks.length),
      role,
      label: clean,
      required,
      synonyms: [],
      meshTerms: [],
      negated,
    });
  };

  const parseSegment = (segment: string, negated: boolean) => {
    // "<design> of <topic>" — split the design out and parse the topic.
    const ofMatch = segment.match(/^(.+?)\s+of\s+(.+)$/i);
    if (ofMatch && DESIGN_PATTERN.test(ofMatch[1])) {
      push("design", ofMatch[1], false, negated);
      parseSegment(ofMatch[2], negated);
      return;
    }

    const effectMatch = segment.match(
      /^(?:the\s+)?(?:effect|impact|influence|association|relationship|predictor(?:s)?|factor(?:s)?)\s+of\s+(.+?)\s+(?:on|upon|in|for|among)\s+(.+)$/i
    );
    if (effectMatch) {
      push("condition", effectMatch[1], true, negated);
      const outcomePart = effectMatch[2];
      const populationMatch = outcomePart.match(/^(.+?)\s+in\s+(.+)$/i);
      if (populationMatch) {
        push("outcome", populationMatch[1], false, negated);
        push("condition", populationMatch[2], false, negated);
      } else {
        push("outcome", outcomePart, false, negated);
      }
      return;
    }

    // Also handle "predictor of X" or "predictors of X"
    const predictorOfMatch = segment.match(/^(?:predictor(?:s)?|risk factor(?:s)?)\s+of\s+(.+)$/i);
    if (predictorOfMatch) {
      let outcome = predictorOfMatch[1];
      // Remove year ranges from outcome if present
      outcome = outcome.replace(/\b(19|20)\d{2}\s*(to|-)\s*(19|20)\d{2}\b/gi, '').trim();
      outcome = outcome.replace(/\b(19|20)\d{2}\b/g, '').trim();
      if (!outcome) outcome = segment;
      push("outcome", outcome, true, negated);
      return;
    }

    const inMatch = segment.match(/^(.+?)\s+(?:in|among|amongst)\s+(.+)$/i);
    if (inMatch) {
      push("condition", inMatch[1], true, negated);
      push("predictor", inMatch[2], false, negated);
      return;
    }

    if (DESIGN_PATTERN.test(segment)) {
      push("design", segment, false, negated);
      return;
    }
    if (containsHint(segment, OUTCOME_HINTS)) {
      push("outcome", segment, false, negated);
      return;
    }
    if (containsHint(segment, PREDICTOR_HINTS)) {
      push("predictor", segment, false, negated);
      return;
    }
    // If it mentions CKM syndrome, treat as condition
    if (/ckm|cardiovascular.*kidney.*metabolic/i.test(segment)) {
      push("condition", segment, true, negated);
      return;
    }
    push("condition", segment, true, negated);
  };

  for (const segment of segments) {
    parseSegment(segment.text, segment.negated);
  }

  // A single concept in the query is always required.
  if (blocks.length === 1) blocks[0].required = true;

  return blocks;
}

/**
 * Attach MeSH headings and synonyms to each concept.
 *
 * Only the most specific matching MeSH entry is used, so a concept never
 * silently explodes into a much broader disease family.
 */
export function enrichConcepts(blocks: ConceptBlock[]): ConceptBlock[] {
  return blocks.map((block) => {
    const expansion = lookupConceptExpansion(block.label);
    const synonyms = new Set<string>(block.synonyms || []);
    for (const synonym of expansion.synonyms) {
      if (synonym && synonym.toLowerCase() !== block.label.toLowerCase()) {
        synonyms.add(synonym);
      }
    }
    for (const narrower of expansion.narrowerTerms) {
      if (narrower && narrower.toLowerCase() !== block.label.toLowerCase()) {
        synonyms.add(narrower);
      }
    }
    const meshTerms = new Set<string>(block.meshTerms || []);
    for (const mesh of expansion.meshTerms) {
      if (mesh) meshTerms.add(mesh);
    }
    return {
      ...block,
      synonyms: Array.from(synonyms).slice(0, 8),
      meshTerms: Array.from(meshTerms).slice(0, 6),
    };
  });
}

function extractJsonArray(content: string): unknown[] | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : content).trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const VALID_ROLES: ConceptRole[] = ["condition", "predictor", "outcome", "design"];

function normaliseRole(value: unknown): ConceptRole {
  const lower = String(value || "").toLowerCase().trim();
  if (VALID_ROLES.includes(lower as ConceptRole)) return lower as ConceptRole;
  if (lower.startsWith("popul") || lower.startsWith("condit")) return "condition";
  if (lower.startsWith("predic") || lower.startsWith("expos")) return "predictor";
  if (lower.startsWith("outc")) return "outcome";
  if (lower.startsWith("design") || lower.startsWith("stud")) return "design";
  return "condition";
}

/**
 * Extract concepts with Gemini when a key is available, otherwise fall back
 * to the local parser. The result is always enriched with MeSH/synonyms.
 */
export async function extractConcepts(
  query: string,
  apiKey?: string
): Promise<{ blocks: ConceptBlock[]; source: "gemini" | "local" }> {
  const local = extractConceptsLocally(query);
  if (!apiKey) {
    return { blocks: enrichConcepts(local), source: "local" };
  }

  const prompt = [
    "You extract search concepts for a systematic review literature search.",
    "Return ONLY a JSON array, no prose, no markdown fences.",
    "Each element must be an object with keys: role, label, required, synonyms, meshTerms.",
    "role is one of: condition, predictor, outcome, design.",
    "label is a short noun phrase (2-6 words).",
    "required is true when the concept must be present in every record.",
    "synonyms is an array of alternative surface forms (max 6).",
    "meshTerms is an array of MeSH heading names (max 4) or an empty array.",
    "",
    `Research area: ${query}`,
  ].join("\n");

  try {
    const content = await callGemini(apiKey, prompt);
    const parsed = extractJsonArray(content);
    if (!parsed || parsed.length === 0) {
      return { blocks: enrichConcepts(local), source: "local" };
    }
    const blocks: ConceptBlock[] = [];
    parsed.forEach((raw: any) => {
      const label = String(raw?.label || "").replace(/\s+/g, " ").trim();
      if (!label) return;
      blocks.push({
        id: slugify(label, blocks.length),
        role: normaliseRole(raw?.role),
        label,
        required: raw?.required === true,
        synonyms: Array.isArray(raw?.synonyms)
          ? raw.synonyms.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 8)
          : [],
        meshTerms: Array.isArray(raw?.meshTerms)
          ? raw.meshTerms.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 6)
          : [],
      });
    });
    if (blocks.length === 0) {
      return { blocks: enrichConcepts(local), source: "local" };
    }
    return { blocks: enrichConcepts(blocks), source: "gemini" };
  } catch {
    return { blocks: enrichConcepts(local), source: "local" };
  }
}

/** Toggle whether a concept is required (AND-ed) or optional (OR-ed). */
export function setConceptRequired(
  blocks: ConceptBlock[],
  id: string,
  required: boolean
): ConceptBlock[] {
  return blocks.map((b) => (b.id === id ? { ...b, required } : b));
}
