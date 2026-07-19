"use client";

import React, { useState } from "react";
import {
  FlaskConical,
  Download,
  ArrowRight,
  ArrowLeft,
  Search,
  GitMerge,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { callGemini, callGroq, callDeepSeek } from "@/lib/ai";
import { useApp } from "@/context/AppContext";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";

const STEPS = [
  { num: 1, label: "ASReview Screening", icon: Search, phase: "asreview" as const },
  { num: 2, label: "meta-pipe Meta-Analysis", icon: GitMerge, phase: "metapipe" as const },
];

function phaseOf(n: number) {
  if (n <= 1) return "asreview";
  return "metapipe";
}

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  asreview: { bg: "bg-emerald-900/40", text: "text-emerald-300", border: "border-emerald-700/50" },
  metapipe: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-800/50" },
};

export default function AutomaticEvidenceSynthesisTab() {
  const { state } = useApp();
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [screened, setScreened] = useState<
    { title: string; abstract: string; decision: "include" | "exclude" | "uncertain" }[]
  >([]);
  const [screeningLoading, setScreeningLoading] = useState(false);

  const [metaOut, setMetaOut] = useState("");
  const [metaLoading, setMetaLoading] = useState(false);

  const [missingApiError, setMissingApiError] = useState<string | null>(null);

  const handleAsReview = async () => {
    if (!searchQuery.trim()) return;
    setScreeningLoading(true);
    setMissingApiError(null);
    try {
      const prompt = `Act as ASReview LAB (Rensvandeschoot/automated-systematic-review) active-learning screener.

Research question: ${searchQuery}

Generate 8 representative candidate studies (title + 120-word abstract) relevant to prediction modeling/prognosis. Format:
1. TITLE: ...
   ABSTRACT: ...

For each study, provide an ASReview-style relevance score (0-1) and include/exclude recommendation.`;
      const text = state.geminiApiKey ? await callGemini(state.geminiApiKey, prompt) : state.groqApiKey ? await callGroq(state.groqApiKey!, prompt) : await callDeepSeek(prompt);
      const matchArr = text.match(/1\.\s+TITLE:([\s\S]*?)ABSTRACT:([\s\S]*?)(?=\n\d\.|\Z)/g);
      let studies: string[] = matchArr || [];
      if (studies.length === 0) {
        const chunks = text.split(/\n(?=\d+\.\s)/);
        studies = chunks.map((chunk) => {
          const lines = chunk.trim().split(/\r?\n/);
          const title = lines[0]?.replace(/^\d+\.\s*/, "").trim() || "Untitled";
          const abstract = lines.slice(1).join(" ").trim() || chunk;
          return `TITLE: ${title}\nABSTRACT: ${abstract}`;
        });
      }
      const parsed = studies.map((s) => {
        const t = s.match(/TITLE:\s*(.+)/);
        const a = s.match(/ABSTRACT:\s*(.+)/);
        const title = t ? t[1].trim() : "Untitled";
        const abstract = a ? a[1].trim() : s;
        const lower = (title + " " + abstract).toLowerCase();
        const decision: "include" | "exclude" | "uncertain" =
          lower.includes("exclude") || lower.includes("not relevant")
            ? "exclude"
            : lower.includes("include") || lower.includes("relevant")
              ? "include"
              : "uncertain";
        return { title, abstract, decision };
      });
      setScreened(parsed);
    } catch (err: any) {
      alert("Screening error: " + (err.message || "Unknown"));
    } finally {
      setScreeningLoading(false);
    }
  };

  const handleMetaPipe = async () => {
    if (screened.length === 0) {
      setMetaOut("Please complete ASReview screening first.");
      return;
    }
    setMetaLoading(true);
    setMetaOut("");
    setMissingApiError(null);
    try {
      const included = screened.filter((s) => s.decision === "include" || s.decision === "uncertain");
      const prompt = `Act as meta-pipe (htlin222/meta-pipe) automated extractor for clinical prediction-modeling studies.

Studies from ASReview LAB screening (${included.length} included):
${included.map((s, i) => `${i + 1}. ${s.title}\n   ${s.abstract}`).join("\n\n")}

Generate a meta-analysis-ready extraction table with columns: Study | Outcome | Effect Estimate | 95% CI Lower | 95% CI Upper | Weight

Also provide:
1. Pooled effect estimate (random-effects model)
2. Heterogeneity statistics (I², tau²)
3. PRISMA-ready summary
4. Forest-plot data in CSV format

Reference meta-pipe stages: ma-data-extraction, ma-meta-analysis.`;
      const text = state.geminiApiKey ? await callGemini(state.geminiApiKey, prompt) : state.groqApiKey ? await callGroq(state.groqApiKey!, prompt) : await callDeepSeek(prompt);
      setMetaOut(text);
    } catch (err: any) {
      setMetaOut("Extraction error: " + (err.message || "Unknown"));
    } finally {
      setMetaLoading(false);
    }
  };

  const goNext = () => { setMissingApiError(null); if (step < STEPS.length) setStep(step + 1); };
  const goPrev = () => { setMissingApiError(null); if (step > 1) setStep(step - 1); };

  const globalMissingApiWarning = !state.geminiApiKey && !state.groqApiKey;

  return (
    <div className="space-y-6">
      {globalMissingApiWarning && (
        <div className="bg-red-900/40 border border-red-500/60 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">No AI provider configured. Open Settings and add a Gemini or Groq API key to use ASReview screening and meta-pipe extraction.</p>
        </div>
      )}
      <div className={`${COLORS[phaseOf(step)].bg} border ${COLORS[phaseOf(step)].border} rounded-lg p-6 shadow`}>
        <div className="flex items-center gap-3 mb-4">
          <FlaskConical className="text-yellow-400" size={24} />
          <div>
            <h2 className="text-xl font-bold text-white">Automatic Evidence Synthesis</h2>
            <p className="text-sm text-blue-300">
              ASReview LAB → meta-pipe Meta-Analysis
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} disabled={step === 1} className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50">
              <ArrowLeft size={12} /> Prev
            </button>
            <span className="text-xs text-blue-400">Step {step} / {STEPS.length}</span>
            <button onClick={goNext} disabled={step === STEPS.length} className="flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50">
              Next <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-6">
          {STEPS.map((s) => {
            const sp = phaseOf(s.num);
            const active = step === s.num;
            const phaseBtnClass: Record<string, string> = {
              asreview: "border-emerald-400 text-emerald-300 bg-emerald-400/10",
              metapipe: "border-blue-400 text-blue-300 bg-blue-400/10",
            };
            return (
              <button key={s.num} onClick={() => setStep(s.num)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${active ? phaseBtnClass[sp] : "border-blue-800 text-blue-300 hover:border-blue-600"}`}>
                <s.icon size={12} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 1: ASReview Literature Screening</h3>
              <p className="text-sm text-blue-300">
                Import studies for active-learning screening following Rensvandeschoot/automated-systematic-review.
                Enter a research query to generate candidate studies and receive AI-assisted include/exclude recommendations.
              </p>
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
              <button
                onClick={handleAsReview}
                disabled={screeningLoading || !searchQuery.trim()}
                className="flex items-center gap-2 bg-emerald-900/50 text-emerald-200 px-4 py-2 rounded text-xs hover:bg-emerald-800/60 disabled:opacity-50"
              >
                {screeningLoading ? (<Loader2 size={12} className="animate-spin" />) : (<Search size={12} />)}
                Run ASReview-style Screening
              </button>
              {missingApiError && step === 1 && (
                <div className="bg-red-900/30 border border-red-700/50 rounded p-3">
                  <p className="text-xs text-red-200">{missingApiError}</p>
                </div>
              )}
              {screened.length > 0 && (
                <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-blue-400">{screened.length} studies screened</p>
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-green-300">Included: {screened.filter((s) => s.decision === "include").length}</span>
                      <span className="text-yellow-300">Uncertain: {screened.filter((s) => s.decision === "uncertain").length}</span>
                      <span className="text-red-300">Excluded: {screened.filter((s) => s.decision === "exclude").length}</span>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {screened.map((s, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 border-b border-blue-900/30 pb-2 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">{s.title}</p>
                          <p className="text-[10px] text-blue-300 line-clamp-2">{s.abstract}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${s.decision === "include" ? "bg-green-900/40 text-green-300" : s.decision === "exclude" ? "bg-red-900/40 text-red-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                          {s.decision}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Step 2: Automated End-to-End Extraction & Meta-Analysis (meta-pipe)</h3>
              <p className="text-sm text-blue-300">
                Deploy the meta-pipe agentic pipeline (htlin222/meta-pipe) to extract effect estimates from included studies and calculate pooled statistics.
              </p>
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <p className="text-xs text-blue-400 mb-2">Extraction schema per study:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-blue-300">
                  {["Study", "Outcome", "Effect Estimate", "95% CI Lower", "95% CI Upper", "Weight", "Predictors", "Validation"].map((col) => (
                    <div key={col} className="bg-blue-900/30 border border-blue-800 rounded px-2 py-1">{col}</div>
                  ))}
                </div>
              </div>
              {screened.length === 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-200">Complete Step 1 ASReview screening first to proceed.</p>
                </div>
              )}
              {missingApiError && step === 2 && (
                <div className="bg-red-900/30 border border-red-700/50 rounded p-3">
                  <p className="text-xs text-red-200">{missingApiError}</p>
                </div>
              )}
              <button
                onClick={handleMetaPipe}
                disabled={metaLoading || screened.length === 0}
                className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-4 py-2 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50"
              >
                {metaLoading ? (<Loader2 size={12} className="animate-spin" />) : (<GitMerge size={12} />)}
                Run meta-pipe Extraction & Meta-Analysis
              </button>
              {metaOut && (
                <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 space-y-2">
                  <pre className="text-xs text-blue-200 whitespace-pre-wrap overflow-x-auto max-h-[600px] overflow-y-auto">{metaOut}</pre>
                  <div className="flex gap-2">
                    <button onClick={() => downloadMarkdownAsWord(metaOut, "meta-pipe-report.docx")} className="flex items-center gap-1 text-[10px] bg-blue-900 text-blue-200 px-2 py-1 rounded hover:bg-blue-800">
                      <Download size={10} /> Word
                    </button>
                    <button onClick={() => downloadMarkdownAsPDF(metaOut, "meta-pipe-report.pdf")} className="flex items-center gap-1 text-[10px] bg-blue-900 text-blue-200 px-2 py-1 rounded hover:bg-blue-800">
                      <Download size={10} /> PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
