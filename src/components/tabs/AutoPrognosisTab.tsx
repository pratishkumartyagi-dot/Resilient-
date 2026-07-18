"use client";

import React, { useState } from "react";
import {
  FlaskConical, Key, CheckCircle2, Loader2,
  Brain, Upload, BarChart3, LineChart, FileText, Sparkles, ArrowRight, ArrowLeft, Target, Calculator,
  Download, Table, ToggleLeft, FileSpreadsheet, AlertCircle, Zap, Search, Filter, Inbox, GitMerge, BookOpen, Play
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek } from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";
import { runAutoPrognosis, type AutoPrognosisResult } from "@/lib/autoprognosis-compute";

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

const PHASES = [
  { id: "asreview", label: "ASReview Screening", icon: Search, color: "emerald" },
  { id: "metapipe", label: "meta-pipe Extraction", icon: GitMerge, color: "blue" },
  { id: "autoprognosis", label: "AutoPrognosis 2.0", icon: FlaskConical, color: "yellow" },
];

const ASREVIEW_STEPS = [
  { num: 1, label: "Study Import", icon: Inbox },
  { num: 2, label: "Active Learning", icon: Brain },
  { num: 3, label: "Full-text Review", icon: BookOpen },
];

const METAPIPE_STEPS = [
  { num: 4, label: "Data Extraction", icon: Table },
  { num: 5, label: "Meta-Analysis", icon: BarChart3 },
  { num: 6, label: "Reporting", icon: FileText },
];

const AUTOPROGNOSIS_STEPS = [
  { num: 7, label: "Dataset Prep", icon: Upload },
  { num: 8, label: "Model Config", icon: Target },
  { num: 9, label: "Run Analysis", icon: Play },
  { num: 10, label: "Results & PIG", icon: CheckCircle2 },
];

const ALL_STEPS = [...ASREVIEW_STEPS, ...METAPIPE_STEPS, ...AUTOPROGNOSIS_STEPS];

function getPhase(stepNum: number) {
  if (stepNum <= 3) return "asreview";
  if (stepNum <= 6) return "metapipe";
  return "autoprognosis";
}

const PHASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  asreview: { bg: "bg-emerald-900/40", text: "text-emerald-300", border: "border-emerald-700/50" },
  metapipe: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-700/50" },
  autoprognosis: { bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-700/50" },
};

export default function AutoPrognosisTab() {
  const { state } = useApp();
  const [localLoading, setLocalLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState("");
  const [step, setStep] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [screenedStudies, setScreenedStudies] = useState<{ title: string; abstract: string; decision: "include" | "exclude" | "uncertain" }[]>([]);
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [screeningLoading, setScreeningLoading] = useState(false);

  const [extractionData, setExtractionData] = useState<{ study: string; effect: string; ci: string; weight: string; outcome: string }[]>([]);
  const [metaAnalysisOutput, setMetaAnalysisOutput] = useState("");

  const [outcome, setOutcome] = useState("");
  const [outcomeType, setOutcomeType] = useState("binary");
  const [candidatePredictors, setCandidatePredictors] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [maxPredictors, setMaxPredictors] = useState("10");
  const [testSize, setTestSize] = useState("0.3");
  const [pigData, setPigData] = useState<string | null>(null);
  const [computationLoading, setComputationLoading] = useState(false);
  const [computationResult, setComputationResult] = useState<AutoPrognosisResult | null>(null);
  const [computationError, setComputationError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<(string | number | null)[][]>([]);

  const phase = PHASE_COLORS[getPhase(step)];

  const handleNext = () => {
    if (step < 10) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const parseCsv = (text: string): { headers: string[]; rows: (string | number | null)[][] } => {
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",").map((part) => {
        const trimmed = part.trim().replace(/^["']|["']$/g, "");
        const num = parseFloat(trimmed);
        return isNaN(num) ? trimmed : num;
      });
      return parts;
    });
    return { headers, rows };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);
    setCsvPreview(parsed.rows.slice(0, 10).map((row) => row.join(", ")).join("\n"));
  };

  const handleAsReviewScreen = async () => {
    if (!searchQuery.trim()) return;
    setScreeningLoading(true);
    try {
      const apiKey = state.geminiApiKey || state.groqApiKey || state.deepseekApiKey;
      const prompt = `Act as ASReview LAB (Rensvandeschoot/automated-systematic-review) active-learning screener.

Research question: ${searchQuery}

Generate 8 representative candidate studies (title + 120-word abstract) relevant to this topic, formatted as:
1. TITLE: ...
   ABSTRACT: ...

Then for each study, provide an ASReview-style relevance score (0-1) and include/exclude recommendation based on likely relevance to the prediction-modeling / prognosis / auto-prognosis context.`;
      let text: string;
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt);
      } else if (state.deepseekApiKey) {
        text = await callDeepSeek(state.deepseekApiKey, prompt);
      } else {
        text = "Please configure an AI provider in Settings to use ASReview-style screening.";
      }
      const studies = text.match(/1\.\s+TITLE:([\s\S]*?)ABSTRACT:([\s\S]*?)(?=\n\d\.|\Z)/g) || [text];
      const parsed = studies.map((s) => {
        const titleMatch = s.match(/TITLE:\s*(.+)/);
        const abstractMatch = s.match(/ABSTRACT:\s*(.+)/);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled study";
        const abstract = abstractMatch ? abstractMatch[1].trim() : s;
        const lower = (title + " " + abstract).toLowerCase();
        const decision: "include" | "exclude" | "uncertain" = lower.includes("exclude") || lower.includes("not relevant") ? "exclude" : lower.includes("include") || lower.includes("relevant") ? "include" : "uncertain";
        return { title, abstract, decision };
      });
      setScreenedStudies(parsed);
      setCurrentStudyIndex(0);
    } catch (err: any) {
      setAiOutput(`Screening error: ${err.message || "Unknown error"}`);
    } finally {
      setScreeningLoading(false);
    }
  };

  const handleMetaPipeExtract = async () => {
    if (screenedStudies.length === 0) {
      setAiOutput("Please complete ASReview screening first.");
      return;
    }
    setLocalLoading(true);
    setAiOutput("");
    try {
      const included = screenedStudies.filter((s) => s.decision === "include" || s.decision === "uncertain");
      const prompt = `Act as meta-pipe (htlin222/meta-pipe) automated extractor.

Based on the following ${included.length} included studies from an ASReview LAB screening:
${included.map((s, i) => `${i + 1}. ${s.title}\n   ${s.abstract}`).join("\n\n")}

Generate a meta-analysis-ready extraction table with columns:
Study | Outcome | Effect Estimate | 95% CI Lower | 95% CI Upper | Weight

Also include:
1. Pooled effect estimate (random-effects model)
2. Heterogeneity statistics (I², tau²)
3. PRISMA-ready summary
4. Forest-plot data in CSV format

Reference meta-pipe stages: ma-data-extraction, ma-meta-analysis.`;
      let text: string;
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt);
      } else if (state.deepseekApiKey) {
        text = await callDeepSeek(state.deepseekApiKey, prompt);
      } else {
        text = "Please configure an AI provider in Settings to use meta-pipe extraction.";
      }
      setMetaAnalysisOutput(text);
      setStep(6);
    } catch (err: any) {
      setAiOutput(`Extraction error: ${err.message || "Unknown error"}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const runAnalysis = () => {
    if (!outcome) {
      setComputationError("Please define an outcome column in Step 8.");
      return;
    }
    if (!outcome || outcomeType === "binary" && !csvHeaders.includes(outcome)) {
      setComputationError("Please define an outcome column that matches your CSV headers.");
      return;
    }
    if (!csvHeaders.length || csvRows.length === 0) {
      setComputationError("Please upload an aggregated dataset in Step 7 first.");
      return;
    }

    setComputationLoading(true);
    setComputationError(null);
    setComputationResult(null);

    try {
      const result = runAutoPrognosis({
        headers: csvHeaders,
        rows: csvRows,
        outcomeColumn: outcome,
        outcomeType: outcomeType as "binary" | "continuous" | "survival",
        testSize: parseFloat(testSize) || 0.3,
        maxPredictors: parseInt(maxPredictors, 10) || 10,
        randomSeed: 42,
      });
      setComputationResult(result);
      setPigData(
        result.pigTable
          .map((row) => `${row.predictor},${row.coefficient},${row.oddsRatio},${row.ciLower},${row.ciUpper},${row.importance}`)
          .join("\n")
      );
    } catch (err: any) {
      setComputationError(err.message || "Analysis failed");
    } finally {
      setComputationLoading(false);
    }
  };

  const handleAiAssist = async () => {
    setLocalLoading(true);
    setAiOutput("");
    let prompt = "";

    switch (step) {
      case 1:
        prompt = `Act as ASReview LAB (Rensvandeschoot/automated-systematic-review) assistant.
Help formulate a search query for systematic screening of literature relevant to AutoPrognosis-style clinical prediction models.
Topic: ${searchQuery || "prognosis / prediction modeling"}
Guidance: suggest boolean search strings, inclusion/exclusion criteria, and prevalence estimation for active learning prioritization.`;
        break;
      case 2:
        prompt = `Explain ASReview LAB active-learning screening (Rensvandeschoot/automated-systematic-review).
Explain Oracle, Exploration, and Simulation modes.
For the current screened set (${screenedStudies.length} studies), suggest how to prioritize uncertain records for human review to minimize screening burden while keeping recall high.`;
        break;
      case 3:
        prompt = `Guide full-text review and deduplication for ASReview-style systematic screening.
List eligibility checks specific to clinical prediction-modeling studies (AutoPrognosis / prognosis model development).
Include TRIPOD checklist essentials and proposed ${outcomeType} outcome validation requirements.`;
        break;
      case 4:
        prompt = `Act as meta-pipe (htlin222/meta-pipe) data-extraction module (ma-data-extraction).
For the included studies from the prior screening, build an extraction schema for:
- Predictors
- Outcome definition
- Effect estimates / event counts
- Validation method
Suggest CSV columns and provide example rows.`;
        break;
      case 5:
        prompt = `Act as meta-pipe (htlin222/meta-pipe) meta-analysis module (ma-meta-analysis).
For extracted data from clinical prediction-modeling studies, describe the meta-analytic plan:
- Pooling strategy for AUC, calibration slope, Brier score
- Heterogeneity assessment (I², tau²)
- Subgroup analyses (outcome type, predictor set size)
- PRISMA-compliant reporting guidance.`;
        break;
      case 6:
        prompt = `Act as meta-pipe (htlin222/meta-pipe) reporting module (ma-publication-quality / ma-manuscript-quarto).
Given the prior screening and meta-analysis outputs, generate a structured results draft including:
1. PRISMA flow
2. Risk of bias / study characteristics summary
3. Pooled effect table
4. Forest-plot data
5. Manuscript-ready Results section in markdown.`;
        break;
      case 7:
        prompt = `Prepare the aggregated dataset from prior meta-analysis for AutoPrognosis 2.0.
Guidance on converting pooled effect data + study-level data into a model-ready CSV:
- Outcome column encoding for ${outcomeType || "binary"} outcome
- Predictor standardization
- Train/test split recommendations
- Missing-data handling aligned with AutoPrognosis workflow.`;
        break;
      case 8:
        prompt = `For AutoPrognosis 2.0, given outcome "${outcome || "clinical outcome"}" (${outcomeType}), recommend:
- Candidate predictors
- Test size (${testSize})
- Max predictors for Forward Stepwise Selection (${maxPredictors})
- Stopping criterion
Reference Efthimiou et al. (BMJ 2024, PMC11369751) and PyHealth conventions.`;
        break;
      case 9:
        prompt = `Explain how to run AutoPrognosis 2.0 on the aggregated dataset:
- Forward Stepwise Selection stopping criteria
- AUC optimism correction
- Predictor Insights Graph interpretation
- Overfitting detection thresholds;
- Include example commands/outputs for this ${outcomeType} prediction task.`;
        break;
      case 10:
        prompt = `Generate a TRIPOD-compliant report for an AutoPrognosis study preceded by ASReview screening and meta-pipe extraction & meta-analysis.
Include:
- Screening flow (ASReview LAB)
- Evidence synthesis (meta-pipe)
- Model development summary (AutoPrognosis 2.0)
- PIG table interpretation
- Deployment guidance.`;
        break;
      default:
        prompt = "Provide guidance for this AutoPrognosis step.";
    }

    const apiKey = state.geminiApiKey || state.groqApiKey || state.deepseekApiKey;
    if (!apiKey) {
      setAiOutput("Please configure an AI provider in Settings first.");
      setLocalLoading(false);
      return;
    }

    try {
      let text: string;
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt);
      } else if (state.deepseekApiKey) {
        text = await callDeepSeek(state.deepseekApiKey, prompt);
      } else {
        throw new Error("No API key configured");
      }
      setAiOutput(text);
    } catch (err: any) {
      setAiOutput(`Error: ${err.message || "Unknown error"}. Please ensure your API key is valid.`);
    } finally {
      setLocalLoading(false);
    }
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

  const downloadComputationResults = () => {
    if (!computationResult) return;
    const lines = [
      "predictor,coefficient,odds_ratio,ci_lower,ci_upper,importance",
      ...computationResult.pigTable.map(
        (row) =>
          `${row.predictor},${row.coefficient},${row.oddsRatio},${row.ciLower},${row.ciUpper},${row.importance}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autoprognosis-pig.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentStepLabel = ALL_STEPS.find((s) => s.num === step)?.label || "";

  return (
    <div className="space-y-6">
      <div className={`${PHASE_COLORS[getPhase(step)].bg} border ${PHASE_COLORS[getPhase(step)].border} rounded-lg p-6 shadow`}>
        <div className="flex items-center gap-3 mb-4">
          <FlaskConical className="text-yellow-400" size={24} />
          <div>
            <h2 className="text-xl font-bold text-white">AutoPrognosis Pipeline</h2>
            <p className="text-sm text-blue-300">
              ASReview LAB screening → meta-pipe extraction & meta-analysis → AutoPrognosis 2.0 on aggregated data
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={step === 1}
              className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
            >
              <ArrowLeft size={12} /> Previous
            </button>
            <span className="text-xs text-blue-400">
              Step {step} of {ALL_STEPS.length}
            </span>
            <button
              onClick={handleNext}
              disabled={step === ALL_STEPS.length}
              className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
            >
              Next <ArrowRight size={12} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runAnalysis}
              disabled={step < 9 || computationLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {computationLoading ? (
                <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
              ) : (
                <BarChart3 size={14} />
              )}
              Run AutoPrognosis
            </button>
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
          {ALL_STEPS.map((s) => {
            const sPhase = getPhase(s.num);
            const isActive = step === s.num;
            return (
              <button
                key={s.num}
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                  isActive
                    ? sPhase === "asreview"
                      ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                      : sPhase === "metapipe"
                        ? "border-blue-400 text-blue-300 bg-blue-400/10"
                        : "border-yellow-400 text-yellow-300 bg-yellow-400/10"
                    : "border-blue-800 text-blue-300 hover:border-blue-600"
                }`}
              >
                <s.icon size={12} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 1: ASReview Study Import</h3>
              <p className="text-sm text-blue-300">
                Import or describe studies for active-learning screening following Rensvandeschoot/automated-systematic-review.
                ASReview LAB supports Oracle, Exploration, and Simulation modes; here the AI acts as an Oracle screener.
              </p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Research Question / Search Query</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., prognostic models for active TB progression"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleAsReviewScreen}
                disabled={screeningLoading || !searchQuery.trim()}
                className="flex items-center gap-2 bg-emerald-900/50 text-emerald-200 px-4 py-2 rounded text-xs hover:bg-emerald-800/60 disabled:opacity-50"
              >
                {screeningLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Run ASReview-style Screening
              </button>
              {screenedStudies.length > 0 && (
                <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-400 mb-2">{screenedStudies.length} studies screened</p>
                  <div className="space-y-2">
                    {screenedStudies.map((s, i) => (
                      <div key={i} className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-white font-medium">{s.title}</p>
                          <p className="text-[10px] text-blue-300 line-clamp-2">{s.abstract}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          s.decision === "include" ? "bg-green-900/40 text-green-300" :
                          s.decision === "exclude" ? "bg-red-900/40 text-red-300" :
                          "bg-yellow-900/40 text-yellow-300"
                        }`}>{s.decision}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 2: Active Learning Review</h3>
              <p className="text-sm text-blue-300">
                Continue ASReview LAB-style active learning. Review uncertain studies, refine inclusion criteria, and iterate.
              </p>
              {screenedStudies.length > 0 ? (
                <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                  <p className="text-xs text-blue-400 mb-2">Active Learning Summary</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-2xl font-bold text-green-300">{screenedStudies.filter(s => s.decision === "include").length}</p><p className="text-[10px] text-blue-300">Included</p></div>
                    <div><p className="text-2xl font-bold text-yellow-300">{screenedStudies.filter(s => s.decision === "uncertain").length}</p><p className="text-[10px] text-blue-300">Uncertain</p></div>
                    <div><p className="text-2xl font-bold text-red-300">{screenedStudies.filter(s => s.decision === "exclude").length}</p><p className="text-[10px] text-blue-300">Excluded</p></div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-blue-400">Complete Step 1 screening first.</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 3: Full-text Review</h3>
              <p className="text-sm text-blue-300">
                Perform full-text eligibility review using ASReview-style checks. Confirm included studies satisfy prediction-model study criteria aligned with TRIPOD.
              </p>
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-xs text-blue-200">
                  Eligibility: study design (development / validation / both), outcome definition, predictor availability, sample size, reporting quality.
                  Auto-approve screened inclusions from Step 2 pending manual spot-check.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 4: meta-pipe Data Extraction</h3>
              <p className="text-sm text-blue-300">
                Automated end-to-end extraction following htlin222/meta-pipe (ma-data-extraction).
              </p>
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-xs text-blue-200 mb-2">Extraction schema per study:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-blue-300">
                  {["Study", "Outcome", "Effect Estimate", "95% CI Lower", "95% CI Upper", "Weight", "Predictors", "Validation"].map((col) => (
                    <div key={col} className="bg-blue-900/30 border border-blue-800 rounded px-2 py-1">{col}</div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleMetaPipeExtract}
                disabled={localLoading || screenedStudies.length === 0}
                className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-4 py-2 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
              >
                {localLoading ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />}
                Run meta-pipe Extraction
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 5: Meta-Analysis</h3>
              <p className="text-sm text-blue-300">
                Pool effects using meta-pipe methodology (ma-meta-analysis). Random-effects model recommended for prediction-model evidence.
              </p>
              {metaAnalysisOutput ? (
                <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                  <pre className="text-xs text-blue-200 whitespace-pre-wrap overflow-x-auto max-h-[600px] overflow-y-auto">{metaAnalysisOutput}</pre>
                </div>
              ) : (
                <p className="text-xs text-blue-400">Run Step 4 extraction first.</p>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 6: Reporting</h3>
              <p className="text-sm text-blue-300">
                PRISMA-ready outputs, forest data, and manuscript-ready results from meta-pipe (ma-publication-quality / ma-manuscript-quarto).
              </p>
              {metaAnalysisOutput ? (
                <div className="flex gap-2">
                  <button onClick={() => downloadMarkdownAsWord(metaAnalysisOutput, "meta-pipe-report.docx")} className="flex items-center gap-1 text-[10px] bg-blue-900 text-blue-200 px-2 py-1 rounded"><Download size={10} /> Word</button>
                  <button onClick={() => downloadMarkdownAsPDF(metaAnalysisOutput, "meta-pipe-report.pdf")} className="flex items-center gap-1 text-[10px] bg-blue-900 text-blue-200 px-2 py-1 rounded"><Download size={10} /> PDF</button>
                </div>
              ) : (
                <p className="text-xs text-blue-400">Complete meta-analysis first.</p>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 7: Dataset Preparation</h3>
              <p className="text-sm text-blue-300">
                Upload the aggregated dataset ready for AutoPrognosis 2.0. This dataset should be derived from the meta-analysis extraction.
              </p>
              <div className="border-2 border-dashed border-blue-800 rounded-lg p-6 text-center">
                <Upload className="mx-auto text-blue-400 mb-2" size={32} />
                <p className="text-sm text-blue-300 mb-3">Upload aggregated dataset (CSV)</p>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="text-sm text-blue-300" />
                {csvPreview && (
                  <div className="mt-4 bg-blue-950 border border-blue-800 rounded-lg p-3 text-left">
                    <p className="text-xs text-blue-400 mb-2">Preview (first 10 lines):</p>
                    <pre className="text-xs text-blue-100 whitespace-pre-wrap overflow-x-auto">{csvPreview}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 8: Model Configuration</h3>
              <p className="text-sm text-blue-300">
                Configure AutoPrognosis 2.0 for the aggregated dataset from meta-pipe.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Outcome</label>
                  <input type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g., progression to active TB" className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Outcome Type</label>
                  <select value={outcomeType} onChange={(e) => setOutcomeType(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm">
                    <option value="binary">Binary</option>
                    <option value="continuous">Continuous</option>
                    <option value="survival">Time-to-event (Survival)</option>
                    <option value="competing_risk">Competing Risk</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Test Size</label>
                  <input type="number" step="0.1" value={testSize} onChange={(e) => setTestSize(e.target.value)} placeholder="0.3" className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Max Predictors</label>
                  <input type="number" value={maxPredictors} onChange={(e) => setMaxPredictors(e.target.value)} placeholder="10" className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
                </div>
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 9: Run AutoPrognosis</h3>
              <p className="text-sm text-blue-300">
                Execute Forward Stepwise Selection, AUC evaluation, and PIG generation on the aggregated dataset.
              </p>
              <button
                onClick={runAnalysis}
                disabled={computationLoading}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {computationLoading ? <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" /> : <Play size={14} />}
                Run AutoPrognosis
              </button>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 10: Results & PIG</h3>
              <p className="text-sm text-blue-300">
                Review AutoPrognosis 2.0 output: discrimination, overfitting check, Predictor Insights Graph, and final model equation.
              </p>
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-200">
                  Include: model equation, performance metrics (AUC, calibration slope, Brier score),
                  validation method, PIG table, and deployment guidance (FastAPI + HTML calculator).
                </p>
              </div>
            </div>
          )}

          {computationError && (
            <div className="bg-red-900/50 border border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-200">{computationError}</p>
            </div>
          )}

          {computationResult && (
            <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">Computed Results</h4>
                <button onClick={downloadComputationResults} className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1">
                  <Download size={12} /> Download PIG CSV
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-blue-400">Test AUC</p>
                  <p className="text-lg font-bold text-white">{computationResult.auc.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-400">Train AUC</p>
                  <p className="text-lg font-bold text-white">{computationResult.trainAuc.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-400">Selected Predictors</p>
                  <p className="text-lg font-bold text-white">{computationResult.selectedPredictors.length}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-400">Overfitting</p>
                  <p className="text-lg font-bold text-white">{computationResult.overfittingDetected ? "Yes" : "No"}</p>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-blue-800">
                      <th className="px-2 py-1 text-blue-300">Predictor</th>
                      <th className="px-2 py-1 text-blue-300">Coefficient</th>
                      <th className="px-2 py-1 text-blue-300">Odds Ratio</th>
                      <th className="px-2 py-1 text-blue-300">95% CI</th>
                      <th className="px-2 py-1 text-blue-300">Importance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computationResult.pigTable.map((row) => (
                      <tr key={row.predictor} className="border-b border-blue-900/50">
                        <td className="px-2 py-1 text-white">{row.predictor}</td>
                        <td className="px-2 py-1 text-blue-200">{row.coefficient.toFixed(4)}</td>
                        <td className="px-2 py-1 text-blue-200">{row.oddsRatio.toFixed(4)}</td>
                        <td className="px-2 py-1 text-blue-200">[{row.ciLower.toFixed(4)}, {row.ciUpper.toFixed(4)}]</td>
                        <td className="px-2 py-1 text-blue-200">{row.importance.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiOutput && (
            <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">AI Guidance ({currentStepLabel})</h4>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleDownloadWord} className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1">
                    <Download size={12} /> Word
                  </button>
                  <button onClick={handleDownloadPDF} className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1">
                    <Download size={12} /> PDF
                  </button>
                </div>
              </div>
              <div className="text-xs text-blue-200 prose prose-xs prose-invert max-h-[600px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiOutput) }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

