"use client";

import React, { useState } from "react";
import {
  FlaskConical, Key, CheckCircle2, Loader2,
  Brain, Upload, BarChart3, LineChart, FileText, Sparkles, ArrowRight, ArrowLeft, Target, Calculator
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callDeepSeek, callGemini, callGroq } from "@/lib/ai";

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

  const step = state.predictionStep;

  const handleNext = () => {
    if (step < 13) dispatch({ type: "SET_PREDICTION_STEP", payload: step + 1 });
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
        prompt = "Recommend whether to develop a new prediction model or update an existing one. Justify with 3 bullets.";
        break;
      case 3:
        prompt = `For a ${state.predictionOutcomeType} outcome named "${state.predictionOutcome || "outcome"}", suggest the best definition and measurement approach. Include time-to-event considerations if relevant.`;
        break;
      case 4:
        prompt = `Given outcome "${state.predictionOutcome || "clinical outcome"}", suggest 8-10 candidate baseline predictors that are routinely available in clinical practice. Explain why each should be included.`;
        break;
      case 5:
        prompt = "Review uploaded data (if any) or summarize best practices for collecting and examining data for clinical prediction models. Include handling of measurement errors and variable distributions.";
        break;
      case 6:
        prompt = `Estimate sample size requirements. Assume binary outcome, 20% event rate, R²=0.2, 10 candidate predictors. Provide Riley-style guidance and note if ML models require larger samples.`;
        break;
      case 7:
        prompt = "Compare missing data strategies (multiple imputation vs single imputation vs complete case). Recommend one and explain how to implement it in a prediction model pipeline using PyHealth best practices.";
        break;
      case 8:
        prompt = `Recommend a modelling strategy for a ${state.predictionOutcomeType} outcome. Suggest 2-3 candidate models from PyHealth (e.g., Transformer, RETAIN, logistic regression) and provide hyperparameter guidance.`;
        break;
      case 9:
        prompt = `For a ${state.predictionOutcomeType} prediction model, list the key performance measures (discrimination and calibration) and how to calculate them. Include AUC, calibration slope, Brier score, and decision curve analysis guidance.`;
        break;
      case 10:
        prompt = "Explain how to select the final model using internal validation (bootstrap or k-fold). Include advice on the bias-variance trade-off and penalisation.";
        break;
      case 11:
        prompt = "Explain how to perform and interpret a decision curve analysis for a clinical prediction model. Include net benefit calculation and how to identify the optimal threshold probability.";
        break;
      case 12:
        prompt = "Describe how to assess individual predictor importance using SHAP and permutation importance. Explain how to interpret these for a clinical audience.";
        break;
      case 13:
        prompt = "Generate a TRIPOD checklist summary for reporting this clinical prediction model study. Include key sections that must be covered in the final manuscript.";
        break;
      default:
        prompt = "Provide guidance for this step.";
    }

    const apiKey = state.deepseekApiKey || state.geminiApiKey || state.groqApiKey;
    if (!apiKey) {
      setAiOutput("Please configure an AI provider in Settings first.");
      setLocalLoading(false);
      return;
    }

    try {
      let response: string;
      if (state.deepseekApiKey) response = await callDeepSeek(apiKey, prompt);
      else if (state.geminiApiKey) response = await callGemini(apiKey, prompt);
      else response = await callGroq(apiKey, prompt);
      setAiOutput(response);
    } catch (e) {
      setAiOutput(`AI assistance failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setLocalLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      dispatch({ type: "SET_PREDICTION_DATA", payload: file });
      const reader = new FileReader();
      reader.onload = () => setDataPreview(reader.result as string);
      reader.readAsText(file);
    }
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                  defaultChecked
                  className="text-yellow-500"
                  onChange={() => {}}
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
                  className="text-yellow-500"
                  onChange={() => {}}
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
            <p className="text-sm text-blue-300">Upload your dataset (CSV) or proceed with AI-guided data quality checks.</p>
            <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
              <Upload className="mx-auto mb-2 text-blue-400" size={32} />
              <input
                type="file"
                accept=".csv"
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
            <button
              onClick={handleAiAssist}
              disabled={localLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              {localLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI Model Configuration & PyHealth Guidance
            </button>
            {aiOutput && (
              <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
              </div>
            )}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                PyHealth pipeline: Dataset → Task → Model → Trainer → Metrics. Use <code>pyhealth.trainer.Trainer</code> with early stopping and penalisation (ridge/LASSO) to prevent overfitting.
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
              </div>
            )}
          </div>
        );

      case 10:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 10: Decide on Final Model</h3>
            <p className="text-sm text-blue-300">Select the final model based on validation performance, simplicity, and clinical utility (Occam&apos;s razor).</p>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
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
                  defaultValue="5"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Max Threshold (%)</label>
                <input
                  type="number"
                  defaultValue="50"
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
              </div>
            )}
          </div>
        );

      case 12:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 12: Assess Individual Predictors (Optional)</h3>
            <p className="text-sm text-blue-300">Use SHAP or permutation importance to understand predictor contribution.</p>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
              </div>
            )}
          </div>
        );

      case 13:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Step 13: Report & Publish</h3>
            <p className="text-sm text-blue-300">Generate a TRIPOD-compliant report draft and provide model access instructions.</p>
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
                <pre className="text-xs text-blue-200 whitespace-pre-wrap">{aiOutput}</pre>
              </div>
            )}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                Provide model equation, code, and an online calculator (e.g., Shiny, Streamlit, or Gradio) so others can reproduce and validate your model independently.
              </p>
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
          Guided 13-step clinical prediction model development based on Efthimiou et al. (BMJ 2024) and PyHealth. AI assists where indicated.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {PREDICTION_STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <button
                key={s.num}
                onClick={() => dispatch({ type: "SET_PREDICTION_STEP", payload: s.num })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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
            Step {step} of 13
          </span>
          <button
            onClick={handleNext}
            disabled={step === 13}
            className="text-sm bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            Next Step <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
