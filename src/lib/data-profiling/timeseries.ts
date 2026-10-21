// Time-series diagnostics (fg-data-profiling "Time-Series" feature).
//
// Detects the sampling frequency, fits a linear trend and computes the
// autocorrelation (ACF) and partial autocorrelation (PACF) functions so the
// report can flag seasonality and serial dependence.

import type { ProfileRow, TimeSeriesProfile } from "./types";
import { isMissing, roundTo } from "./utils";
import { mean, variance } from "./utils";

interface Point {
  date: number;
  value: number;
}

function collectSeries(
  rows: ProfileRow[],
  dateColumn: string,
  valueColumn: string
): Point[] {
  const points: Point[] = [];
  for (const row of rows) {
    const rawDate = row[dateColumn];
    const rawValue = row[valueColumn];
    if (isMissing(rawDate) || isMissing(rawValue)) continue;
    const timestamp = Date.parse(String(rawDate));
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isNaN(timestamp) || !Number.isFinite(value)) continue;
    points.push({ date: timestamp, value });
  }
  return points.sort((a, b) => a.date - b.date);
}

function detectFrequency(points: Point[]): TimeSeriesProfile["frequency"] {
  if (points.length < 3) return "irregular";
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push(points[i].date - points[i - 1].date);
  }
  const meanGap = mean(gaps);
  if (meanGap <= 0) return "irregular";
  const day = 24 * 3600 * 1000;
  if (Math.abs(meanGap - day) < day * 0.2) return "daily";
  if (Math.abs(meanGap - 7 * day) < day) return "weekly";
  if (Math.abs(meanGap - 30 * day) < 5 * day) return "monthly";
  if (Math.abs(meanGap - 91 * day) < 15 * day) return "quarterly";
  if (Math.abs(meanGap - 365 * day) < 30 * day) return "yearly";
  return "irregular";
}

/** Autocorrelation function up to `maxLag` lags. */
export function autocorrelation(values: number[], maxLag: number): number[] {
  const n = values.length;
  if (n < 2) return [];
  const meanVal = mean(values);
  const denominator = values.reduce((s, v) => s + (v - meanVal) ** 2, 0);
  if (denominator === 0) return new Array(maxLag + 1).fill(0);
  const out: number[] = [];
  for (let lag = 0; lag <= Math.min(maxLag, n - 1); lag++) {
    let numerator = 0;
    for (let i = 0; i < n - lag; i++) {
      numerator += (values[i] - meanVal) * (values[i + lag] - meanVal);
    }
    out.push(numerator / denominator);
  }
  return out;
}

/** Partial autocorrelation via the Durbin-Levinson recursion. */
export function partialAutocorrelation(values: number[], maxLag: number): number[] {
  const acf = autocorrelation(values, maxLag);
  const n = acf.length;
  if (n === 0) return [];
  const phi = new Array<number>(n).fill(0);
  const out: number[] = [];
  for (let k = 1; k < n; k++) {
    let numerator = acf[k];
    for (let j = 1; j < k; j++) {
      numerator -= phi[j] * acf[k - j];
    }
    const denominator = 1;
    let updated = numerator / denominator;
    for (let j = 1; j < k; j++) {
      const previous = phi[j];
      phi[j] = previous - updated * phi[k - j];
    }
    phi[k] = updated;
    out.push(updated);
  }
  return out;
}

function linearTrend(values: number[]): {
  slope: number;
  intercept: number;
  r2: number;
  direction: "increasing" | "decreasing" | "flat";
} {
  const n = values.length;
  if (n < 2) {
    return { slope: 0, intercept: n ? values[0] : 0, r2: 0, direction: "flat" };
  }
  const xs = values.map((_, i) => i + 1);
  const mx = mean(xs);
  const my = mean(values);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (values[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const direction =
    Math.abs(slope) < 1e-12 ? "flat" : slope > 0 ? "increasing" : "decreasing";
  return { slope: roundTo(slope, 6), intercept: roundTo(intercept, 6), r2: roundTo(r2, 4), direction };
}

export function profileTimeSeries(
  rows: ProfileRow[],
  dateColumn: string,
  valueColumn: string
): TimeSeriesProfile | null {
  const points = collectSeries(rows, dateColumn, valueColumn);
  if (points.length < 5) return null;

  const values = points.map((p) => p.value);
  const maxLag = Math.min(20, Math.floor(points.length / 3));
  const acfValues = autocorrelation(values, maxLag);
  const pacfValues = partialAutocorrelation(values, maxLag);

  const acf = acfValues.map((acf, lag) => ({ lag, acf: roundTo(acf, 4) }));
  const pacf = pacfValues.map((pacf, index) => ({ lag: index + 1, pacf: roundTo(pacf, 4) }));

  // Seasonality: the lag (other than 0) with the strongest autocorrelation.
  let period: number | null = null;
  let strength = 0;
  for (const entry of acf) {
    if (entry.lag === 0) continue;
    if (Math.abs(entry.acf) > Math.abs(strength)) {
      strength = entry.acf;
      period = entry.lag;
    }
  }

  return {
    dateColumn,
    valueColumn,
    n: points.length,
    frequency: detectFrequency(points),
    trend: linearTrend(values),
    acf,
    pacf,
    seasonality: { period, strength: roundTo(strength, 4) },
    series: points.map((p) => ({
      date: new Date(p.date).toISOString().slice(0, 10),
      value: roundTo(p.value, 6),
    })),
  };
}

/** Find every (date, numeric) pair worth profiling as a time series. */
export function detectTimeSeries(
  rows: ProfileRow[],
  dateColumns: string[],
  numericColumns: string[]
): TimeSeriesProfile[] {
  const out: TimeSeriesProfile[] = [];
  for (const dateColumn of dateColumns) {
    for (const valueColumn of numericColumns) {
      if (dateColumn === valueColumn) continue;
      const profile = profileTimeSeries(rows, dateColumn, valueColumn);
      if (profile) out.push(profile);
    }
  }
  // Keep the most informative series per date column.
  const byDate = new Map<string, TimeSeriesProfile>();
  for (const profile of out) {
    const current = byDate.get(profile.dateColumn);
    if (!current || profile.n > current.n) byDate.set(profile.dateColumn, profile);
  }
  return Array.from(byDate.values());
}

export { variance };
