"use client";

import React, { useState } from "react";
import {
  FlaskConical, Key, CheckCircle2, Loader2,
  Brain, Upload, BarChart3, LineChart, FileText, Sparkles, ArrowRight, ArrowLeft, Target, Calculator,
  Download, Table, ToggleLeft, FileSpreadsheet, AlertCircle, Zap
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq } from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";

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
  const [aiOutput, setAiOutput] = useState("");
  const [dataPreview, setDataPreview] = useState<string | null>(null);
  const [relationshipEnabled, setRelationshipEnabled] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [relationshipResults, setRelationshipResults] = useState<string | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipHeaders, setRelationshipHeaders] = useState<string[]>([]);
  const [captumMethod, setCaptumMethod] = useState<string>("integrated_gradients");
  const [step15MaxVars, setStep15MaxVars] = useState("10");
  const [step15TestSize, setStep15TestSize] = useState("0.4");
  const [step15NumIter, setStep15NumIter] = useState("50");
  const step = state.predictionStep;

  const handleNext = () => {
    if (step < 15) dispatch({ type: "SET_PREDICTION_STEP", payload: step + 1 });
  };

  const handlePrev = () => {
    if (step > 1) dispatch({ type: "SET_PREDICTION_STEP", payload: step - 1 });
  };

  const handleAiAssist = async () => {
    setLocalLoading(true);
    setAiOutput("");
    let prompt = "";
    switch (step) {
      case 1:
        prompt = `Draft a clinical prediction model protocol based on: target population: ${state.predictionPopulation || "not specified"}, outcome: ${state.predictionOutcome || "not specified"}, setting: general hospital. Follow TRIPOD reporting guidelines.`;
        break;
      case 2:
        prompt = `Recommend whether to develop a new prediction model or update an existing one, following the step-by-step guide in Efthimiou et al. (BMJ 2024, PMC11369751). If data is limited, note that PyHealth trainers with penalisation (ridge/LASSO) can help prevent overfitting. Justify with 3 bullets.`;
        break;
      case 3:
        prompt = `For a ${state.predictionOutcomeType} outcome named "${state.predictionOutcome || "outcome"}", suggest the best definition and measurement approach following the PROGRESS/TRIPOD framework (Efthimiou et al., BMJ 2024). Include guidance on when to prefer time-to-event over binary outcomes to avoid loss of information.`;
        break;
      case 4:
        prompt = `Given outcome "${state.predictionOutcome || "clinical outcome"}", suggest 8-10 candidate baseline predictors that are routinely available in clinical practice, aligned with predictor-selection guidance in Efthimiou et al. (BMJ 2024, PMC11369751). Explain why each should be included and reference PyHealth standardised code maps (ICD, ATC, RxNorm) where applicable.`;
        break;
      case 5:
        prompt = `Review uploaded data (if any) or summarize best practices for collecting and examining data for clinical prediction models, following steps 5 and 7 in Efthimiou et al. (BMJ 2024, PMC11369751). Include handling of measurement errors, variable distributions, and missing data patterns. Reference PyHealth dataset formats (MIMIC-IV, eICU, OMOP) where relevant.`;
        break;
      case 6:
        prompt = `Estimate sample size requirements for a binary outcome with 20% event rate, R²=0.2, and 10 candidate predictors, following Riley-style guidance referenced in Efthimiou et al. (BMJ 2024, PMC11369751). Note that ML models require several times larger samples than standard statistical models, and that PyHealth Trainer with early stopping/penalisation can mitigate overfitting.`;
        break;
      case 7:
        prompt = "Compare missing data strategies (multiple imputation vs single imputation vs complete case vs model-based handling), following step 7 in Efthimiou et al. (BMJ 2024, PMC11369751). Recommend one strategy and explain how to implement it in a prediction pipeline using PyHealth-compatible preprocessing (e.g., sklearn.impute.IterativeImputer or native model handling).";
        break;
      case 8:
        prompt = `Recommend a modelling strategy for a ${state.predictionOutcomeType} outcome, following step 8 in Efthimiou et al. (BMJ 2024, PMC11369751). Suggest 2-3 candidate models from PyHealth (e.g., Transformer, RETAIN, logistic regression, Cox, RF, XGBoost) and provide hyperparameter guidance, penalisation strategy (ridge/LASSO), and validation approach. For deep learning models (Transformer, RNN/LSTM/GRU, MLP, RETAIN), explain how to use Captum (https://github.com/meta-pytorch/captum) for model interpretability and reasoning — including Integrated Gradients, DeepLift, and feature ablation to understand predictor contributions.`;
        break;
      case 9:
        prompt = `For a ${state.predictionOutcomeType} prediction model, list the key performance measures (discrimination and calibration) and how to calculate them, following step 9 in Efthimiou et al. (BMJ 2024, PMC11369751) and PyHealth metrics conventions. Include AUC, calibration slope, Brier score, and internal validation guidance (bootstrap or k-fold) for optimism correction. For deep learning models, mention how Captum (https://github.com/meta-pytorch/captum) reasoning can complement traditional performance metrics by providing attribution-based confidence explanations.`;
        break;
      case 10:
        prompt = "Explain how to select the final model using internal validation (bootstrap or k-fold), following step 10 in Efthimiou et al. (BMJ 2024, PMC11369751). Include advice on the bias-variance trade-off, penalisation, and Occam's razor. Reference PyHealth Trainer output comparison across models. For neural models selected as final, outline a Captum (https://github.com/meta-pytorch/captum) reasoning workflow (Integrated Gradients / DeepLift) to generate explanation artifacts for model deployment and clinical validation.";
        break;
      case 11:
        prompt = "Explain how to perform and interpret a decision curve analysis for a clinical prediction model, following step 11 in Efthimiou et al. (BMJ 2024, PMC11369751). Include net benefit calculation, how to identify the optimal threshold probability, and how to combine this with PyHealth predict_proba() outputs for downstream packages like dcurves.";
        break;
      case 12:
        prompt = "Describe how to assess individual predictor importance using SHAP, permutation importance, and Captum (https://github.com/meta-pytorch/captum), following the optional step 12 guidance in Efthimiou et al. (BMJ 2024, PMC11369751). Explain how to extract predictions from PyHealth models (predict_proba) and apply these methods for a clinical audience. For deep learning models, emphasize Captum's Integrated Gradients and DeepLift for attribution-based reasoning over SHAP when model gradients are available.";
        break;
      case 13:
        prompt = "Generate a TRIPOD checklist summary for reporting this clinical prediction model study, following step 13 in Efthimiou et al. (BMJ 2024, PMC11369751). Include model equation, code, and deployment guidance (e.g., FastAPI + HTML calculator). Reference PyHealth export patterns.";
        break;
      case 14:
        prompt = "Provide guidance for analyzing relationships in the uploaded dataset. Identify likely predictor variables, outcome variable, and potential relationships. Suggest appropriate statistical methods for the analysis.";
        break;
      case 15:
        prompt = `Provide comprehensive guidance for logistic regression modeling using AutoPrognosis-style methodology. Cover forward stepwise variable selection, AUC-based evaluation, over-fitting detection, and predictor insights graphs (PIG tables) for clinical prediction models.`;
        break;
      default:
        prompt = "Provide guidance for this step.";
    }

    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey) {
      setAiOutput("Please configure an AI provider in Settings first.");
      setLocalLoading(false);
      return;
    }

    try {
      let response: string;
      if (state.geminiApiKey) response = await callGemini(apiKey, prompt);
      else if (state.groqApiKey) response = await callGroq(apiKey, prompt);
      else throw new Error("No API key configured. Please open Settings (gear icon).");

      setAiOutput(response);
    } catch (e) {
      setAiOutput(`AI assistance failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setLocalLoading(false);
  };

  const runAutoPrognosis = async () => {
    const file = csvFile || state.predictionDataFile;
    if (!file) {
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_HTML", payload: '<p class="text-red-400">Please upload a dataset in Step 14 first.</p>' });
      return;
    }
    dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_LOADING", payload: true });
    dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_HTML", payload: "" });
    dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_TEXT", payload: "" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("study_name", "step15-autoprognosis");
      formData.append("method", "auto_classifier");
      formData.append("max_variables", step15MaxVars);
      formData.append("test_size", step15TestSize);
      formData.append("num_iter", step15NumIter);

      const res = await fetch("/api/researcher/run-autoprognosis", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`AutoPrognosis failed: ${text}`);
      }

      const data = await res.json();
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_HTML", payload: data.report_html || "" });
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_TEXT", payload: data.report_text || "" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_HTML", payload: `<p class="text-red-400">Analysis failed: ${message}</p>` });
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_REPORT_TEXT", payload: `Analysis failed: ${message}` });
    } finally {
      dispatch({ type: "SET_PREDICTION_AUTOPROGNOSIS_LOADING", payload: false });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    const name = file.name.toLowerCase();
    try {
      dispatch({ type: "SET_PREDICTION_DATA", payload: file });
      setCsvFile(file);
      setCsvPreview(null);

      if (name.endsWith(".csv")) {
        const text = await file.text();
        setDataPreview(text);
      } else if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        setDataPreview(csv);
      } else {
        setDataPreview("Unsupported file type. Please upload CSV, .xls, or .xlsx.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setDataPreview("Error reading file: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const parseSimpleCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows = lines.slice(1, 11).map((line) => line.split(",").map((cell) => cell.trim().replace(/^["']|["']$/g, "")));
    return { headers, rows };
  };

  const handleRelationshipCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setCsvFile(file);
    setRelationshipResults(null);
    setCsvPreview(null);

    try {
      let text = "";
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv")) {
        text = await file.text();
      } else if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        text = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        setCsvPreview("Unsupported file type. Please upload CSV, .xls, or .xlsx.");
        return;
      }

      const { headers, rows } = parseSimpleCSV(text);
      setRelationshipHeaders(headers);
      setCsvPreview("Headers: " + headers.join(", ") + "\n\nFirst rows:\n" + rows.map((r) => r.join(", ")).join("\n"));
    } catch (err) {
      console.error("Upload error:", err);
      setCsvPreview("Error reading file: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleRelationshipAnalysis = async () => {
    if (!csvFile) return;
    setRelationshipLoading(true);
    setRelationshipResults(null);
    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey) {
      setRelationshipResults("Please configure an AI provider in Settings first.");
      setRelationshipLoading(false);
      return;
    }

    try {
      let text = "";
      const name = csvFile.name.toLowerCase();
      if (name.endsWith(".csv")) {
        text = await csvFile.text();
      } else if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const buffer = await csvFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        text = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        setRelationshipResults("Unsupported file type. Please upload CSV or Excel.");
        setRelationshipLoading(false);
        return;
      }

      const { headers, rows } = parseSimpleCSV(text);
      const csvContext = `Columns: ${headers.join(", ")}\nSample rows:\n${rows.map((r) => r.join(", ")).join("\n")}`;
      const prompt = `You are a data science assistant. Based on the following uploaded dataset columns and sample rows, identify the relationships between these factors and predict the likely outcome variable. Columns: ${headers.join(", ")}. Sample data: ${csvContext}. Explain which columns are likely predictors, which is the outcome, and what relationships exist. Provide a structured analysis (correlations, causal hints, and prediction guidance) in Markdown format.`;

      try {
        let response: string;
        if (state.geminiApiKey) response = await callGemini(apiKey, prompt);
        else if (state.groqApiKey) response = await callGroq(apiKey, prompt);
        else throw new Error("No API key configured. Please open Settings (gear icon).");

        setRelationshipResults(response);
      } catch (e) {
        setRelationshipResults(`Analysis failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    } catch (err) {
      setRelationshipResults(`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setRelationshipLoading(false);
  };

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
                  defaultValue="Primary Care / Hospital"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Intended Users</label>
                <input
                  defaultValue="Clinicians, Patients, Researchers"
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
          </div>
        );

      case 6:
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
                  defaultValue="0.2"
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
              AI Sample Size Guidance (PyHealth / Riley formula)
            </button>
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                Rule of thumb: EPV (Events Per Variable) should be ≥10–20 for standard models. ML models require several times larger samples. Use PyHealth trainers with early stopping to mitigate overfitting.
              </p>
            </div>
          </div>
        );

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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {state.predictionCaptumEnabled && aiOutput && (
              <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-4">
                <p className="text-xs font-bold text-yellow-300 mb-2">Captum Reasoning Guidance</p>
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
            {!state.predictionCaptumEnabled && aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
          </div>
        );

      case 11:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 11: Decision Curve Analysis</h3>
            <p className="text-sm text-blue-300">Assess clinical utility by comparing net benefit across threshold probabilities.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Decision Curve Guidance
            </button>
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
          </div>
        );

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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
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
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
              </div>
            )}
            {(aiOutput || state.predictionReport) && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => downloadMarkdownAsWord(state.predictionReport || aiOutput, "predictive-report.docx")}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                >
                  <Download size={12} /> Download Word
                </button>
                <button
                  onClick={() => downloadMarkdownAsPDF(state.predictionReport || aiOutput, "predictive-report.pdf")}
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

      case 14:
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
                  disabled={relationshipLoading || !(csvFile || state.predictionDataFile)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {relationshipLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Analyze Relationships & Predict (AI)
                </button>

                {relationshipResults && (
                  <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Relationship & Prediction Analysis</h4>
                    <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(relationshipResults || "") }} />
                  </div>
                )}

                {relationshipResults && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => downloadMarkdownAsWord(relationshipResults, "relationship-prediction.docx")}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                    >
                      <Download size={12} /> Download Word
                    </button>
                    <button
                      onClick={() => downloadMarkdownAsPDF(relationshipResults, "relationship-prediction.pdf")}
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
 

        case 15:
          return (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Step 15: Automated Prognosis & Variable Selection</h3>
                <p className="text-sm text-blue-300">
                  Upload a dataset (CSV or Excel) and run Forward Stepwise Selection with AUC evaluation and PIG table metrics.
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Max Variables</label>
                  <input
                    type="number"
                    value={step15MaxVars}
                    onChange={(e) => setStep15MaxVars(e.target.value)}
                    placeholder="10"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Test Size (0-1)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={step15TestSize}
                    onChange={(e) => setStep15TestSize(e.target.value)}
                    placeholder="0.4"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Iterations</label>
                  <input
                    type="number"
                    value={step15NumIter}
                    onChange={(e) => setStep15NumIter(e.target.value)}
                    placeholder="50"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runAutoPrognosis}
                  disabled={state.predictionAutoPrognosisLoading || !(csvFile || state.predictionDataFile)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {state.predictionAutoPrognosisLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Run AutoPrognosis Analysis
                </button>
                <button
                  onClick={handleAiAssist}
                  disabled={localLoading}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  AI LR Modeling Guidance
                </button>
              </div>

              {aiOutput && (
                <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                  <div className="text-xs text-blue-200 prose prose-xs prose-invert" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
                </div>
              )}

              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-sm font-bold text-white">AutoPrognosis Report</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadMarkdownAsWord(state.predictionAutoPrognosisReportHtml || state.predictionAutoPrognosisReportText, "autoprognosis-report.docx")}
                      disabled={!(state.predictionAutoPrognosisReportHtml || state.predictionAutoPrognosisReportText)}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <Download size={12} /> Download Word
                    </button>
                    <button
                      onClick={() => downloadMarkdownAsPDF(state.predictionAutoPrognosisReportHtml || state.predictionAutoPrognosisReportText, "autoprognosis-report.pdf")}
                      disabled={!(state.predictionAutoPrognosisReportHtml || state.predictionAutoPrognosisReportText)}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1 disabled:opacity-50"
                    >
                      <Download size={12} /> Download PDF
                    </button>
                  </div>
                </div>
                <div className="max-h-[600px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: state.predictionAutoPrognosisReportHtml }} />
              </div>
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
