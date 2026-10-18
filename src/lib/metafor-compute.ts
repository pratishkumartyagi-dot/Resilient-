import { descriptiveStatistics, weightedMean } from "./statistics";

export interface EffectSizeRow {
  study: string;
  effect: number;
  ciLower: number;
  ciUpper: number;
  weight: number;
  variance: number;
}

export interface MetaforResult {
  model: "Fixed" | "Random";
  k: number;
  pooledEstimate: number;
  se: number;
  ciLower: number;
  ciUpper: number;
  Q: number;
  Qp: number;
  I2: number;
  tau2: number;
  predictionLower: number;
  predictionUpper: number;
  weights: number[];
  rows: EffectSizeRow[];
  forestData: ForestRow[];
  descriptiveStats: DescriptiveStats | null;
}

export interface ForestRow {
  study: string;
  effect: number;
  ciLower: number;
  ciUpper: number;
  weight: number;
  weightPercent: number;
  isPooled?: boolean;
}

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  variance: number;
  standardDeviation: number;
  min: number;
  max: number;
  range: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseEffectSizeRow(study: string, effectStr: string, ciStr: string, weightStr: string): EffectSizeRow | null {
  const effect = parseNumber(effectStr);
  if (effect === null) return null;

  let ciLower: number | null = null;
  let ciUpper: number | null = null;

  if (ciStr.trim()) {
    const m = ciStr.match(/(-?[0-9]+(?:\.[0-9]+)?)\s*[-–to(, ]+\s*(-?[0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      ciLower = parseFloat(m[1]);
      ciUpper = parseFloat(m[2]);
    }
  }

  if (ciLower === null || ciUpper === null || !Number.isFinite(ciLower) || !Number.isFinite(ciUpper)) {
    const seMatch = ciStr.match(/se\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (seMatch && effect !== null) {
      const se = parseFloat(seMatch[1]);
      ciLower = effect - 1.96 * se;
      ciUpper = effect + 1.96 * se;
    } else {
      ciLower = effect;
      ciUpper = effect;
    }
  }

  if (ciLower === ciUpper && effectStr.trim() === ciStr.trim()) {
    ciLower = effect;
    ciUpper = effect;
  }

  const se = (ciUpper - ciLower) / (2 * 1.96);
  const variance = Math.max(se * se, 1e-8);
  const weight = parseNumber(weightStr) || 0;

  return { study, effect, ciLower, ciUpper, weight, variance };
}

export function fixedEffectsMetaAnalysis(rows: EffectSizeRow[]): MetaforResult | null {
  const valid = rows.filter((r) => Number.isFinite(r.effect) && Number.isFinite(r.variance) && r.variance > 0);
  if (valid.length === 0) return null;

  const k = valid.length;
  const wStar = valid.map((r) => 1 / r.variance);
  const sumWStar = wStar.reduce((a, b) => a + b, 0);
  const effects = valid.map((r) => r.effect);
  const pooledEstimate = weightedMean(effects, wStar);
  const se = Math.sqrt(1 / sumWStar);
  const z = 1.96;
  const ciLower = pooledEstimate - z * se;
  const ciUpper = pooledEstimate + z * se;

  const Q = valid.reduce((acc, r, i) => acc + wStar[i] * Math.pow(r.effect - pooledEstimate, 2), 0);
  const df = k - 1;
  const Qp = chiSquaredPValue(Q, df);
  const I2 = Q > df ? Math.max(0, ((Q - df) / Q) * 100) : 0;

  return {
    model: "Fixed",
    k,
    pooledEstimate,
    se,
    ciLower,
    ciUpper,
    Q,
    Qp,
    I2,
    tau2: 0,
    predictionLower: ciLower,
    predictionUpper: ciUpper,
    weights: wStar,
    rows: valid,
    forestData: buildForestData(valid, pooledEstimate, ciLower, ciUpper, se, wStar, "Fixed", k),
    descriptiveStats: buildDescriptiveStats(valid),
  };
}

export function randomEffectsMetaAnalysis(rows: EffectSizeRow[]): MetaforResult | null {
  const valid = rows.filter((r) => Number.isFinite(r.effect) && Number.isFinite(r.variance) && r.variance > 0);
  if (valid.length === 0) return null;

  const k = valid.length;
  const wStar = valid.map((r) => 1 / r.variance);
  const sumWStar = wStar.reduce((a, b) => a + b, 0);
  const wy = valid.reduce((acc, r, i) => acc + wStar[i] * r.effect, 0);
  const muFixed = wy / sumWStar;
  const Q = valid.reduce((acc, r, i) => acc + wStar[i] * Math.pow(r.effect - muFixed, 2), 0);
  const df = k - 1;
  const Qp = chiSquaredPValue(Q, df);
  const I2 = Q > df ? Math.max(0, ((Q - df) / Q) * 100) : 0;

  let tau2 = 0;
  if (Q > df) {
    const c = sumWStar - wStar.reduce((acc, w) => acc + w * w, 0) / sumWStar;
    tau2 = Math.max(0, (Q - df) / c);
  }

  const wRandom = valid.map((r) => 1 / (r.variance + tau2));
  const sumWRandom = wRandom.reduce((a, b) => a + b, 0);
  const effects = valid.map((r) => r.effect);
  const pooledEstimate = weightedMean(effects, wRandom);
  const se = Math.sqrt(1 / sumWRandom);
  const z = 1.96;
  const ciLower = pooledEstimate - z * se;
  const ciUpper = pooledEstimate + z * se;

  const predictionSe = Math.sqrt(se * se + tau2);
  const predictionLower = pooledEstimate - 1.96 * predictionSe;
  const predictionUpper = pooledEstimate + 1.96 * predictionSe;

  return {
    model: "Random",
    k,
    pooledEstimate,
    se,
    ciLower,
    ciUpper,
    Q,
    Qp,
    I2,
    tau2,
    predictionLower,
    predictionUpper,
    weights: wRandom,
    rows: valid,
    forestData: buildForestData(valid, pooledEstimate, ciLower, ciUpper, se, wRandom, "Random", k),
    descriptiveStats: buildDescriptiveStats(valid),
  };
}

function buildDescriptiveStats(rows: EffectSizeRow[]): DescriptiveStats {
  const stats = descriptiveStatistics(rows.map((r) => r.effect));
  return {
    n: stats.n,
    mean: stats.mean,
    median: stats.median,
    variance: stats.variance,
    standardDeviation: stats.standardDeviation,
    min: stats.min,
    max: stats.max,
    range: stats.range,
    iqr: stats.iqr,
    skewness: stats.skewness,
    kurtosis: stats.kurtosis,
  };
}

function buildForestData(
  rows: EffectSizeRow[],
  pooled: number,
  ciLower: number,
  ciUpper: number,
  se: number,
  weights: number[],
  model: "Fixed" | "Random",
  k: number
): ForestRow[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  return [
    ...rows.map((r, i) => ({
      study: r.study,
      effect: r.effect,
      ciLower: r.ciLower,
      ciUpper: r.ciUpper,
      weight: r.weight || (sumW > 0 ? (weights[i] / sumW) * 100 : 100 / k),
      weightPercent: sumW > 0 ? (weights[i] / sumW) * 100 : 100 / k,
    })),
    {
      study: `Pooled (${model})`,
      effect: pooled,
      ciLower,
      ciUpper,
      weight: 100,
      weightPercent: 100,
      isPooled: true,
    },
  ];
}

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const FPMIN = 1e-300;
  const EPS = 1e-14;

  if (x < a + 1) {
    // Series representation for P(a, x).
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }

  // Continued-fraction representation for Q(a, x), then P = 1 - Q.
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  return 1 - q;
}

function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 1;
  // Survival function of the chi-square distribution: P(X > x) = Q(df/2, x/2).
  return 1 - regularizedGammaP(df / 2, x / 2);
}
