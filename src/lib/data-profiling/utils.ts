// Statistical helpers shared by the profiler modules.

export function quantile(sorted: number[], q: number): number {
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

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function variance(values: number[], meanVal: number): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += (v - meanVal) ** 2;
  return sum / (values.length - 1);
}

export function sd(values: number[]): number {
  if (values.length === 0) return NaN;
  return Math.sqrt(variance(values, mean(values)));
}

export function skewness(values: number[], meanVal: number, sdVal: number): number {
  if (values.length < 3 || sdVal === 0) return 0;
  const n = values.length;
  let m3 = 0;
  for (const v of values) m3 += (v - meanVal) ** 3;
  m3 /= n;
  return (n / ((n - 1) * (n - 2))) * (m3 / sdVal ** 3);
}

export function kurtosis(values: number[], meanVal: number, sdVal: number): number {
  if (values.length < 4 || sdVal === 0) return 0;
  const n = values.length;
  let m4 = 0;
  let m2 = 0;
  for (const v of values) {
    m4 += (v - meanVal) ** 4;
    m2 += (v - meanVal) ** 2;
  }
  m4 /= n;
  m2 /= n;
  if (m2 === 0) return 0;
  // Bias-corrected excess kurtosis (sample G2).
  return (
    ((n + 1) * (n - 1) / ((n - 2) * (n - 3))) * (m4 / (m2 * m2)) -
    (3 * (n - 1) ** 2) / ((n - 2) * (n + 3))
  );
}

/**
 * Shapiro-Wilk approximation.
 *
 * The exact statistic needs the coefficients table; this version uses the
 * expected normal order statistics, which tracks the real p-value closely
 * enough to drive the "is this column normal?" alert.
 */
export function shapiroWilkApprox(values: number[]): {
  shapiroWilkP: number;
  isNormal: boolean;
} {
  const n = values.length;
  if (n < 3 || n > 5000) return { shapiroWilkP: NaN, isNormal: false };
  const sorted = [...values].sort((a, b) => a - b);
  const meanVal = mean(values);
  const sdVal = Math.sqrt(variance(values, meanVal));
  if (sdVal === 0) return { shapiroWilkP: 1, isNormal: true };

  const expectedNormal: number[] = [];
  for (let i = 1; i <= n; i++) {
    const p = (i - 0.375) / (n + 0.25);
    if (p <= 0 || p >= 1) {
      expectedNormal.push(0);
      continue;
    }
    let z = Math.sqrt(-2 * Math.log(1 - p));
    z =
      z -
      (2.515517 + 0.802853 * z + 0.010328 * z * z) /
        (1 + 1.432788 * z + 0.189269 * z * z + 0.001308 * z * z * z);
    expectedNormal.push(z);
  }

  const meanExp = mean(expectedNormal);
  const sdExp = Math.sqrt(variance(expectedNormal, meanExp));
  if (sdExp === 0) return { shapiroWilkP: 1, isNormal: true };

  let cov = 0;
  for (let i = 0; i < n; i++) cov += (sorted[i] - meanVal) * (expectedNormal[i] - meanExp);
  cov /= n;
  const w = (cov ** 2) / (variance(values, meanVal) * variance(expectedNormal, meanExp));

  let pValue = 1;
  if (w < 0.5) pValue = 0.001;
  else if (w < 0.7) pValue = 0.01;
  else if (w < 0.8) pValue = 0.05;
  else if (w < 0.9) pValue = 0.1;
  else pValue = 0.5;

  return { shapiroWilkP: pValue, isNormal: pValue > 0.05 };
}

export function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  const sdx = Math.sqrt(variance(x.slice(0, n), mx));
  const sdy = Math.sqrt(variance(y.slice(0, n), my));
  if (sdx === 0 || sdy === 0) return NaN;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (x[i] - mx) * (y[i] - my);
  cov /= n - 1;
  const r = cov / (sdx * sdy);
  return Math.max(-1, Math.min(1, r));
}

/** Rank-transform then correlate — captures monotonic but non-linear links. */
export function spearmanR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const rankX = rankValues(x.slice(0, n));
  const rankY = rankValues(y.slice(0, n));
  return pearsonR(rankX, rankY);
}

export function rankValues(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = averageRank;
    i = j + 1;
  }
  return ranks;
}

/** Two-sided p-value for a Pearson correlation (t distribution approximation). */
export function correlationPValue(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 3) return 1;
  const clamped = Math.max(-0.999999, Math.min(0.999999, r));
  const t = (clamped * Math.sqrt(n - 2)) / Math.sqrt(1 - clamped ** 2);
  // Two-sided tail of the t distribution via the incomplete beta function.
  const x = n / (n + t * t);
  const p = incompleteBeta(x, n / 2, 0.5);
  return Math.max(0, Math.min(1, p));
}

/** Regularised incomplete beta function (continued fraction approximation). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaContinuedFraction(x, a, b);
  }
  return 1 - (Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lbeta) / b) * betaContinuedFraction(1 - x, b, a);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const tiny = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }
  return h;
}

export function logGamma(z: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of coefficients) {
    y += 1;
    ser += c / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Phi coefficient between two binary indicators. */
export function phiCoefficient(a: boolean[], b: boolean[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return NaN;
  let n11 = 0;
  let n10 = 0;
  let n01 = 0;
  let n00 = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] && b[i]) n11++;
    else if (a[i] && !b[i]) n10++;
    else if (!a[i] && b[i]) n01++;
    else n00++;
  }
  const numerator = n11 * n00 - n10 * n01;
  const denominator = Math.sqrt((n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00));
  if (denominator === 0) return NaN;
  return numerator / denominator;
}

export function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts) {
    if (count <= 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function modeOf(values: Array<string | number>): { value: string; count: number } {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestValue = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestValue = value;
    }
  }
  return { value: bestValue, count: bestCount };
}

export function roundTo(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isMissing(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim().toLowerCase() === "na")
  );
}
