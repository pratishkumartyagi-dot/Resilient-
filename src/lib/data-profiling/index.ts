// fg-data-profiling style profiler.
//
// Feature set mirrors https://github.com/data-centric-ai-community/fg-data-profiling
// (formerly ydata-profiling / pandas-profiling):
//
//   - Type inference ................ type-inference.ts
//   - Univariate analysis ........... univariate.ts
//   - Multivariate analysis ........ multivariate.ts
//   - Alerts / warnings ............. alerts.ts
//   - Time-series diagnostics ....... timeseries.ts
//   - Text analysis ................ text.ts
//   - Compare datasets .............. compare.ts
//   - HTML / JSON report ............ html-report.ts
//
// The report is organised as Overview → Variables → Interactions →
// Missing values → Duplicate rows → Time series → Text → Alerts →
// Reproduction, matching the structure of the original report.

import type {
  CategoricalProfile,
  CorrelationPair,
  DataProfile,
  DataQualityIssue,
  DateProfile,
  DuplicateRowGroup,
  HistogramBin,
  NumericProfile,
  PCAComponent,
  ProfileAlert,
  ProfileRow,
  TextProfile,
  TimeSeriesProfile,
} from "./types";
import {
  buildHistogram,
  profileCategoricalColumn,
  profileDateColumn,
  profileNumericColumn,
} from "./univariate";
import { inferColumnTypes, inferColumnType } from "./type-inference";
import {
  analyseMissingValues,
  correlationMatrix,
  findDuplicateRows,
} from "./multivariate";
import { buildAlerts } from "./alerts";
import { detectTimeSeries } from "./timeseries";
import { profileTextColumn } from "./text";
import { pcaAnalysis } from "./pca";
import { isMissing } from "./utils";

export * from "./types";
export { buildAlerts, ALERT_LABELS } from "./alerts";
export { buildHistogram } from "./univariate";
export { inferColumnType, inferColumnTypes, looksLikeDate } from "./type-inference";
export { compareProfiles, summariseDataset } from "./compare";
export { profileTextColumn } from "./text";
export { autocorrelation, partialAutocorrelation, profileTimeSeries } from "./timeseries";
export { correlationMatrix, analyseMissingValues, findDuplicateRows } from "./multivariate";
export { buildHtmlReport } from "./html-report";
export { profileToJson } from "./json-report";

export interface ProfileOptions {
  /** Name shown in the report and used for the reproduction section. */
  name?: string;
  /** Maximum number of correlation pairs to keep. */
  maxCorrelations?: number;
  /** Number of histogram bins per numeric column. */
  histogramBins?: number;
  /** Skip the (more expensive) time-series detection. */
  skipTimeSeries?: boolean;
}

const ENGINE_NAME = "fg-data-profiling (TypeScript port)";
const ENGINE_VERSION = "1.0.0";

function estimateFootprint(rows: ProfileRow[], colNames: string[]): string {
  let cells = 0;
  for (const row of rows) {
    for (const col of colNames) {
      const value = row[col];
      if (value === null || value === undefined) continue;
      cells += typeof value === "number" ? 8 : String(value).length * 2;
    }
  }
  if (cells < 1024) return `${cells} B`;
  if (cells < 1024 * 1024) return `${(cells / 1024).toFixed(1)} KB`;
  return `${(cells / (1024 * 1024)).toFixed(2)} MB`;
}

export function profileDataset(
  rows: ProfileRow[],
  options: ProfileOptions = {}
): DataProfile {
  const startedAt = Date.now();
  const name = options.name || "dataset";
  const colNames = rows.length > 0 ? Object.keys(rows[0]) : [];
  const maxCorrelations = options.maxCorrelations ?? 200;
  const histogramBins = options.histogramBins ?? 20;

  if (rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      correlationMatrix: [],
      pca: { components: [], totalVarianceExplained: 0 },
      quality: {
        completeness: 0,
        missingCells: 0,
        totalCells: 0,
        issues: [
          {
            column: "all",
            type: "missing",
            count: 0,
            percentage: 0,
            description: "No data rows were parsed.",
          },
        ],
      },
      groups: [],
      name,
      types: [],
      numericProfiles: [],
      categoricalProfiles: [],
      dateProfiles: [],
      textProfiles: [],
      histograms: {},
      alerts: [],
      missingAnalysis: {
        totalCells: 0,
        missingCells: 0,
        completeness: 0,
        perColumn: [],
        patterns: [],
        correlations: [],
      },
      duplicates: [],
      duplicateCount: 0,
      timeSeries: [],
      summary: {
        name,
        rowCount: 0,
        columnCount: 0,
        memoryFootprint: "0 B",
        completeness: 0,
        duplicates: 0,
        typeCounts: {},
      },
      reproduction: {
        generatedAt: new Date().toISOString(),
        engine: ENGINE_NAME,
        engineVersion: ENGINE_VERSION,
        durationMs: Date.now() - startedAt,
        rowCount: 0,
        columnCount: 0,
        configuration: {},
      },
    };
  }

  // ---- Type inference ---------------------------------------------------
  const types = inferColumnTypes(rows, colNames);
  const typeByName = new Map(types.map((t) => [t.name, t]));

  // ---- Univariate --------------------------------------------------------
  const numericProfiles: NumericProfile[] = [];
  const categoricalProfiles: CategoricalProfile[] = [];
  const dateProfiles: DateProfile[] = [];
  const textProfiles: TextProfile[] = [];
  const histograms: Record<string, HistogramBin[]> = {};

  for (const col of colNames) {
    const type = typeByName.get(col)?.type;
    const values = rows.map((row) => row[col]);
    const present = values.filter((v) => !isMissing(v));

    if (type === "Date") {
      dateProfiles.push(profileDateColumn(col, values));
      continue;
    }

    if (type === "Numeric" || type === "Integer" || type === "ID") {
      const numeric = present
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((v) => Number.isFinite(v));
      const raw: Array<number | undefined> = values.map((v) => {
        if (isMissing(v)) return undefined;
        const parsed = typeof v === "number" ? v : Number(v);
        return Number.isFinite(parsed) ? parsed : undefined;
      });
      const profile = profileNumericColumn(col, raw);
      numericProfiles.push(profile);
      histograms[col] = buildHistogram(numeric, histogramBins);
      continue;
    }

    if (type === "Text") {
      textProfiles.push(profileTextColumn(col, values));
      continue;
    }

    // Categorical, Boolean, URL, Email, Constant, Empty and mixed columns
    // are all summarised as frequency tables.
    categoricalProfiles.push(profileCategoricalColumn(col, values));
  }

  // ---- Multivariate ------------------------------------------------------
  // Identifier columns are excluded from correlations and PCA — a row counter
  // is not a measured variable.
  const numericColumnNames = numericProfiles
    .filter((c) => typeByName.get(c.name)?.type !== "ID")
    .map((c) => c.name);
  const correlations: CorrelationPair[] = correlationMatrix(rows, numericColumnNames).slice(
    0,
    maxCorrelations
  );
  const pca: PCAComponent[] = pcaAnalysis(rows, numericColumnNames);
  const missingAnalysis = analyseMissingValues(rows, colNames);
  const { groups: duplicateGroups, duplicateCount } = findDuplicateRows(rows, colNames);

  // ---- Time series -------------------------------------------------------
  let timeSeries: TimeSeriesProfile[] = [];
  if (!options.skipTimeSeries) {
    const dateColumns = dateProfiles.map((c) => c.name);
    // Identifier columns are excluded — a row counter is not a measurement.
    const timeSeriesValues = numericProfiles
      .filter((c) => typeByName.get(c.name)?.type !== "ID")
      .map((c) => c.name);
    timeSeries = detectTimeSeries(rows, dateColumns, timeSeriesValues);
  }

  // ---- Quality issues ----------------------------------------------------
  const issues: DataQualityIssue[] = [];
  for (const col of colNames) {
    const values = rows.map((r) => r[col]);
    const missing = values.filter((v) => isMissing(v)).length;
    const nonNumeric = values.filter(
      (v) => !isMissing(v) && typeof v !== "number"
    ).length;
    const numericVals = values.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );
    const distinctNumeric = new Set(numericVals).size;

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
    if (numericVals.length > 0 && distinctNumeric === 1) {
      issues.push({
        column: col,
        type: "constant",
        count: numericVals.length,
        percentage: 100,
        description: "Constant value — no variation",
      });
    }
  }
  if (duplicateCount > 0) {
    issues.push({
      column: "(dataset)",
      type: "duplicate",
      count: duplicateCount,
      percentage: (duplicateCount / rows.length) * 100,
      description: `${duplicateCount} duplicated row(s) across ${duplicateGroups.length} pattern(s)`,
    });
  }

  // ---- Alerts ------------------------------------------------------------
  const alerts: ProfileAlert[] = buildAlerts({
    rows,
    columnNames: colNames,
    types,
    numericProfiles,
    categoricalProfiles,
    correlations,
    missingAnalysis,
    duplicateGroups,
    duplicateCount,
  });

  const typeCounts: Record<string, number> = {};
  for (const column of types) {
    typeCounts[column.type] = (typeCounts[column.type] || 0) + 1;
  }

  const memoryFootprint = estimateFootprint(rows, colNames);
  const durationMs = Date.now() - startedAt;

  return {
    rowCount: rows.length,
    columnCount: colNames.length,
    // Backwards-compatible fields used by the auto-analyst report.
    columns: numericProfiles,
    correlationMatrix: correlations,
    pca: {
      components: pca,
      totalVarianceExplained: pca.reduce((s, c) => s + c.varianceExplained, 0),
    },
    quality: {
      completeness: missingAnalysis.completeness,
      missingCells: missingAnalysis.missingCells,
      totalCells: missingAnalysis.totalCells,
      issues,
    },
    groups: rows.map((r) => ({
      label: String(r.label || ""),
      value: typeof r.value === "number" ? r.value : 0,
      sd: typeof r.sd === "number" ? r.sd : undefined,
      n: typeof r.n === "number" ? r.n : undefined,
    })),

    name,
    types,
    numericProfiles,
    categoricalProfiles,
    dateProfiles,
    textProfiles,
    histograms,
    alerts,
    missingAnalysis,
    duplicates: duplicateGroups,
    duplicateCount,
    timeSeries,
    summary: {
      name,
      rowCount: rows.length,
      columnCount: colNames.length,
      memoryFootprint,
      completeness: missingAnalysis.completeness,
      duplicates: duplicateCount,
      typeCounts,
    },
    reproduction: {
      generatedAt: new Date().toISOString(),
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      durationMs,
      rowCount: rows.length,
      columnCount: colNames.length,
      configuration: {
        title: name,
        memoryFootprint,
        maxCorrelations: String(maxCorrelations),
        histogramBins: String(histogramBins),
        timeSeries: options.skipTimeSeries ? "disabled" : "enabled",
      },
    },
  };
}

export type { DuplicateRowGroup, TextProfile, DateProfile, CategoricalProfile };
