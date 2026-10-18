// Automatic analytical report generation (concepts: FireBird-Technologies/Auto-Analyst
// and teng-lin/notebooklm-py) — turns a data profile into a notebook-style, editable
// narrative report with descriptive statistics, comparisons and recommendations.

import type { DataProfile, NumericProfile } from "@/lib/data-profiling";

export interface AutoReportOptions {
  title?: string;
  datasetName?: string;
  aiFn?: (prompt: string) => Promise<string>;
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return Number(n.toFixed(digits)).toLocaleString();
}

function statRow(c: NumericProfile): string {
  return `| ${c.name} | ${c.count} | ${c.missing} (${c.missingPct.toFixed(1)}%) | ${fmt(c.mean)} | ${fmt(c.sd)} | ${fmt(c.median)} | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.iqr)} | ${fmt(c.skewness, 2)} |`;
}

function buildSummary(profile: DataProfile): string {
  const value = profile.columns.find((c) => c.name === "value");
  const lines: string[] = [];
  lines.push(`The dataset contains **${profile.rowCount}** row(s) and **${profile.columnCount}** column(s).`);
  lines.push(`Data completeness is **${profile.quality.completeness.toFixed(1)}%** (${profile.quality.missingCells} of ${profile.quality.totalCells} cells missing).`);
  if (value) {
    lines.push(`Values range from **${fmt(value.min)}** to **${fmt(value.max)}** with a mean of **${fmt(value.mean)}** (SD ${fmt(value.sd)}), median ${fmt(value.median)}, and interquartile range ${fmt(value.iqr)}.`);
  }
  return lines.join(" ");
}

function buildDataQualitySection(profile: DataProfile): string {
  const lines: string[] = [];
  lines.push(`### Missing Data`);
  lines.push(`- Total missing cells: **${profile.quality.missingCells}** of **${profile.quality.totalCells}** (${(100 - profile.quality.completeness).toFixed(1)}% missing).`);
  if (profile.quality.issues.length > 0) {
    lines.push("");
    lines.push("**Issues detected:**");
    for (const issue of profile.quality.issues) {
      lines.push(`- **${issue.column}** — ${issue.description}`);
    }
  } else {
    lines.push("- No data quality issues detected.");
  }
  return lines.join("\n");
}

function buildCorrelationSection(profile: DataProfile): string {
  const { correlationMatrix } = profile;
  if (correlationMatrix.length === 0) {
    return "## Correlation Matrix\n\nInsufficient numeric data for correlation analysis.\n";
  }
  const lines: string[] = [];
  lines.push("## Correlation Matrix (Pearson)");
  lines.push("");
  lines.push("| Variable 1 | Variable 2 | r | p-value | Significant | Strength |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of correlationMatrix) {
    lines.push(`| ${c.var1} | ${c.var2} | ${fmt(c.r, 3)} | ${fmt(c.pValue, 3)} | ${c.significant ? "Yes" : "No"} | ${c.strength} |`);
  }
  const strong = correlationMatrix.filter((c) => c.strength === "strong");
  const moderate = correlationMatrix.filter((c) => c.strength === "moderate");
  if (strong.length > 0) {
    lines.push("");
    lines.push("**Strong correlations (|r| ≥ 0.7):**");
    for (const c of strong) {
      lines.push(`- ${c.var1} ↔ ${c.var2}: r = ${fmt(c.r, 3)}, p = ${fmt(c.pValue, 3)}`);
    }
  }
  if (moderate.length > 0) {
    lines.push("");
    lines.push("**Moderate correlations (0.4 ≤ |r| < 0.7):**");
    for (const c of moderate) {
      lines.push(`- ${c.var1} ↔ ${c.var2}: r = ${fmt(c.r, 3)}, p = ${fmt(c.pValue, 3)}`);
    }
  }
  return lines.join("\n");
}

function buildPCASection(profile: DataProfile): string {
  const { pca } = profile;
  if (pca.components.length === 0) {
    return "## Principal Component Analysis\n\nInsufficient numeric variables for PCA.\n";
  }
  const lines: string[] = [];
  lines.push("## Principal Component Analysis");
  lines.push("");
  lines.push("| Component | Eigenvalue | Variance Explained | Cumulative Variance |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of pca.components) {
    lines.push(`| PC${c.component} | ${fmt(c.eigenvalue, 3)} | ${(c.varianceExplained * 100).toFixed(1)}% | ${(c.cumulativeVariance * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push(`**Total variance explained by all components:** ${(pca.totalVarianceExplained * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("### Component Loadings");
  for (const comp of pca.components.slice(0, 3)) {
    lines.push(`#### PC${comp.component} (${(comp.varianceExplained * 100).toFixed(1)}% variance)`);
    const loadings = Object.entries(comp.loadings)
      .map(([varName, loading]) => `  - ${varName}: ${fmt(loading, 3)}`)
      .join("\n");
    lines.push(loadings);
    lines.push("");
  }
  return lines.join("\n");
}

function buildComparisons(profile: DataProfile): string {
  const groups = profile.groups || [];
  if (groups.length < 2) {
    return "## Group Comparisons\n\nFewer than two groups are available, so no between-group comparison was performed.\n";
  }
  const sorted = [...groups].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const diff = top.value - bottom.value;
  const rel = bottom.value !== 0 ? (diff / Math.abs(bottom.value)) * 100 : NaN;

  const parts: string[] = [];
  parts.push(`The highest mean is **${top.label}** (${fmt(top.value)}${top.ci95 ? `, 95% CI ${fmt(top.ci95[0])}–${fmt(top.ci95[1])}` : ""}) and the lowest is **${bottom.label}** (${fmt(bottom.value)}${bottom.ci95 ? `, 95% CI ${fmt(bottom.ci95[0])}–${fmt(bottom.ci95[1])}` : ""}).`);
  parts.push(`The absolute difference is **${fmt(diff)}**${Number.isFinite(rel) ? ` (${fmt(rel, 1)}% relative to the lowest group)` : ""}.`);

  if (top.ci95 && bottom.ci95) {
    const overlap = top.ci95[0] <= bottom.ci95[1] && bottom.ci95[0] <= top.ci95[1];
    parts.push(
      overlap
        ? "The 95% confidence intervals overlap, so the difference is not statistically distinguishable at the 5% level from these summary estimates alone."
        : "The 95% confidence intervals do not overlap, which is consistent with a statistically distinguishable difference; confirm with a formal hypothesis test."
    );
  } else {
    parts.push("Confidence intervals could not be computed (missing SD or n), so the comparison is descriptive only.");
  }
  return parts.join(" ");
}

function buildFindings(profile: DataProfile): string {
  const findings: string[] = [];
  const valueProfile = profile.columns.find((c) => c.name === "value");
  if (valueProfile) {
    findings.push(`Mean value across all groups is ${fmt(valueProfile.mean)} (SD ${fmt(valueProfile.sd)}).`);
    findings.push(`Median (${fmt(valueProfile.median)}) vs mean (${fmt(valueProfile.mean)}) ${Math.abs(valueProfile.mean - valueProfile.median) > valueProfile.sd * 0.25 ? "differ, suggesting a skewed distribution" : "are close, suggesting an approximately symmetric distribution"}.`);
    if (valueProfile.normality.isNormal) {
      findings.push(`The value distribution appears approximately normal (Shapiro-Wilk p = ${fmt(valueProfile.normality.shapiroWilkP, 3)}).`);
    } else {
      findings.push(`The value distribution deviates from normality (Shapiro-Wilk p = ${fmt(valueProfile.normality.shapiroWilkP, 3)}).`);
    }
  }
  if (profile.groups.length >= 2) {
    const sorted = [...profile.groups].sort((a, b) => b.value - a.value);
    findings.push(`The top group is "${sorted[0].label}" (${fmt(sorted[0].value)}); the lowest is "${sorted[sorted.length - 1].label}" (${fmt(sorted[sorted.length - 1].value)}).`);
  }
  if (profile.quality.issues.length === 0) {
    findings.push("No data-quality issues were detected.");
  }
  return findings.map((f) => `- ${f}`).join("\n");
}

function buildReportBody(profile: DataProfile, title: string): string {
  const valueProfile = profile.columns.find((c) => c.name === "value");
  const outlierSection = valueProfile && valueProfile.outlierCount > 0
    ? `The value column has **${valueProfile.outlierCount}** potential outlier(s) beyond 1.5×IQR (${fmt(valueProfile.q1 - 1.5 * valueProfile.iqr)}–${fmt(valueProfile.q3 + 1.5 * valueProfile.iqr)}): ${valueProfile.outliers.map((v) => fmt(v)).join(", ")}.`
    : "No potential outliers were detected in the value column using the 1.5×IQR rule.";

  return [
    `# ${title}`,
    "",
    "## 1. Dataset Overview",
    "",
    buildSummary(profile),
    "",
    "## 2. Data Profiling & Quality",
    "",
    "| Variable | n | Missing (%) | Mean | SD | Median | Min | Max | IQR | Skewness |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...profile.columns.map(statRow),
    "",
    buildDataQualitySection(profile),
    "",
    "## 3. Distribution & Outliers",
    "",
    outlierSection,
    "",
    "## 4. Correlation Matrix",
    "",
    buildCorrelationSection(profile),
    "",
    "## 5. Principal Component Analysis",
    "",
    buildPCASection(profile),
    "",
    "## 6. Group Comparisons",
    "",
    buildComparisons(profile),
    "",
    "## 7. Key Findings",
    "",
    buildFindings(profile),
    "",
    "## 8. Limitations & Recommendations",
    "",
    "- These are descriptive statistics from summary inputs; formal inference requires the raw observations.",
    "- Providing SD and n for every group enables 95% confidence intervals.",
    "- Confirm group differences with an appropriate hypothesis test (e.g., t-test, ANOVA, or a non-parametric equivalent) before drawing conclusions.",
    "",
  ].join("\n");
}

export function buildAutoAnalystReport(profile: DataProfile, options: AutoReportOptions = {}): string {
  const title = options.title || "Automated Statistical Report";
  return buildReportBody(profile, title);
}

export async function buildAutoAnalystReportAsync(
  profile: DataProfile,
  options: AutoReportOptions = {},
): Promise<string> {
  const title = options.title || "Automated Statistical Report";
  const base = buildReportBody(profile, title);
  if (!options.aiFn) return base;
  try {
    const prompt = `You are an expert biostatistician writing the "Analytical Narrative" for an automated statistical report.

DATA PROFILE:
${base}

Write a concise, scholarly narrative (3-5 paragraphs) interpreting the profile: background context, what the data show, strength of evidence, distributional notes, the group comparison, and what analyses should follow. Do not invent numbers beyond those given. Use markdown, no code fences, and do not repeat the tables.`;
    const narrative = (await options.aiFn(prompt)).replace(/```/g, "").trim();
    if (narrative) {
      return `${base}\n## 9. Analytical Narrative\n\n${narrative}\n`;
    }
  } catch {
    // Fall back to deterministic report when the AI is unavailable.
  }
  return base;
}
