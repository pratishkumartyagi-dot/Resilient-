// Text analysis (fg-data-profiling "Text analysis" feature).
//
// Detects the character repertoire of a text column: casing balance, digit
// and punctuation share, Unicode script blocks, ASCII vs non-ASCII blocks and
// the most frequent words.

import type { TextProfile } from "./types";
import { isMissing, roundTo } from "./utils";

const SCRIPT_RANGES: Array<{ script: string; test: RegExp }> = [
  { script: "Latin", test: /[A-Za-z]/ },
  { script: "Cyrillic", test: /[\u0400-\u04FF]/ },
  { script: "Greek", test: /[\u0370-\u03FF]/ },
  { script: "Arabic", test: /[\u0600-\u06FF]/ },
  { script: "Hebrew", test: /[\u0590-\u05FF]/ },
  { script: "Devanagari", test: /[\u0900-\u097F]/ },
  { script: "CJK", test: /[\u4E00-\u9FFF]/ },
  { script: "Hiragana/Katakana", test: /[\u3040-\u30FF]/ },
  { script: "Hangul", test: /[\uAC00-\uD7AF]/ },
];

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function profileTextColumn(name: string, values: unknown[]): TextProfile {
  const present = values.filter((v) => !isMissing(v)).map((v) => String(v));
  const joined = present.join("\n");
  const charCount = joined.length;

  let uppercase = 0;
  let lowercase = 0;
  let digits = 0;
  let whitespace = 0;
  let punctuation = 0;
  let nonAscii = 0;

  for (const ch of joined) {
    if (/\s/.test(ch)) whitespace++;
    else if (ch >= "0" && ch <= "9") digits++;
    else if (ch >= "A" && ch <= "Z") uppercase++;
    else if (ch >= "a" && ch <= "z") lowercase++;
    else if (/[^\p{L}\p{N}\s]/u.test(ch)) punctuation++;
    if (ch.charCodeAt(0) > 127) nonAscii++;
  }

  const scriptCounts = new Map<string, number>();
  for (const { script, test } of SCRIPT_RANGES) {
    let count = 0;
    for (const ch of joined) if (test.test(ch)) count++;
    if (count > 0) scriptCounts.set(script, count);
  }

  const wordMatches = joined.match(WORD_PATTERN) || [];
  const wordCounts = new Map<string, number>();
  for (const word of wordMatches) {
    const key = word.toLowerCase();
    wordCounts.set(key, (wordCounts.get(key) || 0) + 1);
  }
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  const totalLetters = uppercase + lowercase;
  const pct = (n: number) => (charCount ? roundTo((n / charCount) * 100, 2) : 0);

  return {
    name,
    charCount,
    wordCount: wordMatches.length,
    avgWordLength: wordMatches.length
      ? roundTo(
          wordMatches.reduce((s, w) => s + w.length, 0) / wordMatches.length,
          2
        )
      : 0,
    uppercasePct: totalLetters ? roundTo((uppercase / totalLetters) * 100, 2) : 0,
    lowercasePct: totalLetters ? roundTo((lowercase / totalLetters) * 100, 2) : 0,
    digitPct: pct(digits),
    whitespacePct: pct(whitespace),
    punctuationPct: pct(punctuation),
    nonAsciiPct: pct(nonAscii),
    scripts: Array.from(scriptCounts.entries())
      .map(([script, count]) => ({
        script,
        count,
        pct: charCount ? roundTo((count / charCount) * 100, 2) : 0,
      }))
      .sort((a, b) => b.count - a.count),
    blocks: [
      {
        block: "ASCII",
        count: charCount - nonAscii,
        pct: charCount ? roundTo(((charCount - nonAscii) / charCount) * 100, 2) : 0,
      },
      {
        block: "Non-ASCII (Unicode)",
        count: nonAscii,
        pct: pct(nonAscii),
      },
    ],
    topWords,
  };
}
