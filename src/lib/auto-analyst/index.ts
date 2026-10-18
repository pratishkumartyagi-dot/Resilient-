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
  return `| ${c.name} | ${c.count} | ${c.missing} | ${fmt(c.mean)} | ${fmt(c.sd)} | ${fmt(c.median)} | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.iqr)} |`;
}

function buildSummary(profile: DataProfile): string {
  const value = profile.columns.find((c) => c.name === "value");
  const lines: string[] = [];
  lines.push(`The dataset contains **${profile.rowCount}** group(s) / row(s) across **${profile.labelColumn.unique}** unique label(s).`);
  if (value) {
    lines.push(
      `Values range from **${fmt(value.min)}** to **${fmt(value.max)}** with a mean of **${fmt(value.mean)}** (SD ${fmt(value.sd)}), median ${fmt(value.median)}, and interquartile range ${fmt(value.iqr)}.`
    );
  }
  lines.push(`Data completeness is **${(profile.quality.completeness * 100).toFixed(1)}%**.`);
  return lines.join(" ");
}

function buildComparisons(profile: DataProfile): string {
  const groups = profile.labelColumn.groupStats;
  if (groups.length < 2) {
    return "Fewer than two groups are available, so no between-group comparison was performed.";
  }
  const sorted = [...groups].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const diff = top.value - bottom.value;
  const rel = bottom.value !== 0 ? (diff / Math.abs(bottom.value)) * 100 : NaN;

  const parts: string[] = [];
  parts.push(
    `The highest mean is **${top.label}** (${fmt(top.value)}${top.ci95 ? `, 95% CI ${fmt(top.ci95[0])}–${fmt(top.ci95[1])}` : ""}) and the lowest is **${bottom.label}** (${fmt(bottom.value)}${bottom.ci95 ? `, 95% CI ${fmt(bottom.ci95[0])}–${fmt(bottom.ci95[1])}` : ""}).`
  );
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

function buildReportBody(profile: DataProfile, title: string): string {
  const valueProfile = profile.columns.find((c) => c.name === "value");
  const outlierSection = valueProfile && valueProfile.outliers.length > 0
    ? `The value column has **${valueProfile.outliers.length}** potential outlier(s) beyond 1.5×IQR (${fmt(valueProfile.q1 - 1.5 * valueProfile.iqr)}–${fmt(valueProfile.q3 + 1.5 * valueProfile.iqr)}): ${valueProfile.outliers.map((v) => fmt(v)).join(", ")}.`
    : "No potential outliers were detected in the value column using the 1.5×IQR rule.";

  const findings: string[] = [];
  if (valueProfile) {
    findings.push(`Mean value across all groups is ${fmt(valueProfile.mean)} (SD ${fmt(valueProfile.sd)}).`);
    findings.push(`Median (${fmt(valueProfile.median)}) vs mean (${fmt(valueProfile.mean)}) ${Math.abs(valueProfile.mean - valueProfile.median) > valueProfile.sd * 0.25 ? "differ, suggesting a skewed distribution" : "are close, suggesting an approximately symmetric distribution"}.`);
  }
  if (profile.labelColumn.groupStats.length >= 2) {
    const sorted = [...profile.labelColumn.groupStats].sort((a, b) => b.value - a.value);
    findings.push(`The top group is "${sorted[0].label}" (${fmt(sorted[0].value)}); the lowest is "${sorted[sorted.length - 1].label}" (${fmt(sorted[sorted.length - 1].value)}).`);
  }
  if (profile.quality.issues.length === 0) {
    findings.push("No data-quality issues were detected.");
  }

  return [
    `# ${title}`,
    "",
    "## 1. Dataset Overview",
    "",
    buildSummary(profile),
    "",
    "## 2. Data Profiling & Quality",
    "",
    "| Column | n | Missing | Mean | SD | Median | Min | Max | IQR |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...profile.columns.map(statRow),
    "",
    profile.quality.issues.length > 0
      ? `**Data-quality flags:**\n${profile.quality.issues.map((i) => `- ${i}`).join("\n")}`
      : "**Data-quality flags:** none.",
    "",
    "## 3. Distribution & Outliers",
    "",
    outlierSection,
    "",
    "## 4. Group Comparisons",
    "",
    buildComparisons(profile),
    "",
    "## 5. Key Findings",
    "",
    findings.map((f) => `- ${f}`).join("\n"),
    "",
    "## 6. Limitations & Recommendations",
    "",
    `- These are descriptive statistics from summary inputs; formal inference requires the raw observations.`,
    `- ${profile.labelColumn.groupStats.some((g) => !g.ci95) ? "Provide SD and n for every group to enable 95% confidence intervals." : "Confidence intervals are based on the normal approximation (1.96×SE)."}`,
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

Write a concise, rigorous analytical narrative (3–5 paragraphs) interpreting the profile: what the data show, the strength of evidence, distributional notes, the group comparison, and what analyses should follow. Do not invent numbers beyond those given. Use markdown, no code fences, and do not repeat the tables.`;
    const narrative = (await options.aiFn(prompt)).replace(/```/g, "").trim();
    if (narrative) {
      return `${base}\n## 7. Analytical Narrative\n\n${narrative}\n`;
    }
  } catch {
    // Fall back to the deterministic report when the AI is unavailable.
  }
  return base;
}
