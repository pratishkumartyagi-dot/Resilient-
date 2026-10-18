// Column-level data profiling (concept: data-centric-ai-community/fg-data-profiling).
// Produces descriptive statistics, missingness and outlier diagnostics for
// tabular research data so downstream reporting can describe the dataset.

export interface ProfileRow {
  label: string;
  value: number;
  sd?: number;
  n?: number;
}

export interface NumericProfile {
  name: string;
  count: number;
  missing: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  sd: number;
  q1: number;
  q3: number;
  iqr: number;
  outliers: number[];
}

export interface DataProfile {
  rowCount: number;
  columns: NumericProfile[];
  labelColumn: {
    unique: number;
    entries: Array<{ label: string; value: number }>;
    groupStats: Array<{ label: string; value: number; sd?: number; n?: number; ci95?: [number, number] }>;
  };
  quality: {
    completeness: number;
    issues: string[];
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function profileNumeric(name: string, raw: Array<number | undefined>): NumericProfile {
  const present = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const sorted = [...present].sort((a, b) => a - b);
  const count = present.length;
  const missing = raw.length - count;
  const mean = count ? present.reduce((s, v) => s + v, 0) / count : NaN;
  const variance = count > 1 ? present.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1) : 0;
  const sd = Math.sqrt(variance);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < lo || v > hi);
  return {
    name,
    count,
    missing,
    min: count ? sorted[0] : NaN,
    max: count ? sorted[sorted.length - 1] : NaN,
    mean,
    median: quantile(sorted, 0.5),
    sd,
    q1,
    q3,
    iqr,
    outliers,
  };
}

export function profileRows(rows: ProfileRow[]): DataProfile {
  const values = rows.map((r) => r.value);
  const sds = rows.map((r) => r.sd);
  const ns = rows.map((r) => r.n);

  const columns: NumericProfile[] = [
    profileNumeric("value", values),
    profileNumeric("sd", sds),
    profileNumeric("n", ns),
  ].filter((c) => c.count > 0);

  const groupStats = rows.map((r) => {
    let ci95: [number, number] | undefined;
    if (r.sd !== undefined && r.n !== undefined && r.n > 1) {
      const se = r.sd / Math.sqrt(r.n);
      ci95 = [r.value - 1.96 * se, r.value + 1.96 * se];
    }
    return { label: r.label, value: r.value, sd: r.sd, n: r.n, ci95 };
  });

  const totalCells = rows.length * 3;
  const missingCells = sds.filter((v) => v === undefined).length + ns.filter((v) => v === undefined).length;
  const completeness = totalCells ? 1 - missingCells / totalCells : 1;

  const issues: string[] = [];
  if (rows.length === 0) issues.push("No data rows were parsed.");
  if (rows.length > 0 && rows.length < 3) issues.push("Very few groups/rows — inferential comparisons are unstable.");
  if (values.some((v) => !Number.isFinite(v))) issues.push("Some value entries are not numeric.");
  if (sds.some((v) => v === undefined)) issues.push("Standard deviations are missing for some rows (CIs cannot be computed).");
  if (ns.some((v) => v === undefined)) issues.push("Sample sizes (n) are missing for some rows.");
  const valueProfile = columns.find((c) => c.name === "value");
  if (valueProfile && valueProfile.outliers.length > 0) {
    issues.push(`${valueProfile.outliers.length} potential outlier(s) detected in the value column (1.5×IQR rule).`);
  }

  return {
    rowCount: rows.length,
    columns,
    labelColumn: {
      unique: new Set(rows.map((r) => r.label)).size,
      entries: rows.map((r) => ({ label: r.label, value: r.value })),
      groupStats,
    },
    quality: { completeness, issues },
  };
}
