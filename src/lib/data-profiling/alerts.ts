// Alerts engine (fg-data-profiling "Warnings" / "Alerts" feature).
//
// Produces the automatic list of data-quality problems that the report leads
// with: missing values, constant columns, uniform and unique distributions,
// zero inflation, skewness, high correlation, class imbalance, outliers,
// non-normality, duplicates, infinite values, high cardinality and mixed types.

import type {
  AlertSeverity,
  CategoricalProfile,
  CorrelationPair,
  DuplicateRowGroup,
  MissingValueAnalysis,
  NumericProfile,
  ProfileAlert,
  ProfileRow,
} from "./types";
import { isMissing } from "./utils";

export interface AlertInputs {
  rows: ProfileRow[];
  columnNames: string[];
  types: Array<{ name: string; type: string; distinct: number; distinctPct: number }>;
  numericProfiles: NumericProfile[];
  categoricalProfiles: CategoricalProfile[];
  correlations: CorrelationPair[];
  missingAnalysis: MissingValueAnalysis;
  duplicateGroups: DuplicateRowGroup[];
  duplicateCount: number;
}

const MISSING_WARNING_PCT = 5;
const MISSING_ERROR_PCT = 50;
const HIGH_CORRELATION = 0.9;
const SKEWNESS_THRESHOLD = 1;
const ZERO_INFLATION_PCT = 50;
const OUTLIER_PCT = 1;
const IMBALANCE_RATIO = 10;
const HIGH_CARDINALITY = 0.9;

function severityForMissing(pct: number): AlertSeverity {
  if (pct >= MISSING_ERROR_PCT) return "error";
  if (pct >= MISSING_WARNING_PCT) return "warning";
  return "info";
}

export function buildAlerts(inputs: AlertInputs): ProfileAlert[] {
  const alerts: ProfileAlert[] = [];

  // ---- Column level ----------------------------------------------------
  for (const type of inputs.types) {
    if (type.type === "Empty") {
      alerts.push({
        type: "empty_column",
        column: type.name,
        severity: "error",
        title: `${type.name} is entirely empty`,
        description: "No row holds a value for this column — it can be dropped.",
        value: 0,
        threshold: 0,
      });
      continue;
    }
    if (type.type === "Constant") {
      alerts.push({
        type: "constant",
        column: type.name,
        severity: "warning",
        title: `${type.name} is constant`,
        description:
          "Every row holds the same value, so the column carries no information for modelling.",
        value: 1,
        threshold: 1,
      });
      continue;
    }
    if (type.type === "ID" || (type.distinctPct >= 0.99 && inputs.rows.length > 10)) {
      alerts.push({
        type: "unique",
        column: type.name,
        severity: "info",
        title: `${type.name} is unique per row`,
        description:
          "All values are distinct, which is typical for an identifier rather than a measured variable.",
        value: type.distinct,
        threshold: inputs.rows.length,
      });
    }
  }

  for (const column of inputs.numericProfiles) {
    if (column.count === 0) continue;

    if (column.zeroPct >= ZERO_INFLATION_PCT) {
      alerts.push({
        type: "zeros",
        column: column.name,
        severity: "warning",
        title: `${column.name} is ${column.zeroPct.toFixed(0)}% zeros`,
        description:
          "A majority of zeros usually indicates a structural or structural-zero problem worth investigating.",
        value: column.zeroPct,
        threshold: ZERO_INFLATION_PCT,
      });
    }
    if (Math.abs(column.skewness) > SKEWNESS_THRESHOLD) {
      alerts.push({
        type: "skewness",
        column: column.name,
        severity: "warning",
        title: `${column.name} is highly skewed`,
        description: `Skewness is ${column.skewness.toFixed(2)} — consider a transformation before parametric tests.`,
        value: column.skewness,
        threshold: SKEWNESS_THRESHOLD,
      });
    }
    if (column.outlierCount > 0) {
      const outlierPct = (column.outlierCount / column.count) * 100;
      if (outlierPct >= OUTLIER_PCT) {
        alerts.push({
          type: "outliers",
          column: column.name,
          severity: "warning",
          title: `${column.name} has ${column.outlierCount} outliers`,
          description: `${outlierPct.toFixed(1)}% of values fall outside 1.5×IQR (${column.q1 - 1.5 * column.iqr} to ${column.q3 + 1.5 * column.iqr}).`,
          value: column.outlierCount,
          threshold: Math.ceil((column.count * OUTLIER_PCT) / 100),
        });
      }
    }
    if (!column.normality.isNormal && Number.isFinite(column.normality.shapiroWilkP)) {
      alerts.push({
        type: "non_normal",
        column: column.name,
        severity: "info",
        title: `${column.name} deviates from normality`,
        description: `Shapiro-Wilk p = ${column.normality.shapiroWilkP.toFixed(3)} — a non-parametric test is safer.`,
        value: column.normality.shapiroWilkP,
        threshold: 0.05,
      });
    }
  }

  for (const column of inputs.categoricalProfiles) {
    if (column.count === 0) continue;
    if (column.isImbalanced) {
      alerts.push({
        type: "imbalance",
        column: column.name,
        severity: "warning",
        title: `${column.name} is imbalanced`,
        description: `The most frequent category ("${column.mode}") occurs ${column.imbalanceRatio.toFixed(1)}× more often than the rarest one.`,
        value: column.imbalanceRatio,
        threshold: IMBALANCE_RATIO,
      });
    }
    if (column.distinct > 2 && column.distinct / Math.max(1, column.count) >= HIGH_CARDINALITY) {
      alerts.push({
        type: "high_cardinality",
        column: column.name,
        severity: "info",
        title: `${column.name} is high cardinality`,
        description: `${column.distinct} distinct values across ${column.count} rows — most values occur once.`,
        value: column.distinct,
        threshold: HIGH_CARDINALITY,
      });
    }
  }

  // Missing values — reported for every column, whatever its inferred type.
  const rowCount = inputs.rows.length;
  for (const column of inputs.columnNames) {
    const missing = inputs.rows.filter((row) => isMissing(row[column])).length;
    if (missing === 0) continue;
    const missingPct = rowCount ? (missing / rowCount) * 100 : 0;
    alerts.push({
      type: "missing",
      column,
      severity: severityForMissing(missingPct),
      title: `${column} has ${missing} missing value${missing === 1 ? "" : "s"}`,
      description: `${missingPct.toFixed(1)}% of the rows have no value for this column.`,
      value: missingPct,
      threshold: MISSING_WARNING_PCT,
    });
  }

  // Mixed types inside a column
  for (const column of inputs.columnNames) {
    const values = inputs.rows.map((row) => row[column]).filter((v) => !isMissing(v));
    if (values.length < 4) continue;
    const numeric = values.filter(
      (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    ).length;
    if (numeric > 0 && numeric < values.length) {
      alerts.push({
        type: "mixed_type",
        column,
        severity: "warning",
        title: `${column} mixes numbers and text`,
        description: `${values.length - numeric} of ${values.length} values are not numeric — clean the column before analysis.`,
        value: values.length - numeric,
        threshold: 0,
      });
    }
  }

  // ---- Dataset level ----------------------------------------------------
  for (const pair of inputs.correlations) {
    if (Math.abs(pair.r) >= HIGH_CORRELATION) {
      alerts.push({
        type: "high_correlation",
        column: pair.var1,
        columns: [pair.var1, pair.var2],
        severity: "warning",
        title: `${pair.var1} is highly correlated with ${pair.var2}`,
        description: `Pearson r = ${pair.r.toFixed(3)} (Spearman ρ = ${pair.spearman.toFixed(3)}), n = ${pair.n}.`,
        value: pair.r,
        threshold: HIGH_CORRELATION,
      });
    }
  }

  if (inputs.duplicateCount > 0) {
    alerts.push({
      type: "duplicates",
      severity: "warning",
      title: `${inputs.duplicateCount} duplicate row(s)`,
      description: `${inputs.duplicateGroups.length} distinct row pattern(s) occur more than once.`,
      value: inputs.duplicateCount,
      threshold: 0,
    });
  }

  for (const pattern of inputs.missingAnalysis.patterns) {
    if (pattern.columns.length >= 2 && pattern.pct >= 10) {
      alerts.push({
        type: "missing",
        column: pattern.columns.join(", "),
        columns: pattern.columns,
        severity: "warning",
        title: `${pattern.columns.length} columns are missing together in ${pattern.pct.toFixed(1)}% of rows`,
        description:
          "These columns share a missingness pattern, which usually means the gap is structural rather than random.",
        value: pattern.pct,
        threshold: 10,
      });
    }
  }

  const order: Record<AlertSeverity, number> = { error: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const ALERT_LABELS: Record<string, string> = {
  empty_column: "Empty column",
  missing: "Missing values",
  constant: "Constant",
  unique: "Unique",
  uniform: "Uniform",
  zeros: "Zeros",
  skewness: "Skewness",
  high_correlation: "High correlation",
  imbalance: "Imbalance",
  outliers: "Outliers",
  non_normal: "Non-normal",
  duplicates: "Duplicates",
  infinite: "Infinite",
  high_cardinality: "High cardinality",
  mixed_type: "Mixed type",
  date_range: "Date range",
};
