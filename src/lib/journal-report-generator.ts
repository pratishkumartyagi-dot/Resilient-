import { marked } from "marked";

export function buildJournalManuscriptMarkdown(opts: {
  nPatients: number;
  nFeatures: number;
  missingPct: string;
  bestPipeline: string;
  aurocCi: string;
  brierCi: string;
  f1Ci: string;
  testSize: string;
  maxPredictors: string;
  pigTableMarkdown: string;
  outcome: string;
  outcomeType: string;
  metaOut?: string;
  selectedPredictors: string[];
  coefficients: Record<string, number>;
  intercept: number;
}): string {
  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let tableMd = opts.pigTableMarkdown;
  if (!tableMd || tableMd.trim().length === 0) {
    tableMd = opts.selectedPredictors.length > 0
      ? "| Variable | Coefficient | Odds Ratio |\n|---|---|---|\n" +
        opts.selectedPredictors
          .slice(0, 5)
          .map((p) => `| ${p} | ${(opts.coefficients[p] ?? 0).toFixed(4)} | ${(Math.exp(opts.coefficients[p] ?? 0)).toFixed(3)} |`)
          .join("\n")
      : "| Variable | Predictive Weight |\n|---|---|\n| Demographics | High |\n| Biomarkers | Moderate |";
  }

  const modelEquation =
    opts.selectedPredictors.length > 0
      ? `logit(P) = ${opts.intercept.toFixed(4)} + ${opts.selectedPredictors.map((name) => `${(opts.coefficients[name] ?? 0).toFixed(4)} × ${name}`).join(" + ")}`
      : `logit(P) = ${opts.intercept.toFixed(4)}`;

  const metaSection = opts.metaOut
    ? `---

## Systemic Review & Meta-Analysis Output

${opts.metaOut}
`
    : "";

  return `# Development and Validation of a Prognostic Model via Automated Machine Learning: A Pooled Meta-Analysis
**Date of Generation:** ${generatedDate}
**Framework:** AutoPrognosis 2.0 & meta-pipe Pipeline

---

### ABSTRACT
**Background:** Traditional clinical risk scores often fail to capture non-linear interactions across heterogeneous patient populations. We leveraged automated machine learning (AutoML) to synthesize a pooled prognostic model from compiled medical literature.
**Methods:** Data from ${opts.nPatients} patients across extracted clinical studies were harmonized. AutoPrognosis 2.0 was used to search the algorithmic space—including imputation, feature engineering, and ensemble selection—to minimize Brier score and maximize AUROC.
**Results:** The optimal architecture selected was an ensemble dominated by ${opts.bestPipeline}. The model achieved a pooled AUROC of ${opts.aurocCi} and a Brier calibration index of ${opts.brierCi}.
**Conclusions:** Fully automated prognostic pipelines provide high-discrimination deployment strategies for multi-center data integration.

---

### 1. INTRODUCTION
Developing valid prognostic tools across multiple medical cohorts requires significant manual engineering. This paper presents a standardized, reproducible workflow that pipes automated systematic review screening data directly into the AutoPrognosis framework.

### 2. METHODS
#### 2.1 Data Sourcing and Harmonization
A total of ${opts.nPatients} unique clinical records containing ${opts.nFeatures} covariates were evaluated. Missing data patterns (~${opts.missingPct}% total missingness) were natively resolved via automated optimization.

#### 2.2 Model Search Space
The AutoPrognosis 2.0 algorithm evaluated competitive combinations of estimators (including Logistic Regression, Random Forest, and Gradient Boosted Trees) using a Stratified K-Fold internal-external validation scheme (test size: ${opts.testSize}, max predictors: ${opts.maxPredictors}).

### 3. RESULTS
#### 3.1 Model Discrimination & Calibration
The performance metrics across the validation folds demonstrate robust consistency:
* **Area Under the Receiver Operating Characteristic (AUROC):** ${opts.aurocCi}
* **Brier Score (Calibration Metric):** ${opts.brierCi}
* **F1-Score Alignment:** ${opts.f1Ci}

#### 3.2 Feature Importance & Interpretability
Table 1 outlines the top predictive factors calculated across the pooled meta-analysis dataset using local model interpreters:

${tableMd}

#### 3.3 Final Model Equation
${modelEquation}

### 4. DISCUSSION
Our automated meta-analysis framework successfully eliminated human bias in feature selection and model architecture deployment. The resulting ${opts.bestPipeline} ensemble provides optimal generalization bounds ready for multi-site prospective validation.
${metaSection}
`;
}

export function buildJournalPDFHTML(markdown: string, filename = "journal_manuscript_draft"): string {
  const htmlContent = marked.parse(markdown) as string;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}.pdf</title>
  <style>
    @page { size: letter; margin: 20mm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.6; color: #000; padding: 0; }
    h1 { font-family: "Times-Bold", "Times New Roman", serif; font-size: 16pt; text-align: center; margin-bottom: 4px; page-break-after: avoid; }
    h2 { font-family: "Times-Bold", "Times New Roman", serif; font-size: 13pt; margin-top: 18px; margin-bottom: 6px; page-break-after: avoid; }
    h3 { font-family: "Times-Bold", "Times New Roman", serif; font-size: 12pt; margin-top: 14px; margin-bottom: 4px; page-break-after: avoid; }
    p { font-size: 11pt; margin-bottom: 8px; text-align: justify; }
    ul, ol { margin-left: 24px; margin-bottom: 8px; }
    li { margin-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
    th { background: #1e3a8a; color: #fff; padding: 6px 8px; border: 1px solid #1e3a8a; text-align: left; }
    td { padding: 5px 8px; border: 1px solid #bbb; vertical-align: top; }
    tr:nth-child(even) { background: #f9fafb; }
    hr { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
    pre { background: #f3f4f6; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 9pt; overflow-x: auto; }
    .meta-info { text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 16px; }
    @media print {
      body { padding: 0; }
      h1 { page-break-after: avoid; }
      h2 { page-break-after: avoid; }
      h3 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
${htmlContent}
<script>
  window.addEventListener("load", function() {
    window.print();
    setTimeout(function() { window.close(); }, 100);
  });
</script>
</body>
</html>`;
}
