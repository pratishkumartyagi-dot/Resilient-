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
  html = html.replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, (_, __, code) => '<pre class="bg-black/30 p-2 rounded text-xs overflow-x-auto"><code>' + code + '</code></pre>');
  html = html.replace(/`(.+?)`/g, (_, code) => '<code>' + code + '</code>');
  html = html.replace(/\n/g, "<br/>");
  return html;
};

const AUTOPROGNOSIS_STEPS = [
  { num: 1, label: "Study Protocol & Aims", icon: FileText },
  { num: 2, label: "Dataset & Outcome", icon: Target },
  { num: 3, label: "Candidate Predictors", icon: Key },
  { num: 4, label: "Data Loading & Profiling", icon: Upload },
  { num: 5, label: "Missing Data Strategy", icon: LineChart },
  { num: 6, label: "Train/Test Split", icon: Calculator },
  { num: 7, label: "Forward Stepwise Selection", icon: ArrowRight },
  { num: 8, label: "AUC & Discrimination", icon: BarChart3 },
  { num: 9, label: "Overfitting Detection", icon: AlertCircle },
  { num: 10, label: "Predictor Insights Graph", icon: Sparkles },
  { num: 11, label: "Final Model Equation", icon: CheckCircle2 },
  { num: 12, label: "Validation & Reporting", icon: FlaskConical },
];

export default function AutoPrognosisTab() {
  const { state } = useApp();
  const [localLoading, setLocalLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState("");
  const [step, setStep] = useState(1);
  const [population, setPopulation] = useState("");
  const [outcome, setOutcome] = useState("");
  const [outcomeType, setOutcomeType] = useState("binary");
  const [candidatePredictors, setCandidatePredictors] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [maxPredictors, setMaxPredictors] = useState("10");
  const [testSize, setTestSize] = useState("0.3");
  const [pigData, setPigData] = useState<string | null>(null);

  const handleNext = () => {
    if (step < 12) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleAiAssist = async () => {
    setLocalLoading(true);
    setAiOutput("");
    let prompt = "";

    switch (step) {
      case 1:
        prompt = `Draft a clinical prediction model protocol using AutoPrognosis-style methodology. Target population: ${population || "not specified"}, Outcome: ${outcome || "not specified"} (${outcomeType}). Follow TRIPOD reporting guidelines and describe the AutoPrognosis workflow including Forward Stepwise Selection (FSS), Predictor Insights Graphs (PIG), and AUC-based evaluation.`;
        break;
      case 2:
        prompt = `For a ${outcomeType} outcome named "${outcome || "outcome"}", recommend the best definition and measurement approach following the PROGRESS/TRIPOD framework (Efthimiou et al., BMJ 2024). Include guidance on when to prefer time-to-event over binary outcomes to avoid loss of information.`;
        break;
      case 3:
        prompt = `Given outcome "${outcome || "clinical outcome"}", suggest 8-10 candidate baseline predictors that are routinely available in clinical practice, aligned with predictor-selection guidance in Efthimiou et al. (BMJ 2024, PMC11369751). Explain why each should be included and reference PyHealth standardised code maps (ICD, ATC, RxNorm) where applicable.`;
        break;
      case 4:
        prompt = `Review uploaded data (if any) or summarize best practices for loading and profiling data for clinical prediction models (AutoPrognosis workflow). Include handling of measurement errors, variable distributions, and missing data patterns. Reference PyHealth dataset formats (MIMIC-IV, eICU, OMOP) where relevant.`;
        break;
      case 5:
        prompt = "Compare missing data strategies (multiple imputation vs single imputation vs complete case vs model-based handling), following step 7 in Efthimiou et al. (BMJ 2024, PMC11369751). Recommend one strategy and explain how to implement it in a prediction pipeline using PyHealth-compatible preprocessing (e.g., sklearn.impute.IterativeImputer or native model handling).";
        break;
      case 6:
        prompt = `Explain how to split data for training and testing in clinical prediction models. Recommend an optimal test size (${testSize}) and justification. Discuss the importance of independent validation sets and how they relate to optimism correction in the AutoPrognosis framework.`;
        break;
      case 7:
        prompt = `Explain Forward Stepwise Selection (FSS) in the context of clinical prediction models. How does it differ from backward elimination and LASSO? Provide pseudocode or Python (scikit-learn) implementation guidance for FSS with ${maxPredictors} maximum predictors. Include stopping criteria (AUC improvement < 0.01).`;
        break;
      case 8:
        prompt = `For a ${outcomeType} prediction model, list the key performance measures (discrimination and calibration) and how to calculate them, following step 9 in Efthimiou et al. (BMJ 2024, PMC11369751) and PyHealth metrics conventions. Include AUC, calibration slope, Brier score, and internal validation guidance (bootstrap or k-fold) for optimism correction.`;
        break;
      case 9:
        prompt = "Explain overfitting detection methods in clinical prediction models: optimism correction via bootstrap, k-fold cross-validation, and comparing apparent vs adjusted performance. Describe how to report these in the AutoPrognosis framework and what thresholds indicate unacceptable overfitting.";
        break;
      case 10:
        prompt = `Explain the Predictor Insights Graph (PIG) methodology from AutoPrognosis. How is it generated? What metrics does it display (odds ratios, confidence intervals, variable importance)? Provide guidance on interpreting PIG tables and creating publication-ready versions using R (autoprognosis package) or Python.`;
        break;
      case 11:
        prompt = "Explain how to derive the final prediction model equation from AutoPrognosis output. Include guidance on presenting the model equation, regression coefficients, and baseline survival/risk for clinical use. Provide an example format.";
        break;
      case 12:
        prompt = `Generate a TRIPOD checklist summary for reporting this AutoPrognosis-based clinical prediction model study, following Efthimiou et al. (BMJ 2024, PMC11369751). Include model equation, code, and deployment guidance (e.g., FastAPI + HTML calculator). Reference PyHealth export patterns.`;
        break;
      default:
        prompt = "Provide guidance for this AutoPrognosis step.";
    }

    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey) {
      setAiOutput("Please configure an AI provider in Settings first.");
      setLocalLoading(false);
      return;
    }

    try {
      let text: string;
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt);
      } else {
        text = await callGroq(state.groqApiKey!, prompt);
      }
      setAiOutput(text);
    } catch (err: any) {
      setAiOutput(`Error: ${err.message || "Unknown error"}. Please ensure your API key is valid.`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const text = await file.text();
    const lines = text.split("\n").slice(0, 11);
    setCsvPreview(lines.join("\n"));
  };

  const handleDownloadWord = () => {
    if (!aiOutput) return;
    const html = `<html><body>${renderMarkdown(aiOutput)}</body></html>`;
    downloadMarkdownAsWord(html, "autoprognosis-report.docx");
  };

  const handleDownloadPDF = () => {
    if (!aiOutput) return;
    const html = `<html><body>${renderMarkdown(aiOutput)}</body></html>`;
    downloadMarkdownAsPDF(html, "autoprognosis-report.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-3 mb-4">
          <FlaskConical className="text-yellow-400" size={24} />
          <div>
            <h2 className="text-xl font-bold text-white">AutoPrognosis Pipeline</h2>
            <p className="text-sm text-blue-300">
              Step-by-step workflow for developing clinical prediction models with Forward Stepwise Selection, AUC evaluation, and Predictor Insights Graphs (PIG).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={step === 1}
              className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
            >
              <ArrowLeft size={12} /> Previous
            </button>
            <span className="text-xs text-blue-400">
              Step {step} of {AUTOPROGNOSIS_STEPS.length}
            </span>
            <button
              onClick={handleNext}
              disabled={step === AUTOPROGNOSIS_STEPS.length}
              className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
            >
              Next <ArrowRight size={12} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Guidance
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-6">
          {AUTOPROGNOSIS_STEPS.map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                step === s.num
                  ? "border-yellow-400 text-yellow-300 bg-yellow-400/10"
                  : "border-blue-800 text-blue-300 hover:border-blue-600"
              }`}
            >
              <s.icon size={12} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 1: Study Protocol & Aims</h3>
              <p className="text-sm text-blue-300">
                Define the target population, outcome, and prediction horizon. Follow TRIPOD reporting guidelines.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Target Population</label>
                  <input
                    type="text"
                    value={population}
                    onChange={(e) => setPopulation(e.target.value)}
                    placeholder="e.g., adults with suspected LATENT tuberculosis infection"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Outcome</label>
                  <input
                    type="text"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="e.g., progression to active TB within 2 years"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 2: Dataset & Outcome Definition</h3>
              <p className="text-sm text-blue-300">
                Specify the dataset source and how the outcome is defined and measured.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Dataset Name / Source</label>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="e.g., MIMIC-IV, eICU, or custom CSV"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Outcome Type</label>
                  <select
                    value={outcomeType}
                    onChange={(e) => setOutcomeType(e.target.value)}
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  >
                    <option value="binary">Binary</option>
                    <option value="continuous">Continuous</option>
                    <option value="survival">Time-to-event (Survival)</option>
                    <option value="competing_risk">Competing Risk</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 3: Candidate Predictor Identification</h3>
              <p className="text-sm text-blue-300">
                List all candidate predictors available at the time of prediction. Focus on routinely available clinical variables.
              </p>
              <textarea
                value={candidatePredictors}
                onChange={(e) => setCandidatePredictors(e.target.value)}
                placeholder="e.g., age, sex, BMI, IGRA result, TST result, chest X-ray findings, previous TB contact..."
                className="w-full h-[200px] bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm resize-y"
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 4: Data Loading & Profiling</h3>
              <p className="text-sm text-blue-300">
                Upload your dataset (CSV) or describe its structure. Preview the data and check for quality issues.
              </p>
              <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
                <Upload className="mx-auto text-blue-400 mb-2" size={32} />
                <p className="text-sm text-blue-300 mb-3">Upload CSV dataset for profiling</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="text-sm text-blue-300"
                />
                {csvPreview && (
                  <div className="mt-4 bg-blue-950 border border-blue-800 rounded-lg p-3 text-left">
                    <p className="text-xs text-blue-400 mb-2">Preview (first 10 lines):</p>
                    <pre className="text-xs text-blue-100 whitespace-pre-wrap overflow-x-auto">
                      {csvPreview}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 5: Missing Data Strategy</h3>
              <p className="text-sm text-blue-300">
                Describe your strategy for handling missing data. Options: multiple imputation, single imputation, complete case analysis, or model-based handling.
              </p>
              <textarea
                placeholder="Describe your missing data strategy..."
                className="w-full h-[200px] bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm resize-y"
              />
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 6: Train/Test Split</h3>
              <p className="text-sm text-blue-300">
                Define how the data will be split into training and test sets. Typically 70/30 or 80/20.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Test Size (0-1)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={testSize}
                    onChange={(e) => setTestSize(e.target.value)}
                    placeholder="0.3"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Random Seed</label>
                  <input
                    type="number"
                    defaultValue={42}
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 7: Forward Stepwise Selection (FSS)</h3>
              <p className="text-sm text-blue-300">
                Configure Forward Stepwise Selection to identify the optimal subset of predictors.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Max Predictors</label>
                  <input
                    type="number"
                    value={maxPredictors}
                    onChange={(e) => setMaxPredictors(e.target.value)}
                    placeholder="10"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Stopping Criterion (AUC improvement)</label>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue="0.01"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 8: AUC & Discrimination</h3>
              <p className="text-sm text-blue-300">
                  Evaluate model discrimination using Area Under the ROC Curve (AUC). Target AUC &gt; 0.7 for clinical utility.
              </p>
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <p className="text-sm text-blue-200">
                  AUC interpretation: 0.5 = no discrimination, 0.7-0.8 = acceptable, 0.8-0.9 = excellent, &gt;0.9 = outstanding.
                  Use bootstrap or k-fold cross-validation for optimism correction.
                </p>
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 9: Overfitting Detection</h3>
              <p className="text-sm text-blue-300">
                Detect overfitting by comparing apparent performance on training data vs. optimism-corrected performance on validation data.
              </p>
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <p className="text-sm text-blue-200">
                  Overfitting is suspected when the difference between apparent and corrected AUC exceeds 0.05.
                  Use bootstrap sampling (n=200-1000) or k-fold cross-validation (k=10) for optimism correction.
                </p>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 10: Predictor Insights Graph (PIG)</h3>
              <p className="text-sm text-blue-300">
                Generate Predictor Insights Graph to visualise the effect of each predictor on the outcome.
              </p>
              <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
                <Table className="mx-auto text-blue-400 mb-2" size={32} />
                <p className="text-sm text-blue-300 mb-3">Upload AutoPrognosis PIG table (CSV) or generate via AI guidance</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setPigData(text);
                  }}
                  className="text-sm text-blue-300"
                />
                {pigData && (
                  <div className="mt-4 bg-blue-950 border border-blue-800 rounded-lg p-3 text-left">
                    <p className="text-xs text-blue-400 mb-2">PIG Table Preview:</p>
                    <pre className="text-xs text-blue-100 whitespace-pre-wrap overflow-x-auto">
                      {pigData.split("\n").slice(0, 15).join("\n")}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 11 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 11: Final Model Equation</h3>
              <p className="text-sm text-blue-300">
                Derive and document the final prediction model equation with regression coefficients and baseline risk.
              </p>
              <textarea
                placeholder="Paste or generate the final model equation here..."
                className="w-full h-[200px] bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm resize-y font-mono"
              />
            </div>
          )}

          {step === 12 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 12: Validation & Reporting</h3>
              <p className="text-sm text-blue-300">
                Summarise validation results and prepare the TRIPOD-compliant report for publication.
              </p>
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <p className="text-sm text-blue-200">
                  Include: model equation, performance metrics (AUC, calibration slope, Brier score),
                  validation method, PIG table, and deployment guidance (FastAPI + HTML calculator).
                </p>
              </div>
            </div>
          )}

          {aiOutput && (
            <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">AI Guidance</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadWord}
                    className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                  >
                    <Download size={12} /> Word
                  </button>
                  <button
                    onClick={handleDownloadPDF}
                    className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1"
                  >
                    <Download size={12} /> PDF
                  </button>
                </div>
              </div>
              <div
                className="text-xs text-blue-200 prose prose-xs prose-invert max-h-[600px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
