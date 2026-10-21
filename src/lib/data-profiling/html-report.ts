// Self-contained HTML profiling report (fg-data-profiling "Flexible output
// formats" feature).
//
// The report mirrors the structure of the original: Overview, Variables,
// Interactions, Missing values, Duplicate rows, Time series, Text, Alerts and
// Reproduction. Everything is inlined so the file can be shared as-is.

import type { DataProfile, HistogramBin, ProfileAlert } from "./types";
import { ALERT_LABELS } from "./alerts";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toLocaleString();
}

function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function histogramHtml(bins: HistogramBin[]): string {
  if (bins.length === 0) return "";
  const max = Math.max(...bins.map((b) => b.count), 1);
  const rows = bins
    .map(
      (bin) => `<tr><td class="bin">${escapeHtml(bin.label)}</td>
<td class="barcell"><span class="bar" style="width:${(bin.count / max) * 100}%"></span></td>
<td class="num">${bin.count}</td></tr>`
    )
    .join("");
  return `<table class="hist">${rows}</table>`;
}

function alertRow(alert: ProfileAlert): string {
  const severityClass =
    alert.severity === "error" ? "sev-error" : alert.severity === "warning" ? "sev-warn" : "sev-info";
  return `<tr class="${severityClass}">
<td><span class="badge ${severityClass}">${escapeHtml(ALERT_LABELS[alert.type] || alert.type)}</span></td>
<td>${escapeHtml(alert.title)}</td>
<td>${escapeHtml(alert.description)}</td>
</tr>`;
}

export function buildHtmlReport(
  profile: DataProfile,
  options: { title?: string; subtitle?: string } = {}
): string {
  const title = options.title || `Profiling Report — ${profile.name}`;
  const subtitle = options.subtitle || profile.reproduction.generatedAt;

  const alertCounts = {
    error: profile.alerts.filter((a) => a.severity === "error").length,
    warning: profile.alerts.filter((a) => a.severity === "warning").length,
    info: profile.alerts.filter((a) => a.severity === "info").length,
  };

  const typeRows = profile.types
    .map(
      (t) => `<tr>
<td class="mono">${escapeHtml(t.name)}</td>
<td><span class="type type-${t.type.toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(t.type)}</span></td>
<td>${t.distinct}</td>
<td>${pct(t.distinctPct)}</td>
<td>${pct(t.confidence * 100, 0)}</td>
<td>${escapeHtml(t.reason)}</td>
</tr>`
    )
    .join("");

  const numericRows = profile.numericProfiles
    .map(
      (c) => `<tr>
<td class="mono">${escapeHtml(c.name)}</td>
<td>${c.count}</td>
<td>${c.missing} (${pct(c.missingPct)})</td>
<td>${fmt(c.mean)}</td>
<td>${fmt(c.sd)}</td>
<td>${fmt(c.median)}</td>
<td>${fmt(c.mode)}</td>
<td>${fmt(c.min)}</td>
<td>${fmt(c.max)}</td>
<td>${fmt(c.iqr)}</td>
<td>${fmt(c.skewness, 2)}</td>
<td>${fmt(c.kurtosis, 2)}</td>
<td>${c.outlierCount}</td>
<td>${c.normality.isNormal ? "yes" : "no"}</td>
</tr>`
    )
    .join("");

  const numericHistograms = Object.entries(profile.histograms)
    .map(
      ([name, bins]) =>
        `<h4 class="sub">${escapeHtml(name)}</h4>${histogramHtml(bins)}`
    )
    .join("");

  const categoricalRows = profile.categoricalProfiles
    .map((c) => {
      const top = c.topCategories
        .map(
          (t) =>
            `<li><span class="mono">${escapeHtml(t.value)}</span> — ${t.count} (${pct(t.pct)})</li>`
        )
        .join("");
      return `<tr>
<td class="mono">${escapeHtml(c.name)}</td>
<td>${c.distinct}</td>
<td>${escapeHtml(c.mode)} (${pct(c.modePct)})</td>
<td>${fmt(c.imbalanceRatio, 1)}×</td>
<td>${fmt(c.entropy, 2)}</td>
<td>${c.missing} (${pct(c.missingPct)})</td>
<td><ul class="cats">${top}</ul></td>
</tr>`;
    })
    .join("");

  const dateRows = profile.dateProfiles
    .map(
      (d) => `<tr>
<td class="mono">${escapeHtml(d.name)}</td>
<td>${d.min} → ${d.max}</td>
<td>${d.rangeDays} days</td>
<td>${d.granularity}</td>
<td>${d.distinct}</td>
<td>${d.missing} (${pct(d.missingPct)})</td>
</tr>`
    )
    .join("");

  const textRows = profile.textProfiles
    .map((t) => {
      const scripts = t.scripts
        .map((s) => `${escapeHtml(s.script)} (${pct(s.pct)})`)
        .join(", ");
      const words = t.topWords
        .slice(0, 6)
        .map((w) => `${escapeHtml(w.word)}: ${w.count}`)
        .join(", ");
      return `<tr>
<td class="mono">${escapeHtml(t.name)}</td>
<td>${t.charCount}</td>
<td>${t.wordCount}</td>
<td>${fmt(t.avgWordLength, 1)}</td>
<td>${pct(t.uppercasePct)} / ${pct(t.lowercasePct)}</td>
<td>${pct(t.nonAsciiPct)}</td>
<td>${escapeHtml(scripts || "—")}</td>
<td>${escapeHtml(words || "—")}</td>
</tr>`;
    })
    .join("");

  const correlationRows = profile.correlationMatrix
    .slice(0, 50)
    .map(
      (c) => `<tr>
<td class="mono">${escapeHtml(c.var1)}</td>
<td class="mono">${escapeHtml(c.var2)}</td>
<td>${fmt(c.r)}</td>
<td>${fmt(c.spearman)}</td>
<td>${fmt(c.pValue)}</td>
<td>${c.strength}</td>
</tr>`
    )
    .join("");

  const missingRows = profile.missingAnalysis.perColumn
    .filter((c) => c.missing > 0)
    .map(
      (c) => `<tr>
<td class="mono">${escapeHtml(c.column)}</td>
<td>${c.missing}</td>
<td>${pct(c.missingPct)}</td>
</tr>`
    )
    .join("");

  const patternRows = profile.missingAnalysis.patterns
    .slice(0, 15)
    .map(
      (p) => `<tr>
<td class="mono">${escapeHtml(p.columns.join(", ") || "(complete rows)")}</td>
<td>${p.count}</td>
<td>${pct(p.pct)}</td>
</tr>`
    )
    .join("");

  const duplicateRows = profile.duplicates
    .slice(0, 15)
    .map(
      (d) => `<tr>
<td>${d.count}</td>
<td class="mono small">${escapeHtml(
        Object.entries(d.example)
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v}`)
          .join(" | ")
      )}</td>
</tr>`
    )
    .join("");

  const timeSeriesSections = profile.timeSeries
    .map((ts) => {
      const acfRows = ts.acf
        .map((a) => `<li>lag ${a.lag}: ${fmt(a.acf)}</li>`)
        .join("");
      const pacfRows = ts.pacf
        .map((a) => `<li>lag ${a.lag}: ${fmt(a.pacf)}</li>`)
        .join("");
      return `<h4 class="sub">${escapeHtml(ts.valueColumn)} over ${escapeHtml(ts.dateColumn)}</h4>
<ul class="kv">
<li>Observations: ${ts.n}</li>
<li>Frequency: ${ts.frequency}</li>
<li>Trend: ${ts.trend.direction} (slope ${fmt(ts.trend.slope, 5)}, R² ${fmt(ts.trend.r2)})</li>
<li>Seasonality: ${ts.seasonality.period ? `lag ${ts.seasonality.period} (strength ${fmt(ts.seasonality.strength)})` : "not detected"}</li>
</ul>
<div class="cols"><div><h5>ACF</h5><ul class="small">${acfRows}</ul></div><div><h5>PACF</h5><ul class="small">${pacfRows}</ul></div></div>`;
    })
    .join("");

  const alertsHtml =
    profile.alerts.length > 0
      ? `<table class="alerts">${profile.alerts.map(alertRow).join("")}</table>`
      : `<p class="ok">No alerts were raised for this dataset.</p>`;

  const pcaRows = profile.pca.components
    .slice(0, 10)
    .map(
      (c) => `<tr>
<td>PC${c.component}</td>
<td>${fmt(c.eigenvalue)}</td>
<td>${pct(c.varianceExplained * 100)}</td>
<td>${pct(c.cumulativeVariance * 100)}</td>
</tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#0d1b3e; --panel:#122347; --line:#1e3a5f; --text:#e2e8f0; --muted:#93b4e0; --accent:#facc15; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; line-height:1.5; }
  .wrap { max-width:1180px; margin:0 auto; padding:32px 24px 64px; }
  h1 { font-size:26px; margin:0 0 4px; }
  h2 { font-size:19px; margin:32px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); color:var(--accent); }
  h3, h4.sub { font-size:15px; margin:18px 0 8px; color:#bfdbfe; }
  h5 { font-size:13px; margin:8px 0 4px; color:var(--muted); }
  p.sub { color:var(--muted); font-size:13px; margin:0 0 20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .card .k { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  .card .v { font-size:22px; font-weight:700; margin-top:4px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th,td { padding:6px 9px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:#16305c; color:#bfdbfe; font-weight:600; white-space:nowrap; }
  tr:last-child td { border-bottom:none; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .small { font-size:11px; }
  .type { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11px; background:#1e3a5f; color:#bfdbfe; }
  .type-numeric,.type-integer { background:#14532d; color:#bbf7d0; }
  .type-date { background:#4c1d95; color:#ddd6fe; }
  .type-text { background:#7c2d12; color:#fed7aa; }
  .type-constant,.type-empty { background:#7f1d1d; color:#fecaca; }
  .badge { display:inline-block; padding:1px 7px; border-radius:4px; font-size:11px; font-weight:600; }
  .sev-error { background:#7f1d1d; color:#fecaca; }
  .sev-warn { background:#78350f; color:#fde68a; }
  .sev-info { background:#1e3a5f; color:#bfdbfe; }
  tr.sev-error td { background:#2a1113; }
  tr.sev-warn td { background:#241a0d; }
  table.hist { background:transparent; border:none; margin-bottom:14px; }
  table.hist td { border:none; padding:1px 4px; }
  td.bin { width:170px; color:var(--muted); font-size:11px; }
  td.barcell { width:70%; }
  td.num { width:60px; text-align:right; }
  .bar { display:inline-block; height:9px; background:linear-gradient(90deg,#38bdf8,#facc15); border-radius:3px; min-width:2px; }
  ul.cats { margin:0; padding-left:14px; font-size:11px; }
  ul.kv { list-style:none; margin:0; padding:0; font-size:12.5px; }
  ul.kv li { padding:1px 0; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .ok { color:#86efac; }
  footer { margin-top:40px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:11.5px; }
  @media (max-width:760px){ .cols{ grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">Generated ${escapeHtml(subtitle)} · ${escapeHtml(profile.reproduction.engine)} v${escapeHtml(profile.reproduction.engineVersion)}</p>

  <h2>Overview</h2>
  <div class="cards">
    <div class="card"><div class="k">Records</div><div class="v">${profile.rowCount.toLocaleString()}</div></div>
    <div class="card"><div class="k">Variables</div><div class="v">${profile.columnCount}</div></div>
    <div class="card"><div class="k">Completeness</div><div class="v">${pct(profile.quality.completeness)}</div></div>
    <div class="card"><div class="k">Missing cells</div><div class="v">${profile.quality.missingCells.toLocaleString()}</div></div>
    <div class="card"><div class="k">Duplicate rows</div><div class="v">${profile.duplicateCount.toLocaleString()}</div></div>
    <div class="card"><div class="k">Memory</div><div class="v">${escapeHtml(profile.summary.memoryFootprint)}</div></div>
    <div class="card"><div class="k">Alerts</div><div class="v">${alertCounts.error} / ${alertCounts.warning} / ${alertCounts.info}</div></div>
  </div>

  <h2>Alerts</h2>
  <p class="sub">Automated data-quality problems detected in this dataset (errors / warnings / information).</p>
  ${alertsHtml}

  <h2>Variable types</h2>
  <p class="sub">Automatic type inference per column.</p>
  <table>
    <thead><tr><th>Variable</th><th>Type</th><th>Distinct</th><th>Distinct %</th><th>Confidence</th><th>Reason</th></tr></thead>
    <tbody>${typeRows}</tbody>
  </table>

  <h2>Variables — numerical</h2>
  <table>
    <thead><tr><th>Variable</th><th>Count</th><th>Missing</th><th>Mean</th><th>SD</th><th>Median</th><th>Mode</th><th>Min</th><th>Max</th><th>IQR</th><th>Skew</th><th>Kurtosis</th><th>Outliers</th><th>Normal</th></tr></thead>
    <tbody>${numericRows || '<tr><td colspan="14">No numerical variables detected.</td></tr>'}</tbody>
  </table>
  ${numericHistograms}

  <h2>Variables — categorical</h2>
  <table>
    <thead><tr><th>Variable</th><th>Distinct</th><th>Mode</th><th>Imbalance</th><th>Entropy</th><th>Missing</th><th>Top categories</th></tr></thead>
    <tbody>${categoricalRows || '<tr><td colspan="7">No categorical variables detected.</td></tr>'}</tbody>
  </table>

  <h2>Variables — temporal</h2>
  <table>
    <thead><tr><th>Variable</th><th>Range</th><th>Span</th><th>Granularity</th><th>Distinct</th><th>Missing</th></tr></thead>
    <tbody>${dateRows || '<tr><td colspan="6">No temporal variables detected.</td></tr>'}</tbody>
  </table>

  <h2>Variables — text</h2>
  <table>
    <thead><tr><th>Variable</th><th>Chars</th><th>Words</th><th>Avg word len</th><th>Upper / lower</th><th>Non-ASCII</th><th>Scripts</th><th>Common words</th></tr></thead>
    <tbody>${textRows || '<tr><td colspan="8">No free-text variables detected.</td></tr>'}</tbody>
  </table>

  <h2>Interactions</h2>
  <h3 class="sub">Pearson and Spearman correlations</h3>
  <table>
    <thead><tr><th>Variable 1</th><th>Variable 2</th><th>Pearson r</th><th>Spearman ρ</th><th>p-value</th><th>Strength</th></tr></thead>
    <tbody>${correlationRows || '<tr><td colspan="6">Not enough numerical variables for correlation analysis.</td></tr>'}</tbody>
  </table>

  <h3 class="sub">Principal components</h3>
  <table>
    <thead><tr><th>Component</th><th>Eigenvalue</th><th>Variance explained</th><th>Cumulative</th></tr></thead>
    <tbody>${pcaRows || '<tr><td colspan="4">Not enough numerical variables for PCA.</td></tr>'}</tbody>
  </table>

  <h2>Missing values</h2>
  <table>
    <thead><tr><th>Variable</th><th>Missing</th><th>%</th></tr></thead>
    <tbody>${missingRows || '<tr><td colspan="3">No missing values.</td></tr>'}</tbody>
  </table>
  <h3 class="sub">Missingness patterns</h3>
  <table>
    <thead><tr><th>Columns</th><th>Rows</th><th>%</th></tr></thead>
    <tbody>${patternRows || '<tr><td colspan="3">No missing values.</td></tr>'}</tbody>
  </table>

  <h2>Duplicate rows</h2>
  <table>
    <thead><tr><th>Copies</th><th>Example</th></tr></thead>
    <tbody>${duplicateRows || '<tr><td colspan="2">No duplicate rows detected.</td></tr>'}</tbody>
  </table>

  ${timeSeriesSections ? `<h2>Time series</h2>${timeSeriesSections}` : ""}

  <h2>Reproduction</h2>
  <ul class="kv">
    <li>Analysis started: ${escapeHtml(profile.reproduction.generatedAt)}</li>
    <li>Engine: ${escapeHtml(profile.reproduction.engine)} v${escapeHtml(profile.reproduction.engineVersion)}</li>
    <li>Duration: ${profile.reproduction.durationMs} ms</li>
    <li>Records: ${profile.reproduction.rowCount}, variables: ${profile.reproduction.columnCount}</li>
    ${Object.entries(profile.reproduction.configuration)
      .map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(value)}</li>`)
      .join("")}
  </ul>

  <footer>
    Produced by ${escapeHtml(profile.reproduction.engine)} — a TypeScript port of the
    fg-data-profiling feature set (github.com/data-centric-ai-community/fg-data-profiling).
  </footer>
</div>
</body>
</html>`;
}
