// Principal component analysis over the numeric columns.

import type { PCAComponent, ProfileRow } from "./types";
import { mean, variance } from "./utils";

export function pcaAnalysis(data: ProfileRow[], colNames: string[]): PCAComponent[] {
  const numericCols = colNames.filter((c) =>
    data.some((r) => typeof r[c] === "number" && Number.isFinite(r[c] as number))
  );

  if (numericCols.length < 2 || data.length < 3) return [];

  const colStats: { mean: number; sd: number }[] = [];
  for (const col of numericCols) {
    const vals = data
      .map((r) => r[col])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const m = mean(vals);
    const sd = Math.sqrt(variance(vals, m));
    colStats.push({ mean: m, sd: sd === 0 ? 1 : sd });
  }

  const standardized: number[][] = [];
  for (const row of data) {
    const rowVals: number[] = [];
    for (let i = 0; i < numericCols.length; i++) {
      const v = row[numericCols[i]];
      const val =
        typeof v === "number" && Number.isFinite(v) ? v : colStats[i].mean;
      rowVals.push((val - colStats[i].mean) / colStats[i].sd);
    }
    standardized.push(rowVals);
  }

  const nCols = numericCols.length;
  const covMatrix: number[][] = Array.from({ length: nCols }, () => Array(nCols).fill(0));
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nCols; j++) {
      let sum = 0;
      for (const row of standardized) sum += row[i] * row[j];
      covMatrix[i][j] = sum / (standardized.length - 1);
    }
  }

  const components: PCAComponent[] = [];
  let remaining = covMatrix.map((row) => [...row]);

  for (let comp = 0; comp < nCols; comp++) {
    let v = Array.from({ length: nCols }, () => 1 / Math.sqrt(nCols));
    for (let iter = 0; iter < 100; iter++) {
      const newV = Array.from({ length: nCols }, (_, i) =>
        remaining[i].reduce((s, vj, j) => s + vj * v[j], 0)
      );
      const norm = Math.sqrt(newV.reduce((s, value) => s + value * value, 0));
      if (norm === 0) break;
      for (let j = 0; j < nCols; j++) v[j] = newV[j] / norm;
    }

    const eigenvalue = v.reduce(
      (s, v_i, i) =>
        s + v_i * remaining[i].reduce((sum, vj, j) => sum + vj * v[j], 0),
      0
    );

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

  let cumulative = 0;
  for (const comp of components) {
    cumulative += comp.varianceExplained;
    comp.cumulativeVariance = cumulative;
  }

  return components;
}
