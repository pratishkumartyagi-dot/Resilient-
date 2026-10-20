// Univariate analysis (fg-data-profiling "Univariate analysis" feature).
//
// Descriptive statistics with distribution histograms for numerical columns,
// frequency tables for categorical columns and date ranges for temporal ones.

import type {
  CategoricalProfile,
  DateProfile,
  HistogramBin,
  NumericProfile,
  ProfileRow,
} from "./types";
import {
  isMissing,
  kurtosis,
  mean,
  modeOf,
  quantile,
  roundTo,
  sd,
  shapiroWilkApprox,
  shannonEntropy,
  skewness,
  variance,
} from "./utils";

export function buildHistogram(values: number[], binCount = 20): HistogramBin[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    return [{ label: String(min), start: min, end: max, count: finite.length }];
  }
  // Freedman-Diaconis rule, clamped to a usable range.
  const sorted = [...finite].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const width = iqr > 0 ? (2 * iqr) / Math.cbrt(finite.length) : (max - min) / binCount;
  const bins = Math.max(5, Math.min(50, width > 0 ? Math.ceil((max - min) / width) : binCount));

  const size = (max - min) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    label: `${roundTo(min + i * size, 3)} – ${roundTo(min + (i + 1) * size, 3)}`,
    start: min + i * size,
    end: min + (i + 1) * size,
    count: 0,
  }));
  for (const value of finite) {
    let idx = Math.floor((value - min) / size);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}

export function profileNumericColumn(
  name: string,
  raw: Array<number | undefined | null>
): NumericProfile {
  const present = raw.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  const sorted = [...present].sort((a, b) => a - b);
  const count = present.length;
  const missing = raw.length - count;
  const meanVal = count ? present.reduce((s, v) => s + v, 0) / count : NaN;
  const varVal = count > 1 ? variance(present, meanVal) : 0;
  const sdVal = Math.sqrt(varVal);
  const cv = meanVal !== 0 ? (sdVal / Math.abs(meanVal)) * 100 : 0;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < lo || v > hi);
  const normality =
    count >= 3 ? shapiroWilkApprox(present) : { shapiroWilkP: NaN, isNormal: false };
  const mode = modeOf(present);
  const zeroCount = present.filter((v) => v === 0).length;

  let monotone: NumericProfile["monotone"] = "none";
  if (present.length >= 3) {
    let increasing = true;
    let decreasing = true;
    for (let i = 1; i < present.length; i++) {
      if (present[i] < present[i - 1]) increasing = false;
      if (present[i] > present[i - 1]) decreasing = false;
    }
    if (increasing && !decreasing) monotone = "increasing";
    else if (decreasing && !increasing) monotone = "decreasing";
    else if (increasing && decreasing) monotone = "constant";
  }

  return {
    name,
    count,
    missing,
    missingPct: raw.length ? (missing / raw.length) * 100 : 0,
    min: count ? sorted[0] : NaN,
    max: count ? sorted[sorted.length - 1] : NaN,
    mean: meanVal,
    median: quantile(sorted, 0.5),
    sd: sdVal,
    variance: varVal,
    cv,
    q1,
    q3,
    iqr,
    skewness: skewness(present, meanVal, sdVal),
    kurtosis: kurtosis(present, meanVal, sdVal),
    outliers,
    outlierCount: outliers.length,
    normality,
    mode: mode.count > 0 ? Number(mode.value) : NaN,
    modeCount: mode.count,
    range: count ? sorted[sorted.length - 1] - sorted[0] : NaN,
    sum: count ? present.reduce((s, v) => s + v, 0) : 0,
    p05: quantile(sorted, 0.05),
    p95: quantile(sorted, 0.95),
    mad: count ? medianAbsoluteDeviation(present) : NaN,
    zeroCount,
    zeroPct: count ? (zeroCount / count) * 100 : 0,
    monotone,
  };
}

function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return NaN;
  const med = quantile([...values].sort((a, b) => a - b), 0.5);
  const deviations = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return quantile(deviations, 0.5);
}

export function profileCategoricalColumn(
  name: string,
  values: unknown[]
): CategoricalProfile {
  const present = values.filter((v) => !isMissing(v));
  const missing = values.length - present.length;
  const counts = new Map<string, number>();
  for (const value of present) {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 10).map(([value, count]) => ({
    value,
    count,
    pct: present.length ? (count / present.length) * 100 : 0,
  }));
  const mode = top[0] || { value: "", count: 0, pct: 0 };
  const countsArray = entries.map(([, c]) => c);
  const imbalanceRatio =
    countsArray.length > 1 ? countsArray[0] / Math.max(1, countsArray[countsArray.length - 1]) : 1;

  return {
    name,
    count: present.length,
    missing,
    missingPct: values.length ? (missing / values.length) * 100 : 0,
    distinct: entries.length,
    mode: mode.value,
    modeCount: mode.count,
    modePct: mode.pct,
    topCategories: top,
    imbalanceRatio,
    isImbalanced: countsArray.length > 1 && imbalanceRatio >= 10,
    entropy: shannonEntropy(countsArray),
  };
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function profileDateColumn(
  name: string,
  values: unknown[]
): DateProfile {
  const timestamps: number[] = [];
  let missing = 0;
  for (const value of values) {
    if (isMissing(value)) {
      missing++;
      continue;
    }
    const text = String(value).trim();
    const parsed = Date.parse(text);
    if (Number.isNaN(parsed)) {
      missing++;
      continue;
    }
    timestamps.push(parsed);
  }
  timestamps.sort((a, b) => a - b);

  const min = timestamps.length ? timestamps[0] : NaN;
  const max = timestamps.length ? timestamps[timestamps.length - 1] : NaN;
  const rangeDays = timestamps.length
    ? Math.round((max - min) / (1000 * 60 * 60 * 24))
    : 0;

  // Choose the period that keeps the series readable.
  const daySpan = rangeDays;
  let granularity: DateProfile["granularity"] = "day";
  let keyOf: (ts: number) => string;
  if (daySpan > 365 * 8) {
    granularity = "year";
    keyOf = (ts) => String(new Date(ts).getFullYear());
  } else if (daySpan > 365 * 2) {
    granularity = "quarter";
    keyOf = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    };
  } else if (daySpan > 70) {
    granularity = "month";
    keyOf = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${MONTH_LABELS[d.getMonth()]}`;
    };
  } else if (daySpan > 14) {
    granularity = "week";
    keyOf = (ts) => {
      const d = new Date(ts);
      const first = new Date(d.getFullYear(), 0, 1);
      const week = Math.floor((d.getTime() - first.getTime()) / (7 * 24 * 3600 * 1000));
      return `${d.getFullYear()}-W${week + 1}`;
    };
  } else {
    granularity = "day";
    keyOf = (ts) => new Date(ts).toISOString().slice(0, 10);
  }

  const buckets = new Map<string, number>();
  for (const ts of timestamps) {
    const key = keyOf(ts);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const histogram = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, count]) => ({ period, count }));

  return {
    name,
    count: timestamps.length,
    missing,
    missingPct: values.length ? (missing / values.length) * 100 : 0,
    min: Number.isFinite(min) ? new Date(min).toISOString().slice(0, 10) : "",
    max: Number.isFinite(max) ? new Date(max).toISOString().slice(0, 10) : "",
    rangeDays,
    distinct: new Set(timestamps).size,
    histogram,
    granularity,
  };
}

/** Extract the numeric values of a column regardless of the inferred type. */
export function numericValuesOf(rows: ProfileRow[], column: string): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const value = row[column];
    if (typeof value === "number" && Number.isFinite(value)) {
      values.push(value);
    } else if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) values.push(parsed);
    }
  }
  return values;
}

export { mean, sd };
