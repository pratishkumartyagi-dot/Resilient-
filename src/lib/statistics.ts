import * as ss from "simple-statistics";

/**
 * Statistics service backed by simple-statistics (https://github.com/simple-statistics/simple-statistics).
 * Provides descriptive statistics, inference tests, regression, correlation, and
 * weighted meta-analysis helpers used across the statistical analysis pipeline
 * and report generator.
 */

export interface DescriptiveStats {
  n: number;
  sum: number;
  mean: number;
  median: number;
  mode: number | null;
  variance: number;
  standardDeviation: number;
  sampleVariance: number;
  sampleStandardDeviation: number;
  min: number;
  max: number;
  range: number;
  iqr: number;
  coefficientOfVariation: number;
  skewness: number;
  kurtosis: number;
  geometricMean: number | null;
  harmonicMean: number | null;
  mad: number | null;
}

export interface RegressionResult {
  equation: string;
  slope: number;
  intercept: number;
  rSquared: number;
  r: number;
  line: (x: number) => number;
  predicted: number[];
  residuals: number[];
}

export interface CorrelationResult {
  pearson: number;
  spearman: number | null;
  pValuePearson: number | null;
}

export interface TTestResult {
  t: number;
  df: number;
  pValue: number;
  significant: boolean;
  meanDifference: number;
  cohenD: number | null;
}

export interface WilcoxonResult {
  statistic: number;
  pValue: number | null;
  significant: boolean;
}

export interface MetaAnalysisInput {
  effect: number;
  variance: number;
  weight?: number;
}

export interface WeightedMetaResult {
  weightedMean: number;
  weightedVariance: number;
  weightedStandardDeviation: number;
  se: number;
  ciLower: number;
  ciUpper: number;
  k: number;
}

function fmt(n: number, decimals = 3): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : "—";
}

// ---------- t-distribution two-tailed p-value (Numerical Recipes incomplete beta) ----------

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

function betainc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  }
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

function gammaln(x: number): number {
  const tmp = (x - 0.5) * Math.log(x + 4.5) - (x + 4.5);
  const ser =
    1 +
    76.18009173 / (x + 0) -
    86.50532033 / (x + 1) +
    24.01409822 / (x + 2) -
    1.231739516 / (x + 3) +
    0.120858003e-2 / (x + 4) -
    0.536382e-5 / (x + 5);
  return tmp + Math.log(ser * Math.sqrt(2 * Math.PI));
}

function studentTTwoTailP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  const x = df / (df + t * t);
  const p = betainc(df / 2, 0.5, x);
  return Math.min(1, p);
}

export function descriptiveStatistics(values: number[]): DescriptiveStats {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) {
    return {
      n: 0, sum: 0, mean: 0, median: 0, mode: null,
      variance: 0, standardDeviation: 0, sampleVariance: 0, sampleStandardDeviation: 0,
      min: 0, max: 0, range: 0, iqr: 0, coefficientOfVariation: 0,
      skewness: 0, kurtosis: 0, geometricMean: null, harmonicMean: null, mad: null,
    };
  }
  const mean = ss.mean(xs);
  const median = ss.median(xs);
  const mode = ss.mode(xs);
  const variance = ss.variance(xs);
  const sd = ss.standardDeviation(xs);
  const sampleVariance = ss.sampleVariance(xs);
  const sampleSD = ss.sampleStandardDeviation(xs);
  const min = ss.min(xs);
  const max = ss.max(xs);
  const range = max - min;
  const iqr = ss.interquartileRange(xs);
  const cv = mean === 0 ? 0 : (sd / Math.abs(mean)) * 100;
  const geom = ss.geometricMean(xs);
  const harm = ss.harmonicMean(xs);
  const mad = ss.medianAbsoluteDeviation(xs);

  return {
    n, sum: ss.sum(xs), mean, median,
    mode: mode === undefined ? null : (Array.isArray(mode) ? mode[0] : mode),
    variance, standardDeviation: sd, sampleVariance, sampleStandardDeviation: sampleSD,
    min, max, range, iqr, coefficientOfVariation: cv,
    skewness: ss.sampleSkewness(xs), kurtosis: ss.sampleKurtosis(xs),
    geometricMean: geom === -Infinity || !Number.isFinite(geom) ? null : geom,
    harmonicMean: harm === -Infinity || !Number.isFinite(harm) ? null : harm,
    mad: mad === -Infinity || !Number.isFinite(mad) ? null : mad,
  };
}

export function linearRegression(x: number[], y: number[]): RegressionResult | null {
  const pairs = x.map((xi, i) => [xi, y[i]] as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pairs.length < 2) return null;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const result = ss.linearRegression(pairs as unknown as readonly number[][]);
  const m = result.m;
  const b = result.b;
  const line = ss.linearRegressionLine(result);
  const predicted = xs.map((xi) => line(xi));
  const residuals = ys.map((yi, i) => yi - predicted[i]);
  const r2 = ss.rSquared(pairs as unknown as readonly number[][], line);
  const r = Math.sqrt(Math.max(0, r2)) * (m >= 0 ? 1 : -1);
  return {
    equation: `y = ${fmt(m)}x + ${fmt(b)}`,
    slope: m,
    intercept: b,
    rSquared: r2,
    r,
    line,
    predicted,
    residuals,
  };
}

export function correlation(x: number[], y: number[]): CorrelationResult {
  const pairs = x.map((xi, i) => [xi, y[i]] as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const pearson = xs.length >= 2 ? ss.sampleCorrelation(xs, ys) : 0;
  const spearman = xs.length >= 3 ? ss.sampleRankCorrelation(xs, ys) : null;
  return { pearson, spearman, pValuePearson: null };
}

export function tTestOneSample(sample: number[], mu = 0): TTestResult | null {
  const xs = sample.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return null;
  const t = ss.tTest(xs, mu);
  const n = xs.length;
  const df = n - 1;
  const mean = ss.mean(xs);
  const sd = ss.sampleStandardDeviation(xs);
  const meanDifference = mean - mu;
  const cohenD = sd === 0 ? null : meanDifference / sd;
  const pValue = studentTTwoTailP(t, df);
  return { t, df, pValue, significant: pValue < 0.05, meanDifference, cohenD };
}

export function tTestTwoSample(sampleA: number[], sampleB: number[]): TTestResult | null {
  const a = sampleA.filter((v) => Number.isFinite(v));
  const b = sampleB.filter((v) => Number.isFinite(v));
  if (a.length < 2 || b.length < 2) return null;
  const t = ss.tTestTwoSample(a, b);
  if (t === null) return null;
  const n1 = a.length;
  const n2 = b.length;
  const df = n1 + n2 - 2;
  const meanA = ss.mean(a);
  const meanB = ss.mean(b);
  const meanDifference = meanA - meanB;
  const pooledSd = Math.sqrt(((n1 - 1) * ss.sampleVariance(a) + (n2 - 1) * ss.sampleVariance(b)) / df);
  const cohenD = pooledSd === 0 ? null : meanDifference / pooledSd;
  const pValue = studentTTwoTailP(t, df);
  return { t, df, pValue, significant: pValue < 0.05, meanDifference, cohenD };
}

export function wilcoxonRankSum(sampleA: number[], sampleB: number[]): WilcoxonResult | null {
  const a = sampleA.filter((v) => Number.isFinite(v));
  const b = sampleB.filter((v) => Number.isFinite(v));
  if (a.length === 0 || b.length === 0) return null;
  let statistic: number;
  try {
    statistic = ss.wilcoxonRankSum(a, b);
  } catch {
    return null;
  }
  // Normal approximation for p-value (Mann-Whitney U equivalent)
  const n1 = a.length;
  const n2 = b.length;
  const total = n1 + n2;
  const meanRankSum = (n1 * (total + 1)) / 2;
  const varianceRankSum = (n1 * n2 * (total + 1)) / 12;
  const z = varianceRankSum === 0 ? 0 : (statistic - meanRankSum) / Math.sqrt(varianceRankSum);
  const pValue = 1 - ss.erf(Math.abs(z) / Math.SQRT2);
  return { statistic, pValue, significant: pValue < 0.05 };
}

export function weightedMetaAnalysis(inputs: MetaAnalysisInput[]): WeightedMetaResult | null {
  const valid = inputs.filter((i) => Number.isFinite(i.effect) && Number.isFinite(i.variance) && i.variance > 0);
  if (valid.length === 0) return null;
  const xs = valid.map((i) => i.effect);
  const ws = valid.map((i) => i.weight ?? 1 / i.variance);
  const weightedMean = ss.weightedMean(xs, ws);
  const weightedVariance = ss.weightedVariance(xs, ws);
  const weightedSD = ss.weightedStandardDeviation(xs, ws);
  const sumW = ws.reduce((a, b) => a + b, 0);
  const se = sumW > 0 ? Math.sqrt(1 / sumW) : 0;
  const z = 1.96;
  return {
    weightedMean,
    weightedVariance,
    weightedStandardDeviation: weightedSD,
    se,
    ciLower: weightedMean - z * se,
    ciUpper: weightedMean + z * se,
    k: valid.length,
  };
}

export { weightedMean, weightedVariance, weightedStandardDeviation, sampleCorrelation, sampleRankCorrelation, cumulativeStdNormalProbability } from "simple-statistics";

export function formatStat(n: number, decimals = 3): string {
  return fmt(n, decimals);
}

export function numericSort(values: number[]): number[] {
  return ss.numericSort([...values]);
}

const statisticsApi = {
  descriptiveStatistics,
  linearRegression,
  correlation,
  tTestOneSample,
  tTestTwoSample,
  wilcoxonRankSum,
  weightedMetaAnalysis,
  formatStat,
  numericSort,
};

export default statisticsApi;
