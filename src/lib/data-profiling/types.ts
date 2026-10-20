// Shared types for the fg-data-profiling style profiler.
//
// The profiler covers the same feature set as
// https://github.com/data-centric-ai-community/fg-data-profiling (formerly
// ydata-profiling / pandas-profiling): type inference, an alerts engine,
// univariate and multivariate analysis, time-series diagnostics, text
// analysis, dataset comparison and Overview / Alerts / Reproduction report
// sections.

export interface ProfileRow {
  [column: string]: string | number | null | undefined;
}

export type ColumnType =
  | "Numeric"
  | "Integer"
  | "Categorical"
  | "Boolean"
  | "Date"
  | "Text"
  | "URL"
  | "Email"
  | "ID"
  | "Constant"
  | "Empty";

export interface ColumnTypeProfile {
  name: string;
  type: ColumnType;
  /** Share of non-missing values that agree with the inferred type (0-1). */
  confidence: number;
  distinct: number;
  distinctPct: number;
  reason: string;
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
  /** fg-data-profiling additions */
  mode: number;
  modeCount: number;
  range: number;
  sum: number;
  p05: number;
  p95: number;
  mad: number;
  zeroCount: number;
  zeroPct: number;
  monotone: "increasing" | "decreasing" | "constant" | "none";
}

export interface CategoricalProfile {
  name: string;
  count: number;
  missing: number;
  missingPct: number;
  distinct: number;
  mode: string;
  modeCount: number;
  modePct: number;
  topCategories: Array<{ value: string; count: number; pct: number }>;
  /** Ratio between the most and least frequent category. */
  imbalanceRatio: number;
  isImbalanced: boolean;
  /** Shannon entropy in bits (0 = single category, log2(k) = uniform). */
  entropy: number;
}

export interface DateProfile {
  name: string;
  count: number;
  missing: number;
  missingPct: number;
  min: string;
  max: string;
  rangeDays: number;
  distinct: number;
  /** Counts per calendar period, ordered chronologically. */
  histogram: Array<{ period: string; count: number }>;
  granularity: "day" | "week" | "month" | "quarter" | "year" | "irregular";
}

export interface TextProfile {
  name: string;
  charCount: number;
  wordCount: number;
  avgWordLength: number;
  uppercasePct: number;
  lowercasePct: number;
  digitPct: number;
  whitespacePct: number;
  punctuationPct: number;
  nonAsciiPct: number;
  /** Unicode script blocks detected (Latin, Cyrillic, Greek, …). */
  scripts: Array<{ script: string; count: number; pct: number }>;
  /** ASCII vs non-ASCII block split. */
  blocks: Array<{ block: string; count: number; pct: number }>;
  topWords: Array<{ word: string; count: number }>;
}

export interface HistogramBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

export interface CorrelationPair {
  var1: string;
  var2: string;
  r: number;
  pValue: number;
  significant: boolean;
  strength: "none" | "weak" | "moderate" | "strong";
  /** Spearman rank correlation (monotonic relationships). */
  spearman: number;
  n: number;
}

export interface PCAComponent {
  component: number;
  eigenvalue: number;
  varianceExplained: number;
  cumulativeVariance: number;
  loadings: Record<string, number>;
}

export type DataQualityIssueType =
  | "missing"
  | "outlier"
  | "nonNumeric"
  | "constant"
  | "duplicate"
  | "infinite"
  | "imbalance"
  | "highCardinality"
  | "mixedType";

export interface DataQualityIssue {
  column: string;
  type: DataQualityIssueType;
  count: number;
  percentage: number;
  description: string;
}

export type AlertType =
  | "empty_column"
  | "missing"
  | "constant"
  | "unique"
  | "uniform"
  | "zeros"
  | "skewness"
  | "high_correlation"
  | "imbalance"
  | "outliers"
  | "non_normal"
  | "duplicates"
  | "infinite"
  | "high_cardinality"
  | "mixed_type"
  | "date_range";

export type AlertSeverity = "info" | "warning" | "error";

export interface ProfileAlert {
  type: AlertType;
  column?: string;
  columns?: string[];
  severity: AlertSeverity;
  title: string;
  description: string;
  value?: number;
  threshold?: number;
}

export interface MissingPattern {
  columns: string[];
  count: number;
  pct: number;
}

export interface MissingnessCorrelation {
  var1: string;
  var2: string;
  /** Phi coefficient of the two missingness indicators (-1 to 1). */
  r: number;
  n: number;
}

export interface DuplicateRowGroup {
  hash: string;
  count: number;
  example: Record<string, string | number | null>;
}

export interface MissingValueAnalysis {
  totalCells: number;
  missingCells: number;
  completeness: number;
  perColumn: Array<{ column: string; missing: number; missingPct: number }>;
  patterns: MissingPattern[];
  correlations: MissingnessCorrelation[];
}

export interface TimeSeriesProfile {
  dateColumn: string;
  valueColumn: string;
  n: number;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";
  trend: {
    slope: number;
    intercept: number;
    r2: number;
    direction: "increasing" | "decreasing" | "flat";
  };
  acf: Array<{ lag: number; acf: number }>;
  pacf: Array<{ lag: number; pacf: number }>;
  seasonality: { period: number | null; strength: number };
  series: Array<{ date: string; value: number }>;
}

export interface DatasetSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  memoryFootprint: string;
  completeness: number;
  duplicates: number;
  typeCounts: Record<string, number>;
}

export interface ColumnComparison {
  name: string;
  leftType: ColumnType;
  rightType: ColumnType;
  leftDistinct: number;
  rightDistinct: number;
  leftMissingPct: number;
  rightMissingPct: number;
  status: "only_left" | "only_right" | "changed" | "same";
}

export interface DatasetComparison {
  left: DatasetSummary;
  right: DatasetSummary;
  columnComparisons: ColumnComparison[];
  sharedColumns: number;
  onlyLeft: string[];
  onlyRight: string[];
  changedColumns: string[];
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

  // ---- fg-data-profiling extensions -------------------------------------
  name: string;
  /** Column type inference results, in column order. */
  types: ColumnTypeProfile[];
  /** Numeric column profiles, in column order. */
  numericProfiles: NumericProfile[];
  categoricalProfiles: CategoricalProfile[];
  dateProfiles: DateProfile[];
  textProfiles: TextProfile[];
  histograms: Record<string, HistogramBin[]>;
  alerts: ProfileAlert[];
  missingAnalysis: MissingValueAnalysis;
  duplicates: DuplicateRowGroup[];
  duplicateCount: number;
  timeSeries: TimeSeriesProfile[];
  summary: DatasetSummary;
  /** Reproduction metadata for the report. */
  reproduction: {
    generatedAt: string;
    engine: string;
    engineVersion: string;
    durationMs: number;
    rowCount: number;
    columnCount: number;
    configuration: Record<string, string>;
  };
}
