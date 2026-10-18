import type { ChapterFile } from "@/lib/thesis-types";

export interface HumaniserInput {
  chapters: ChapterFile[];
  fullThesis: string;
  aiFn?: (prompt: string) => Promise<string>;
}

export interface HumaniserOutput {
  chapters: ChapterFile[];
  fullThesis: string;
  changeLog: string[];
  subResult: { ok: boolean; error?: string };
}

// Layer 1 & 2 of the academic-humanizer skill (AIScientists-Dev/academic-humanizer, MIT):
// AI-tell catalog + academic AI tells. Each pair is [pattern, replacement].
// High-confidence phrase edits only; the AI pass handles claim/evidence and voice.
const TELL_REPLACEMENTS: Array<[RegExp, string]> = [
  // AI vocabulary (Layer 1)
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
  // Copula avoidance + filler (Layer 1)
  [/\bserves as\b/gi, "is"],
  [/\bin order to\b/gi, "to"],
  [/\bit is worth noting that\b/gi, ""],
  [/\bit should be emphasized that\b/gi, ""],
  [/\bit is important to note that\b/gi, "note that"],
  [/\bnotably,\s*/gi, ""],
  [/\bimportantly,\s*/gi, ""],
  // Significance hype (2.2)
  [/\bpaves? the way for\b/gi, "supports"],
  [/\bsheds? light on\b/gi, "clarifies"],
  [/\bof paramount importance\b/gi, "important"],
  [/\bbridges? the gap\b/gi, "addresses the gap"],
  [/\bhas the potential to revolutionize\b/gi, "could change"],
  [/\bopens? new avenues\b/gi, "opens directions"],
  [/\ba crucial step toward\b/gi, "a step toward"],
  // Empty intensifiers (2.3)
  [/\bextensive experiments\b/gi, "experiments"],
  [/\bcomprehensive experiments\b/gi, "experiments"],
  [/\bthorough experiments\b/gi, "experiments"],
  [/\ba wide range of\b/gi, "several"],
  // Novelty padding (2.4)
  [/\bto the best of our knowledge,\s*/gi, ""],
  [/\bnovel\s+(framework|method|approach|algorithm)\b/gi, "$1"],
  // Formulaic openers (2.5)
  [/\bin recent years,\s*/gi, ""],
  [/\bwith the rapid development of\b/gi, "as"],
  [/\bhas attracted increasing attention\b/gi, "is an active area"],
  // Connective overuse (2.6) — only at sentence start to avoid breaking clauses
  [/(^|[.!?]\s+)Moreover,\s+/g, "$1"],
  [/(^|[.!?]\s+)Furthermore,\s+/g, "$1"],
  [/(^|[.!?]\s+)Additionally,\s+/g, "$1"],
];

function stripTells(text: string, log: Set<string>): string {
  let out = text;
  for (const [re, repl] of TELL_REPLACEMENTS) {
    if (re.test(out)) {
      log.add(String(re));
      out = out.replace(re, repl);
    }
  }
  // Layer 1: remove em-dashes entirely, recasting with commas/colons.
  // Do NOT touch dashes inside numeric ranges (e.g. 0.12–0.45 → must stay intact).
  if (/—|–/.test(out)) {
    log.add("em-dash removal");
    out = out.replace(/(?<!\d)\s*[—–]\s*(?!\d)/g, ", ");
  }
  // Layer 2.11: split overlong clause-stacked sentences (> ~45 words).
  out = splitOverlongSentences(out);
  // Tidy artifacts from removals.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ,/g, ",")
    .replace(/\.\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+/gm, (m) => m);
  return out;
}

function splitOverlongSentences(text: string): string {
  // Split only within prose paragraphs, never headings/lists/tables/code.
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const t = block.trim();
      if (/^#{1,6}\s/.test(t) || t.startsWith("```") || /^\s*[-*+]\s/.test(t) || /^\s*\|\s/.test(t)) {
        return block;
      }
      return block.replace(/([^.?!])((?:[^.!?]*?,){3,}[^.!?]*?)([.!?])/g, (m) => {
        if (m.split(/\s+/).length < 45) return m;
        return m.replace(/,\s+(?=(?:and|which|while|with|whereas|although)\b)/g, ". ");
      });
    })
    .join("\n\n");
}

const HUMANISER_SYSTEM_PROMPT = `You are the "academic-humanizer" (AIScientists-Dev/academic-humanizer, MIT). Improve the clarity and voice of AI-assisted academic writing while preserving scholarly voice.

HARD RULES:
- NEVER change, drop, or invent a number, equation, citation, or reference. Keep every cite key.
- Keep evidence-tied hedging ("suggests", "is consistent with", "may indicate"). Do not over-claim.
- Keep first-person plural "we", passive voice where the actor is irrelevant, definitions, symbols, and technical terms verbatim.
- Remove AI tells: inflated significance ("paves the way", "pivotal"), significance hype, empty intensifiers ("extensive/comprehensive experiments"), novelty padding ("to the best of our knowledge", "novel"), formulaic openers ("In recent years..."), connective overuse (Moreover/Furthermore/Additionally), boilerplate emphasis ("It is worth noting that"), AI vocabulary (delve, underscore, intricate, tapestry, testament, leverage, seamless, showcase, foster, realm, landscape).
- Remove em-dashes entirely; recast with commas, colons, parentheses, or separate sentences.
- Split overlong clause-stacked sentences: one idea per sentence.
- Claim-evidence discipline: no verb stronger than the evidence (prove -> show empirically). Replace vague magnitudes with the stated number/range; if none is given, soften rather than invent.
- Cover everything the original covered: same paragraph count and structure. Preserve markdown headings, lists, and tables.

Return ONLY the rewritten text with no preamble and no code fences.`;

function cleanAiOutput(text: string): string {
  return text.replace(/```(?:markdown|md)?/gi, "").replace(/```/g, "").trim();
}

export async function humanise(input: HumaniserInput): Promise<HumaniserOutput> {
  const chaptersIn = Array.isArray(input?.chapters) ? input.chapters : [];
  const fullThesisIn = typeof input?.fullThesis === "string" ? input.fullThesis : "";
  const aiFn = input?.aiFn;
  const changeLog = new Set<string>();
  const humanised: ChapterFile[] = [];
  let aiSucceeded = false;

  for (const chapter of chaptersIn) {
    const original = typeof chapter?.content === "string" ? chapter.content : "";
    let content = stripTells(original, changeLog);

    if (aiFn && content.trim().length > 0) {
      try {
        const text = await aiFn(`${HUMANISER_SYSTEM_PROMPT}\n\nMANUSCRIPT SECTION:\n${content}`);
        const cleaned = cleanAiOutput(text);
        // Guard: only accept the AI rewrite if it preserved citations & numbers.
        if (cleaned.length > 0 && preservesCitations(original, cleaned)) {
          content = stripTells(cleaned, changeLog);
          changeLog.add("AI rewrite (voice + claim/evidence)");
          aiSucceeded = true;
        }
      } catch {
        // Quota/network failure: keep the deterministic humanised text.
      }
    }

    humanised.push({
      ...chapter,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
    });
  }

  const fullThesis = humanised.length > 0
    ? humanised.map((c) => `# Chapter ${c.chapterNumber}: ${c.chapterTitle}\n\n${c.content}\n`).join("\n---\n\n")
    : stripTells(fullThesisIn, changeLog);

  return {
    chapters: humanised,
    fullThesis,
    changeLog: Array.from(changeLog),
    subResult: { ok: aiSucceeded || chaptersIn.length === 0, error: aiSucceeded ? undefined : "Humanise stage: no AI rewrite succeeded" },
  };
}

// Ensure the rewrite did not drop citations (author-year) or numeric tokens.
function preservesCitations(before: string, after: string): boolean {
  const citeRe = /\(([^)]+,\s*\d{4})\)/g;
  const nums = (s: string) => (s.match(/\d+(\.\d+)?/g) || []).length;
  const citesBefore = (before.match(citeRe) || []).length;
  const citesAfter = (after.match(citeRe) || []).length;
  if (citesBefore > 0 && citesAfter < citesBefore * 0.8) return false;
  if (nums(before) > 0 && nums(after) < nums(before) * 0.8) return false;
  return true;
}
