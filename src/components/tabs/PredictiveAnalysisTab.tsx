"use client";

import React, { useEffect, useState } from "react";
import {
  FlaskConical, Key, CheckCircle2, Loader2,
  Brain, Upload, BarChart3, LineChart, FileText, Sparkles, ArrowRight, ArrowLeft, Target, Calculator,
  Download, ToggleLeft, FileSpreadsheet, AlertCircle, Zap
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek } from "@/lib/ai";

// Lazy-load heavy doc exporters on demand so docx stays out of the initial
// preview bundle.
async function exportPredictiveDoc(kind: "word" | "pdf", content: string, filename: string) {
  const mod = await import("@/lib/exporters");
  if (kind === "word") await mod.downloadMarkdownAsWord(content, filename);
  else await mod.downloadMarkdownAsPDF(content, filename);
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

// RFC-4180-ish CSV parser: handles quoted fields, escaped "" and commas inside
// quotes, plus both LF and CRLF line endings.
function parseCsv(text: string): ParsedTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const cleaned = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (cleaned.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = cleaned;
  return { headers, rows: dataRows };
}

function formatTable(table: ParsedTable, maxRows: number, maxChars: number): string {
  if (table.headers.length === 0) return "(no parsed tabular data)";
  const lines = [table.headers.join(" | ")];
  for (const r of table.rows.slice(0, maxRows)) lines.push(r.join(" | "));
  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n...[truncated]";
  return out;
}

function describeTable(table: ParsedTable): string {
  return "Headers: " + table.headers.join(", ") + "\n\nFirst rows:\n" + table.rows.slice(0, 10).map((r) => r.join(", ")).join("\n");
}

async function readTableAsCsv(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return await file.text();
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(worksheet);
  }
  throw new Error("Unsupported file type. Please upload CSV, .xls, or .xlsx.");
}

interface RileyResult {
  events: number;
  predictors: number;
  r2: number;
  sampleSize: number;
  requiredEvents: number;
  epp: number;
  prevalence: number;
  criteria: { label: string; n: number }[];
}

const clampNumber = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Riley et al. (2019) binary-outcome minimum sample size, mirroring the three
// pmsampsize criteria. Prevalence is inferred from the entered event count so
// that the entered events genuinely influence the result.
function rileyBinarySampleSize(events: number, predictors: number, r2: number): RileyResult | null {
  if (!Number.isFinite(events) || !Number.isFinite(predictors) || !Number.isFinite(r2)) return null;
  if (events <= 0 || predictors <= 0 || r2 <= 0) return null;

  const shrinkage = 0.9;
  const r = clampNumber(r2, 0.001, shrinkage * 0.999);
  const n1 = Math.ceil(predictors / ((shrinkage - 1) * Math.log(1 - r / shrinkage)));
  const prevalence = clampNumber(events / n1, 0.001, 0.999);

  const e1 = n1 * prevalence;
  const lnLnull = e1 > 0 && n1 - e1 > 0
    ? e1 * Math.log(e1 / n1) + (n1 - e1) * Math.log(1 - e1 / n1)
    : Math.log(0.5) * n1;
  const maxR2a = 1 - Math.exp((2 * lnLnull) / n1);
  const s4 = maxR2a > 0 ? r / (r + 0.05 * maxR2a) : shrinkage;
  const n2 = s4 < 1
    ? Math.ceil(predictors / ((s4 - 1) * Math.log(1 - r / s4)))
    : n1;
  const n3 = Math.ceil(Math.pow(1.96 / 0.05, 2) * prevalence * (1 - prevalence));

  const sampleSize = Math.max(n1, n2, n3);
  const requiredEvents = Math.ceil(sampleSize * prevalence);

  return {
    events,
    predictors,
    r2: r,
    sampleSize,
    requiredEvents,
    epp: requiredEvents / predictors,
    prevalence,
    criteria: [
      { label: "Shrinkage \u2265 0.9", n: n1 },
      { label: "|\u0394R\u00b2| \u2264 0.05", n: n2 },
      { label: "Precise risk estimate", n: n3 },
    ],
  };
}

interface DcaRow {
  threshold: number;
  treatAll: number;
  treatNone: number;
  model: number;
}

// Decision-curve net benefit across a threshold range. The model curve assumes
// sensitivity = specificity = 0.70 (documented in the UI) since no predictions
// are available at this stage.
function computeDecisionCurve(minPct: number, maxPct: number, eventRatePct: number, steps = 6): DcaRow[] | null {
  if (!Number.isFinite(minPct) || !Number.isFinite(maxPct) || !Number.isFinite(eventRatePct)) return null;
  if (maxPct <= minPct || eventRatePct <= 0 || eventRatePct >= 100) return null;

  const p = eventRatePct / 100;
  const sens = 0.7;
  const spec = 0.7;
  const rows: DcaRow[] = [];
  for (let i = 0; i < steps; i++) {
    const pt = (minPct + ((maxPct - minPct) * i) / (steps - 1)) / 100;
    if (pt <= 0 || pt >= 1) continue;
    const odds = pt / (1 - pt);
    rows.push({
      threshold: pt,
      treatAll: p - (1 - p) * odds,
      treatNone: 0,
      model: sens * p - (1 - spec) * (1 - p) * odds,
    });
  }
  return rows;
}

const renderMarkdown = (text: string): string => {
  let html = text;
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, '<pre class="bg-black/30 p-2 rounded text-xs overflow-x-auto"><code>$2</code></pre>');
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  html = html.replace(/\n/g, "<br/>");
  return html;
};

const PREDICTION_STEPS = [
  { num: 1, label: "Aims & Protocol", icon: FileText },
  { num: 2, label: "Model Strategy", icon: Brain },
  { num: 3, label: "Outcome Definition", icon: Target },
  { num: 4, label: "Predictor Selection", icon: Key },
  { num: 5, label: "Data Collection", icon: Upload },
  { num: 6, label: "Sample Size", icon: Calculator },
  { num: 7, label: "Missing Data", icon: LineChart },
  { num: 8, label: "Model Fitting", icon: FlaskConical },
  { num: 9, label: "Performance", icon: BarChart3 },
  { num: 10, label: "Final Model", icon: CheckCircle2 },
  { num: 11, label: "Decision Curve", icon: ArrowRight },
  { num: 12, label: "Predictor Importance", icon: Sparkles },
  { num: 13, label: "Report & Publish", icon: FileText },
  { num: 14, label: "CSV Prediction", icon: FileSpreadsheet },
  { num: 15, label: "LR Modeling & Variable Selection", icon: Calculator },
];

const OUTCOME_TYPES = ["binary", "continuous", "survival", "competing_risk"];
const MODEL_TYPES = [
  "Logistic Regression",
  "Cox Proportional Hazards",
  "Random Forest",
  "Gradient Boosting (XGBoost/LightGBM)",
  "Transformer (PyHealth)",
  "RNN/LSTM/GRU",
  "MLP",
  "RETAIN",
];

export default function PredictiveAnalysisTab() {
  const { state, dispatch } = useApp();
  const [localLoading, setLocalLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState<{ step: number; text: string } | null>(null);
  const [dataPreview, setDataPreview] = useState<string | null>(null);
  const [relationshipEnabled, setRelationshipEnabled] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [relationshipResults, setRelationshipResults] = useState<string | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [captumMethod, setCaptumMethod] = useState<string>("integrated_gradients");
  const [setting, setSetting] = useState("Primary Care / Hospital");
  const [intendedUsers, setIntendedUsers] = useState("Clinicians, Patients, Researchers");
  const [expectedR2, setExpectedR2] = useState("0.2");
  const [dcaEventRate, setDcaEventRate] = useState("20");
  const step = state.predictionStep;
  // AI output is scoped to the step it was generated for, so switching steps
  // never shows stale output under the next step.
  const aiText = aiOutput && aiOutput.step === step ? aiOutput.text : "";

  // Rehydrate a locally-lost File from context (e.g. after switching tabs).
  useEffect(() => {
    if (csvFile || !state.predictionDataFile) return;
    let cancelled = false;
    const file = state.predictionDataFile;
    readTableAsCsv(file)
      .then((text) => {
        if (cancelled) return;
        setCsvFile(file);
        setCsvPreview(describeTable(parseCsv(text)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [csvFile, state.predictionDataFile]);

  const handleNext = () => {
    if (step < 15) dispatch({ type: "SET_PREDICTION_STEP", payload: step + 1 });
  };

  const handlePrev = () => {
    if (step > 1) dispatch({ type: "SET_PREDICTION_STEP", payload: step - 1 });
  };

  const runAi = async (prompt: string, fallback: string): Promise<string> => {
    try {
      let response = "";
      if (state.geminiApiKey) response = await callGemini(state.geminiApiKey, prompt);
      else if (state.groqApiKey) response = await callGroq(state.groqApiKey, prompt);
      else response = await callDeepSeek(prompt);
      const trimmed = (response ?? "").trim();
      return trimmed || fallback;
    } catch {
      return fallback;
    }
  };

  const parseStep6 = () => {
    const [e, p] = state.predictionSampleSize.split("|");
    return { events: parseFloat(e), predictors: parseFloat(p), r2: parseFloat(expectedR2) };
  };

  const parseStep11 = () => {
    const minPct = parseFloat(state.predictionDcaMinThreshold);
    const maxPct = parseFloat(state.predictionDcaMaxThreshold);
    return { minPct, maxPct, eventRatePct: parseFloat(dcaEventRate), rows: computeDecisionCurve(minPct, maxPct, parseFloat(dcaEventRate)) };
  };

  const uploadedTableText = () => (dataPreview ? formatTable(parseCsv(dataPreview), 30, 4000) : "(no dataset uploaded)");

  const pipelineSummary = () => [
    `- Population: ${state.predictionPopulation || "not specified"}`,
    `- Outcome: ${state.predictionOutcome || "not specified"} (${state.predictionOutcomeType})`,
    `- Model strategy: ${state.predictionModelStrategy || "not chosen"}`,
    `- Predictors: ${state.predictionPredictors || "not specified"}`,
    `- Sample-size inputs (events|predictors): ${state.predictionSampleSize || "not specified"}`,
    `- Missing data strategy: ${state.predictionMissingDataStrategy || "not chosen"}`,
    `- Model type: ${state.predictionModelType || "not chosen"}`,
    `- Performance notes: ${state.predictionPerformance || "none"}`,
    `- Final model rationale: ${state.predictionModelResult || "none"}`,
  ].join("\n");

  const buildStepAi = (current: number): { prompt: string; fallback: string } => {
    const outcome = state.predictionOutcome || "the outcome";
    switch (current) {
      case 1: {
        const prompt = `Draft a clinical prediction model protocol based on: target population: ${state.predictionPopulation || "not specified"}, outcome: ${outcome}, healthcare setting: ${setting || "not specified"}, intended users: ${intendedUsers || "not specified"}. Follow TRIPOD reporting guidelines.`;
        const fallback = `### Protocol draft (offline)\n- Target population: ${state.predictionPopulation || "not specified"}\n- Outcome: ${outcome}\n- Setting: ${setting || "not specified"}\n- Intended users: ${intendedUsers || "not specified"}\n\nAI providers are unavailable; refine the fields above and retry for a full TRIPOD protocol draft.`;
        return { prompt, fallback };
      }
      case 2: {
        const strategyLabel = state.predictionModelStrategy === "new"
          ? "develop a new model"
          : state.predictionModelStrategy === "update"
          ? "update an existing model"
          : "not yet chosen";
        const prompt = `Recommend whether to develop a new prediction model or update an existing one, following the step-by-step guide in Efthimiou et al. (BMJ 2024, PMC11369751). The user selected: ${strategyLabel}. If data is limited, note that PyHealth trainers with penalisation (ridge/LASSO) can help prevent overfitting. Justify with 3 bullets.`;
        const fallback = `### Model strategy (offline)\nSelected strategy: ${strategyLabel}\nOutcome: ${outcome} (${state.predictionOutcomeType}).\n\nAI providers are unavailable; document whether a new model or an update is justified by the available data.`;
        return { prompt, fallback };
      }
      case 3:
        return {
          prompt: `For a ${state.predictionOutcomeType} outcome named "${outcome}", suggest the best definition and measurement approach following the PROGRESS/TRIPOD framework (Efthimiou et al., BMJ 2024). Include guidance on when to prefer time-to-event over binary outcomes to avoid loss of information.`,
          fallback: `### Outcome definition (offline)\nOutcome: ${outcome}\nType: ${state.predictionOutcomeType}\n\nAI providers are unavailable; define the outcome and its measurement window per TRIPOD/PROGRESS.`,
        };
      case 4: {
        const predictors = state.predictionPredictors || "(none entered)";
        return {
          prompt: `Given outcome "${outcome}", the user entered these candidate predictors:\n${predictors}\n\nSuggest 8-10 additional candidate baseline predictors that are routinely available in clinical practice, aligned with predictor-selection guidance in Efthimiou et al. (BMJ 2024, PMC11369751). Explain why each should be included and reference PyHealth standardised code maps (ICD, ATC, RxNorm) where applicable.`,
          fallback: `### Predictor review (offline)\nEntered predictors:\n${predictors}\n\nAI providers are unavailable; review this list for availability at prediction time and clinical plausibility.`,
        };
      }
      case 5:
        return {
          prompt: `Review the following uploaded dataset (headers and first rows) for a clinical prediction model and advise on data collection and quality, following steps 5 and 7 in Efthimiou et al. (BMJ 2024, PMC11369751). Include handling of measurement errors, variable distributions, and missing data patterns. Reference PyHealth dataset formats (MIMIC-IV, eICU, OMOP) where relevant.\n\nUploaded data:\n${uploadedTableText()}`,
          fallback: `### Data review (offline)\n${dataPreview ? "Parsed dataset preview:\n" + uploadedTableText() : "No dataset uploaded yet."}\n\nAI providers are unavailable; upload a CSV/Excel file and retry.`,
        };
      case 6: {
        const { events, predictors, r2 } = parseStep6();
        const riley = rileyBinarySampleSize(events, predictors, r2);
        const computed = riley
          ? `minimum sample size n=${riley.sampleSize}, required events=${riley.requiredEvents}, events per parameter=${riley.epp.toFixed(1)}, implied outcome prevalence=${(riley.prevalence * 100).toFixed(1)}%`
          : "not computable from the current inputs";
        return {
          prompt: `Estimate sample size requirements for a binary outcome. User inputs: events=${Number.isFinite(events) ? events : "not specified"}, number of candidate predictors=${Number.isFinite(predictors) ? predictors : "not specified"}, expected R²=${Number.isFinite(r2) ? r2 : "not specified"}. Local Riley-style calculation: ${computed}. Discuss this result following Riley-style guidance referenced in Efthimiou et al. (BMJ 2024, PMC11369751). Note that ML models require several times larger samples than standard statistical models, and that PyHealth Trainer with early stopping/penalisation can mitigate overfitting.`,
          fallback: `### Sample size (offline Riley-style calculation)\n- Events: ${Number.isFinite(events) ? events : "not specified"}\n- Predictors: ${Number.isFinite(predictors) ? predictors : "not specified"}\n- Expected R²: ${Number.isFinite(r2) ? r2 : "not specified"}\n${riley ? `- Riley minimum sample size: ${riley.sampleSize}\n- Required events: ${riley.requiredEvents}\n- Events per parameter: ${riley.epp.toFixed(1)}` : "- Calculation unavailable; enter valid values."}\n\nAI providers are unavailable; the deterministic calculation above is shown.`,
        };
      }
      case 7: {
        const strategy = state.predictionMissingDataStrategy || "not selected";
        return {
          prompt: `Compare missing data strategies (multiple imputation vs single imputation vs complete case vs model-based handling) for a ${state.predictionOutcomeType} prediction model. The user selected: ${strategy}. Follow step 7 in Efthimiou et al. (BMJ 2024, PMC11369751). Recommend one strategy and explain how to implement it in a prediction pipeline using PyHealth-compatible preprocessing (e.g., sklearn.impute.IterativeImputer or native model handling).`,
          fallback: `### Missing data (offline)\nSelected strategy: ${strategy}\n\nAI providers are unavailable; document the chosen handling and whether it avoids leakage at prediction time.`,
        };
      }
      case 8: {
        const modelType = state.predictionModelType || "not selected";
        const captum = state.predictionCaptumEnabled ? `enabled (method: ${captumMethod})` : "disabled";
        return {
          prompt: `Recommend a modelling strategy for a ${state.predictionOutcomeType} outcome. User selections — model type: ${modelType}; Captum reasoning: ${captum}. Follow step 8 in Efthimiou et al. (BMJ 2024, PMC11369751). Suggest 2-3 candidate models from PyHealth (e.g., Transformer, RETAIN, logistic regression, Cox, RF, XGBoost) and provide hyperparameter guidance, penalisation strategy (ridge/LASSO), and validation approach. ${state.predictionCaptumEnabled ? `For the enabled Captum method (${captumMethod}), explain how to use Captum (https://github.com/meta-pytorch/captum) for model interpretability and reasoning — including Integrated Gradients, DeepLift, and feature ablation to understand predictor contributions.` : "For deep learning models (Transformer, RNN/LSTM/GRU, MLP, RETAIN), explain how to use Captum (https://github.com/meta-pytorch/captum) for model interpretability and reasoning — including Integrated Gradients, DeepLift, and feature ablation."}`,
          fallback: `### Model configuration (offline)\nModel type: ${modelType}\nCaptum reasoning: ${captum}\n\nAI providers are unavailable; fit the selected model with penalisation and internal validation.`,
        };
      }
      case 9: {
        const notes = state.predictionPerformance || "(none entered)";
        return {
          prompt: `For a ${state.predictionOutcomeType} prediction model, interpret the following performance notes entered by the user:\n${notes}\n\nList the key performance measures (discrimination and calibration) and how to calculate them, following step 9 in Efthimiou et al. (BMJ 2024, PMC11369751) and PyHealth metrics conventions. Include AUC, calibration slope, Brier score, and internal validation guidance (bootstrap or k-fold) for optimism correction. For deep learning models, mention how Captum (https://github.com/meta-pytorch/captum) reasoning can complement traditional performance metrics by providing attribution-based confidence explanations.`,
          fallback: `### Performance interpretation (offline)\nEntered notes:\n${notes}\n\nAI providers are unavailable; compare the reported AUC, calibration slope and Brier score against acceptable thresholds and internal validation.`,
        };
      }
      case 10: {
        const rationale = state.predictionModelResult || "(none entered)";
        return {
          prompt: `Explain how to select the final model using internal validation (bootstrap or k-fold), following step 10 in Efthimiou et al. (BMJ 2024, PMC11369751). The user's selection rationale is:\n${rationale}\n\nInclude advice on the bias-variance trade-off, penalisation, and Occam's razor. Reference PyHealth Trainer output comparison across models. For neural models selected as final, outline a Captum (https://github.com/meta-pytorch/captum) reasoning workflow (Integrated Gradients / DeepLift) to generate explanation artifacts for model deployment and clinical validation.`,
          fallback: `### Final model (offline)\nRationale entered:\n${rationale}\n\nAI providers are unavailable; justify the chosen model on validation performance, simplicity and clinical utility.`,
        };
      }
      case 11: {
        const { minPct, maxPct, eventRatePct, rows } = parseStep11();
        const summary = rows && rows.length
          ? rows.map((r) => `threshold ${(r.threshold * 100).toFixed(1)}%: treat-all ${r.treatAll.toFixed(3)}, treat-none 0.000, model ${r.model.toFixed(3)}`).join("; ")
          : "not computable";
        return {
          prompt: `Explain how to perform and interpret a decision curve analysis for a clinical prediction model, following step 11 in Efthimiou et al. (BMJ 2024, PMC11369751). Threshold range entered by the user: ${minPct}% to ${maxPct}% at an assumed event rate of ${eventRatePct}%. Local net-benefit calculation (model assumes sensitivity = specificity = 0.70): ${summary}. Include net benefit calculation, how to identify the optimal threshold probability, and how to combine this with PyHealth predict_proba() outputs for downstream packages like dcurves.`,
          fallback: `### Decision curve (offline)\nThresholds: ${minPct}%–${maxPct}%, event rate ${eventRatePct}%.\n${rows && rows.length ? rows.map((r) => `- ${(r.threshold * 100).toFixed(1)}%: treat-all ${r.treatAll.toFixed(3)} | treat-none 0.000 | model ${r.model.toFixed(3)}`).join("\n") : "- Net benefit not computable."}\n\nAI providers are unavailable; the deterministic net-benefit table is shown above.`,
        };
      }
      case 12: {
        const method = state.predictionImportanceMethod || "not selected";
        return {
          prompt: `Describe how to assess individual predictor importance using the method selected by the user: ${method}, following the optional step 12 guidance in Efthimiou et al. (BMJ 2024, PMC11369751). Note that SHAP, permutation importance and Captum attributions must be computed externally (e.g., in Python) from model predictions or gradients; this app only interprets the results. Explain how to extract predictions from PyHealth models (predict_proba) and apply these methods for a clinical audience. For deep learning models, emphasize Captum's Integrated Gradients and DeepLift for attribution-based reasoning over SHAP when model gradients are available.`,
          fallback: `### Predictor importance (offline)\nSelected method: ${method}\n\nAI providers are unavailable; compute importances externally (SHAP/permutation/Captum) and interpret the resulting ranking clinically.`,
        };
      }
      case 13: {
        const notes = state.predictionReportNotes || "(none entered)";
        return {
          prompt: `Generate a TRIPOD checklist summary for reporting this clinical prediction model study, following step 13 in Efthimiou et al. (BMJ 2024, PMC11369751). Report notes:\n${notes}\n\nPrior pipeline entries:\n${pipelineSummary()}\n\nInclude model equation, code, and deployment guidance (e.g., FastAPI + HTML calculator). Reference PyHealth export patterns.`,
          fallback: `### TRIPOD report draft (offline)\nReport notes:\n${notes}\n\nPrior pipeline entries:\n${pipelineSummary()}\n\nAI providers are unavailable; complete the TRIPOD checklist using the pipeline entries above.`,
        };
      }
      case 15:
        return {
          prompt: `Provide comprehensive guidance for logistic regression modeling and variable selection for outcome "${outcome}" with candidate predictors:\n${state.predictionPredictors || "(none entered)"}\n\nUploaded data:\n${uploadedTableText()}\n\nCover forward stepwise variable selection, AUC-based evaluation, over-fitting detection, and predictor insights graphs (PIG tables) for clinical prediction models.`,
          fallback: `### LR modeling guidance (offline)\nOutcome: ${outcome}\nPredictors: ${state.predictionPredictors || "(none entered)"}\nUploaded data: ${dataPreview ? "see parsed preview above" : "none uploaded"}\n\nAI providers are unavailable; fit logistic regression with stepwise selection and report AUC with internal validation.`,
        };
      default:
        return { prompt: "Provide guidance for this step.", fallback: "AI providers are unavailable and no deterministic output exists for this step." };
    }
  };

  const handleAiAssist = async () => {
    setLocalLoading(true);
    const generationStep = step;
    const { prompt, fallback } = buildStepAi(generationStep);
    const result = await runAi(prompt, fallback);
    setAiOutput({ step: generationStep, text: result });
    setLocalLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    try {
      dispatch({ type: "SET_PREDICTION_DATA", payload: file });
      setCsvFile(file);
      setCsvPreview(null);

      const text = await readTableAsCsv(file);
      setDataPreview(text);
    } catch (err) {
      console.error("Upload error:", err);
      setDataPreview("Error reading file: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleRelationshipCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setCsvFile(file);
    setRelationshipResults(null);
    setCsvPreview(null);

    try {
      dispatch({ type: "SET_PREDICTION_DATA", payload: file });
      const text = await readTableAsCsv(file);
      setCsvPreview(describeTable(parseCsv(text)));
    } catch (err) {
      console.error("Upload error:", err);
      setCsvPreview("Error reading file: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleRelationshipAnalysis = async () => {
    const file = csvFile || state.predictionDataFile;
    if (!file) return;
    setRelationshipLoading(true);
    setRelationshipResults(null);

    try {
      const text = await readTableAsCsv(file);
      const table = parseCsv(text);

      if (table.headers.length === 0) {
        setRelationshipResults("No tabular data could be parsed from the uploaded file.");
        setRelationshipLoading(false);
        return;
      }

      const tableText = formatTable(table, table.rows.length, 12000);
      const prompt = `You are a data science assistant. Based on the following uploaded dataset (columns and rows), identify the relationships between these factors and predict the likely outcome variable. Columns: ${table.headers.join(", ")}. Data:\n${tableText}\nExplain which columns are likely predictors, which is the outcome, and what relationships exist. Provide a structured analysis (correlations, causal hints, and prediction guidance) in Markdown format.`;
      const fallback = `### Relationship analysis (offline)\nColumns: ${table.headers.join(", ")}\n\nThe AI providers are unavailable. Review the ${table.rows.length} parsed row(s) above and inspect correlations between candidate predictors and the likely outcome externally (e.g., in R/Python).`;

      const response = await runAi(prompt, fallback);
      setRelationshipResults(response);
    } catch (err) {
      setRelationshipResults(`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setRelationshipLoading(false);
  };

  const renderAiOutput = () => aiText && (
    <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
      <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiText) }} />
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 1: Define Aims & Protocol</h3>
            <p className="text-sm text-blue-300">Define the target population, outcome, setting, users, and clinical decisions. Then generate a protocol draft.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Target Population</label>
                <textarea
                  value={state.predictionPopulation}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_POPULATION", payload: e.target.value })}
                  placeholder="e.g., Adults with type 2 diabetes in primary care"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm h-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Health Outcome</label>
                <input
                  value={state.predictionOutcome}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_OUTCOME", payload: e.target.value })}
                  placeholder="e.g., 5-year cardiovascular mortality"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Healthcare Setting</label>
                <input
                  value={setting}
                  onChange={(e) => setSetting(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Intended Users</label>
                <input
                  value={intendedUsers}
                  onChange={(e) => setIntendedUsers(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate Protocol Draft (AI)
            </button>
            {renderAiOutput()}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 2: Model Strategy</h3>
            <p className="text-sm text-blue-300">Choose whether to develop a new model or update an existing one.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 bg-blue-950 border border-blue-800 rounded-lg p-4 cursor-pointer">
                <input
                  type="radio"
                  name="modelStrategy"
                  checked={state.predictionModelStrategy === "new"}
                  onChange={() => dispatch({ type: "SET_PREDICTION_MODEL_STRATEGY", payload: "new" })}
                  className="text-yellow-500"
                />
                <div>
                  <p className="text-sm font-bold text-white">Develop New Model</p>
                  <p className="text-xs text-blue-300">Use existing data to build a model from scratch.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 bg-blue-950 border border-blue-800 rounded-lg p-4 cursor-pointer">
                <input
                  type="radio"
                  name="modelStrategy"
                  checked={state.predictionModelStrategy === "update"}
                  onChange={() => dispatch({ type: "SET_PREDICTION_MODEL_STRATEGY", payload: "update" })}
                  className="text-yellow-500"
                />
                <div>
                  <p className="text-sm font-bold text-white">Update Existing Model</p>
                  <p className="text-xs text-blue-300">Recalibrate, revise, or extend a published model.</p>
                </div>
              </label>
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Recommendation
            </button>
            {renderAiOutput()}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 3: Define Outcome Measure</h3>
            <p className="text-sm text-blue-300">Define the primary outcome. Prefer time-to-event over binary when follow-up time varies.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Outcome Name</label>
                <input
                  value={state.predictionOutcome}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_OUTCOME", payload: e.target.value })}
                  placeholder="e.g., Relapse within 2 years"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Outcome Type</label>
                <select
                  value={state.predictionOutcomeType}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_OUTCOME_TYPE", payload: e.target.value as "binary" | "continuous" | "survival" | "competing_risk" })}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                >
                  {OUTCOME_TYPES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Outcome Guidance
            </button>
            {renderAiOutput()}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 4: Identify Candidate Predictors</h3>
            <p className="text-sm text-blue-300">List baseline predictors that will be available when making predictions.</p>
            <textarea
              value={state.predictionPredictors}
              onChange={(e) => dispatch({ type: "SET_PREDICTION_PREDICTORS", payload: e.target.value })}
              placeholder="One per line: age, sex, blood pressure, cholesterol, smoking status..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm h-32"
            />
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Predictor Suggestions
            </button>
            {renderAiOutput()}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                Use PyHealth medical code maps (ICD, ATC, RxNorm) to standardise predictor codes. Avoid categorising continuous predictors unless clinically justified.
              </p>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 5: Collect & Examine Data</h3>
            <p className="text-sm text-blue-300">Upload your dataset (CSV or Excel) or proceed with AI-guided data quality checks.</p>
            <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
              <Upload className="mx-auto mb-2 text-blue-400" size={32} />
              <p className="text-sm text-blue-300 mb-2">Upload your dataset (CSV or Excel)</p>
              <p className="text-xs text-blue-400 mb-3">Supported: .csv, .xls, .xlsx</p>
              <input
                key={`step5-file-${step}`}
                type="file"
                accept="text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileUpload}
                className="text-sm text-blue-300"
              />
              {dataPreview && (
                <div className="mt-4 text-left bg-blue-950/50 rounded p-3">
                  <p className="text-xs text-blue-300 mb-2">Preview (first 500 chars):</p>
                  <pre className="text-xs text-blue-200 whitespace-pre-wrap">{dataPreview.slice(0, 500)}</pre>
                </div>
              )}
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Data Quality Guidance
            </button>
            {renderAiOutput()}
          </div>
        );

      case 6: {
        const { events, predictors, r2 } = parseStep6();
        const riley = rileyBinarySampleSize(events, predictors, r2);
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 6: Consider Sample Size</h3>
            <p className="text-sm text-blue-300">Calculate minimum sample size and check for overfitting risk.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Events (outcome occurrences)</label>
                <input
                  type="number"
                  value={state.predictionSampleSize.split("|")[0] || ""}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_SAMPLE_SIZE", payload: `${e.target.value}|${state.predictionSampleSize.split("|")[1] || ""}` })}
                  placeholder="e.g., 200"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Number of Predictors</label>
                <input
                  type="number"
                  value={state.predictionSampleSize.split("|")[1] || ""}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_SAMPLE_SIZE", payload: `${state.predictionSampleSize.split("|")[0] || ""}|${e.target.value}` })}
                  placeholder="e.g., 10"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Expected R²</label>
                <input
                  type="number"
                  step="0.01"
                  value={expectedR2}
                  onChange={(e) => setExpectedR2(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            {riley ? (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                <p className="text-sm font-bold text-white mb-2">Riley-style minimum sample size</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-blue-300">Minimum n: </span><span className="text-white font-bold">{riley.sampleSize}</span></div>
                  <div><span className="text-blue-300">Required events: </span><span className="text-white font-bold">{riley.requiredEvents}</span></div>
                  <div><span className="text-blue-300">Events/parameter: </span><span className="text-white font-bold">{riley.epp.toFixed(1)}</span></div>
                  <div><span className="text-blue-300">Implied prevalence: </span><span className="text-white font-bold">{(riley.prevalence * 100).toFixed(1)}%</span></div>
                </div>
                <table className="mt-3 w-full text-xs text-blue-200">
                  <thead>
                    <tr className="text-blue-300">
                      <th className="text-left font-medium">Criterion</th>
                      <th className="text-right font-medium">Required n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riley.criteria.map((c) => (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td className="text-right">{c.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-300">Enter events, number of predictors, and expected R² to compute the minimum sample size.</p>
              </div>
            )}

            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Sample Size Guidance (PyHealth / Riley formula)
            </button>
            {renderAiOutput()}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                Rule of thumb: EPV (Events Per Variable) should be ≥10–20 for standard models. ML models require several times larger samples. Use PyHealth trainers with early stopping to mitigate overfitting.
              </p>
            </div>
          </div>
        );
      }

      case 7:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 7: Deal with Missing Data</h3>
            <p className="text-sm text-blue-300">Choose a missing data strategy.</p>
            <select
              value={state.predictionMissingDataStrategy}
              onChange={(e) => dispatch({ type: "SET_PREDICTION_MISSING", payload: e.target.value })}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Select strategy...</option>
              <option value="multiple_imputation">Multiple Imputation (MICE / PyHealth)</option>
              <option value="single_imputation">Single Imputation (Regression)</option>
              <option value="complete_case">Complete Case Analysis</option>
              <option value="model_based">Model-Based (e.g., XGBoost handles missing natively)</option>
            </select>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Imputation Recommendation
            </button>
            {renderAiOutput()}
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 8: Fit Prediction Models</h3>
            <p className="text-sm text-blue-300">Select a modelling strategy. PyHealth provides 33+ pre-built models and trainers.</p>
            <select
              value={state.predictionModelType}
              onChange={(e) => dispatch({ type: "SET_PREDICTION_MODEL", payload: e.target.value })}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Select model...</option>
              {MODEL_TYPES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-yellow-400" />
                <span className="text-sm font-medium text-white">Captum Model Reasoning</span>
                <span className="text-xs text-blue-300">(Deep Learning models)</span>
              </div>
              <button
                onClick={() => dispatch({ type: "SET_PREDICTION_CAPTUM_ENABLED", payload: !state.predictionCaptumEnabled })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  state.predictionCaptumEnabled ? "border-yellow-400 bg-yellow-400/20 text-yellow-300" : "border-blue-800 bg-blue-900/30 text-blue-300"
                }`}
              >
                <ToggleLeft size={14} className={state.predictionCaptumEnabled ? "text-yellow-400" : "text-blue-400"} />
                {state.predictionCaptumEnabled ? "Enabled" : "Enable Captum Reasoning"}
              </button>
            </div>
            {state.predictionCaptumEnabled && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <label className="block text-sm font-medium text-blue-200 mb-2">Captum Method</label>
                <select
                  value={captumMethod}
                  onChange={(e) => setCaptumMethod(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                >
                  <option value="integrated_gradients">Integrated Gradients</option>
                  <option value="deep_lift">DeepLift</option>
                  <option value="saliency">Saliency</option>
                  <option value="input_x_gradient">Input X Gradient</option>
                  <option value="feature_ablation">Feature Ablation</option>
                  <option value="guided_backprop">Guided Backpropagation</option>
                </select>
              </div>
            )}
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Model Configuration & PyHealth Guidance
            </button>
            {state.predictionCaptumEnabled && aiText && (
              <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-4">
                <p className="text-xs font-bold text-yellow-300 mb-2">Captum Reasoning Guidance</p>
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiText) }} />
              </div>
            )}
            {!state.predictionCaptumEnabled && renderAiOutput()}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                PyHealth pipeline: Dataset → Task → Model → Trainer → Metrics. Use <code>pyhealth.trainer.Trainer</code> with early stopping and penalisation (ridge/LASSO) to prevent overfitting.
                {state.predictionCaptumEnabled && <> When Captum is enabled, reasoning summaries are generated using <code>captum.attr.{captumMethod.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()).replace(" ", "")}</code> for neural models.</>}
              </p>
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 9: Assess Model Performance</h3>
            <p className="text-sm text-blue-300">Evaluate discrimination and calibration. Use internal validation (bootstrap or k-fold).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-sm font-bold text-white mb-2">Discrimination</p>
                <ul className="text-xs text-blue-300 list-disc list-inside space-y-1">
                  <li>AUC / C-statistic (binary / survival)</li>
                  <li>Harrell&apos;s C / Uno&apos;s C (survival)</li>
                  <li>Rank correlation (continuous)</li>
                </ul>
              </div>
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-sm font-bold text-white mb-2">Calibration</p>
                <ul className="text-xs text-blue-300 list-disc list-inside space-y-1">
                  <li>Calibration slope &amp; intercept</li>
                  <li>Brier score</li>
                  <li>Smooth calibration curve (LOESS / splines)</li>
                </ul>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Performance Notes</label>
              <textarea
                value={state.predictionPerformance}
                onChange={(e) => dispatch({ type: "SET_PREDICTION_PERFORMANCE", payload: e.target.value })}
                placeholder="Enter observed AUC, calibration slope, Brier score, or notes from internal validation..."
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm h-24"
              />
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Performance Interpretation
            </button>
            {renderAiOutput()}
          </div>
        );

      case 10:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 10: Decide on Final Model</h3>
            <p className="text-sm text-blue-300">Select the final model based on validation performance, simplicity, and clinical utility (Occam&apos;s razor).</p>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Model Selection Rationale</label>
              <textarea
                value={state.predictionModelResult}
                onChange={(e) => dispatch({ type: "SET_PREDICTION_MODEL_RESULT", payload: e.target.value })}
                placeholder="Summarise the chosen model, validation metric, and reasons for preferring it over alternatives..."
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm h-24"
              />
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Final Model Recommendation
            </button>
            {renderAiOutput()}
          </div>
        );

      case 11: {
        const { minPct, maxPct, eventRatePct, rows } = parseStep11();
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 11: Decision Curve Analysis</h3>
            <p className="text-sm text-blue-300">Assess clinical utility by comparing net benefit across threshold probabilities.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Min Threshold (%)</label>
                <input
                  type="number"
                  value={state.predictionDcaMinThreshold}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_DCA_MIN", payload: e.target.value })}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Max Threshold (%)</label>
                <input
                  type="number"
                  value={state.predictionDcaMaxThreshold}
                  onChange={(e) => dispatch({ type: "SET_PREDICTION_DCA_MAX", payload: e.target.value })}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Event Rate (%)</label>
                <input
                  type="number"
                  value={dcaEventRate}
                  onChange={(e) => setDcaEventRate(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            {rows && rows.length > 0 ? (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                <p className="text-sm font-bold text-white mb-2">Decision-curve net benefit</p>
                <table className="w-full text-xs text-blue-200">
                  <thead>
                    <tr className="text-blue-300">
                      <th className="text-left font-medium">Threshold</th>
                      <th className="text-right font-medium">Treat all</th>
                      <th className="text-right font-medium">Treat none</th>
                      <th className="text-right font-medium">Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.threshold}>
                        <td>{(r.threshold * 100).toFixed(1)}%</td>
                        <td className="text-right">{r.treatAll.toFixed(3)}</td>
                        <td className="text-right">{r.treatNone.toFixed(3)}</td>
                        <td className="text-right">{r.model.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-blue-400 mt-2">Model net benefit assumes sensitivity = specificity = 0.70 at an event rate of {eventRatePct}%.</p>
              </div>
            ) : (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-300">Enter a valid threshold range (max &gt; min) and an event rate between 0 and 100 to compute net benefit.</p>
              </div>
            )}

            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Decision Curve Guidance
            </button>
            {renderAiOutput()}
          </div>
        );
      }

      case 12:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 12: Assess Individual Predictors (Optional)</h3>
            <p className="text-sm text-blue-300">Use SHAP, permutation importance, or Captum to understand predictor contribution.</p>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Method</label>
              <select
                value={state.predictionImportanceMethod || ""}
                onChange={(e) => dispatch({ type: "SET_PREDICTION_IMPORTANCE_METHOD", payload: e.target.value ? (e.target.value as "shap" | "permutation" | "captum" | "both" | "all") : null })}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Select method...</option>
                <option value="shap">SHAP</option>
                <option value="permutation">Permutation Importance</option>
                <option value="captum">Captum (Deep Learning Attribution)</option>
                <option value="both">SHAP + Permutation</option>
                <option value="all">SHAP + Permutation + Captum</option>
              </select>
            </div>
            {(state.predictionImportanceMethod === "captum" || state.predictionImportanceMethod === "all") && (
              <div className="bg-yellow-950/20 border border-yellow-800/50 rounded-lg p-3">
                <p className="text-xs text-yellow-300">
                  Captum reasoning will use <code>captum.attr.IntegratedGradients</code> or <code>DeepLift</code> for neural models (Transformer, RNN/LSTM/GRU, MLP, RETAIN) to generate attribution-based explanations. Results are displayed as predictor importance rankings.
                </p>
              </div>
            )}
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Predictor Importance Explanation
            </button>
            {renderAiOutput()}
          </div>
        );

      case 13:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 13: Report & Publish</h3>
            <p className="text-sm text-blue-300">Generate a TRIPOD-compliant report draft and provide model access instructions.</p>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Report Notes</label>
              <textarea
                value={state.predictionReportNotes}
                onChange={(e) => dispatch({ type: "SET_PREDICTION_REPORT_NOTES", payload: e.target.value })}
                placeholder="Add manuscript notes, model equation highlights, or deployment instructions..."
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm h-24"
              />
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate TRIPOD Report Draft (AI)
            </button>
            {renderAiOutput()}
            {(aiText || state.predictionReport) && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => exportPredictiveDoc("word", state.predictionReport || aiText, "predictive-report.docx")}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                >
                  <Download size={12} /> Download Word
                </button>
                <button
                  onClick={() => exportPredictiveDoc("pdf", state.predictionReport || aiText, "predictive-report.pdf")}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                >
                  <Download size={12} /> Download PDF
                </button>
              </div>
            )}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                Provide model equation, code, and an online calculator (e.g., Shiny, Streamlit, or Gradio) so others can reproduce and validate your model independently.
              </p>
            </div>
          </div>
        );

      case 14: {
        const hasFile = Boolean(csvFile || state.predictionDataFile);
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Step 14: CSV/Excel Upload & Relationship Prediction</h3>
                  <p className="text-sm text-blue-300">Upload a CSV or Excel file to let AI analyze relationships between factors and predict outcomes.</p>
                </div>
              <button
                onClick={() => setRelationshipEnabled(!relationshipEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  relationshipEnabled ? "border-yellow-400 bg-yellow-400/20 text-yellow-300" : "border-blue-800 bg-blue-900/30 text-blue-300"
                }`}
              >
                <ToggleLeft size={14} className={relationshipEnabled ? "text-yellow-400" : "text-blue-400"} />
                {relationshipEnabled ? "Enabled" : "Enable Feature"}
              </button>
            </div>

            {!relationshipEnabled ? (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 text-center">
                <AlertCircle className="mx-auto mb-2 text-blue-400" size={28} />
                <p className="text-sm text-blue-300">Toggle the switch above to enable CSV upload and relationship-based prediction.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
                  <FileSpreadsheet className="mx-auto mb-2 text-blue-400" size={32} />
                  <p className="text-sm text-blue-300 mb-2">Upload your dataset (CSV or Excel)</p>
                  <p className="text-xs text-blue-400 mb-3">Supported: .csv, .xls, .xlsx</p>
                  <input
                    key={`step14-file-${step}-${relationshipEnabled}`}
                    type="file"
                    accept="text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleRelationshipCsvUpload}
                    className="text-sm text-blue-300"
                  />
                  {csvPreview && (
                    <div className="mt-4 text-left bg-blue-950/50 rounded p-3">
                      <p className="text-xs text-blue-300 mb-2">Preview:</p>
                      <pre className="text-xs text-blue-200 whitespace-pre-wrap">{csvPreview}</pre>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleRelationshipAnalysis}
                  disabled={relationshipLoading || !hasFile}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {relationshipLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Analyze Relationships & Predict (AI)
                </button>

                {!hasFile && (
                  <p className="text-xs text-blue-400">Upload a CSV/Excel file to enable analysis. A previously uploaded prediction dataset is reused automatically when available.</p>
                )}

                {relationshipResults && (
                  <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Relationship & Prediction Analysis</h4>
                    <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(relationshipResults || "") }} />
                  </div>
                )}

                {relationshipResults && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => exportPredictiveDoc("word", relationshipResults, "relationship-prediction.docx")}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                    >
                      <Download size={12} /> Download Word
                    </button>
                    <button
                      onClick={() => exportPredictiveDoc("pdf", relationshipResults, "relationship-prediction.pdf")}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                    >
                      <Download size={12} /> Download PDF
                    </button>
                  </div>
                )}
              </div>
            )}
           </div>
         );
      }

      case 15:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">Step 15: LR Modeling & Variable Selection</h3>
              <p className="text-sm text-blue-300">
                Use AI guidance for logistic regression modeling, forward stepwise variable selection, AUC evaluation, and predictor insights graphs (PIG tables).
              </p>
            </div>

            {(csvFile || state.predictionDataFile) && (
              <span className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded">
                Loaded: {(csvFile || state.predictionDataFile)?.name}
              </span>
            )}

            <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
              <Upload className="mx-auto mb-2 text-blue-400" size={32} />
              <p className="text-sm text-blue-300 mb-2">Upload your dataset (CSV or Excel)</p>
              <p className="text-xs text-blue-400 mb-3">Supported: .csv, .xls, .xlsx</p>
              <input
                key={`step15-file-${step}`}
                type="file"
                accept="text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileUpload}
                className="text-sm text-blue-300"
              />
              {dataPreview && (
                <div className="mt-4 text-left bg-blue-950/50 rounded p-3">
                  <p className="text-xs text-blue-300 mb-2">Preview (first 500 chars):</p>
                  <pre className="text-xs text-blue-200 whitespace-pre-wrap">{dataPreview.slice(0, 500)}</pre>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleAiAssist}
                disabled={localLoading}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI LR Modeling Guidance
              </button>
            </div>

            {renderAiOutput()}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="text-yellow-400" size={22} />
          <h2 className="text-xl font-bold text-white">Predictive Analysis Pipeline</h2>
        </div>
        <p className="text-sm text-blue-300 mb-6">
          Guided {PREDICTION_STEPS.length}-step clinical prediction model development based on Efthimiou et al. (BMJ 2024) and PyHealth. AI assists where indicated.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {PREDICTION_STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <button
                key={s.num}
                onClick={() => dispatch({ type: "SET_PREDICTION_STEP", payload: s.num })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? "border-yellow-400 bg-yellow-400/20 text-yellow-300"
                    : isDone
                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                    : "border-blue-800 bg-blue-900/30 text-blue-300 hover:text-white"
                }`}
              >
                <Icon size={12} />
                {s.label}
                {isDone && <CheckCircle2 size={12} className="text-green-400" />}
              </button>
            );
          })}
        </div>

        {renderStepContent()}

        <div className="flex items-center justify-between mt-8">
          <button
            onClick={handlePrev}
            disabled={step === 1}
            className="text-sm text-blue-300 hover:text-white disabled:opacity-50 flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Previous Step
          </button>
          <span className="text-xs text-blue-400">
            Step {step} of {PREDICTION_STEPS.length}
          </span>
          <button
            onClick={handleNext}
            disabled={step === PREDICTION_STEPS.length}
            className="text-sm bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            Next Step <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
