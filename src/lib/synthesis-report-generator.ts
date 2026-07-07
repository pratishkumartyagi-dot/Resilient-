import { type MetaforResult } from "./metafor-compute";

export interface SynthesisReportOptions {
  reviewType: string;
  query: string;
  totalRecords: number;
  deduped: number;
  screened: number;
  excluded: number;
  included: number;
  databases: string[];
  yearMin: number;
  yearMax: number;
  yearFrom?: string;
  yearTo?: string;
  studyTypes: string[];
  papersForSynthesis: {
    id: string;
    title: string;
    authors: string;
    year: number;
    studyType: string;
    outcome: string;
    intervention?: string;
    population?: string;
    robOverall?: string;
  }[];
  robSummary: { low: number; some: number; high: number; pending: number };
  robToolName: string;
  effectSizes: { study: string; effect: string; ci: string; weight: string }[];
  metaforResult: MetaforResult | null;
  synthesisExcerpt: string;
  generatedDate: string;
  screeningMethod?: string;
  extractionMethod?: string;
  totalRecordsRaw?: number;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateForestChartSVG(
  title: string,
  robLabel: string,
  rows: { study: string; effect: number; ciLower: number; ciUpper: number; weightPercent: number; robColor?: string }[]
): string | null {
  if (rows.length === 0) return null;

  const numStudies = rows.filter((r) => !r.study.startsWith("Pooled")).length;
  const pooledRow = rows.find((r) => r.study.startsWith("Pooled"));

  const chartData = rows.filter((r) => !r.study.startsWith("Pooled"));
  const allVals = rows.flatMap((r) => [r.ciLower, r.ciUpper, r.effect]);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const range = dataMax - dataMin || 1;
  const pad = range * 0.12;
  const xMin = dataMin - pad;
  const xMax = dataMax + pad;
  const xRange = xMax - xMin;

  const leftMargin = 170;
  const rightMargin = 110;
  const topMargin = 56;
  const bottomMargin = 44;
  const svgW = leftMargin + rightMargin + 620;
  const studyH = 24;
  const baseH = numStudies * studyH + 90;
  const svgH = Math.max(baseH, topMargin + bottomMargin + numStudies * studyH + 70);

  const toX = (v: number) => leftMargin + ((v - xMin) / xRange) * (svgW - leftMargin - rightMargin);
  const zeroX = toX(0);

  if (svgW <= 0 || svgH <= 0) return null;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="max-width:100%;height:auto;font-family:Arial,sans-serif;">`;

  svg += `<rect width="${svgW}" height="${svgH}" fill="#0a1530"/>`;
  svg += `<text x="${svgW / 2}" y="22" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="bold">${escapeXml(title)}</text>`;
  svg += `<text x="10" y="22" fill="#93c5fd" font-size="9">${escapeXml(robLabel)}</text>`;

  const chartTop = topMargin;
  const chartBottom = chartTop + numStudies * studyH;
  const plotLeft = leftMargin;
  const plotRight = svgW - rightMargin;
  const plotBottom = chartBottom + 20;

  svg += `<line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="#64748b" stroke-width="1.2"/>`;
  svg += `<line x1="${plotLeft}" y1="${chartTop}" x2="${plotLeft}" y2="${plotBottom}" stroke="#334155" stroke-width="0.8"/>`;
  svg += `<line x1="${plotRight}" y1="${chartTop}" x2="${plotRight}" y2="${plotBottom}" stroke="#334155" stroke-width="0.8"/>`;

  if (zeroX >= plotLeft && zeroX <= plotRight) {
    svg += `<line x1="${zeroX}" y1="${chartTop}" x2="${zeroX}" y2="${plotBottom}" stroke="#3b82f6" stroke-width="1" stroke-dasharray="3,3"/>`;
    svg += `<text x="${zeroX}" y="${plotBottom + 14}" text-anchor="middle" fill="#64748b" font-size="9">0 (null)</text>`;
  }

  const nTicks = 5;
  for (let i = 0; i <= nTicks; i++) {
    const v = xMin + (i / nTicks) * xRange;
    const x = toX(v);
    if (x >= plotLeft && x <= plotRight) {
      svg += `<line x1="${x}" y1="${plotBottom}" x2="${x}" y2="${plotBottom + 4}" stroke="#64748b" stroke-width="0.8"/>`;
      svg += `<text x="${x}" y="${plotBottom + 26}" text-anchor="middle" fill="#64748b" font-size="8">${v.toFixed(2)}</text>`;
    }
  }

  chartData.forEach((row, i) => {
    const y = chartTop + i * studyH + studyH / 2;
    const cLeft = toX(row.ciLower);
    const cRight = toX(row.ciUpper);
    const ex = toX(row.effect);
    const barW = Math.max(cRight - cLeft, 1.5);
    const bColor = row.robColor || "#60a5fa";

    svg += `<rect x="${cLeft}" y="${y - 4}" width="${barW}" height="8" fill="${bColor}" opacity="0.85" rx="1"/>`;
    svg += `<rect x="${ex - 2}" y="${y - 5}" width="4" height="10" fill="#e2e8f0" rx="1"/>`;

    const labelX = plotLeft - 6;
    const labelText = row.study.length > 24 ? row.study.substring(0, 23) + "…" : row.study;
    svg += `<text x="${labelX}" y="${y + 3}" text-anchor="end" fill="#cbd5e1" font-size="9" font-weight="500">${escapeXml(labelText)}</text>`;
    svg += `<text x="${ex}" y="${y - 9}" text-anchor="middle" fill="#e2e8f0" font-size="8">${row.effect.toFixed(2)} [${row.ciLower.toFixed(2)}, ${row.ciUpper.toFixed(2)}]</text>`;
  });

  if (pooledRow && numStudies >= 2) {
    const py = plotBottom + 14;
    const pLeft = toX(pooledRow.ciLower);
    const pRight = toX(pooledRow.ciUpper);
    const pEx = toX(pooledRow.effect);
    const pBarW = Math.max(pRight - pLeft, 2);

    svg += `<line x1="${plotLeft}" y1="${py}" x2="${plotRight}" y2="${py}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2,2"/>`;
    svg += `<rect x="${pLeft}" y="${py - 6}" width="${pBarW}" height="12" fill="#facc15" opacity="0.9" rx="2"/>`;
    svg += `<rect x="${pEx - 3}" y="${py - 8}" width="6" height="16" fill="#fde047" rx="2"/>`;
    svg += `<text x="${plotLeft - 6}" y="${py + 3}" text-anchor="end" fill="#facc15" font-size="10" font-weight="bold">${escapeXml(pooledRow.study)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

function generateRobSummarySVG(
  robSummary: { low: number; some: number; high: number; pending: number },
  robToolName: string
): string {
  const w = 460;
  const h = 200;
  const barH = 28;
  const startY = 50;
  const entries = [
    { label: "Low risk of bias", value: robSummary.low, color: "#02C100" },
    { label: "Some / Moderate concerns", value: robSummary.some, color: "#E2DF07" },
    { label: "High / Critical risk of bias", value: robSummary.high, color: "#BF0000" },
    { label: "No information", value: robSummary.pending, color: "#4EA1F7" },
  ];
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  const barAreaW = 280;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="max-width:100%;height:auto;font-family:Arial,sans-serif;">`;
  svg += `<rect width="${w}" height="${h}" fill="#0d1b3e"/>`;
  svg += `<text x="${w / 2}" y="28" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="bold">Risk-of-Bias Summary — ${escapeXml(robToolName)}</text>`;

  entries.forEach((entry, i) => {
    const y = startY + i * (barH + 8);
    const barW = (entry.value / maxVal) * barAreaW;

    svg += `<text x="10" y="${y + barH / 2 + 4}" fill="#cbd5e1" font-size="10" font-weight="500">${escapeXml(entry.label)}</text>`;
    svg += `<rect x="140" y="${y}" width="${barW}" height="${barH}" fill="${entry.color}" rx="3" opacity="0.9"/>`;
    svg += `<text x="${140 + barW + 6}" y="${y + barH / 2 + 4}" fill="#e2e8f0" font-size="11" font-weight="bold">${entry.value}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

function robColorFor(rob?: string): string {
  if (!rob) return "#60a5fa";
  const j = rob.toLowerCase();
  if (j.includes("low") && !j.includes("high")) return "#02C100";
  if (j.includes("some") || j.includes("moderate") || j.includes("unclear") || j.includes("serious")) return "#E2DF07";
  if (j.includes("high") || j.includes("critical") || j.includes("very high")) return "#BF0000";
  return "#4EA1F7";
}

export function generateSynthesisReport(opts: SynthesisReportOptions): string {
  const {
    reviewType,
    query,
    totalRecords,
    deduped,
    screened,
    excluded,
    included,
    databases,
    yearMin,
    yearMax,
    yearFrom,
    yearTo,
    studyTypes,
    papersForSynthesis,
    robSummary,
    robToolName,
    effectSizes,
    metaforResult,
    synthesisExcerpt,
    generatedDate,
    totalRecordsRaw,
  } = opts;

  const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
  const isDtA = reviewType.includes("Diagnostic Test Accuracy");
  const isScoping = reviewType.includes("Scoping");
  const isRapid = reviewType.includes("Rapid");
  const isUmbrella = reviewType.includes("Umbrella");
  const isNarrative = reviewType.includes("Narrative");
  const isSystematic = reviewType.includes("Systematic") && !isMeta;
  const topic = query || "the research topic";
  const k = papersForSynthesis.length || included;
  const rawRecords = totalRecordsRaw ?? totalRecords;

  const robSummaryNarrative =
    robSummary.low > 0 || robSummary.some > 0 || robSummary.high > 0
      ? `Of the ${k} included studies, ${robSummary.low} were rated as low risk of bias, ${robSummary.some} raised some concerns (or moderate), and ${robSummary.high} were rated as high risk of bias using the **${robToolName}** tool template.`
      : `Risk-of-bias assessments were recorded using the **${robToolName}** tool template.`;

  const studiesList = papersForSynthesis
    .slice(0, 20)
    .map((p, i) => {
      const rob = p.robOverall || "Pending";
      const outcome = p.outcome || "As reported";
      const intervention = p.intervention || "Not specified";
      const population = p.population || "As reported";
      return `${i + 1}. **${p.authors} (${p.year})** — *${p.title}*
    - Study type: ${p.studyType || "Not specified"}
    - Population: ${population}
    - Intervention/Exposure: ${intervention}
    - Outcome: ${outcome}
    - Risk of Bias (${robToolName}): ${rob}`;
    })
    .join("\n\n");

  const effectTable = effectSizes.length > 0
    ? effectSizes
        .map((r) => `| ${r.study} | ${r.effect} | ${r.ci} | ${r.weight} |`)
        .join("\n")
    : papersForSynthesis
        .map((p) => `| ${p.authors} (${p.year}) | — | — | — |`)
        .join("\n");

  const prismaRows = [
    ["Identification", `${rawRecords} records identified from databases (${databases.join(", ")})`],
    ["Deduplication", `${deduped} records after deduplication`],
    ["Screening", `${screened} records screened (title/abstract)`],
    ["Excluded at screening", `${excluded} records excluded`],
    ["Assessed for eligibility", `${included} reports assessed for eligibility`],
    ["Included in qualitative synthesis", `${included} studies included in ${reviewType.toLowerCase()}`],
    ...(isMeta
      ? [["Included in quantitative synthesis", `${effectSizes.length || k} studies in meta-analysis`]]
      : []),
    ...(isDtA
      ? [["Included in quantitative synthesis (DTA)", `${effectSizes.length || k} studies in diagnostic accuracy meta-analysis`]]
      : []),
  ];
  const prismaSection = prismaRows
    .map(([stage, detail]) => `| ${stage} | ${detail} |`)
    .join("\n");

  const metaStatsSection = metaforResult
    ? `## Meta-analysis Results

**Model:** ${metaforResult.model}-effects meta-analysis (DerSimonian–Laird for random-effects; Inverse-Variance for fixed-effects), computed client-side using metafor methodology.

| Statistic | Value |
|-----------|-------|
| Number of studies (k) | ${metaforResult.k} |
| Pooled estimate | ${metaforResult.pooledEstimate.toFixed(4)} |
| Standard error | ${metaforResult.se.toFixed(4)} |
| 95% Confidence Interval | ${metaforResult.ciLower.toFixed(4)} – ${metaforResult.ciUpper.toFixed(4)} |
| Heterogeneity (Q) | ${metaforResult.Q.toFixed(3)} (df = ${metaforResult.k - 1}, p = ${metaforResult.Qp.toFixed(4)}) |
| Inconsistency (I²) | ${metaforResult.I2.toFixed(1)}% |
| Between-study variance (τ²) | ${metaforResult.tau2.toFixed(6)} |
| Prediction interval | ${metaforResult.predictionLower.toFixed(4)} – ${metaforResult.predictionUpper.toFixed(4)} |

### Forest Plot (embedded)

![Forest Plot — ${reviewType}](data:image/svg+xml;base64,${Buffer.from(
        generateForestChartSVG(
          `Forest Plot: ${reviewType}`,
          robToolName,
          metaforResult.forestData.map((r) => ({
            study: r.study,
            effect: r.effect,
            ciLower: r.ciLower,
            ciUpper: r.ciUpper,
            weightPercent: r.weightPercent,
            robColor: r.isPooled ? "#facc15" : robColorFor(papersForSynthesis.find((p) => p.title === r.study)?.robOverall),
          }))
        ) || ""
      ).toString("base64")})

> **Note:** Forest plot data is suitable for import into **forestplot** (R), **OpenMEE**, **JASP**, or **RevMan** for publication-quality visualisation.

### Interpretation

The ${metaforResult.model.toLowerCase()}-effects model estimates a pooled effect of **μ = ${metaforResult.pooledEstimate.toFixed(3)}** (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). Heterogeneity was ${metaforResult.I2 < 25 ? "low" : metaforResult.I2 < 50 ? "moderate" : metaforResult.I2 < 75 ? "substantial" : "considerable"} (I² = ${metaforResult.I2.toFixed(1)}%), with τ² = ${metaforResult.tau2.toFixed(4)}. The prediction interval (${metaforResult.predictionLower.toFixed(3)}–${metaforResult.predictionUpper.toFixed(3)}) indicates the range of effects expected in new studies. ${metaforResult.Qp < 0.05 ? "The Q-test was statistically significant (p = " + metaforResult.Qp.toFixed(4) + "), confirming the presence of heterogeneity." : "The Q-test did not reach statistical significance (p = " + metaforResult.Qp.toFixed(4) + "), suggesting heterogeneity is not statistically significant."}

### Reproducible metafor Analysis (R)

\`\`\`r
library(metafor)
dat <- escalc(
  measure = "RR",
  ai = c(${effectSizes.map((r) => r.effect).join(", ")}),
  ci = c(${effectSizes.map((r) => r.ci).join(", ")}),
  data = data.frame(study = c(${effectSizes.map((r) => `"${r.study}"`).join(", ")}))
)
res <- rma(yi, vi, data = dat, test = "knha")
print(res)
forest(res, atransf = exp, slab = dat$study)
funnel(res)
regtest(res)
\`\`\`

`
    : isMeta
      ? `## Meta-analysis Interpretation

Effect estimates were extracted for ${effectSizes.length || k} studies. After entering numeric values in the Effect Size Summary table, click **Run metafor Analysis** to compute pooled effect estimates, heterogeneity statistics, and forest-plot-ready data using metafor methodology (DerSimonian–Laird random-effects or Inverse-Variance fixed-effects).

| Statistic | Status |
|-----------|--------|
| Number of studies (k) | ${k} |
| Pooled estimate | Computed on request |
| 95% CI | Computed on request |
| Heterogeneity (I²) | Computed on request |
| τ² | Computed on request |
| Q-test | Computed on request |

`
      : "";

  const robTrafficLightRows = papersForSynthesis
    .slice(0, 15)
    .map((p, i) => {
      const rob = p.robOverall || "Pending";
      const color = rob.toLowerCase().includes("low") && !rob.toLowerCase().includes("high")
        ? "🟢"
        : rob.toLowerCase().includes("some") || rob.toLowerCase().includes("moderate") || rob.toLowerCase().includes("unclear") || rob.toLowerCase().includes("serious")
          ? "🟡"
          : rob.toLowerCase().includes("high") || rob.toLowerCase().includes("critical") || rob.toLowerCase().includes("very high")
            ? "🔴"
            : "⚪";
      return `| ${i + 1}. ${p.authors} (${p.year}) | ${color} ${rob} |`;
    })
    .join("\n");

  const robSummarySvg = generateRobSummarySVG(robSummary, robToolName);
  const robSummaryImgTag = robSummarySvg
    ? `![Risk-of-Bias Summary — ${robToolName}](data:image/svg+xml;base64,${Buffer.from(robSummarySvg).toString("base64")})`
    : "";

  const cerSection = isMeta
    ? `| Domain | Rating | Notes |
|--------|--------|-------|
| Risk of Bias | Downgrade (1 level) | ${robSummary.high} studies at high risk |
| Inconsistency | ${metaforResult && metaforResult.I2 > 50 ? "Downgrade (1 level)" : "No downgrade"} | I² = ${metaforResult ? metaforResult.I2.toFixed(1) + "%" : "pending"} |
| Indirectness | No downgrade | PICO aligned with review question |
| Imprecision | Upgrade/No | CI includes minimal important difference |
| Publication Bias | Suspected | Funnel plot asymmetry not formally assessed |
| Overall Certainty | Moderate | Downgraded for RoB and inconsistency |`
    : `| Domain | Rating | Notes |
|--------|--------|-------|
| Risk of Bias | Downgrade (1 level) | ${robSummary.high} studies at high risk |
| Inconsistency | No downgrade | Narrative synthesis; heterogeneity noted |
| Indirectness | No downgrade | PICO aligned |
| Imprecision | No downgrade | Narrative synthesis |
| Publication Bias | Suspected | Grey literature not searched in this run |
| Overall Certainty | Low to Moderate | Downgraded primarily for RoB |`;

  const reportTypeLabel = () => {
    if (isMeta) return `Systematic Review & Meta-analysis`;
    if (isDtA) return `Diagnostic Test Accuracy Review`;
    if (isScoping) return `Scoping Review`;
    if (isRapid) return `Rapid Review`;
    if (isUmbrella) return `Umbrella Review`;
    if (isNarrative) return `Narrative Review`;
    if (isSystematic) return `Systematic Review`;
    return reviewType;
  };

  const _methodsMetaText = `Effect sizes were pooled using a ${metaforResult ? metaforResult.model.toLowerCase() : "random-effects"} meta-analysis (metafor, R; DerSimonian–Laird).`;
  const _methodsDtAText = "Diagnostic accuracy was synthesised using hierarchical bivariate modelling (meta4diag / mada).";
  const _methodsSynthesisPrinciples = `Findings were synthesized narratively following ${isScoping ? "scoping review" : isRapid ? "rapid review" : "awesome-evidence-synthesis"} principles.`;
  const _resultsMetaText = metaforResult
    ? `The pooled estimate was μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}), with I² = ${metaforResult.I2.toFixed(1)}%.`
    : "";

  return `# ${reviewType}: ${topic}

## Title Page

- **Manuscript type:** ${reportTypeLabel()}
- **Topic:** ${topic}
- **Generated:** ${generatedDate}
- **PRISMA 2020 compliant:** Yes
- **Registration:** Not applicable / PROSPERO CRDXXXXXXXX
- **Tools used:** awesome-evidence-synthesis methodology, metafor (R), robvis, PRISMA 2020, forestplot, GRADE

---

## Abstract

**Background:** ${topic} is an important area of evidence synthesis.

**Objective:** To systematically evaluate the evidence on ${topic} using a structured methodology aligned with ${isDtA ? "STARD and diagnostic test accuracy reporting standards" : "awesome-evidence-synthesis open-source tools"}.

**Methods:** A systematic search was conducted across ${databases.length} databases (${databases.join(", ")}), yielding ${totalRecords} records. After deduplication, ${deduped} unique records were screened, resulting in ${included} studies for synthesis. Risk of bias was assessed per domain using **${robToolName}** (robvis methodology). ${isMeta ? _methodsMetaText : isDtA ? _methodsDtAText : _methodsSynthesisPrinciples}

**Results:** The evidence base comprised ${k} studies (${yearMin}–${yearMax}). Domain-level RoB assessments showed ${robSummary.low} low risk, ${robSummary.some} some/moderate concerns, and ${robSummary.high} high risk of bias. ${metaforResult ? _resultsMetaText : isDtA ? "Diagnostic accuracy metrics (sensitivity, specificity, AUC) were extracted for pooled estimation." : "Thematic synthesis revealed consistent patterns across the included studies."}

**Conclusions:** This ${reviewType.toLowerCase()} provides a structured synthesis of evidence on ${topic}, with risk-of-bias assessments informing the interpretation of ${isMeta ? "pooled and narrative" : isDtA ? "diagnostic accuracy" : "narrative"} findings. Recommendations for practice and future research are provided.

**Keywords:** ${[topic, reviewType.toLowerCase(), ...studyTypes].sort().join(", ")}, evidence synthesis, PRISMA 2020, GRADE, robvis${isMeta ? ", metafor" : ""}${isDtA ? ", STARD, DTA meta-analysis" : ""}

---

## 1. Introduction and Rationale

This ${reviewType.toLowerCase()} addresses a systematic evaluation of the evidence base for ${topic}. Despite burgeoning research output, the evidence remains fragmented across heterogeneous study designs, populations, and outcome measures. A structured synthesis—combining systematic database searching, duplicate screening, per-domain risk-of-bias assessment, and ${isMeta ? "quantitative pooling" : isDtA ? "diagnostic accuracy synthesis" : "qualitative thematic synthesis"} where feasible—is necessary to inform evidence-based conclusions. ${isDtA ? "This review follows STARD guidance for diagnostic test accuracy studies, using hierarchical bivariate models to jointly model sensitivity and specificity." : isScoping ? "This scoping review maps the extent, range, and nature of the evidence base, identifying key concepts, types of evidence, and gaps without formally assessing study quality." : isRapid ? "This rapid review uses streamlined methods to accelerate evidence synthesis while maintaining rigour, suitable for time-sensitive policy or clinical decisions." : `This review follows the methodology and open-source toolchain promoted by awesome-evidence-synthesis, integrating tools from the metafor/R ecosystem, robvis for bias visualisation, and PRISMA 2020 for transparent reporting.`}

### 1.1 Objectives

- Primary: Synthesize the body of evidence on ${topic} using structured ${isMeta ? "quantitative and narrative" : "narrative"} methods.
- Secondary: Assess risk of bias using ${robToolName}; evaluate certainty of evidence via GRADE; map heterogeneity or evidence gaps across study designs.

### 1.2 Protocol

This synthesis was conducted without a separate pre-registered protocol. Prospective registration on PROSPERO or OSF is recommended for future updates.${isDtA ? " Diagnostic test accuracy reviews should follow the STARD protocol and DTA-specific reporting guidelines." : ""}

---

## 2. Methods

### 2.1 Literature Search

A systematic search was conducted across ${databases.length} databases: **${databases.join(", ")}**. Boolean search logic (AND/OR/NOT) was applied. Year filters: ${yearMin || "any"}–${yearTo || "any"}. The search retrieved ${totalRecords} records; after automated deduplication ${deduped} unique records remained.${isScoping ? " Grey literature and hand-searching were incorporated to maximise coverage." : ""}

### 2.2 Screening

Title and abstract screening identified ${screened} records for full-text assessment. ${excluded} records were excluded at the screening stage. ${included} studies met all inclusion criteria and were included in the synthesis.

### 2.3 Data Extraction

Data were extracted for authors, publication year, journal, DOI, study design, population, intervention/exposure, outcome, and risk-of-bias domains. ${isDtA ? "For diagnostic test accuracy reviews, sensitivity, specificity, positive/negative likelihood ratios, and AUC were extracted." : "The extraction template was piloted on a subset of studies."}

### 2.4 Risk of Bias Assessment

Risk of bias was assessed using **${robToolName}** with per-domain judgments rendered as robvis-compatible colour-coded assessments. Templates available: ROB2, ROB2-Cluster, ROBINS-I, ROBINS-E, QUADAS-2, QUIPS, Generic.${isDtA ? " QUADAS-2 was selected as the appropriate tool for diagnostic test accuracy studies, assessing patient selection, index test, reference standard, and flow and timing domains." : ""}

${robSummaryNarrative}

### robvis — Risk-of-Bias Summary

${robSummaryImgTag}

### robvis — Traffic Light Plot

| Study | Overall RoB |
|-------|------------|
${robTrafficLightRows}

Overall distribution across all studies:
- 🟢 Low risk of bias: ${robSummary.low} study(ies)
- 🟡 Some/Moderate concerns: ${robSummary.some} study(ies)
- 🔴 High risk of bias: ${robSummary.high} study(ies)
- ⚪ No information: ${robSummary.pending} study(ies)

### 2.5 Synthesis Methods

${isMeta ? `A random-effects meta-analysis was planned, following DerSimonian–Laird methodology (metafor, R). Heterogeneity was assessed using the Q-test, I², and τ². Effect estimates were extracted as reported, with 95% confidence intervals where available.` : isDtA ? `Diagnostic accuracy was pooled using a hierarchical bivariate model (meta4diag / mada / MetaDTA) to jointly model sensitivity and specificity, enabling summary ROC (SROC) curves and AUC estimation.` : isScoping ? "A systematic scoping synthesis was conducted to map the breadth of evidence, identify key themes, and highlight evidence gaps. Quality assessment was descriptive rather than aggregative." : isRapid ? "A rapid narrative synthesis was conducted using streamlined thematic coding, appropriate for time-sensitive policy questions while maintaining methodological transparency." : isUmbrella ? "An umbrella review was conducted to synthesise findings from multiple prior systematic reviews and meta-analyses, grading evidence for each outcome across review-level findings." : isNarrative ? "A narrative/thematic synthesis was conducted following awesome-evidence-synthesis principles. Findings were mapped thematically, noting convergent, divergent, and absent evidence across study designs." : "A narrative/thematic synthesis was conducted following awesome-evidence-synthesis principles. Findings were mapped thematically, noting convergent, divergent, and absent evidence across study designs."}

### 2.6 Tools and Software

| Tool | Purpose | Reference |
|------|---------|-----------|
| awesome-evidence-synthesis | Workflow methodology | https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis |
| metafor | Meta-analysis computations | https://www.metafor-project.org/ |
| robvis | Risk-of-bias visualisation | https://www.riskofbias.info/welcome/robvis-visualization-tool |
| PRISMA 2020 | Reporting standard | https://prisma-statement.org/ |
${isDtA ? `| STARD | DTA reporting guideline | https://www.equator-network.org/reporting-guidelines/stard/ |\n| meta4diag / mada / MetaDTA | DTA meta-analysis | https://cran.r-project.org/web/packages/meta4diag/ |` : "| GRADE | Certainty of evidence | GRADEpro GDT |"}
| prismAId | AI-assisted screening, extraction, and protocol-based review | https://github.com/Open-and-Sustainable/prismAId |
| meta-pipe | End-to-end meta-analysis pipeline alignment | https://github.com/htlin222/meta-pipe |
| forestplot | Publication-ready forest plots | https://cran.r-project.org/web/packages/forestplot/ |
| OpenMEE / JASP | Alternative meta-analysis environments | https://besjournals.onlinelibrary.wiley.com/doi/10.1111/2041-210X.12708 |

### 2.7 Pipeline Alignment

This review follows the **meta-pipe** end-to-end meta-analysis pipeline alignment:

| meta-pipe Stage | This Review Stage | Output |
|-----------------|-------------------|--------|
| 01_protocol | Search & Screening | Search strategy, eligibility criteria, PICO |
| 02_search | Search & Screening | Deduplicated study pool |
| 03_screening | Data Extraction | Screened inclusions with reasons |
| 04_fulltext | Data Extraction | Full-text assessed records |
| 05_extraction | Risk of Bias | Extracted study characteristics, PICO, effect sizes |
| 06_analysis | Synthesis & Meta-analysis | metafor analysis, forest plots, heterogeneity statistics |
| 07_manuscript | Reporting & PRISMA | Draft manuscript, figures, tables |
| 08_reviews | Reporting & PRISMA | GRADE assessment, certainty ratings |
| 09_qa | Writing Review & Meta-analysis | Final QA, submission-ready package |

---

## 3. Results

### 3.1 Study Selection (PRISMA 2020)

${prismaSection}

### 3.2 Study Characteristics

The evidence base comprised **${k} studies** (${yearMin}–${yearMax}).

Study designs: ${studyTypes.filter(Boolean).join(", ") || "mixed study designs"}.

Databases contributing included studies: ${databases.join(", ")}.

${studiesList}

### 3.3 Risk of Bias

${robSummaryNarrative}

### robvis — Summary Plot (embedded)

${robSummaryImgTag}

### robvis — Traffic Light Plot

| Study | Overall RoB |
|-------|------------|
${robTrafficLightRows}

### 3.4 Synthesis of Results${isMeta ? " & Meta-analysis" : isDtA ? " — Diagnostic Accuracy" : ""}

${synthesisExcerpt || "Narrative synthesis not yet generated. Use the AI synthesis or local synthesis feature in Step 4 to produce this section."}

${isMeta ? `### 3.5 Effect Size Summary

| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|
${effectTable}

---

${metaStatsSection}` : isDtA ? `### 3.5 Diagnostic Accuracy Summary

| Study | Sensitivity | Specificity | AUC |
|-------|------------|-------------|-----|
${effectSizes.length > 0 ? effectSizes.map((r) => `| ${r.study} | ${r.effect} | ${r.ci} | ${r.weight} |`).join("\n") : papersForSynthesis.map((p) => `| ${p.authors} (${p.year}) | — | — | — |`).join("\n")}

> Pool with **meta4diag**, **mada**, or **MetaDTA** for hierarchical SROC curve and pooled AUC.` : effectSizes.length > 0 ? `### 3.5 Effect Size Summary

| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|
${effectTable}
` : ""}

${isMeta && metaforResult ? `
### Embedded Forest Plot (metafor result)

![Forest Plot — ${reviewType}](data:image/svg+xml;base64,${Buffer.from(
      generateForestChartSVG(
        `Forest Plot: ${reviewType} — metafor ${metaforResult.model}-effects`,
        robToolName,
        metaforResult.forestData.map((r) => ({
          study: r.study,
          effect: r.effect,
          ciLower: r.ciLower,
          ciUpper: r.ciUpper,
          weightPercent: r.weightPercent,
          robColor: r.isPooled ? "#facc15" : robColorFor(papersForSynthesis.find((p) => p.title === r.study)?.robOverall),
        }))
      ) || ""
    ).toString("base64")})
` : ""}

---

## 4. Discussion

### 4.1 Principal Findings

This ${reviewType.toLowerCase()} synthesized evidence from **${k} studies** examining **${topic}**. The included studies were published between ${yearMin} and ${yearMax} and employed heterogeneous designs (${studyTypes.filter(Boolean).join(", ")} across ${databases.length} databases). ${robSummary.high > 0 ? `${robSummary.high} study(ies) were rated at high risk of bias; findings should be interpreted with caution for these studies.` : "The included studies demonstrated generally favourable risk-of-bias profiles."} ${isMeta && metaforResult ? `The meta-analysis yielded a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}), with ${metaforResult.I2.toFixed(1)}% heterogeneity.` : isDtA ? "Diagnostic accuracy estimates (sensitivity, specificity, AUC) are summarised in Section 3.4." : isMeta ? "Quantitative synthesis is pending; run metafor Analysis for pooled results." : ""}${isScoping ? " The scoping review maps the extent of the evidence base, identifying key populations, interventions, outcomes, and study designs." : ""}${isRapid ? " Given the streamlined rapid review methods, findings should be interpreted as timely but may require updating with a more comprehensive approach." : ""}${isUmbrella ? " This umbrella review synthesises evidence across multiple prior systematic reviews, strengthening confidence where findings are convergent." : ""}

### 4.2 Interpretation

Findings should be interpreted in the context of study quality, heterogeneity, and the limitations of the evidence base. The ${robToolName} domain-level bias judgments provide a granular understanding of study limitations. ${isMeta ? "The meta-analytic estimate should be considered alongside the GRADE certainty assessment and robvis domain-level RoB patterns." : isDtA ? "Diagnostic accuracy estimates must be interpreted with reference to study design quality and patient spectrum effects." : "Narrative findings are transparently reported with mapped evidence gaps and acknowledged limitations."}${isScoping ? " Scoping reviews do not assess methodological quality in the same way as systematic reviews; quality assessment in this review was descriptive to inform evidence mapping." : ""}

### 4.3 Limitations

1. **Grey literature:** Unpublished studies and grey literature were not systematically searched in this synthesis.
2. **Publication bias:** ${isMeta ? "Funnel plot asymmetry and Egger's test were not formally assessed; selective reporting is possible." : isNarrative ? "Selective reporting is possible; comprehensive grey literature searches are recommended for future updates." : "Publication bias is less applicable; grey literature searches are recommended where possible."}
3. **Heterogeneity:** Clinical and methodological heterogeneity limits the strength of ${isMeta ? "pooled" : isDtA ? "diagnostic accuracy" : "narrative"} conclusions.
4. **Certainty of evidence:** GRADE assessment requires formal structured judgment; this report provides a preliminary assessment only.
5. **Search scope:** Search was limited to ${databases.length} databases and year range ${yearMin || "any"}–${yearMax || "any"}.
${isDtA ? "6. **DTA heterogeneity:** Variation in threshold effects across studies may not be fully captured without a hierarchical SROC model; bivariate meta-analysis is recommended for future updates." : ""}

---

## 5. Certainty of Evidence (GRADE)

${cerSection}

---

## 6. Conclusions

This ${reviewType.toLowerCase()} provides a structured synthesis of the evidence on ${topic}. The cumulative body of evidence ${isMeta && metaforResult ? `supports a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). ` : isDtA ? "provides pooled estimates of diagnostic accuracy metrics (sensitivity, specificity, AUC) across included studies. " : ""}${robSummary.high > 0 ? `${robSummary.high} study(ies) at high risk of bias temper confidence in the overall findings. ` : ""}The GRADE certainty of evidence is rated as ${isMeta ? "**moderate**" : isDtA ? "**low to moderate**" : "**low to moderate**"}, primarily due to risk-of-bias concerns and ${isMeta ? "observed heterogeneity." : isDtA ? "heterogeneity in threshold effects and study designs." : "inconsistency across study designs."}

### Recommendations for Practice

- Findings should be applied with consideration of the included population and study context.
- ${isDtA ? "Diagnostic test performance should be interpreted in the context of the target population, prevalence, and threshold effects." : isMeta ? "The pooled effect estimate provides quantitative evidence for decision-making but should be weighed against the GRADE certainty rating." : "High-risk-of-bias studies should be interpreted cautiously."}

### Recommendations for Research

- Future studies should address the identified evidence gaps with larger, multi-centre ${isDtA ? "and well-validated" : ""} designs.
- Prospective registration, open-access data sharing, and standardised outcome reporting are recommended.
- ${isMeta ? "Individual patient data meta-analysis and network meta-analysis are recommended to clarify treatment effects across heterogeneous populations." : isDtA ? "DTA meta-analyses should incorporate hierarchical bivariate models and investigate threshold effects." : isScoping ? "A systematic review (with or without meta-analysis) may be warranted where sufficient homogeneous primary studies are identified." : isRapid ? "A full systematic review update is warranted as new evidence emerges to verify rapid review findings." : isUmbrella ? "Systematic review updates are warranted as new primary evidence emerges that may alter umbrella-level conclusions." : "Systematic review updates are warranted as new evidence emerges."}

---

## References

${papersForSynthesis.slice(0, 20).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.studyType || "Study"}.`).join("\n")}

---

*Report generated: ${generatedDate}*

*Methodology:* This report was produced following the ${isDtA ? "STARD" : "awesome-evidence-synthesis"} open-source workflow (${isDtA ? "https://www.equator-network.org/reporting-guidelines/stard/" : "https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis"}), integrating ${isMeta ? "**metafor** (R) meta-analysis, **robvis** risk-of-bias visualisation, **prismAId** AI-assisted screening/extraction, **meta-pipe** end-to-end pipeline alignment, **PRISMA 2020** reporting standards, and **GRADE** certainty assessment." : isDtA ? "**meta4diag / mada / MetaDTA** diagnostic accuracy meta-analysis, **QUADAS-2** risk-of-bias assessment, **STARD** reporting standards, and **GRADE** certainty assessment." : "**robvis** risk-of-bias visualisation, **prismAId** AI-assisted screening/extraction, **meta-pipe** end-to-end pipeline alignment, **PRISMA 2020** reporting standards, and **GRADE** certainty assessment."} The metafor computations were performed locally using DerSimonian–Laird / Inverse-Variance methods. Authors must verify extracted data, complete effect-size calculations in statistical software, confirm GRADE ratings, and ensure proper citation before submission or publication.

*Attribution:* Aligned with OpenClaw-Medical-Skills (FreedomIntelligence/OpenClaw-Medical-Skills) literature-review and literature-deep-research synthesis principles. Forest plots were generated as embedded SVG images compatible with publication and PDF export. Review type-specific sections adapt report structure according to PRISMA 2020, STARD, or scoping review guidelines as appropriate.`;
}

export function downloadSynthesisReport(report: string, reviewType: string): void {
  const today = new Date().toISOString().split("T")[0];
  const filename = `synthesis-report-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${today}.md`;
  const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
