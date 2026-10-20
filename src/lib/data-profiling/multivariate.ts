// Multivariate analysis (fg-data-profiling "Multivariate analysis" feature).
//
// Pearson and Spearman correlations between numeric columns, missing-value
// patterns and missingness correlations, and duplicate row detection.

import type {
  CorrelationPair,
  DuplicateRowGroup,
  MissingnessCorrelation,
  MissingPattern,
  MissingValueAnalysis,
  ProfileRow,
} from "./types";
import { isMissing } from "./utils";
import {
  correlationPValue,
  pearsonR,
  phiCoefficient,
  spearmanR,
} from "./utils";

export function correlationMatrix(
  data: ProfileRow[],
  colNames: string[]
): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < colNames.length; i++) {
    for (let j = i + 1; j < colNames.length; j++) {
      const v1 = colNames[i];
      const v2 = colNames[j];
      const x: number[] = [];
      const y: number[] = [];
      for (const row of data) {
        const a = row[v1];
        const b = row[v2];
        const na = typeof a === "number" && Number.isFinite(a) ? a : Number(a);
        const nb = typeof b === "number" && Number.isFinite(b) ? b : Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb) && !isMissing(a) && !isMissing(b)) {
          x.push(na);
          y.push(nb);
        }
      }
      if (x.length < 3) continue;

      const r = pearsonR(x, y);
      if (!Number.isFinite(r)) continue;
      const spearman = spearmanR(x, y);
      const pValue = correlationPValue(r, x.length);

      const absR = Math.abs(r);
      let strength: CorrelationPair["strength"] = "none";
      if (absR >= 0.7) strength = "strong";
      else if (absR >= 0.4) strength = "moderate";
      else if (absR >= 0.2) strength = "weak";

      pairs.push({
        var1: v1,
        var2: v2,
        r,
        pValue,
        significant: pValue < 0.05,
        strength,
        spearman: Number.isFinite(spearman) ? spearman : r,
        n: x.length,
      });
    }
  }
  return pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/** Phi correlation between the missingness indicators of two columns. */
export function missingnessCorrelations(
  data: ProfileRow[],
  colNames: string[]
): MissingnessCorrelation[] {
  const out: MissingnessCorrelation[] = [];
  for (let i = 0; i < colNames.length; i++) {
    for (let j = i + 1; j < colNames.length; j++) {
      const v1 = colNames[i];
      const v2 = colNames[j];
      const a = data.map((row) => isMissing(row[v1]));
      const b = data.map((row) => isMissing(row[v2]));
      const r = phiCoefficient(a, b);
      if (!Number.isFinite(r)) continue;
      out.push({ var1: v1, var2: v2, r, n: data.length });
    }
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
}

export function findMissingPatterns(
  data: ProfileRow[],
  colNames: string[]
): MissingPattern[] {
  const counts = new Map<string, { columns: string[]; count: number }>();
  for (const row of data) {
    const missing = colNames.filter((c) => isMissing(row[c]));
    const key = missing.join("|");
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { columns: missing, count: 1 });
  }
  return Array.from(counts.values())
    .map((entry) => ({
      columns: entry.columns,
      count: entry.count,
      pct: data.length ? (entry.count / data.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function rowSignature(row: ProfileRow, colNames: string[]): string {
  return colNames
    .map((c) => {
      const value = row[c];
      if (isMissing(value)) return "";
      if (typeof value === "number") return String(Math.round(value * 1e6) / 1e6);
      return String(value).trim().toLowerCase();
    })
    .join("");
}

export function findDuplicateRows(
  data: ProfileRow[],
  colNames: string[]
): { groups: DuplicateRowGroup[]; duplicateCount: number } {
  const counts = new Map<string, { count: number; example: ProfileRow }>();
  for (const row of data) {
    const signature = rowSignature(row, colNames);
    if (!signature.replace(//g, "")) continue;
    const existing = counts.get(signature);
    if (existing) existing.count++;
    else counts.set(signature, { count: 1, example: row });
  }
  const groups: DuplicateRowGroup[] = [];
  let duplicateCount = 0;
  for (const [hash, entry] of counts) {
    if (entry.count <= 1) continue;
    duplicateCount += entry.count - 1;
    const example: Record<string, string | number | null> = {};
    for (const col of colNames) {
      const value = entry.example[col];
      example[col] = isMissing(value) ? null : (value as string | number);
    }
    groups.push({ hash, count: entry.count, example });
  }
  return {
    groups: groups.sort((a, b) => b.count - a.count),
    duplicateCount,
  };
}

export function analyseMissingValues(
  data: ProfileRow[],
  colNames: string[]
): MissingValueAnalysis {
  const totalCells = data.length * colNames.length;
  let missingCells = 0;
  const perColumn: MissingValueAnalysis["perColumn"] = [];

  for (const col of colNames) {
    const missing = data.filter((row) => isMissing(row[col])).length;
    missingCells += missing;
    perColumn.push({
      column: col,
      missing,
      missingPct: data.length ? (missing / data.length) * 100 : 0,
    });
  }

  return {
    totalCells,
    missingCells,
    completeness: totalCells ? ((totalCells - missingCells) / totalCells) * 100 : 100,
    perColumn: perColumn.sort((a, b) => b.missingPct - a.missingPct),
    patterns: findMissingPatterns(data, colNames),
    correlations: missingnessCorrelations(data, colNames),
  };
}
