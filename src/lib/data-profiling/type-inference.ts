// Column type inference (fg-data-profiling "Type inference" feature).
//
// Every column is classified from its non-missing values: numerical,
// integer, boolean, date, categorical, text, URL, email, identifier,
// constant or empty. The inference reports a confidence so low-confidence
// guesses can be surfaced in the alerts.

import type { ColumnType, ColumnTypeProfile, ProfileRow } from "./types";
import { isMissing } from "./utils";

const URL_PATTERN = /^(https?:\/\/|ftp:\/\/|www\.)[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_PATTERN = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2})?)?/;
const US_DATE_PATTERN = /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;
const TRUE_WORDS = new Set(["true", "yes", "y", "t"]);
const FALSE_WORDS = new Set(["false", "no", "n", "f"]);

export function looksLikeDate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 40) return false;
  if (!ISO_DATE_PATTERN.test(trimmed) && !US_DATE_PATTERN.test(trimmed)) return false;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return false;
  const year = new Date(parsed).getFullYear();
  return year > 1800 && year < 2200;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    // Reject strings that only look numeric because of their date format.
    if (looksLikeDate(trimmed)) return null;
    return parsed;
  }
  return null;
}

export function inferColumnType(
  name: string,
  values: unknown[]
): { type: ColumnType; confidence: number; reason: string } {
  const present = values.filter((v) => !isMissing(v));
  if (present.length === 0) {
    return { type: "Empty", confidence: 1, reason: "All values are missing." };
  }

  const distinct = new Set(present.map((v) => String(v))).size;
  const distinctPct = distinct / present.length;

  if (distinct === 1) {
    return {
      type: "Constant",
      confidence: 1,
      reason: `Every row holds the same value ("${String(present[0])}").`,
    };
  }

  let numeric = 0;
  let integer = 0;
  let boolean = 0;
  let date = 0;
  let url = 0;
  let email = 0;
  let string = 0;

  for (const value of present) {
    const numericValue = asNumber(value);
    if (numericValue !== null) {
      numeric++;
      if (Number.isInteger(numericValue)) integer++;
      continue;
    }
    const text = String(value).trim();
    const lower = text.toLowerCase();
    if (TRUE_WORDS.has(lower) || FALSE_WORDS.has(lower)) {
      boolean++;
      continue;
    }
    if (looksLikeDate(text)) {
      date++;
      continue;
    }
    if (EMAIL_PATTERN.test(text)) {
      email++;
      continue;
    }
    if (URL_PATTERN.test(text)) {
      url++;
      continue;
    }
    string++;
  }

  const total = present.length;
  const numericRatio = numeric / total;

  if (boolean / total >= 0.95 && distinct <= 2) {
    return {
      type: "Boolean",
      confidence: boolean / total,
      reason: "All values are boolean literals.",
    };
  }
  if (numericRatio >= 0.9) {
    // A numeric column whose values are all distinct is an identifier, not a
    // measure — it must be checked before the plain numeric classification.
    if (distinctPct >= 0.95 && present.length > 3) {
      return {
        type: "ID",
        confidence: numericRatio,
        reason: "Every row holds a unique numeric value — treated as an identifier.",
      };
    }
    const integerRatio = integer / total;
    if (integerRatio >= 0.99) {
      return {
        type: "Integer",
        confidence: numericRatio,
        reason: "Every value is a whole number.",
      };
    }
    return {
      type: "Numeric",
      confidence: numericRatio,
      reason: `${(numericRatio * 100).toFixed(0)}% of values are numeric.`,
    };
  }
  if (date / total >= 0.8) {
    return {
      type: "Date",
      confidence: date / total,
      reason: `${(date / total * 100).toFixed(0)}% of values parse as dates.`,
    };
  }
  if (url / total >= 0.8) {
    return { type: "URL", confidence: url / total, reason: "Values are web addresses." };
  }
  if (email / total >= 0.8) {
    return { type: "Email", confidence: email / total, reason: "Values are email addresses." };
  }

  // A numeric column that is entirely unique is an identifier, not a measure.
  if (numericRatio >= 0.8 && distinctPct >= 0.95 && present.length > 3) {
    return {
      type: "ID",
      confidence: numericRatio,
      reason: "Every row holds a unique numeric value — treated as an identifier.",
    };
  }

  if (string / total >= 0.8) {
    const categoricalLimit = Math.max(10, Math.sqrt(present.length));
    if (distinct <= categoricalLimit || distinctPct < 0.5) {
      return {
        type: "Categorical",
        confidence: 1 - Math.min(1, distinct / Math.max(categoricalLimit, 1)) * 0.2,
        reason: `${distinct} distinct values across ${present.length} rows.`,
      };
    }
    return {
      type: "Text",
      confidence: 0.8,
      reason: `${distinct} distinct free-text values.`,
    };
  }

  // Mixed content: numbers, dates and strings together.
  return {
    type: "Categorical",
    confidence: 0.5,
    reason: "Mixed value types detected.",
  };
}

export function inferColumnTypes(
  rows: ProfileRow[],
  colNames: string[]
): ColumnTypeProfile[] {
  return colNames.map((name) => {
    const values = rows.map((row) => row[name]);
    const present = values.filter((v) => !isMissing(v));
    const distinct = new Set(present.map((v) => String(v))).size;
    const { type, confidence, reason } = inferColumnType(name, values);
    return {
      name,
      type,
      confidence,
      distinct,
      distinctPct: present.length ? distinct / present.length : 0,
      reason,
    };
  });
}
