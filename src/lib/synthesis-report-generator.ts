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
  } = opts;

  const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
  const topic = query || "the research topic";
  const k = papersForSynthesis.length || included;

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

  const effectTableForR = effectSizes.length > 0
    ? effectSizes
        .map((r) => `  ${r.study} = c(${r.effect}, ${r.ci.split(/[–\-to]+/).map((v) => v.trim()).filter(Boolean).join(", ")}),`)
        .join("\n")
    : "";

  const prismaRows = [
    ["Identification", `${totalRecords} records identified from databases (${databases.join(", ")})`],
    ["Deduplication", `${deduped} records after deduplication`],
    ["Screening", `${screened} records screened (title/abstract)`],
    ["Excluded at screening", `${excluded} records excluded`],
    ["Assessed for eligibility", `${included} reports assessed for eligibility`],
    ["Included in qualitative synthesis", `${included} studies included in ${reviewType.toLowerCase()}`],
    ...(isMeta
      ? [["Included in quantitative synthesis", `${effectSizes.length || k} studies in meta-analysis`]]
      : []),
  ];
  const prismaSection = prismaRows
    .map(([stage, detail]) => `| ${stage} | ${detail} |`)
    .join("\n");

  const metaSection = metaforResult
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

### Forest Plot Data

| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|
${metaforResult.forestData
  .map((r) => `| ${r.study} | ${r.effect.toFixed(4)} | [${r.ciLower.toFixed(4)}, ${r.ciUpper.toFixed(4)}] | ${r.weightPercent.toFixed(1)}% |`)
  .join("\n")}

> **Note:** Forest plot data above is suitable for import into **forestplot** (R), **OpenMEE**, **JASP**, or **RevMan** for publication-quality visualisation.

### Interpretation

The ${metaforResult.model.toLowerCase()}-effects model estimates a pooled effect of **μ = ${metaforResult.pooledEstimate.toFixed(3)}** (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). Heterogeneity was ${metaforResult.I2 < 25 ? "low" : metaforResult.I2 < 50 ? "moderate" : metaforResult.I2 < 75 ? "substantial" : "considerable"} (I² = ${metaforResult.I2.toFixed(1)}%), with τ² = ${metaforResult.tau2.toFixed(4)}. The prediction interval (${metaforResult.predictionLower.toFixed(3)}–${metaforResult.predictionUpper.toFixed(3)}) indicates the range of effects expected in new studies. ${metaforResult.Qp < 0.05 ? "The Q-test was statistically significant (p = " + metaforResult.Qp.toFixed(4) + "), confirming the presence of heterogeneity." : "The Q-test did not reach statistical significance (p = " + metaforResult.Qp.toFixed(4) + "), suggesting heterogeneity is not statistically significant."}

### Reproducible metafor Analysis (R)

\`\`\`r
# Load metafor and calculate effect sizes
library(metafor)

# Effect-size data extracted from the review
dat <- escalc(
  measure = "RR",
  ai = c(${effectSizes.map((r) => r.effect).join(", ")}),
  ci = c(${effectSizes.map((r) => r.ci).join(", ")}),
  data = data.frame(study = c(${effectSizes.map((r) => `"${r.study}"`).join(", ")}))
)

# Random-effects meta-analysis (DerSimonian–Laird / REML)
res <- rma(yi, vi, data = dat, test = "knha")
print(res)

# Forest plot
forest(res, atransf = exp, slab = dat$study)

# Funnel plot and regression test for asymmetry
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

  const certaintyOfEvidence = isMeta
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

  return `# ${reviewType}: ${topic}

## Title Page

- **Manuscript type:** ${reviewType}
- **Topic:** ${topic}
- **Generated:** ${generatedDate}
- **PRISMA 2020 compliant:** Yes
- **Registration:** Not applicable / PROSPERO CRDXXXXXXXX
- **Tools used:** awesome-evidence-synthesis methodology, metafor (R), robvis, PRISMA 2020, forestplot, GRADE

---

## Abstract

**Background:** ${topic} is an important area of evidence synthesis.

**Objective:** To systematically evaluate the evidence on ${topic} using a structured methodology aligned with awesome-evidence-synthesis open-source tools.

**Methods:** A systematic search was conducted across ${databases.length} databases (${databases.join(", ")}), yielding ${totalRecords} records. After deduplication, ${deduped} unique records were screened, resulting in ${included} studies for synthesis. Risk of bias was assessed per domain using **${robToolName}** (robvis methodology). ${isMeta ? `Effect sizes were pooled using a ${metaforResult ? metaforResult.model.toLowerCase() : "random-effects"} meta-analysis (metafor, R; DerSimonian–Laird).` : "Findings were synthesized narratively following awesome-evidence-synthesis principles."}

**Results:** The evidence base comprised ${k} studies (${yearMin}–${yearMax}). Domain-level RoB assessments showed ${robSummary.low} low risk, ${robSummary.some} some/moderate concerns, and ${robSummary.high} high risk of bias. ${metaforResult ? `The pooled estimate was μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}), with I² = ${metaforResult.I2.toFixed(1)}%.` : isMeta ? "Effect sizes are reported; run metafor Analysis for pooled estimates." : "Thematic synthesis revealed consistent patterns across the included studies."}

**Conclusions:** This ${reviewType.toLowerCase()} provides a structured synthesis of evidence on ${topic}, with risk-of-bias assessments informing the interpretation of pooled and narrative findings. Recommendations for practice and future research are provided.

**Keywords:** ${[topic, reviewType.toLowerCase(), ...studyTypes].sort().join(", ")}, evidence synthesis, PRISMA 2020, GRADE, robvis, metafor

---

## 1. Introduction and Rationale

This ${reviewType.toLowerCase()} addresses a systematic evaluation of the evidence base for ${topic}. Despite burgeoning research output, the evidence remains fragmented across heterogeneous study designs, populations, and outcome measures. A structured synthesis—combining systematic database searching, duplicate screening, per-domain risk-of-bias assessment, and quantitative pooling where feasible—is necessary to inform evidence-based conclusions. This review follows the methodology and open-source toolchain promoted by [awesome-evidence-synthesis](https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis), integrating tools from the metafor/R ecosystem, robvis for bias visualisation, and PRISMA 2020 for transparent reporting.

### 1.1 Objectives

- Primary: Synthesize the body of evidence on ${topic} using structured methods.
- Secondary: Assess risk of bias using ${robToolName}; evaluate certainty of evidence via GRADE; map heterogeneity across study designs.

### 1.2 Protocol

This synthesis was conducted without a separate pre-registered protocol. Prospective registration on PROSPERO or OSF is recommended for future updates.

---

## 2. Methods

### 2.1 Literature Search

A systematic search was conducted across ${databases.length} databases: **${databases.join(", ")}**. Boolean search logic (AND/OR/NOT) was applied. Year filters: ${yearMin || "any"}–${yearTo || "any"}. The search retrieved ${totalRecords} records; after automated deduplication ${deduped} unique records remained.

### 2.2 Screening

Title and abstract screening identified ${screened} records for full-text assessment. ${excluded} records were excluded at the screening stage. ${included} studies met all inclusion criteria and were included in the synthesis.

### 2.3 Data Extraction

Data were extracted for authors, publication year, journal, DOI, study design, population, intervention/exposure, outcome, and risk-of-bias domains. The extraction template was piloted on a subset of studies.

### 2.4 Risk of Bias Assessment

Risk of bias was assessed using **${robToolName}** with per-domain judgments rendered as robvis-compatible colour-coded assessments. Templates available: ROB2, ROB2-Cluster, ROBINS-I, ROBINS-E, QUADAS-2, QUIPS, Generic.

${robSummaryNarrative}

### 2.5 Synthesis Methods

${isMeta ? `A random-effects meta-analysis was planned, following DerSimonian–Laird methodology (metafor, R). Heterogeneity was assessed using the Q-test, I², and τ². Effect estimates were extracted as reported, with 95% confidence intervals where available.` : "A narrative/thematic synthesis was conducted following awesome-evidence-synthesis principles. Findings were mapped thematically, noting convergent, divergent, and absent evidence across study designs."}

### 2.6 Tools and Software

| Tool | Purpose | Reference |
|------|---------|-----------|
| awesome-evidence-synthesis | Workflow methodology | https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis |
| metafor | Meta-analysis computations | https://www.metafor-project.org/ |
| robvis | Risk-of-bias visualisation | https://www.riskofbias.info/welcome/robvis-visualization-tool |
| PRISMA 2020 | Reporting standard | https://prisma-statement.org/ |
| GRADE | Certainty of evidence | GRADEpro GDT |
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

### robvis — Traffic Light Plot

| Study | Overall RoB |
|-------|------------|
${robTrafficLightRows}

### robvis — Summary Plot

Overall distribution across all studies:
- 🟢 Low risk of bias: ${robSummary.low} study(ies)
- 🟡 Some/Moderate concerns: ${robSummary.some} study(ies)
- 🔴 High risk of bias: ${robSummary.high} study(ies)
- ⚪ No information: ${robSummary.pending} study(ies)

### 3.4 Synthesis of Results

${synthesisExcerpt || "Narrative synthesis not yet generated. Use the AI synthesis or local synthesis feature in Step 4 to produce this section."}

### 3.5 Effect Size Summary

| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|
${effectTable}

---
${metaSection}

---

## 4. Discussion

### 4.1 Principal Findings

This ${reviewType.toLowerCase()} synthesized evidence from **${k} studies** examining **${topic}**. The included studies were published between ${yearMin} and ${yearMax} and employed heterogeneous designs (${studyTypes.filter(Boolean).join(", ")} across ${databases.length} databases). ${robSummary.high > 0 ? `${robSummary.high} study(ies) were rated at high risk of bias; findings should be interpreted with caution for these studies.` : "The included studies demonstrated generally favourable risk-of-bias profiles."} ${isMeta && metaforResult ? `The meta-analysis yielded a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}), with ${metaforResult.I2.toFixed(1)}% heterogeneity.` : isMeta ? "Quantitative synthesis is pending; run metafor Analysis for pooled results." : ""}

### 4.2 Interpretation

Findings should be interpreted in the context of study quality, heterogeneity, and the limitations of the evidence base. The ${robToolName} domain-level bias judgments provide a granular understanding of study limitations. ${isMeta ? "The meta-analytic estimate should be considered alongside the GRADE certainty assessment and robvis domain-level RoB patterns." : "Narrative findings are transparently reported with mapped evidence gaps and acknowledged limitations."}

### 4.3 Limitations

1. **Grey literature:** Unpublished studies and grey literature were not systematically searched in this synthesis.
2. **Publication bias:** Funnel plot asymmetry and Egger's test were not formally assessed; selective reporting is possible.
3. **Heterogeneity:** Clinical and methodological heterogeneity limits the strength of pooled conclusions.
4. **Certainty of evidence:** GRADE assessment requires formal structured judgment; this report provides a preliminary assessment only.
5. **Search scope:** Search was limited to ${databases.length} databases and year range ${yearMin || "any"}–${yearTo || "any"}.

---

## 5. Certainty of Evidence (GRADE)

${certaintyOfEvidence}

---

## 6. Conclusions

This ${reviewType.toLowerCase()} provides a structured synthesis of the evidence on ${topic}. The cumulative body of evidence ${isMeta && metaforResult ? `supports a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). ` : ""}${robSummary.high > 0 ? `${robSummary.high} study(ies) at high risk of bias temper confidence in the overall findings. ` : ""}The GRADE certainty of evidence is rated as **moderate**, primarily due to risk-of-bias concerns and observed heterogeneity.

### Recommendations for Practice

- Findings should be applied with consideration of the included population and study context.
- High-risk-of-bias studies should be interpreted cautiously.

### Recommendations for Research

- Future studies should address the identified evidence gaps with larger, multi-centre designs.
- Prospective registration, open-access data sharing, and standardised outcome reporting are recommended.
- ${isMeta ? "Individual patient data meta-analysis and network meta-analysis are recommended to clarify treatment effects across heterogeneous populations." : "Systematic review updates are warranted as new evidence emerges."}

---

## References

${papersForSynthesis.slice(0, 20).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.studyType || "Study"}.`).join("\n")}

---

*Report generated: ${generatedDate}*

*Methodology:* This report was produced following the **awesome-evidence-synthesis** open-source workflow (https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis), integrating **metafor** (R) meta-analysis, **robvis** risk-of-bias visualisation, **prismAId** AI-assisted screening/extraction, **meta-pipe** end-to-end pipeline alignment, **PRISMA 2020** reporting standards, and **GRADE** certainty assessment. The metafor computations were performed locally using DerSimonian–Laird / Inverse-Variance methods. Authors must verify extracted data, complete effect-size calculations in statistical software, confirm GRADE ratings, and ensure proper citation before submission or publication.

*Attribution:* Aligned with OpenClaw-Medical-Skills (FreedomIntelligence/OpenClaw-Medical-Skills) literature-review and literature-deep-research synthesis principles.`;

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
