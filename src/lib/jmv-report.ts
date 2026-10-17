import type { MetaforResult } from "./metafor-compute";

/**
 * jmvReport-inspired APA 7th edition statistical reporting
 * (https://github.com/bartuyurdacan/jmvReport).
 *
 * Converts computed statistics into publication-ready APA narrative prose and
 * tables that can be pasted directly into a manuscript.
 */

export interface ApaTable {
  number: number;
  caption: string;
  headers: string[];
  rows: string[][];
  note?: string;
}

export interface ApaReportSection {
  heading: string;
  paragraphs: string[];
  tables: ApaTable[];
}

export interface ApaReport {
  title: string;
  sections: ApaReportSection[];
  references: string[];
}

export interface ApaMetaOptions {
  reviewType: string;
  effectMeasure?: string;
  model?: "Fixed" | "Random";
  studies?: { study: string; authors?: string; year?: number }[];
}

export function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< .001";
  return `= ${p.toFixed(3).replace(/^0\./, ".").replace(/^-0\./, "-.")}`;
}

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

export function formatSigned(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(decimals)}`;
}

function heterogeneityDescriptor(i2: number): string {
  if (i2 < 25) return "low";
  if (i2 < 50) return "moderate";
  if (i2 < 75) return "substantial";
  return "considerable";
}

export function apaTableToMarkdown(table: ApaTable): string {
  const lines = [
    `**Table ${table.number}**`,
    "",
    `*${table.caption}*`,
    "",
    `| ${table.headers.join(" | ")} |`,
    `| ${table.headers.map(() => "---").join(" | ")} |`,
    ...table.rows.map((r) => `| ${r.join(" | ")} |`),
  ];
  if (table.note) {
    lines.push("", `*Note.* ${table.note}`);
  }
  return lines.join("\n");
}

export function buildApaMetaAnalysisReport(result: MetaforResult, opts: ApaMetaOptions): ApaReport {
  const measure = opts.effectMeasure || "effect size";
  const modelLabel = result.model === "Random" ? "random-effects" : "fixed-effects";
  const pooled = formatSigned(result.pooledEstimate, 2);
  const ci = `${formatSigned(result.ciLower, 2)}, ${formatSigned(result.ciUpper, 2)}`;
  const df = result.k - 1;

  const narrative = [
    `A ${modelLabel} meta-analysis was conducted to estimate the pooled ${measure} across ${result.k} studies. The pooled ${measure} was ${pooled}, 95% CI [${ci}].`,
    `Heterogeneity across studies was ${heterogeneityDescriptor(result.I2)}, Q(${df}) = ${formatNumber(result.Q, 2)}, p ${formatPValue(result.Qp)}, I² = ${formatNumber(result.I2, 1)}%, τ² = ${formatNumber(result.tau2, 3)}.`,
    result.model === "Random"
      ? `The 95% prediction interval for the effect in a new study was [${formatSigned(result.predictionLower, 2)}, ${formatSigned(result.predictionUpper, 2)}].`
      : "",
  ].filter(Boolean);

  const interpretation =
    result.ciLower > 0 || result.ciUpper < 0
      ? `Because the 95% confidence interval did not include zero, the pooled ${measure} was statistically distinguishable from no effect.`
      : `Because the 95% confidence interval included zero, the pooled ${measure} was not statistically distinguishable from no effect.`;

  const studyRows = result.rows.map((r) => [
    r.study,
    formatSigned(r.effect, 2),
    `[${formatSigned(r.ciLower, 2)}, ${formatSigned(r.ciUpper, 2)}]`,
    formatNumber(r.weight, 1),
  ]);

  const table: ApaTable = {
    number: 1,
    caption: `Summary of ${modelLabel} meta-analysis of ${measure} across ${result.k} studies`,
    headers: ["Study", "Effect", "95% CI", "Weight (%)"],
    rows: [
      ...studyRows,
      [
        "Pooled estimate",
        formatSigned(result.pooledEstimate, 2),
        `[${formatSigned(result.ciLower, 2)}, ${formatSigned(result.ciUpper, 2)}]`,
        "100.0",
      ],
    ],
    note: `SE = ${formatNumber(result.se, 3)}; Q(${df}) = ${formatNumber(result.Q, 2)}; p ${formatPValue(result.Qp)}; I² = ${formatNumber(result.I2, 1)}%; τ² = ${formatNumber(result.tau2, 3)}.`,
  };

  return {
    title: `APA Statistical Report — ${opts.reviewType}`,
    sections: [
      {
        heading: "Meta-Analysis",
        paragraphs: [...narrative, interpretation],
        tables: [table],
      },
    ],
    references: [
      "Borenstein, M., Hedges, L. V., Higgins, J. P. T., & Rothstein, H. R. (2009). Introduction to meta-analysis. Wiley.",
      "Higgins, J. P. T., Thompson, S. G., Deeks, J. J., & Altman, D. G. (2003). Measuring inconsistency in meta-analyses. BMJ, 327(7414), 557–560.",
      "Page, M. J., et al. (2021). The PRISMA 2020 statement. BMJ, 372, n71.",
    ],
  };
}

export interface ApaTTestOptions {
  labels: [string, string];
  design?: "independent" | "paired";
}

export function apaTTestReport(
  result: { t: number; df: number; pValue: number; meanDifference: number; cohenD?: number | null },
  opts: ApaTTestOptions
): ApaReportSection {
  const design = opts.design === "paired" ? "A paired-samples t test" : "An independent-samples t test";
  const sig = result.pValue < 0.05;
  const paragraph = `${design} was conducted to compare ${opts.labels[0]} and ${opts.labels[1]}. ${sig ? "There was a statistically significant difference" : "There was no statistically significant difference"} between the two conditions, t(${result.df}) = ${formatNumber(result.t, 2)}, p ${formatPValue(result.pValue)}, mean difference = ${formatSigned(result.meanDifference, 2)}${result.cohenD !== undefined && result.cohenD !== null ? `, Cohen's d = ${formatNumber(result.cohenD, 2)}` : ""}.`;
  return { heading: "t Test", paragraphs: [paragraph], tables: [] };
}

export function apaCorrelationReport(
  result: { pearson: number; spearman?: number | null },
  labels: [string, string]
): ApaReportSection {
  const strength = Math.abs(result.pearson);
  const descriptor = strength < 0.1 ? "negligible" : strength < 0.3 ? "small" : strength < 0.5 ? "moderate" : strength < 0.7 ? "large" : "very large";
  const paragraph = `The relationship between ${labels[0]} and ${labels[1]} was ${descriptor}, r = ${formatNumber(result.pearson, 2)}${result.spearman !== undefined && result.spearman !== null ? `, Spearman ρ = ${formatNumber(result.spearman, 2)}` : ""}.`;
  return { heading: "Correlation", paragraphs: [paragraph], tables: [] };
}

export function apaRegressionReport(
  result: { equation: string; slope: number; intercept: number; rSquared: number },
  labels: [string, string]
): ApaReportSection {
  const paragraph = `A simple linear regression was conducted with ${labels[0]} as the predictor and ${labels[1]} as the outcome. The regression equation was ${result.equation}, R² = ${formatNumber(result.rSquared, 3)}, indicating that ${formatNumber(result.rSquared * 100, 1)}% of the variance in ${labels[1]} was explained by ${labels[0]}.`;
  return { heading: "Linear Regression", paragraphs: [paragraph], tables: [] };
}

export function renderApaReportMarkdown(report: ApaReport): string {
  const parts: string[] = [`## ${report.title}`, ""];
  for (const section of report.sections) {
    parts.push(`### ${section.heading}`, "");
    for (const p of section.paragraphs) {
      parts.push(p, "");
    }
    for (const table of section.tables) {
      parts.push(apaTableToMarkdown(table), "");
    }
  }
  if (report.references.length > 0) {
    parts.push("### References", "");
    report.references.forEach((r, i) => parts.push(`${i + 1}. ${r}`));
    parts.push("");
  }
  parts.push(
    "*Statistical reporting formatted following APA 7th edition conventions, in the style of jmvReport (bartuyurdacan/jmvReport).*"
  );
  return parts.join("\n");
}
