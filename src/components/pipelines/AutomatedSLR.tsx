"use client";

import React, { useState, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import {
  Microscope, Search, Database, List, CheckCircle2, X,
  ChevronRight, ChevronLeft, Filter, ShieldAlert, BarChart3,
  FileText, Save, Download, Copy, Loader2, Plus, Trash2,
  RefreshCw, MapPin, Layers, ClipboardList, Brain
} from "lucide-react";
import {
  fetchRealPapers, type Paper, deduplicatePapers,
} from "@/lib/database-apis";
import { extractPICOForPapers } from "@/lib/pico-extractor";
import {
  buildProblemFormulation,
  buildProtocol,
  buildSearchQueries,
  buildScreeningCriteria,
  buildExtractionPrompt,
  buildQualityAssessment,
  buildSynthesisPrompt,
  buildReportingPrompt,
  buildCitationChasing,
  buildLivingSLR,
  SLR_SKILLS,
  type SLRQuestion,
} from "@/lib/slr-skills";
import { marked } from "marked";

const STEP_LABELS: Record<number, string> = {
  1: "Problem Formulation",
  2: "Protocol Development",
  3: "Literature Search",
  4: "Study Selection",
  5: "Data Extraction",
  6: "Quality Assessment",
  7: "Data Synthesis",
  8: "Reporting",
};

const FRAMEWORK_FIELDS: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  PICO: [
    { key: "slrPopulation", label: "Population (P)", placeholder: "e.g. adults with type 2 diabetes" },
    { key: "slrIntervention", label: "Intervention (I)", placeholder: "e.g. metformin therapy" },
    { key: "slrComparator", label: "Comparator (C)", placeholder: "e.g. placebo or standard care" },
    { key: "slrOutcome", label: "Outcome (O)", placeholder: "e.g. HbA1c reduction" },
    { key: "slrTimeframe", label: "Timeframe (T)", placeholder: "e.g. 12 months follow-up" },
  ],
  PECO: [
    { key: "slrPopulation", label: "Population (P)", placeholder: "e.g. adults with hypertension" },
    { key: "slrIntervention", label: "Exposure (E)", placeholder: "e.g. high sodium intake" },
    { key: "slrComparator", label: "Comparator (C)", placeholder: "e.g. low sodium intake" },
    { key: "slrOutcome", label: "Outcome (O)", placeholder: "e.g. cardiovascular events" },
    { key: "slrTimeframe", label: "Timeframe (T)", placeholder: "e.g. 5 years" },
  ],
  PECOT: [
    { key: "slrPopulation", label: "Population (P)", placeholder: "e.g. preterm infants" },
    { key: "slrIntervention", label: "Exposure (E)", placeholder: "e.g. breast milk fortifier" },
    { key: "slrComparator", label: "Comparator (C)", placeholder: "e.g. standard formula" },
    { key: "slrOutcome", label: "Outcome (O)", placeholder: "e.g. weight gain velocity" },
    { key: "slrTimeframe", label: "Timeframe (T)", placeholder: "e.g. hospital discharge" },
  ],
  freeflow: [],
};

export default function AutomatedSLR() {
  const { state, dispatch } = useApp();

  const [activeStep, setActiveStep] = useState(state.slrStep || 1);
  const [framework, setFramework] = useState(state.slrFramework || "PICO");
  const [freeQuery, setFreeQuery] = useState(state.slrFreeQuery || "");
  const [population, setPopulation] = useState(state.slrPopulation || "");
  const [intervention, setIntervention] = useState(state.slrIntervention || "");
  const [comparator, setComparator] = useState(state.slrComparator || "");
  const [outcome, setOutcome] = useState(state.slrOutcome || "");
  const [timeframe, setTimeframe] = useState(state.slrTimeframe || "");
  const [yearFrom, setYearFrom] = useState(state.slrYearFrom || "");
  const [yearTo, setYearTo] = useState(state.slrYearTo || "");
  const [databases, setDatabases] = useState<string[]>(state.slrDatabases || [
    "PubMed", "Europe PMC", "bioRxiv", "medRxiv", "Crossref",
    "arXiv", "Zenodo", "ClinicalTrials.gov",
  ]);
  const [biasAssessing, setBiasAssessing] = useState(false);
  const [slrBias, setSlrBias] = useState<Record<string, { risk: "low" | "some" | "high"; aiGenerated: boolean }>>({});

  const callAi = useCallback(
    async (prompt: string): Promise<string> => {
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: state.searchQuery };
      if (state.geminiApiKey) return callGemini(state.geminiApiKey, prompt, searchOptions);
      if (state.groqApiKey) return callGroq(state.groqApiKey, prompt, searchOptions);
      return callDeepSeek(prompt, searchOptions);
    },
    [state.geminiApiKey, state.groqApiKey, state.searchQuery]
  );
  const [searching, setSearching] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const ALL_DATABASES = [
    "PubMed", "Europe PMC", "bioRxiv", "medRxiv", "Crossref",
    "arXiv", "Zenodo", "ClinicalTrials.gov",
  ];

  const goToStep = (step: number) => {
    setActiveStep(step);
    dispatch({ type: "SET_SLR_STEP", payload: step });
  };

  const updateField = (field: string, value: string) => {
    dispatch({ type: "SET_SLR_FIELD", payload: { field: field as any, value } });
    if (field === "slrFramework") setFramework(value as any);
    if (field === "slrFreeQuery") setFreeQuery(value);
    if (field === "slrPopulation") setPopulation(value);
    if (field === "slrIntervention") setIntervention(value);
    if (field === "slrComparator") setComparator(value);
    if (field === "slrOutcome") setOutcome(value);
    if (field === "slrTimeframe") setTimeframe(value);
    if (field === "slrYearFrom") setYearFrom(value);
    if (field === "slrYearTo") setYearTo(value);
  };

  const question: SLRQuestion = {
    framework,
    population,
    intervention,
    exposure: intervention,
    comparator,
    outcome,
    timeframe,
    freeQuery,
    yearFrom,
    yearTo,
  };

  const handleRunSearch = async () => {
    setSearching(true);
    try {
      const queries = buildSearchQueries(question, databases);
      const allPapers: Paper[] = [];

      for (let i = 0; i < queries.length; i++) {
        try {
          const papers = await fetchRealPapers(
            queries[i],
            [databases[i % databases.length]],
            yearFrom,
            yearTo,
            "All Study Types",
          );
          papers.forEach((p) => {
            if (!p.database) p.database = databases[i % databases.length];
          });
          allPapers.push(...papers);
        } catch (err) {
          console.warn(`Search failed for ${databases[i % databases.length]}:`, err);
        }
      }

      const deduped = deduplicatePapers(allPapers);
      dispatch({ type: "SET_SLR_PAPERS", payload: deduped });
      dispatch({ type: "SET_SLR_PRISMA", payload: {
        identified: deduped.length,
        screened: 0,
        eligible: 0,
        included: 0,
      }});
      goToStep(4);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleScreen = (paper: Paper, include: boolean) => {
    const screened = state.slrScreenedPapers.map((p) =>
      p.id === paper.id ? { ...p, screened: true, included: include } : p
    );
    const included = include
      ? [...state.slrIncludedPapers, { ...paper, included: true }]
      : state.slrIncludedPapers.filter((p) => p.id !== paper.id);
    dispatch({ type: "SET_SLR_SCREENED", payload: screened });
    dispatch({ type: "SET_SLR_INCLUDED", payload: included });
    dispatch({ type: "SET_SLR_PRISMA", payload: {
      identified: state.slrPapers.length,
      screened: screened.filter((p) => p.screened === true).length,
      eligible: included.length,
      included: included.length,
    }});
  };

  const handleRunExtraction = async () => {
    setExtracting(true);
    try {
      const included = state.slrIncludedPapers;
      if (included.length === 0) return;

      const picoResults = extractPICOForPapers(
        included.map((p) => ({
          id: p.id,
          title: p.title,
          abstract: p.abstract,
          studyType: p.studyType,
        }))
      );

      const synthesisRows = included.map((p, i) => ({
        id: p.id,
        reference: `${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>. ${p.doi ? `doi:${p.doi}` : ""}`,
        keyFindings: picoResults[i]?.effectEstimate || "Not reported",
        synopsis: picoResults[i]?.population || "Not extracted",
        studyDetails: `Population: ${picoResults[i]?.population || "N/A"}. Intervention: ${picoResults[i]?.intervention || "N/A"}. Comparator: ${picoResults[i]?.comparison || "N/A"}. Outcome: ${picoResults[i]?.outcome || "N/A"}.`,
        researchGaps: picoResults[i]?.researchGaps || "Not extracted",
      }));

      dispatch({ type: "SET_SLR_SYNTHESIS", payload: synthesisRows });
      goToStep(6);
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateReport = async () => {
    const included = state.slrIncludedPapers;
    const systemPrompt = "You are an expert systematic review methodologist. Write a complete, PRISMA 2020-compliant systematic literature review report.";
    const fullPrompt = `${systemPrompt}\n\n${buildReportingPrompt(question, included, state.slrResults || "")}`;

    try {
      const res = await callGemini(state.geminiApiKey || "", fullPrompt, {
        searchEnabled: false,
      });
      dispatch({ type: "SET_SLR_RESULTS", payload: res });
      goToStep(8);
    } catch (err) {
      console.error("Report generation failed:", err);
    }
  };

  const handleReset = () => {
    dispatch({ type: "RESET_SLR" });
    setActiveStep(1);
    setFramework("PICO");
    setFreeQuery("");
    setPopulation("");
    setIntervention("");
    setComparator("");
    setOutcome("");
    setTimeframe("");
    setYearFrom("");
    setYearTo("");
    setDatabases(ALL_DATABASES);
  };

  const setBiasRating = (paperId: string, risk: "low" | "some" | "high") => {
    setSlrBias((prev) => ({
      ...prev,
      [paperId]: { risk, aiGenerated: false },
    }));
  };

  const handleRunBiasAssessment = async () => {
    setBiasAssessing(true);
    const included = state.slrIncludedPapers;
    try {
      if (included.length === 0) return;

      const prompt = `# RoB Assessment - Robtreviewer / Robvis
      Assess risk of bias for each of the following ${included.length} included studies using appropriate tools:
      - RoB 2 for RCTs
      - NOS for observational studies
      - AMSTAR-2 for systematic reviews
      - QUADAS-2 for diagnostic accuracy studies
      
      Studies to assess:
      ${included.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal}. Study type: ${p.studyType}. Abstract: ${p.abstract}`).join("\n\n")}
      
      For each paper, output ONLY:
      Paper N: [Low Risk / Some Concerns / High Risk]
      Reason: [1-2 sentences based on study design, sample size, potential biases]
      
      Be concise and consistent.`;

      const text = await callAi(prompt);
      const ratings: Record<string, { risk: "low" | "some" | "high"; aiGenerated: boolean }> = {};
      const lines = text.split("\n");
      let currentPaper: number | null = null;
      let currentRisk: "low" | "some" | "high" | null = null;
      
      for (const line of lines) {
        const paperMatch = line.match(/Paper (\d+):/);
        if (paperMatch) {
          currentPaper = parseInt(paperMatch[1], 10);
          currentRisk = null;
        }
        const riskMatch = line.match(/\[(Low Risk|Some Concerns|High Risk)\]/i);
        if (riskMatch && currentPaper !== null) {
          const riskStr = riskMatch[1].toLowerCase();
          if (riskStr.includes("low")) currentRisk = "low";
          else if (riskStr.includes("some")) currentRisk = "some";
          else if (riskStr.includes("high")) currentRisk = "high";
          if (currentRisk && included[currentPaper - 1]) {
            ratings[included[currentPaper - 1].id] = { risk: currentRisk, aiGenerated: true };
          }
        }
      }
      
      if (Object.keys(ratings).length > 0) {
        setSlrBias(ratings);
      }
    } catch (err: any) {
        console.error("AI bias assessment failed:", err);
        const fallbackRatings: Record<string, { risk: "low" | "some" | "high"; aiGenerated: boolean }> = {};
        included.forEach((p: Paper) => {
          fallbackRatings[p.id] = { risk: "some", aiGenerated: false };
        });
        setSlrBias(fallbackRatings);
      } finally {
        setBiasAssessing(false);
      }
    };

  const progress = ((activeStep - 1) / 7) * 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0d1b3e] p-4 rounded-xl border border-blue-900/50">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Microscope size={24} className="text-emerald-400" /> Automated SLR
          </h2>
          <p className="text-sm text-blue-300 mt-1">
            Systematic Literature Review pipeline — PICO/PECO/PECOT/freeflow
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="text-xs bg-red-900/20 text-red-300 px-3 py-1.5 rounded hover:bg-red-900/40 border border-red-900/30"
          >
            Reset Pipeline
          </button>
        </div>
      </div>

      <div className="w-full">
        <div className="flex justify-between text-xs text-blue-300 mb-1">
          <span>SLR Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-[#1e293b] rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-4">
        {Object.entries(STEP_LABELS).map(([num, label]) => {
          const n = parseInt(num);
          const isActive = activeStep === n;
          const isCompleted = n < activeStep;
          return (
            <button
              key={num}
              onClick={() => goToStep(n)}
              disabled={n > activeStep && n !== 1}
              className={`flex flex-col items-center gap-1 px-3 py-2 min-w-[100px] rounded-lg border transition-colors ${
                isActive
                  ? "bg-emerald-900/30 text-emerald-300 border-emerald-500"
                  : isCompleted
                  ? "bg-[#1e293b] text-blue-300 border-blue-500/50"
                  : "bg-[#0f172a]/50 text-blue-500/50 border-transparent"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                isActive ? "bg-emerald-500 text-white" : isCompleted ? "bg-blue-500 text-white" : "bg-transparent text-blue-500 border border-blue-500/30"
              }`}>{n}</div>
              <span className="text-[10px] truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {activeStep === 1 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 1 — Problem Formulation</h3>
            <p className="text-blue-300 text-sm mb-4">
              Define your research question using PICO, PECO, PECOT, or freeflow.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-blue-300 mb-1">Framework</label>
                <select
                  value={framework}
                  onChange={(e) => {
                    setFramework(e.target.value as any);
                    updateField("slrFramework", e.target.value);
                  }}
                  className="w-full bg-[#1e293b] border-blue-900/50 text-white rounded px-3 py-2"
                >
                  {["PICO", "PECO", "PECOT", "freeflow"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => goToStep(2)}
                  disabled={!(framework === "freeflow" ? freeQuery : population || intervention || outcome)}
                  className={`px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                    !(framework === "freeflow" ? freeQuery : population || intervention || outcome)
                      ? "bg-blue-900/30 text-blue-400"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  Next: Protocol
                </button>
              </div>
            </div>
            {framework === "freeflow" ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-blue-300">Free-flow Research Question</label>
                <textarea
                  value={freeQuery}
                  onChange={(e) => {
                    setFreeQuery(e.target.value);
                    updateField("slrFreeQuery", e.target.value);
                  }}
                  rows={4}
                  className="w-full bg-[#1e293b] border-blue-900/50 text-white rounded px-3 py-2 focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. What is the effectiveness of telehealth for managing chronic pain in rural populations?"
                />
                <p className="text-xs text-blue-400/70">Enter your research question in natural language.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {FRAMEWORK_FIELDS[framework].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-blue-300">{field.label}</label>
                    <input
                      value={
                        field.key === "slrPopulation" ? population :
                        field.key === "slrIntervention" ? intervention :
                        field.key === "slrComparator" ? comparator :
                        field.key === "slrOutcome" ? outcome :
                        field.key === "slrTimeframe" ? timeframe : ""
                      }
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-[#1e293b] border-blue-900/50 text-white rounded px-3 py-2 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-blue-900/30">
              <div>
                <label className="block text-xs font-semibold text-blue-300 mb-1">Year From</label>
                <input
                  type="number"
                  value={yearFrom}
                  onChange={(e) => updateField("slrYearFrom", e.target.value)}
                  placeholder="e.g. 2021"
                  className="w-full bg-[#1e293b] border-blue-900/50 text-white rounded px-3 py-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-300 mb-1">Year To</label>
                <input
                  type="number"
                  value={yearTo}
                  onChange={(e) => updateField("slrYearTo", e.target.value)}
                  placeholder="e.g. 2026"
                  className="w-full bg-[#1e293b] border-blue-900/50 text-white rounded px-3 py-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 2 — Protocol Development</h3>
            <p className="text-blue-300 text-sm mb-4">
              Select databases and define inclusion/exclusion criteria.
            </p>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-blue-300">Databases to Search</label>
              <div className="flex flex-wrap gap-2">
                {ALL_DATABASES.map((db) => (
                  <button
                    key={db}
                    onClick={() => {
                      const next = databases.includes(db)
                        ? databases.filter((d) => d !== db)
                        : [...databases, db];
                      setDatabases(next);
                      dispatch({ type: "SET_SLR_DATABASES", payload: next });
                    }}
                    className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                      databases.includes(db)
                        ? "bg-emerald-900/30 text-emerald-300 border-emerald-500"
                        : "bg-[#1e293b] text-blue-300 border-blue-900/50 hover:border-blue-500"
                    }`}
                  >
                    {db}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 p-3 bg-[#1e293b] rounded border border-blue-900/30">
              <h4 className="text-xs font-semibold text-blue-300 mb-2">Generated Protocol</h4>
              <pre className="text-xs text-blue-200 overflow-x-auto">{buildProtocol(question, databases)}</pre>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => goToStep(1)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={handleRunSearch}
                disabled={searching || databases.length === 0}
                className={`ml-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                  searching || databases.length === 0
                    ? "bg-blue-900/30 text-blue-400"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {searching ? <Loader2 size={14} className="mr-2" /> : ""} Run Literature Search
              </button>
            </div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 3 — Literature Search</h3>
            <p className="text-blue-300 text-sm mb-4">
              Searching {databases.length} database(s) for:{" "}
              <span className="font-mono text-emerald-300">{question.freeQuery || `${population} ${intervention} ${comparator} ${outcome}`}</span>
            </p>
            {searching && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-blue-300">Searching databases...</span>
                </div>
              </div>
            )}
            {!searching && state.slrPapers.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-300">Papers identified:</span>
                  <span className="font-mono text-emerald-300">{state.slrPapers.length}</span>
                </div>
                <div className="p-3 bg-[#1e293b] rounded border border-blue-900/30 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-blue-400/70 border-b border-blue-900/50">
                        <th className="text-left pb-2">Title</th>
                        <th className="text-left pb-2">Database</th>
                        <th className="text-left pb-2">Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.slrPapers.slice(0, 20).map((p) => (
                        <tr key={p.id} className="border-b border-blue-900/20 hover:bg-blue-900/10">
                          <td className="pb-2 truncate max-w-[300px]">{p.title}</td>
                          <td className="pb-2">{p.database}</td>
                          <td className="pb-2">{p.year}</td>
                        </tr>
                      ))}
                      {state.slrPapers.length > 20 && (
                        <tr>
                          <td colSpan={3} className="pb-2 text-xs text-blue-500/70 italic">
                            ...and {state.slrPapers.length - 20} more papers
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => goToStep(4)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    Proceed to Study Selection
                  </button>
                </div>
              </div>
            )}
            {!searching && state.slrPapers.length === 0 && (
              <div className="text-center py-8 text-blue-400/50">
                <p>No papers found. Adjust your search terms or year range.</p>
              </div>
            )}
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(2)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              {!searching && state.slrPapers.length === 0 && (
                <button
                  onClick={handleRunSearch}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                >
                  Retry Search
                </button>
              )}
            </div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 4 — Study Selection</h3>
            <p className="text-blue-300 text-sm mb-4">
              Screen each paper: include or exclude based on relevance.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-blue-400">To Screen ({state.slrPapers.filter((p) => !p.screened).length})</h4>
                  <button
                    onClick={() => {
                      const unscreened = state.slrPapers.filter((p) => !p.screened);
                      if (unscreened.length === 0) return;
                      unscreened.forEach((p) => handleToggleScreen(p, true));
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    Select All → Include
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2 bg-[#1e293b] p-3 rounded border border-blue-900/30">
                  {state.slrPapers.filter((p) => !p.screened).map((p) => (
                    <div key={p.id} className="p-2 border border-blue-900/30 rounded hover:bg-blue-900/10">
                      <div className="text-sm text-blue-200 truncate">{p.title}</div>
                      <div className="text-xs text-blue-500/70 mt-1">{p.database} • {p.year}</div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleToggleScreen(p, true)}
                          className="px-2 py-1 text-xs bg-emerald-900/30 text-emerald-300 rounded hover:bg-emerald-900/50"
                        >
                          Include
                        </button>
                        <button
                          onClick={() => handleToggleScreen(p, false)}
                          className="px-2 py-1 text-xs bg-red-900/30 text-red-300 rounded hover:bg-red-900/50"
                        >
                          Exclude
                        </button>
                      </div>
                    </div>
                  ))}
                  {state.slrPapers.filter((p) => !p.screened).length === 0 && (
                    <p className="text-xs text-blue-400/70 text-center py-2">All papers screened.</p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-400 mb-2">Included ({state.slrIncludedPapers.length})</h4>
                <div className="max-h-96 overflow-y-auto space-y-2 bg-emerald-900/10 p-3 rounded border border-emerald-900/30">
                  {state.slrIncludedPapers.map((p) => (
                    <div key={p.id} className="p-2 border border-emerald-900/30 rounded">
                      <div className="text-sm text-emerald-200 truncate">{p.title}</div>
                      <button
                        onClick={() => handleToggleScreen(p, false)}
                        className="text-xs text-red-400 mt-1 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-blue-400 mb-2">Screening Criteria</h4>
                <div className="p-3 bg-[#1e293b] rounded border border-blue-900/30">
                  <pre className="text-xs text-blue-200">{buildScreeningCriteria(question)}</pre>
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(3)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={() => goToStep(5)}
                disabled={state.slrIncludedPapers.length === 0}
                className={`ml-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                  state.slrIncludedPapers.length === 0
                    ? "bg-blue-900/30 text-blue-400"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                Proceed to Data Extraction
              </button>
            </div>
          </div>
        )}

        {activeStep === 5 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 5 — Data Extraction</h3>
            <p className="text-blue-300 text-sm mb-4">
              Extract PICO elements and study details from included papers.
            </p>
            {extracting && (
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-blue-300">Extracting data from {state.slrIncludedPapers.length} papers...</span>
              </div>
            )}
            {!extracting && state.slrSynthesisRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-blue-400/70 border-b border-blue-900/50">
                      <th className="text-left pb-2">Reference</th>
                      <th className="text-left pb-2">Population</th>
                      <th className="text-left pb-2">Intervention/Exposure</th>
                      <th className="text-left pb-2">Comparator</th>
                      <th className="text-left pb-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.slrSynthesisRows.map((r) => (
                      <tr key={r.id} className="border-b border-blue-900/20">
                        <td className="pb-2 truncate max-w-[200px]">{r.reference}</td>
                        <td className="pb-2 truncate">{r.studyDetails.split(".")[0]}</td>
                        <td className="pb-2 truncate">{r.studyDetails.split(".")[1]}</td>
                        <td className="pb-2 truncate">{r.studyDetails.split(".")[2]}</td>
                        <td className="pb-2 truncate">{r.studyDetails.split(".")[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!extracting && state.slrSynthesisRows.length === 0 && state.slrIncludedPapers.length > 0 && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleRunExtraction}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  Run Data Extraction
                </button>
              </div>
            )}
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(4)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={() => goToStep(6)}
                disabled={state.slrSynthesisRows.length === 0}
                className={`ml-2 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                  state.slrSynthesisRows.length === 0
                    ? "bg-blue-900/30 text-blue-400"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                Proceed to Quality Assessment
              </button>
            </div>
          </div>
        )}

        {activeStep === 6 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 6 — Quality Assessment (Robtreviewer / Robvis)</h3>
            <p className="text-blue-300 text-sm mb-4">
              Automated AI-powered risk-of-bias assessment for each included study.
            </p>
            <div className="mb-4">
              <button
                onClick={handleRunBiasAssessment}
                disabled={biasAssessing || state.slrIncludedPapers.length === 0}
                className={`w-full py-2 rounded-lg text-white font-medium transition-colors ${
                  biasAssessing || state.slrIncludedPapers.length === 0
                    ? "bg-blue-900/30 text-blue-400"
                    : "bg-purple-600 hover:bg-purple-500"
                }`}
              >
                {biasAssessing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Brain size={14} />}
                {biasAssessing ? "Running AI Bias Assessment..." : "Run Automated Bias Assessment (Robtreviewer)"}
              </button>
              {state.slrIncludedPapers.length > 0 && (
                <p className="text-[10px] text-purple-400/80 mt-1">
                  Assesses risk of bias across {state.slrIncludedPapers.length} included study(ies) using RoB-2 (RCTs), NOS (observational), AMSTAR-2 (systematic reviews), and QUADAS-2 (diagnostic accuracy) frameworks.
                </p>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {state.slrIncludedPapers.map((p) => {
                const bias = slrBias[p.id] ?? {};
                return (
                  <div key={p.id} className="p-2 border border-blue-900/30 rounded flex justify-between items-center">
                    <div>
                      <div className="text-sm text-blue-200 truncate">{p.title}</div>
                      <div className="text-xs text-blue-500/70">{p.database} • {p.studyType}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setBiasRating(p.id, "low")}
                        className={`px-2 py-1 text-[10px] rounded ${
                          bias.risk === "low" ? "bg-emerald-900 text-emerald-300" : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                        }`}
                      >
                        Low
                      </button>
                      <button
                        onClick={() => setBiasRating(p.id, "some")}
                        className={`px-2 py-1 text-[10px] rounded ${
                          bias.risk === "some" ? "bg-blue-900 text-blue-300" : "bg-blue-900/30 text-blue-400 hover:bg-blue-900/50"
                        }`}
                      >
                        Some
                      </button>
                      <button
                        onClick={() => setBiasRating(p.id, "high")}
                        className={`px-2 py-1 text-[10px] rounded ${
                          bias.risk === "high" ? "bg-red-900 text-red-300" : "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                        }`}
                      >
                        High
                      </button>
                    </div>
                    {bias.risk && (
                      <span className={`text-[10px] font-semibold ${bias.risk === "low" ? "text-emerald-400" : bias.risk === "some" ? "text-blue-400" : "text-red-400"}`}>
                        {bias.risk === "low" ? "Low Risk" : bias.risk === "some" ? "Some Concerns" : "High Risk"}
                        {bias.aiGenerated ? " (AI)" : ""}
                      </span>
                    )}
                  </div>
                );
              })}
              {state.slrIncludedPapers.length === 0 && (
                <p className="text-sm text-blue-400/70 text-center py-4">No included papers to assess.</p>
              )}
            </div>
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(5)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={() => goToStep(7)}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Proceed to Data Synthesis
              </button>
            </div>
          </div>
        )}

        {activeStep === 7 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 7 — Data Synthesis</h3>
            <p className="text-blue-300 text-sm mb-4">
              Synthesize evidence across included studies.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-[#1e293b] rounded border border-blue-900/30">
                <h4 className="text-xs font-bold text-blue-400 mb-2">PRISMA Flow</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Identified:</span> <span className="font-mono text-emerald-300">{state.slrPrismaCounts.identified}</span></div>
                  <div className="flex justify-between"><span>Screened:</span> <span className="font-mono text-emerald-300">{state.slrPrismaCounts.screened}</span></div>
                  <div className="flex justify-between"><span>Eligible:</span> <span className="font-mono text-emerald-300">{state.slrPrismaCounts.eligible}</span></div>
                  <div className="flex justify-between"><span>Included:</span> <span className="font-mono text-emerald-300">{state.slrPrismaCounts.included}</span></div>
                </div>
              </div>
              <div className="p-3 bg-[#1e293b] rounded border border-blue-900/30">
                <h4 className="text-xs font-bold text-blue-400 mb-2">Included Studies</h4>
                <div className="text-sm text-blue-200">{state.slrIncludedPapers.length} papers</div>
              </div>
            </div>
            <div className="mb-4">
              <h4 className="text-xs font-bold text-blue-400 mb-2">Evidence Synthesis</h4>
              <div className="p-3 bg-[#1e293b] rounded border border-blue-900/30 overflow-x-auto">
                <pre className="text-xs text-blue-200">{buildSynthesisPrompt(state.slrIncludedPapers, state.slrPrismaCounts)}</pre>
              </div>
            </div>
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(6)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerateReport}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Generate Report
              </button>
            </div>
          </div>
        )}

        {activeStep === 8 && (
          <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-900/50">
            <h3 className="text-lg font-bold text-white mb-3">Step 8 — Reporting</h3>
            <p className="text-blue-300 text-sm mb-4">
              Final PRISMA 2020-compliant systematic review report.
            </p>
            <div className="relative">
              {state.slrResults ? (
                <div className="prose prose-invert max-w-none p-4 bg-[#1e293b] rounded border border-blue-900/30 overflow-y-auto max-h-[60vh]">
                  {marked.parse(state.slrResults)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-blue-400/50">
                  <FileText size={48} className="mb-2 opacity-50" />
                  <p>Generating report...</p>
                </div>
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  onClick={() => {
                    const blob = new Blob([state.slrResults || ""], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "systematic-review-report.md";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-xs bg-blue-900/30 text-blue-300 rounded hover:bg-blue-900/50"
                >
                  <Download size={14} className="mr-1" /> Download MD
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(state.slrResults || "");
                  }}
                  className="px-3 py-1.5 text-xs bg-blue-900/30 text-blue-300 rounded hover:bg-blue-900/50"
                >
                  <Copy size={14} className="mr-1" /> Copy
                </button>
              </div>
            </div>
            <div className="flex justify-between mt-4">
              <button
                onClick={() => goToStep(7)}
                className="px-4 py-2 rounded-lg text-blue-300 hover:bg-blue-900/30"
              >
                ← Back
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg bg-red-900/20 text-red-300 hover:bg-red-900/40"
              >
                Start New SLR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
