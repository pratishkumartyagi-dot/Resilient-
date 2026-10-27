"use client";

import React, { useState, useCallback } from "react";
import {
  Sparkles, Save, Download, FileText, FileCheck, ChevronRight,
  Loader2, X, Copy, ShieldCheck, Scroll, ClipboardList, AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  JOURNAL_OPTIONS,
  CITATION_FORMATS,
  REVIEWER_LENSES,
  PAPER_REVIEWER_MODES,
  getJournalProfile,
  buildReviewerPrompt,
} from "@/lib/academic-research-skills";
import { callAiWithFallback, type AiProviderName } from "@/lib/ai";

const SESSION_KEY = "paper_reviewer_session";

const PROVIDERS: { value: AiProviderName; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "local", label: "Local Model (fallback)" },
];

function initialState() {
  return {
    journalId: "PLOS Medicine",
    citationStyle: "vancouver",
    language: "en",
    reviewerLens: "journal-fit" as string,
    mode: "full" as string,
    apiKey: "",
    provider: "gemini" as AiProviderName,
  };
}

export default function PaperReviewerPipeline() {
  const { dispatch } = useApp();
  const [form, setForm] = useState(initialState());
  const [paperText, setPaperText] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [status, setStatus] = useState<"idle" | "reviewing" | "completed" | "error">("idle");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const aiFn = useCallback(
    async (prompt: string) => {
      return callAiWithFallback(prompt, undefined, {
        order: [form.provider, ...PROVIDERS.map((p) => p.value).filter((v) => v !== form.provider)],
      });
    },
    [form.provider]
  );

  const handleUpdate = useCallback((key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReview = useCallback(async () => {
    if (!paperText.trim()) {
      setError("Please paste a manuscript to review.");
      return;
    }
    if (!form.apiKey && form.provider !== "local") {
      setError("Please enter an API key or select Local Model.");
      return;
    }

    setStatus("reviewing");
    setStage("Initializing reviewer panel...");
    setProgress(0);
    setError("");

    try {
      const journal = getJournalProfile(form.journalId);

      setStage("Running peer review panel...");
      setProgress(40);

      const prompt = buildReviewerPrompt({
        paperText,
        journalId: form.journalId,
        citationStyle: form.citationStyle,
        language: form.language,
        reviewerLens: form.reviewerLens,
        mode: form.mode,
      });

      const review = await aiFn(prompt);

      setReviewText(review);
      setProgress(100);
      setStage("Review complete");
      setStatus("completed");
    } catch (err: any) {
      setError(err?.message || "Review failed");
      setStatus("error");
    } finally {
      setProgress(100);
    }
  }, [paperText, form.journalId, form.citationStyle, form.language, form.reviewerLens, form.mode, form.apiKey, form.provider, aiFn]);

  const handleExport = useCallback((format: "word" | "pdf" | "latex") => {
    if (!reviewText) return;
    if (format === "word") {
      // Simple export - user can copy
      navigator.clipboard.writeText(reviewText);
    } else if (format === "pdf") {
      navigator.clipboard.writeText(reviewText);
    } else if (format === "latex") {
      navigator.clipboard.writeText(reviewText);
    }
  }, [reviewText]);

  const handleCopy = useCallback(() => {
    if (!reviewText) return;
    navigator.clipboard.writeText(reviewText);
  }, [reviewText]);

  const handleClear = useCallback(() => {
    setPaperText("");
    setReviewText("");
    setError("");
    setStatus("idle");
    setStage("");
    setProgress(0);
  }, []);

  const journal = getJournalProfile(form.journalId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-green-400" />
            <h1 className="text-xl font-bold text-white">Paper Reviewer</h1>
          </div>
          <p className="text-blue-200 text-sm">
            Peer review academic manuscripts using {form.provider} AI. Based on Academic Research Skills (Imbad0202/academic-research-skills).
          </p>
        </div>
        <button
          onClick={() => dispatch({ type: "SET_TAB", payload: "main" })}
          className="text-xs bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-900/60"
        >
          ← Back to Research Pipeline
        </button>
      </div>

      {/* Configuration */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 space-y-5">
        <h2 className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
          <ClipboardList size={16} /> Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Target Journal</label>
            <select
              value={form.journalId}
              onChange={(e) => handleUpdate("journalId", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {JOURNAL_OPTIONS.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({j.publisher})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-blue-400">
              Citation style: {journal.citationStyle.toUpperCase()} • Field: {journal.field.join(", ")}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Citation Style</label>
            <select
              value={form.citationStyle}
              onChange={(e) => handleUpdate("citationStyle", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {CITATION_FORMATS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Reviewer Lens</label>
            <select
              value={form.reviewerLens}
              onChange={(e) => handleUpdate("reviewerLens", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {REVIEWER_LENSES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-blue-400">{REVIEWER_LENSES.find((l) => l.id === form.reviewerLens)?.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Review Mode</label>
            <select
              value={form.mode}
              onChange={(e) => handleUpdate("mode", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {PAPER_REVIEWER_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">AI Provider</label>
            <select
              value={form.provider}
              onChange={(e) => handleUpdate("provider", e.target.value as AiProviderName)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-blue-300">API Key</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => handleUpdate("apiKey", e.target.value)}
            placeholder="Gemini/Groq API key"
            className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <p className="text-[10px] text-blue-400">
            Required unless using Local Model fallback
          </p>
        </div>
      </div>

      {/* Input: Manuscript */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
          <FileText size={16} /> Manuscript to Review
        </label>
        <textarea
          value={paperText}
          onChange={(e) => setPaperText(e.target.value)}
          placeholder="Paste the full manuscript text here..."
          className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded-lg px-4 py-3 text-sm font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-yellow-500 h-64"
        />
        <p className="text-[10px] text-blue-400">
          Paste the complete paper text. The reviewer will assess it against {journal.name} standards.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleReview}
          disabled={
            status === "reviewing" ||
            !paperText.trim() ||
            (!form.apiKey && form.provider !== "local")
          }
          className="flex-1 bg-green-500 hover:bg-green-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ShieldCheck size={16} /> Review Paper
        </button>
        <button
          onClick={handleClear}
          className="bg-red-900/20 hover:bg-red-900/40 text-red-300 px-4 py-3 rounded-lg"
        >
          <X size={16} /> Clear
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 rounded px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Progress */}
      {status !== "idle" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-blue-300">
            <span>{stage}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-[#0a1a3a] rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Output: Review Report */}
      {reviewText && (
        <div className="bg-[#0a1a3a] border border-green-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-green-900/30 px-4 py-2 border-b border-green-800">
            <div className="flex items-center gap-2 text-xs font-medium text-green-300">
              <ClipboardList size={14} />
              <span>Peer Review Report</span>
              <span className="text-green-400">{reviewText.split(/\s+/).length.toLocaleString()} words</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="text-xs bg-green-800/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-800"
              >
                <Copy size={14} /> Copy
              </button>
              <button
                onClick={() => handleExport("word")}
                className="text-xs bg-green-800/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-800"
              >
                <Save size={14} /> Export
              </button>
            </div>
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto text-sm text-green-100 leading-relaxed font-mono text-[12px]">
            {reviewText}
          </div>
        </div>
      )}
    </div>
  );
}
