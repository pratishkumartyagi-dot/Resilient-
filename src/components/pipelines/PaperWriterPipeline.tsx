"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Sparkles, Save, RotateCcw, Download, FileText, BookOpen, ChevronRight,
  Loader2, CircleHelp, X, Copy, Edit2, Check, CheckCircle2, ClipboardCheck,
  Plus, Minus, Briefcase, Scroll, FileCheck, ShieldCheck, Lock, FileType,
  Search,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  JOURNAL_OPTIONS,
  PAPER_WRITING_MODES,
  CITATION_FORMATS,
  WORD_COUNT_PRESETS,
  getJournalProfile,
  buildAcademicPaperPrompt,
  sanitizeCitations,
  formatPaperReferences,
} from "@/lib/academic-research-skills";
import { webSearchPapers, type Paper } from "@/lib/database-apis";
import { callAiWithFallback, type AiProviderName } from "@/lib/ai";
import {
  downloadMarkdownAsWord,
  downloadMarkdownAsPDF,
  downloadMarkdownAsLaTeX,
} from "@/lib/exporters";
import type { ThesisPaper } from "@/lib/thesis-types";

const SESSION_KEY = "paper_writer_session";

const PROVIDERS: { value: AiProviderName; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "local", label: "Local Model (fallback)" },
];

const DESIGNS: { value: string; label: string }[] = [
  { value: "rct", label: "Randomized Controlled Trial" },
  { value: "observational", label: "Observational Study" },
  { value: "case_series", label: "Case Series" },
  { value: "review", label: "Literature Review" },
  { value: "other", label: "Other / Not specified" },
];

function initialState() {
  return {
    topic: "",
    journalId: "PLOS Medicine",
    citationStyle: "vancouver",
    language: "en",
    wordCountPreset: "standard" as "short" | "standard" | "extended" | "custom",
    customMin: 3000,
    customMax: 5000,
    yearFrom: undefined as number | undefined,
    yearTo: undefined as number | undefined,
    studyDesign: "other" as string,
    mode: "full" as string,
    apiKey: "",
    provider: "gemini" as AiProviderName,
    maxReferences: 50,
  };
}

export default function PaperWriterPipeline() {
  const { dispatch } = useApp();
  const [form, setForm] = useState(initialState());
  const [papers, setPapers] = useState<ThesisPaper[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "writing" | "completed" | "error">("idle");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [paperText, setPaperText] = useState("");
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");

  const aiFn = useCallback(
    async (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => {
      return callAiWithFallback(prompt, opts, {
        order: [form.provider, ...PROVIDERS.map((p) => p.value).filter((v) => v !== form.provider)],
      });
    },
    [form.provider]
  );

  const handleUpdate = useCallback((key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSearch = useCallback(async () => {
    if (!form.topic.trim()) {
      setSearchError("Please enter a research topic.");
      return;
    }
    setStatus("searching");
    setStage("Searching databases for grounding papers...");
    setProgress(10);
    setSearchError("");

    try {
      const result = await webSearchPapers(form.topic, form.maxReferences);
      const thesisPapers: ThesisPaper[] = result.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        database: p.database,
        studyType: p.studyType,
        url: p.url,
      }));
      setPapers(thesisPapers);
      setProgress(100);
      setStage(`Found ${thesisPapers.length} papers`);
    } catch (err: any) {
      setSearchError(err?.message || "Search failed");
      setPapers([]);
    } finally {
      setStatus("idle");
    }
  }, [form.topic, form.maxReferences]);

  const handleWrite = useCallback(async () => {
    if (!form.topic.trim()) {
      setError("Please enter a research topic.");
      return;
    }
    if (!form.apiKey && form.provider !== "local") {
      setError("Please enter an API key or select Local Model.");
      return;
    }

    setStatus("writing");
    setStage("Building paper outline...");
    setProgress(0);
    setError("");

    try {
      const journal = getJournalProfile(form.journalId);
      const preset = WORD_COUNT_PRESETS.find((p) => p.id === form.wordCountPreset);
      const minWords = form.wordCountPreset === "custom" ? form.customMin : preset?.min ?? 3000;
      const maxWords = form.wordCountPreset === "custom" ? form.customMax : preset?.max ?? 5000;
      const targetWords = Math.round((minWords + maxWords) / 2);

      // Stage 1: Outline
      setStage("Generating paper outline...");
      setProgress(20);
      const outlinePrompt = `You are an expert academic editor. Create a detailed outline for a paper to be submitted to ${journal.name}.

TOPIC: ${form.topic}
JOURNAL: ${journal.name} (${journal.publisher})
CITATION STYLE: ${form.citationStyle.toUpperCase()}
WORD TARGET: ${targetWords} words (range ${minWords}-${maxWords})
YEAR INTERVAL: ${form.yearFrom ?? "any"}–${form.yearTo ?? "any"}
STUDY DESIGN: ${form.studyDesign}

STRUCTURE REQUIRED: ${journal.structure.join(" → ")}

Return a JSON outline with: title, sections (each with title and wordTarget), and total word estimate. Do not use code fences.`;
      const outlineText = await aiFn(outlinePrompt, { searchEnabled: false });

      // Stage 2: Write full paper
      setStage("Writing paper manuscript...");
      setProgress(50);

      const prompt = buildAcademicPaperPrompt({
        topic: form.topic,
        journalId: form.journalId,
        citationStyle: form.citationStyle,
        language: form.language,
        targetWordCount: targetWords,
        minWordCount: minWords,
        maxWordCount: maxWords,
        yearFrom: form.yearFrom,
        yearTo: form.yearTo,
        studyDesign: form.studyDesign,
        papers,
        mode: form.mode,
      });

      const manuscript = await aiFn(prompt, {
        searchEnabled: false,
        searchQuery: form.topic,
      });

      // Stage 3: Sanitize citations and append references
      setStage("Finalizing citations and references...");
      setProgress(80);

      const cleanManuscript = sanitizeCitations(manuscript, papers);
      const referencesSection = formatPaperReferences(papers, form.citationStyle);
      const finalText = `${cleanManuscript}\n\n---\n\n## References\n\n${referencesSection}`;

      setPaperText(finalText);
      setProgress(100);
      setStage("Paper complete");
      setStatus("completed");
    } catch (err: any) {
      setError(err?.message || "Paper generation failed");
      setStatus("error");
    } finally {
      setProgress(100);
    }
  }, [
    form.topic, form.journalId, form.citationStyle, form.language, form.wordCountPreset,
    form.customMin, form.customMax, form.yearFrom, form.yearTo, form.studyDesign,
    form.mode, form.apiKey, form.provider, papers, aiFn,
  ]);

  const handleExport = useCallback((format: "word" | "pdf" | "latex") => {
    if (!paperText) return;
    if (format === "word") downloadMarkdownAsWord(paperText, "paper-writer-manuscript");
    else if (format === "pdf") downloadMarkdownAsPDF(paperText, "paper-writer-manuscript");
    else if (format === "latex") downloadMarkdownAsLaTeX(paperText, "paper-writer-manuscript");
  }, [paperText]);

  const handleCopy = useCallback(() => {
    if (!paperText) return;
    navigator.clipboard.writeText(paperText);
  }, [paperText]);

  const handleClear = useCallback(() => {
    setPaperText("");
    setPapers([]);
    setError("");
    setSearchError("");
    setStatus("idle");
    setStage("");
    setProgress(0);
  }, []);

  const preset = WORD_COUNT_PRESETS.find((p) => p.id === form.wordCountPreset);
  const journal = getJournalProfile(form.journalId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-yellow-400" />
            <h1 className="text-xl font-bold text-white">Paper Writer</h1>
          </div>
          <p className="text-blue-200 text-sm">
            Write complete academic papers for top-tier journals using {form.provider} AI. Based on Academic Research Skills (Imbad0202/academic-research-skills).
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
          <Scroll size={16} /> Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Research Topic</label>
            <input
              type="text"
              value={form.topic}
              onChange={(e) => handleUpdate("topic", e.target.value)}
              placeholder="e.g., predictors of CKM syndrome"
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
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
              Word limit: {journal.wordLimit?.toLocaleString() ?? "N/A"} • Ref limit: {journal.referenceLimit?.toLocaleString() ?? "N/A"} • Style: {journal.citationStyle.toUpperCase()}
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Word Count</label>
            <select
              value={form.wordCountPreset}
              onChange={(e) => handleUpdate("wordCountPreset", e.target.value as any)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {WORD_COUNT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.min}-{p.max} words)
                </option>
              ))}
            </select>
            {form.wordCountPreset === "custom" && (
              <>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={form.customMin}
                    onChange={(e) => handleUpdate("customMin", parseInt(e.target.value) || 1000)}
                    placeholder="Min"
                    className="flex-1 bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <input
                    type="number"
                    value={form.customMax}
                    onChange={(e) => handleUpdate("customMax", parseInt(e.target.value) || 5000)}
                    placeholder="Max"
                    className="flex-1 bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <p className="text-[10px] text-blue-400">Custom range: {form.customMin}-{form.customMax} words</p>
              </>
            )}
            {form.wordCountPreset !== "custom" && preset && (
              <p className="text-[10px] text-blue-400">{preset.description}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Year Interval</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={form.yearFrom || ""}
                onChange={(e) => handleUpdate("yearFrom", e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="From"
                className="flex-1 bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <input
                type="number"
                value={form.yearTo || ""}
                onChange={(e) => handleUpdate("yearTo", e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="To"
                className="flex-1 bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <p className="text-[10px] text-blue-400">
              {form.yearFrom && form.yearTo ? `${form.yearFrom}–${form.yearTo}` : "Any year"}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Study Design</label>
            <select
              value={form.studyDesign}
              onChange={(e) => handleUpdate("studyDesign", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {DESIGNS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Writing Mode</label>
            <select
              value={form.mode}
              onChange={(e) => handleUpdate("mode", e.target.value)}
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {PAPER_WRITING_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-blue-300">Max References</label>
            <input
              type="number"
              value={form.maxReferences}
              onChange={(e) => handleUpdate("maxReferences", parseInt(e.target.value) || 50)}
              min="10"
              max="200"
              className="w-full bg-[#0a1a3a] border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSearch}
          disabled={status === "searching" || !form.topic.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Search size={16} /> Search Papers
        </button>
        <button
          onClick={handleWrite}
          disabled={
            status === "writing" ||
            !form.topic.trim() ||
            (!form.apiKey && form.provider !== "local") ||
            papers.length === 0
          }
          className="flex-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Sparkles size={16} /> Write Paper
        </button>
        <button
          onClick={handleClear}
          className="bg-red-900/20 hover:bg-red-900/40 text-red-300 px-4 py-3 rounded-lg"
        >
          <X size={16} /> Clear
        </button>
      </div>

      {searchError && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 rounded px-4 py-3 text-sm">
          {searchError}
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
              className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 rounded px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Output */}
      {paperText && (
        <div className="bg-[#0a1a3a] border border-blue-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-blue-900/30 px-4 py-2 border-b border-blue-800">
            <div className="flex items-center gap-2 text-xs font-medium text-yellow-300">
              <FileType size={14} />
              <span>Generated Manuscript</span>
              <span className="text-blue-400">{paperText.split(/\s+/).length.toLocaleString()} words</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="text-xs bg-blue-800/50 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-800"
              >
                <Copy size={14} /> Copy
              </button>
              <button
                onClick={() => handleExport("word")}
                className="text-xs bg-blue-800/50 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-800"
              >
                <Save size={14} /> Word
              </button>
              <button
                onClick={() => handleExport("pdf")}
                className="text-xs bg-blue-800/50 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-800"
              >
                <Download size={14} /> PDF
              </button>
            </div>
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto text-sm text-blue-100 leading-relaxed font-mono text-[12px]">
            {paperText}
          </div>
        </div>
      )}

      {/* Grounding papers */}
      {papers.length > 0 && (
        <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
              <FileCheck size={14} /> Grounding Papers ({papers.length})
            </h2>
            <p className="text-[10px] text-blue-400">Only these papers are cited — no hallucinated references</p>
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-2 text-sm text-blue-200">
            {papers.map((p, i) => (
              <div key={p.id || i} className="bg-[#0a1a3a] border border-blue-900/50 rounded p-2">
                <div className="font-medium">{i + 1}. {p.title}</div>
                <div className="text-xs text-blue-400">{p.authors}</div>
                <div className="text-xs text-blue-400">
                  {p.journal} • {p.year} {p.doi ? `• doi:${p.doi}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
