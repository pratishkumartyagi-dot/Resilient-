// Multivariate data profiling (concept: data-centric-ai-community/fg-data-profiling).
// Produces descriptive statistics, missingness, outlier diagnostics, correlation
// matrix, PCA, normality tests and group comparisons for tabular research data.

export interface ProfileRow {
  [column: string]: string | number | null | undefined;
}

export interface NumericProfile {
  name: string;
  count: number;
  missing: number;
  missingPct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  sd: number;
  variance: number;
  cv: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
  outliers: number[];
  outlierCount: number;
  normality: {
    shapiroWilkP: number;
    isNormal: boolean;
  };
}

export interface CorrelationPair {
  var1: string;
  var2: string;
  r: number;
  pValue: number;
  significant: boolean;
  strength: "none" | "weak" | "moderate" | "strong";
}

export interface PCAComponent {
  component: number;
  eigenvalue: number;
  varianceExplained: number;
  cumulativeVariance: number;
  loadings: Record<string, number>;
}

export interface DataQualityIssue {
  column: string;
  type: "missing" | "outlier" | "nonNumeric" | "constant";
  count: number;
  percentage: number;
  description: string;
}

export interface DataProfile {
  rowCount: number;
  columnCount: number;
  columns: NumericProfile[];
  correlationMatrix: CorrelationPair[];
  pca: {
    components: PCAComponent[];
    totalVarianceExplained: number;
  };
  quality: {
    completeness: number;
    missingCells: number;
    totalCells: number;
    issues: DataQualityIssue[];
  };
  groups: Array<{
    label: string;
    value: number;
    sd?: number;
    n?: number;
    ci95?: [number, number];
  }>;
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

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function variance(values: number[], meanVal: number): number {
  if (values.length < 2) return 0;
  return values.reduce((s, v) => s + (v - meanVal) ** 2, 0) / (values.length - 1);
}

function skewness(values: number[], meanVal: number, sd: number): number {
  if (values.length < 3 || sd === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((s, v) => s + (v - meanVal) ** 3, 0) / n;
  return (n / ((n - 1) * (n - 2))) * (m3 / sd ** 3);
}

function kurtosis(values: number[], meanVal: number, sd: number): number {
  if (values.length < 4 || sd === 0) return 0;
  const n = values.length;
  const m4 = values.reduce((s, v) => s + (v - meanVal) ** 4, 0) / n;
  const m2 = values.reduce((s, v) => s + (v - meanVal) ** 2, 0) / n;
  return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * (m4 / (m2 ** 2)) - (3 * (n - 1) ** 2) / ((n - 1) * (n - 2));
}

function shapiroWilkApprox(values: number[]): { shapiroWilkP: number; isNormal: boolean } {
  const n = values.length;
  if (n < 3 || n > 5000) return { shapiroWilkP: NaN, isNormal: false };
  const sorted = [...values].sort((a, b) => a - b);
  const meanVal = mean(values);
  const sd = Math.sqrt(variance(values, meanVal));
  if (sd === 0) return { shapiroWilkP: 1, isNormal: true };

  // Approximate inverse normal CDF for expected order statistics
  const expectedNormal: number[] = [];
  for (let i = 1; i <= n; i++) {
    const p = (i - 0.375) / (n + 0.25);
    if (p <= 0 || p >= 1) {
      expectedNormal.push(0);
      continue;
    }
    let z = Math.sqrt(-2 * Math.log(1 - p));
    z = z - (2.515517 + 0.802853 * z + 0.010328 * z * z) /
      (1 + 1.432788 * z + 0.189269 * z * z + 0.001308 * z * z * z);
    expectedNormal.push(z);
  }

  const meanExp = mean(expectedNormal);
  const sdExp = Math.sqrt(variance(expectedNormal, meanExp));
  if (sdExp === 0) return { shapiroWilkP: 1, isNormal: true };

  const cov = sorted.reduce((s, v, i) => s + (v - meanVal) * (expectedNormal[i] - meanExp), 0) / n;
  const w = (cov ** 2) / (variance(values, meanVal) * variance(expectedNormal, meanExp));

  // Approximate p-value from W statistic
  let pValue = 1;
  if (w < 0.5) pValue = 0.001;
  else if (w < 0.7) pValue = 0.01;
  else if (w < 0.8) pValue = 0.05;
  else if (w < 0.9) pValue = 0.1;
  else pValue = 0.5;

  return { shapiroWilkP: pValue, isNormal: pValue > 0.05 };
}

export function profileNumeric(name: string, raw: Array<number | undefined>): NumericProfile {
  const present = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const sorted = [...present].sort((a, b) => a - b);
  const count = present.length;
  const missing = raw.length - count;
  const meanVal = count ? present.reduce((s, v) => s + v, 0) / count : NaN;
  const varVal = count > 1 ? present.reduce((s, v) => s + (v - meanVal) ** 2, 0) / (count - 1) : 0;
  const sd = Math.sqrt(varVal);
  const cv = meanVal !== 0 ? (sd / Math.abs(meanVal)) * 100 : 0;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < lo || v > hi);
  const normality = count >= 3 ? shapiroWilkApprox(present) : { shapiroWilkP: NaN, isNormal: false };

  return {
    name,
    count,
    missing,
    missingPct: raw.length ? (missing / raw.length) * 100 : 0,
    min: count ? sorted[0] : NaN,
    max: count ? sorted[sorted.length - 1] : NaN,
    mean: meanVal,
    median: quantile(sorted, 0.5),
    sd,
    variance: varVal,
    cv,
    q1,
    q3,
    iqr,
    skewness: skewness(present, meanVal, sd),
    kurtosis: kurtosis(present, meanVal, sd),
    outliers,
    outlierCount: outliers.length,
    normality,
  };
}

export function correlationMatrix(data: ProfileRow[], colNames: string[]): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < colNames.length; i++) {
    for (let j = i + 1; j < colNames.length; j++) {
      const v1 = colNames[i];
      const v2 = colNames[j];
      const paired: Array<[number, number]> = [];
      for (const row of data) {
        const a = row[v1];
        const b = row[v2];
        if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
          paired.push([a, b]);
        }
      }
      if (paired.length < 3) continue;

      const x = paired.map((p) => p[0]);
      const y = paired.map((p) => p[1]);
      const mx = mean(x);
      const my = mean(y);
      const sdx = Math.sqrt(variance(x, mx));
      const sdy = Math.sqrt(variance(y, my));

      if (sdx === 0 || sdy === 0) continue;

      const cov = paired.reduce((s: number, [a, b]: [number, number]) => s + (a - mx) * (b - my), 0) / (paired.length - 1);
      const r = cov / (sdx * sdy);

      const rClamped = Math.max(-1, Math.min(1, r));
      const n = paired.length;
      const t = (rClamped * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1e-10, 1 - rClamped ** 2));
      const df = n - 2;

      let pValue = 1;
      if (Math.abs(t) > 3) pValue = 0.01;
      else if (Math.abs(t) > 2) pValue = 0.05;
      else if (Math.abs(t) > 1) pValue = 0.2;
      else pValue = 0.5;

      let strength: "none" | "weak" | "moderate" | "strong" = "none";
      const absR = Math.abs(rClamped);
      if (absR >= 0.7) strength = "strong";
      else if (absR >= 0.4) strength = "moderate";
      else if (absR >= 0.2) strength = "weak";

      pairs.push({
        var1: v1,
        var2: v2,
        r: rClamped,
        pValue,
        significant: pValue < 0.05,
        strength,
      });
    }
  }
  return pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export function pcaAnalysis(data: ProfileRow[], colNames: string[]): PCAComponent[] {
  const numericCols = colNames.filter((c) => {
    return data.some((r) => typeof r[c] === "number" && Number.isFinite(r[c]));
  });

  if (numericCols.length < 2) return [];

  // Standardize data
  const standardized: number[][] = [];
  const colStats: { mean: number; sd: number }[] = [];
  for (const col of numericCols) {
    const vals = data.map((r) => r[col]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const m = mean(vals);
    const sd = Math.sqrt(variance(vals, m));
    colStats.push({ mean: m, sd: sd === 0 ? 1 : sd });
  }

  for (const row of data) {
    const rowVals: number[] = [];
    for (let i = 0; i < numericCols.length; i++) {
      const v = row[numericCols[i]];
      const val = typeof v === "number" && Number.isFinite(v) ? v : colStats[i].mean;
      rowVals.push((val - colStats[i].mean) / colStats[i].sd);
    }
    standardized.push(rowVals);
  }

  const nCols = numericCols.length;
  const covMatrix: number[][] = Array.from({ length: nCols }, () => Array(nCols).fill(0));
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nCols; j++) {
      let sum = 0;
      for (const row of standardized) {
        sum += row[i] * row[j];
      }
      covMatrix[i][j] = sum / (standardized.length - 1);
    }
  }

  // Power iteration for principal components
  const components: PCAComponent[] = [];
  let remaining = covMatrix.map((row) => [...row]);

  for (let comp = 0; comp < nCols; comp++) {
    let v = Array.from({ length: nCols }, () => 1 / Math.sqrt(nCols));
    for (let iter = 0; iter < 100; iter++) {
      const newV = Array.from({ length: nCols }, (_, i) =>
        remaining[i].reduce((s, vj, j) => s + vj * v[j], 0)
      );
      const norm = Math.sqrt(newV.reduce((s, v) => s + v * v, 0));
      if (norm === 0) break;
      for (let j = 0; j < nCols; j++) v[j] = newV[j] / norm;
    }

    const eigenvalue = v.reduce((s, v_i, i) => s + v_i * remaining[i].reduce((sum, vj, j) => sum + vj * v[j], 0), 0);

    // Deflate
    for (let i = 0; i < nCols; i++) {
      for (let j = 0; j < nCols; j++) {
        remaining[i][j] -= eigenvalue * v[i] * v[j];
      }
    }

    components.push({
      component: comp + 1,
      eigenvalue,
      varianceExplained: eigenvalue / nCols,
      cumulativeVariance: 0,
      loadings: Object.fromEntries(numericCols.map((col, idx) => [col, v[idx]])),
    });
  }

  let cumVar = 0;
  for (const comp of components) {
    cumVar += comp.varianceExplained;
    comp.cumulativeVariance = cumVar;
  }

  return components;
}

export function profileDataset(rows: ProfileRow[]): DataProfile {
  if (rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      correlationMatrix: [],
      pca: { components: [], totalVarianceExplained: 0 },
      quality: { completeness: 0, missingCells: 0, totalCells: 0, issues: [{ column: "all", type: "missing", count: 0, percentage: 0, description: "No data rows were parsed." }] },
      groups: [],
    };
  }

  const colNames = Object.keys(rows[0]);
  const numericCols = colNames.filter((col) => rows.some((r) => typeof r[col] === "number" && Number.isFinite(r[col])));

  const columns: NumericProfile[] = [];
  for (const col of numericCols) {
    const raw = rows.map((r) => (typeof r[col] === "number" && Number.isFinite(r[col]) ? r[col] : undefined));
    columns.push(profileNumeric(col, raw));
  }

  const correlationMatrixResult = correlationMatrix(rows, numericCols);
  const pca = pcaAnalysis(rows, numericCols);

  const totalCells = rows.length * colNames.length;
  const missingCells = rows.reduce((sum, r) => sum + colNames.filter((c) => r[c] === undefined || r[c] === null || r[c] === "").length, 0);
  const completeness = totalCells ? 1 - missingCells / totalCells : 1;

  const issues: Array<{ column: string; type: "missing" | "outlier" | "nonNumeric" | "constant"; count: number; percentage: number; description: string }> = [];

  for (const col of colNames) {
    const values = rows.map((r) => r[col]);
    const nonNumeric = values.filter((v) => v !== null && v !== undefined && v !== "" && typeof v !== "number").length;
    const missing = values.filter((v) => v === undefined || v === null || v === "").length;
    const numericVals = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const outliers = numericVals.length > 0 ? profileNumeric(col, numericVals).outliers : [];

    if (missing > 0) {
      issues.push({
        column: col,
        type: "missing",
        count: missing,
        percentage: (missing / rows.length) * 100,
        description: `${missing} missing value(s) (${((missing / rows.length) * 100).toFixed(1)}%)`,
      });
    }
    if (nonNumeric > 0) {
      issues.push({
        column: col,
        type: "nonNumeric",
        count: nonNumeric,
        percentage: (nonNumeric / rows.length) * 100,
        description: `${nonNumeric} non-numeric value(s)`,
      });
    }
    if (outliers.length > 0) {
      issues.push({
        column: col,
        type: "outlier",
        count: outliers.length,
        percentage: (outliers.length / numericVals.length) * 100,
        description: `${outliers.length} potential outlier(s) beyond 1.5×IQR`,
      });
    }
    if (numericVals.length > 0 && new Set(numericVals).size === 1) {
      issues.push({
        column: col,
        type: "constant",
        count: numericVals.length,
        percentage: 100,
        description: "Constant value — no variation",
      });
    }
  }

  return {
    rowCount: rows.length,
    columnCount: colNames.length,
    columns,
    correlationMatrix: correlationMatrixResult,
    pca: {
      components: pca,
      totalVarianceExplained: pca.reduce((s, c) => s + c.varianceExplained, 0),
    },
    quality: {
      completeness: completeness * 100,
      missingCells,
      totalCells,
      issues,
    },
    groups: rows.map((r) => ({
      label: String(r.label || ""),
      value: typeof r.value === "number" ? r.value : 0,
      sd: typeof r.sd === "number" ? r.sd : undefined,
      n: typeof r.n === "number" ? r.n : undefined,
    })),
  };
}
