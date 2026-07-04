import { type Paper } from "./database-apis";

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
    const m = ciStr.match(/([0-9]+(?:\.[0-9]+)?)\s*[-–to(, ]+\s*([0-9]+(?:\.[0-9]+)?)/);
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

  const variance = Math.max((ciUpper - ciLower) / (2 * 1.96), 1e-8);
  const weight = parseNumber(weightStr) || 0;

  return { study, effect, ciLower, ciUpper, weight, variance };
}

export function fixedEffectsMetaAnalysis(rows: EffectSizeRow[]): MetaforResult | null {
  const valid = rows.filter((r) => Number.isFinite(r.effect) && Number.isFinite(r.variance) && r.variance > 0);
  if (valid.length === 0) return null;

  const k = valid.length;
  const wStar = valid.map((r) => 1 / r.variance);
  const sumWStar = wStar.reduce((a, b) => a + b, 0);
  const wy = valid.reduce((acc, r, i) => acc + wStar[i] * r.effect, 0);
  const pooledEstimate = wy / sumWStar;
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
  const pooledEstimate = valid.reduce((acc, r, i) => acc + wRandom[i] * r.effect, 0) / sumWRandom;
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

function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 1;
  if (df % 2 === 0) {
    let sum = 0;
    for (let i = df / 2; i > 0; i--) {
      sum += Math.pow(x, i - 1) / factorial(i - 1);
    }
    return Math.exp(-x / 2) * sum;
  }
  return Math.exp(-x / 2) * (1 / Math.sqrt(Math.PI * x)) * modifiedBesselI(df / 2 - 0.5, x / 2);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function modifiedBesselI(v: number, x: number): number {
  const sum = (() => {
    let s = 0;
    for (let k = 0; k < 20; k++) {
      const term = Math.pow(x / 2, 2 * k + 2 * v) / (factorial(k) * factorial(k + v));
      s += term;
    }
    return s;
  })();
  return Math.pow(x / 2, v) * sum;
}
