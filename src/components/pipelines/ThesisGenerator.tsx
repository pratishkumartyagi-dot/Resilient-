"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Sparkles, Save, RotateCcw, Download, FileText, BookOpen, ChevronRight,
  Loader2, CircleHelp, X, Copy, Edit2, Check, CheckCircle2, ClipboardCheck, Calculator,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { runThesisPipeline, buildDefaultConfig } from "@/lib/thesis-pipeline";
import { buildThesisAiFn, searchThesisPapers, toThesisPaper } from "@/lib/thesis-ai";
import type { ThesisGeneratorConfig } from "@/lib/thesis-types";
import {
  downloadMarkdownAsWord,
  downloadMarkdownAsPDF,
  downloadMarkdownAsLaTeX,
} from "@/lib/exporters";
import {
  emptyNotebook,
  addSource,
  removeSource,
  selectSource,
  getSelectedSources,
  buildNotebookContext,
  expandChapterPrompt,
  parseChapterResponse,
  expandChapter,
  sourceFromPaper,
  type NotebookState,
  type NotebookSource,
} from "@/lib/notebook-expansion";

const SESSION_KEY = "thesis_generator_session";

type Level = "research_paper" | "case_series" | "bachelor" | "master" | "phd";
type Style = "apa" | "vancouver" | "ieee" | "mla" | "harvard";
type Language = "en" | "es" | "fr" | "de" | "zh";
type Provider = "gemini" | "groq" | "qwen" | "mlc";
type Design = "rct" | "observational" | "case_series" | "review" | "other";

const LEVELS: { value: Level; label: string }[] = [
  { value: "research_paper", label: "Research Paper (3k–5k words)" },
  { value: "case_series", label: "Case Series (1.5k–2.5k words)" },
  { value: "bachelor", label: "Bachelor Thesis (8k–15k words)" },
  { value: "master", label: "MD/MS Thesis (15k–40k words)" },
  { value: "phd", label: "PhD Thesis (60k–100k words)" },
];

const STYLES: { value: Style; label: string }[] = [
  { value: "vancouver", label: "Vancouver" },
  { value: "apa", label: "APA" },
  { value: "ieee", label: "IEEE" },
  { value: "mla", label: "MLA" },
  { value: "harvard", label: "Harvard" },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "qwen", label: "Qwen" },
  { value: "mlc", label: "MLC-LLM (local)" },
];

const DESIGNS: { value: Design; label: string; guideline: string }[] = [
  { value: "rct", label: "Randomized Controlled Trial", guideline: "CONSORT" },
  { value: "observational", label: "Observational", guideline: "STROBE" },
  { value: "case_series", label: "Case Series", guideline: "CARE" },
  { value: "review", label: "Review", guideline: "PRISMA" },
  { value: "other", label: "Other / Not specified", guideline: "none" },
];

function initialConfig(): ThesisGeneratorConfig {
  return buildDefaultConfig({
    topic: "",
    level: "master",
    style: "vancouver",
    language: "en",
    author: "",
    institution: "",
    apiKey: "",
    provider: "gemini",
    maxReferences: 150,
  });
}

export default function ThesisGenerator() {
  const { state } = useApp();
  const apiKey = state.geminiApiKey || state.groqApiKey || "";

  const [config, setConfig] = useState<ThesisGeneratorConfig>(initialConfig());
  const [status, setStatus] = useState<"idle" | "generating" | "completed" | "error">("idle");
  const [stage, setStage] = useState("");
  const [stageMessage, setStageMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullThesis, setFullThesis] = useState("");
  const [finalized, setFinalized] = useState(false);
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [chapterDraft, setChapterDraft] = useState("");
  const [expanding, setExpanding] = useState<number | null>(null);
  const [notebook, setNotebook] = useState<NotebookState>(emptyNotebook());
  const [notebookInput, setNotebookInput] = useState("");
  const [notebookTitle, setNotebookTitle] = useState("");
  const generatingRef = useRef(false);

  // Load saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.config) setConfig(parsed.config);
        if (parsed.result) {
          setResult(parsed.result);
          setFullThesis(parsed.result.fullThesis || "");
          setStatus("completed");
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveSession = useCallback((cfg: ThesisGeneratorConfig, res: any) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ config: cfg, result: res, savedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, []);

  const handleConfigChange = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!config.topic.trim()) {
      setError("Please enter a thesis topic.");
      return;
    }

    const cfg = { ...config, apiKey: config.apiKey || apiKey };
    setConfig(cfg);
    setStatus("generating");
    setStage("initializing");
    setProgress(0);
    setError(null);
    setResult(null);
    setFullThesis("");
    setFinalized(false);
    generatingRef.current = true;

    try {
      const aiFn = buildThesisAiFn(cfg.provider, cfg.apiKey, true);
      const res = await runThesisPipeline(cfg, {
        aiFn,
        searchFn: async (query, opts) => {
          const papers = await searchThesisPapers({
            query,
            databases: ["PubMed", "Europe PMC", "bioRxiv", "medRxiv", "Crossref", "arXiv", "OpenAIRE", "Zenodo"],
            yearFrom: opts?.yearFrom,
            yearTo: opts?.yearTo,
            studyDesign: opts?.studyDesign,
          });
          return papers.map(toThesisPaper);
        },
        onProgress: (s, msg) => {
          setStage(s);
          setStageMessage(msg || "");
          setProgress((p) => {
            if (s === "outline") return Math.min(Math.max(p, 5), 15);
            if (s === "prose") {
              const m = (msg || "").match(/chapter (\d+) of (\d+)/i);
              if (m) {
                const done = parseInt(m[1], 10);
                const total = Math.max(parseInt(m[2], 10), 1);
                return Math.round(15 + (done / total) * 40);
              }
              return Math.min(Math.max(p, 15), 55);
            }
            if (s === "refine") return Math.min(Math.max(p, 55), 80);
            if (s === "appraise") return Math.min(Math.max(p, 80), 92);
            return p;
          });
        },
      });

      setResult(res);
      setFullThesis(res.fullThesis || "");
      setStatus(res.stages.complete ? "completed" : "error");
      setProgress(100);
      saveSession(cfg, res);
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Thesis generation failed.");
      setProgress(0);
    } finally {
      generatingRef.current = false;
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setStage("");
    setProgress(0);
    setResult(null);
    setFullThesis("");
    setFinalized(false);
    setError(null);
    setConfig(initialConfig());
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };

  const handleThesisChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFullThesis(e.target.value);
    setFinalized(false);
    if (result) setResult({ ...result, fullThesis: e.target.value });
  };

  const handleExport = (kind: "pdf" | "word" | "latex") => {
    if (!fullThesis) return;
    if (!finalized) {
      setError("Please finalise the thesis before downloading. Review the text, then click “Finalise Thesis”.");
      return;
    }
    const base = `thesis-${config.topic.replace(/\s+/g, "-").slice(0, 40)}-${new Date().toISOString().split("T")[0]}`;
    if (kind === "pdf") downloadMarkdownAsPDF(fullThesis, `${base}.pdf`);
    else if (kind === "word") downloadMarkdownAsWord(fullThesis, `${base}.docx`);
    else downloadMarkdownAsLaTeX(fullThesis, `${base}.tex`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fullThesis || "");
  };

  // ---- Notebook management -------------------------------------------------
  const handleAddNotebookSource = () => {
    if (!notebookTitle.trim() || !notebookInput.trim()) return;
    const src: Omit<NotebookSource, "id" | "addedAt"> = {
      title: notebookTitle.trim(),
      content: notebookInput.trim(),
      type: "note",
    };
    setNotebook((n) => addSource(n, src));
    setNotebookTitle("");
    setNotebookInput("");
  };

  const handleAddPaperToNotebook = (paper: any) => {
    setNotebook((n) => addSource(n, sourceFromPaper(paper)));
  };

  const handleRemoveNotebookSource = (id: string) => {
    setNotebook((n) => removeSource(n, id));
  };

  const handleToggleNotebookSource = (id: string, selected: boolean) => {
    setNotebook((n) => selectSource(n, id, selected));
  };

  const selectedSources = getSelectedSources(notebook);

  // ---- Chapter expansion via notebook -------------------------------------
  const handleExpandChapter = async () => {
    if (!result || result.chapters.length === 0) return;
    setExpanding(-1);
    try {
      const aiFn = buildThesisAiFn(config.provider, config.apiKey || apiKey, true);
      const updatedChapters: any[] = [];
      let nextThesis = fullThesis;
      for (let i = 0; i < result.chapters.length; i++) {
        const ch = result.chapters[i];
        const currentWords = ch.wordCount || ch.content.split(/\s+/).filter(Boolean).length;
        const target = Math.round(currentWords * 1.5);
        if (currentWords >= target) {
          updatedChapters.push(ch);
          continue;
        }
        setStageMessage(`Expanding Chapter ${ch.chapterNumber}: ${ch.chapterTitle}...`);
        const expanded = await expandChapter(
          {
            chapterNumber: ch.chapterNumber,
            chapterTitle: ch.chapterTitle || `Chapter ${ch.chapterNumber}`,
            content: ch.content || "",
            sections: ch.sections || [],
            wordCount: ch.wordCount || 0,
            citations: ch.citations || [],
            argumentAudit: ch.argumentAudit,
          },
          notebook,
          {
            topic: config.topic,
            level: config.level,
            style: config.style,
            language: config.language,
          },
          aiFn,
          { targetWords: target, maxPasses: 3 },
        );
        updatedChapters.push({
          ...ch,
          content: expanded.content.trim(),
          wordCount: expanded.words,
        });
      }
      const parts = nextThesis.split("\n---\n\n");
      const updatedParts = parts.map((part, idx) => {
        const headerMatch = part.match(/^#\s*Chapter\s+(\d+)\s*:/i);
        if (!headerMatch) return part;
        const num = parseInt(headerMatch[1], 10);
        const ch = updatedChapters.find((c) => c.chapterNumber === num);
        if (!ch) return part;
        const newlineIndex = part.indexOf("\n");
        const header = newlineIndex >= 0 ? part.slice(0, newlineIndex) : part;
        return `${header}\n\n${ch.content.trim()}`;
      });
      nextThesis = updatedParts.join("\n---\n\n");
      setFullThesis(nextThesis);
      setResult({ ...result, fullThesis: nextThesis, chapters: updatedChapters });
    } finally {
      setExpanding(null);
    }
  };

  // ---- per-chapter editing ------------------------------------------------
  // The thesis is stored as "# Chapter N: Title\n\n<content>" blocks joined by
  // a horizontal rule, so a single chapter can be edited and written back
  // without touching the rest of the document.
  const openChapterEditor = (chapter: any) => {
    setEditingChapter(chapter.chapterNumber);
    setChapterDraft(chapter.content || "");
    setFinalized(false);
  };

  const cancelChapterEdit = () => {
    setEditingChapter(null);
    setChapterDraft("");
  };

  const saveChapterEdit = () => {
    if (editingChapter === null || !result) return;
    const number = editingChapter;
    const parts = fullThesis.split("\n---\n\n");
    const updated = parts.map((part) => {
      const headerMatch = part.match(/^#\s*Chapter\s+(\d+)\s*:/i);
      if (!headerMatch || parseInt(headerMatch[1], 10) !== number) return part;
      const newlineIndex = part.indexOf("\n");
      const header = newlineIndex >= 0 ? part.slice(0, newlineIndex) : part;
      return `${header}\n\n${chapterDraft.trim()}`;
    });
    const nextThesis = updated.join("\n---\n\n");
    setFullThesis(nextThesis);
    setResult({
      ...result,
      fullThesis: nextThesis,
      chapters: (result.chapters || []).map((ch: any) =>
        ch.chapterNumber === number
          ? { ...ch, content: chapterDraft.trim(), wordCount: chapterDraft.trim().split(/\s+/).filter(Boolean).length }
          : ch
      ),
    });
    setEditingChapter(null);
    setChapterDraft("");
  };

  const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

  /** Live word budget: planned target vs the words actually in the document. */
  const liveWordBudget = useMemo(() => {
    if (!result) return [];
    const plan = result.nursestackPlan;
    if (!plan?.chapters) return [];
    const parts = fullThesis.split("\n---\n\n");
    return plan.chapters.map((c: { number: number; title: string; wordTarget: number }) => {
      const part = parts.find((p: string) => {
        const m = p.match(/^#\s*Chapter\s+(\d+)\s*:/i);
        return m && parseInt(m[1], 10) === c.number;
      });
      const actual = part ? countWords(part.split("\n").slice(1).join(" ")) : 0;
      const ratio = c.wordTarget > 0 ? actual / c.wordTarget : 0;
      return {
        number: c.number,
        title: c.title,
        target: c.wordTarget,
        actual,
        status: ratio === 0 ? "pending" : ratio < 0.88 ? "short" : ratio > 1.12 ? "over" : "on-target",
      };
    });
  }, [result, fullThesis]);

  const refsList = result?.references || [];
  const stats = result?.stats || {};
  const chapters = result?.chapters || result?.outline?.chapters || [];

  const isApiKeyMissing = !config.apiKey && !apiKey;

  const pipelineStages: Array<{ n: number; name: string; role: string; href: string; stageKey: string }> = [
    { n: 1, name: "OpenDraft", role: "Outline & chapter structure", href: "https://github.com/federicodeponte/opendraft", stageKey: "outline" },
    { n: 2, name: "ThesisGenerator", role: "Per-chapter prose + argument audit", href: "https://github.com/ekontoTURBO/thesis-generator", stageKey: "prose" },
    { n: 3, name: "ScholarCopilot", role: "Refine/expand + citation validation", href: "https://github.com/TIGER-AI-Lab/ScholarCopilot", stageKey: "refine" },
  ];

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen size={22} className="text-yellow-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Thesis Generator</h2>
            <p className="text-xs text-blue-300">
              AI-powered thesis pipeline: outline → prose → citation validation → humaniser.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isApiKeyMissing && (
            <span className="text-xs bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded border border-purple-800/50">
              No API key — local thesis generation will be used
            </span>
          )}
          <button onClick={handleReset} disabled={status === "generating"} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60 disabled:opacity-50">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Pipeline stage flow with source tools */}
      <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2">
          {pipelineStages.map((s, i) => {
            const ok = result?.stages?.[s.stageKey];
            const dot = result ? (ok ? "bg-emerald-400" : "bg-red-400") : (status === "generating" && stage === s.stageKey ? "bg-yellow-400" : "bg-blue-700");
            return (
              <React.Fragment key={s.name}>
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot} ${status === "generating" && stage === s.stageKey ? "animate-pulse" : ""}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-white">Stage {s.n}: {s.name}</span>
                      {s.href && (
                        <a href={s.href} target="_blank" rel="noreferrer" className="text-[10px] text-yellow-300 underline">repo</a>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-400 truncate">{s.role}</p>
                  </div>
                </div>
                {i < pipelineStages.length - 1 && <ChevronRight size={14} className="text-blue-700 flex-shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Configuration panel */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-1 md:col-span-2 lg:col-span-2">
          <label className="block text-xs font-medium text-blue-300 mb-1">Thesis topic</label>
          <input
            value={config.topic}
            onChange={(e) => handleConfigChange("topic", e.target.value)}
            placeholder="e.g., Impact of telemedicine on diabetes management"
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-blue-900/30"
            disabled={status === "generating"}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Level</label>
          <select
            value={config.level}
            onChange={(e) => handleConfigChange("level", e.target.value)}
            disabled={status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Citation style</label>
          <select
            value={config.style}
            onChange={(e) => handleConfigChange("style", e.target.value)}
            disabled={status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Language</label>
          <select
            value={config.language}
            onChange={(e) => handleConfigChange("language", e.target.value)}
            disabled={status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {LANGUAGES.map((lg) => (
              <option key={lg.value} value={lg.value}>{lg.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">AI provider</label>
          <select
            value={config.provider}
            onChange={(e) => handleConfigChange("provider", e.target.value)}
            disabled={status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Study design</label>
          <select
            value={config.studyDesign}
            onChange={(e) => handleConfigChange("studyDesign", e.target.value)}
            disabled={status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {DESIGNS.map((d) => (
              <option key={d.value} value={d.value}>{d.label} ({d.guideline})</option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Author</label>
          <input
            value={config.author || ""}
            onChange={(e) => handleConfigChange("author", e.target.value)}
            placeholder="Author name"
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={status === "generating"}
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Institution</label>
          <input
            value={config.institution || ""}
            onChange={(e) => handleConfigChange("institution", e.target.value)}
            placeholder="Institution"
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={status === "generating"}
          />
        </div>

        <div className="col-span-1 md:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-blue-300 mb-1">Max references</label>
          <input
            type="number"
            value={config.maxReferences ?? 150}
            onChange={(e) => handleConfigChange("maxReferences", Number(e.target.value) || 150)}
            min="10"
            max="500"
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={status === "generating"}
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Year from</label>
          <input
            type="number"
            value={config.yearFrom ?? ""}
            onChange={(e) => handleConfigChange("yearFrom", e.target.value ? Number(e.target.value) : undefined)}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={status === "generating"}
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Year to</label>
          <input
            type="number"
            value={config.yearTo ?? ""}
            onChange={(e) => handleConfigChange("yearTo", e.target.value ? Number(e.target.value) : undefined)}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={status === "generating"}
          />
        </div>

        <div className="col-span-full">
          <label className="block text-xs font-medium text-blue-300 mb-1">API key</label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => handleConfigChange("apiKey", e.target.value)}
              placeholder="Gemini / Groq API key"
              className="flex-1 bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              disabled={status === "generating"}
            />
            <span className="text-[10px]">{apiKey ? "context key loaded" : "enter key"}</span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleGenerate}
          disabled={status === "generating" || !config.topic.trim()}
          className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "generating" ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating thesis…
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generate Thesis
            </>
          )}
        </button>

        <div className="flex items-center gap-2 text-[10px] text-blue-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status === "generating" ? "#fbbf24" : "#4ade80" }} />
            {status === "generating" ? `Generating · ${stage}` : status === "completed" ? "Completed" : "Idle"}
          </span>
          <span>{progress}%</span>
        </div>

        {status === "generating" && stageMessage && (
          <p className="text-[10px] text-blue-300/90 bg-blue-950/60 border border-blue-900/60 rounded px-2.5 py-1.5 mt-1 flex items-center gap-2">
            <Loader2 size={11} className="animate-spin shrink-0" />
            {stageMessage}
          </p>
        )}

        {/* Thesis Notebook (Open Notebook style): sources + chapter expansion */}
        {result && (
          <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen size={14} className="text-yellow-400" />
                Thesis Notebook · Grounded Chapter Expansion
              </h4>
              <span className="text-[10px] text-blue-400">{notebook.sources.length} sources · {selectedSources.length} selected</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="md:col-span-3">
                <input
                  value={notebookTitle}
                  onChange={(e) => setNotebookTitle(e.target.value)}
                  placeholder="Source title (paper, note, excerpt…)"
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="md:col-span-1">
                <button
                  onClick={handleAddNotebookSource}
                  disabled={!notebookTitle.trim() || !notebookInput.trim()}
                  className="bg-yellow-500 text-[#0a1a3a] font-bold px-3 py-2 rounded disabled:opacity-50 hover:bg-yellow-600 disabled:cursor-not-allowed text-xs"
                >
                  Add
                </button>
              </div>
            </div>
            <textarea
              value={notebookInput}
              onChange={(e) => setNotebookInput(e.target.value)}
              placeholder="Paste source text, paper abstract, or your own notes here…"
              rows={3}
              className="w-full bg-blue-950/60 border border-blue-900 rounded p-2.5 text-xs text-white font-mono leading-relaxed focus:outline-none resize-y whitespace-pre-wrap"
            />
            <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {notebook.sources.map((s) => {
                const sel = notebook.selectedSourceIds.includes(s.id);
                return (
                  <div key={s.id} className="bg-blue-950/40 border border-blue-900/50 rounded-lg p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={(e) => handleToggleNotebookSource(s.id, e.target.checked)}
                          className="w-3 h-3 rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500 shrink-0 mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-semibold text-blue-200">{s.title}</div>
                          <div className="text-[9px] text-blue-400">
                            {s.type} · {s.authors ? `${s.authors} · ` : ""}{s.year ? `${s.year} · ` : ""}{s.content.length} chars
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveNotebookSource(s.id)}
                        className="text-[9px] text-red-300 hover:text-red-100 p-1"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => selectedSources.length > 0 && handleExpandChapter()}
                disabled={selectedSources.length === 0 || expanding !== null}
                className={`flex items-center gap-1 bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded text-xs hover:bg-blue-800/60 disabled:opacity-50 flex-shrink-0 ${expanding !== null ? "animate-pulse" : ""}`}
              >
                <Sparkles size={11} />
                Expand selected chapter
              </button>
              {expanding !== null && (
                <span className="text-[10px] text-yellow-300 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Expanding…
                </span>
              )}
            </div>
            {selectedSources.length > 0 && (
              <p className="text-[9px] text-blue-400 italic">
                Expansion uses only the checked notebook sources as grounding; every new claim cites (Author, Year)
                from those sources.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={handleCopy} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60">
              <Copy size={12} /> Copy
            </button>
            {!finalized ? (
              <button
                onClick={() => setFinalized(true)}
                disabled={!fullThesis.trim()}
                className="text-xs bg-yellow-500 text-[#0a1a3a] font-bold px-3 py-1.5 rounded hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1"
              >
                <Check size={12} /> Finalise Thesis
              </button>
            ) : (
              <>
                <span className="text-[10px] text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Finalised
                </span>
                <button onClick={() => setFinalized(false)} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60">
                  <Edit2 size={12} /> Edit
                </button>
                <button onClick={() => handleExport("word")} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60">
                  <Download size={12} /> Word
                </button>
                <button onClick={() => handleExport("pdf")} className="text-xs bg-emerald-900/50 text-emerald-300 px-3 py-1.5 rounded hover:bg-emerald-800/60">
                  <Download size={12} /> PDF
                </button>
                <button onClick={() => handleExport("latex")} className="text-xs bg-purple-900/50 text-purple-200 px-3 py-1.5 rounded hover:bg-purple-800/60">
                  <Download size={12} /> LaTeX
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText size={14} className="text-yellow-400" />
              Generated Thesis
            </h3>
            <div className="text-[10px] text-blue-400 flex gap-2">
              <span>Chapters: {stats.totalChapters || chapters.length}</span>
              <span>Words: {stats.totalWords || 0}</span>
              <span>References: {stats.totalReferences || refsList.length}</span>
              <span>Time: {stats.generationTimeMs ? (stats.generationTimeMs / 1000).toFixed(1) + "s" : "-"}</span>
            </div>
          </div>

          {/* Stage badges */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            {Object.entries(result.stages || {}).map(([key, ok]) => (
              <span key={key} className={`px-2 py-1 rounded border ${ok ? "bg-emerald-900/30 text-emerald-200 border-emerald-700" : "bg-red-900/30 text-red-300 border-red-800"}`}>
                {ok ? "✓" : "✗"} {key}
              </span>
            ))}
          </div>

          {/* NurseStack plan */}
          {result.nursestackPlan && (
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <ClipboardCheck size={13} className="text-yellow-400" />
                  NurseStack thesis plan
                </h4>
                <span className="text-[10px] text-blue-400">nursestack /plan-dissertation • /plan-pico</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="bg-blue-900/30 border border-blue-900 rounded p-2.5">
                  <p className="text-blue-300 font-semibold mb-1">Methodology fit</p>
                  <p className="text-blue-200">Question type: {result.nursestackPlan.methodology.questionType}</p>
                  <p className="text-blue-200">Recommended: {result.nursestackPlan.methodology.methodology}</p>
                  <p className="text-blue-200">Reporting guideline: {result.nursestackPlan.methodology.reportingGuideline}</p>
                  <p className="text-blue-200">CASP checklist: {result.nursestackPlan.methodology.caspChecklistId.replace(/_/g, " ")}</p>
                  <p className="text-blue-400 mt-1">{result.nursestackPlan.methodology.ethicsNote}</p>
                </div>
                <div className="bg-blue-900/30 border border-blue-900 rounded p-2.5">
                  <p className="text-blue-300 font-semibold mb-1">PICO(S)</p>
                  <p className="text-blue-200">{result.nursestackPlan.pico.population}</p>
                  <p className="text-blue-200">{result.nursestackPlan.pico.intervention}</p>
                  <p className="text-blue-200">{result.nursestackPlan.pico.comparison}</p>
                  <p className="text-blue-200">{result.nursestackPlan.pico.outcome}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-blue-300 font-semibold text-[11px] mb-1">Chapter structure</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {result.nursestackPlan.chapters.map((c: { number: number; title: string; wordTarget: number }) => (
                    <div key={c.number} className="bg-blue-900/20 border border-blue-900/60 rounded px-2 py-1.5 text-[10px] text-blue-200">
                      <span className="text-yellow-300 font-semibold">Ch {c.number}</span> {c.title}
                      <span className="text-blue-500"> — ~{c.wordTarget.toLocaleString()} words</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-blue-300 font-semibold text-[11px] mb-1">Critical appraisal plan (CASP)</p>
                <ul className="space-y-0.5 text-[10px] text-blue-300">
                  {result.nursestackPlan.appraisalPlan.map((s: string, i: number) => (
                    <li key={i}>- {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* CASP appraisal is handled on the separate Critical Appraisal tab. */}

          <div className="bg-blue-950 border border-blue-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-[11px] text-blue-300">
                Review and edit the thesis below, then click <span className="text-yellow-300 font-semibold">Finalise Thesis</span> to enable Word / PDF / LaTeX downloads.
              </span>
              {finalized && (
                <span className="text-[11px] text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Finalised — ready to download
                  {liveWordBudget.length > 0 && (
                    <span className="text-blue-400">
                      · {countWords(fullThesis).toLocaleString()} words ·{" "}
                      {liveWordBudget.filter((w: { status: string }) => w.status === "on-target").length}/{liveWordBudget.length} chapters on target
                    </span>
                  )}
                </span>
              )}
            </div>
            <textarea
              value={fullThesis}
              onChange={handleThesisChange}
              rows={24}
              className="w-full h-[600px] bg-transparent text-white text-sm font-mono leading-relaxed focus:outline-none resize-y whitespace-pre-wrap"
              placeholder="Thesis content will appear here..."
              disabled={status === "generating"}
            />
          </div>

          {/* Word budget — the NurseStack plan allocates words per chapter */}
          {liveWordBudget.length > 0 && (
            <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calculator size={14} className="text-yellow-400" />
                  Word budget (NurseStack plan)
                </h4>
                <span className="text-[10px] text-blue-400">
                  {liveWordBudget.filter((w: { status: string }) => w.status === "on-target").length}/{liveWordBudget.length} chapters on target
                </span>
              </div>
              <div className="space-y-1.5">
                {liveWordBudget.map((w: { number: number; title: string; target: number; actual: number; status: string }) => {
                  const pct = w.target > 0 ? Math.min((w.actual / w.target) * 100, 130) : 0;
                  const colour =
                    w.status === "on-target"
                      ? "bg-emerald-500"
                      : w.status === "short"
                        ? "bg-yellow-500"
                        : w.status === "over"
                          ? "bg-orange-500"
                          : "bg-blue-800";
                  return (
                    <div key={w.number} className="bg-blue-950/40 border border-blue-900 rounded px-2.5 py-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-blue-200">
                          Ch {w.number}: {w.title}
                        </span>
                        <span className={w.status === "on-target" ? "text-emerald-300" : w.status === "pending" ? "text-blue-400" : "text-yellow-300"}>
                          {w.actual.toLocaleString()} / {w.target.toLocaleString()} words
                          {w.status !== "pending" && w.status !== "on-target" ? ` (${w.status})` : ""}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-blue-950 rounded">
                        <div className={`h-full rounded ${colour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-blue-500 mt-2">
                The Scholar Copilot expands or condenses each chapter to the word count the plan allocates (±12%). Edit a
                chapter below and the budget updates live.
              </p>
            </div>
          )}

          {/* Per-chapter editor */}
          {editingChapter !== null && (
            <div className="bg-[#0a1530] border border-yellow-700/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit2 size={14} className="text-yellow-400" />
                  Editing chapter {editingChapter}
                </h4>
                <div className="flex gap-2">
                  <button onClick={cancelChapterEdit} className="text-[10px] bg-blue-900/50 text-blue-200 px-2.5 py-1 rounded hover:bg-blue-800/60">
                    Cancel
                  </button>
                  <button onClick={saveChapterEdit} className="text-[10px] bg-yellow-500 text-[#0a1a3a] font-bold px-2.5 py-1 rounded hover:bg-yellow-600">
                    Save chapter
                  </button>
                </div>
              </div>
              <textarea
                value={chapterDraft}
                onChange={(e) => setChapterDraft(e.target.value)}
                rows={18}
                className="w-full bg-blue-950/60 border border-blue-900 rounded p-3 text-white text-xs font-mono leading-relaxed focus:outline-none resize-y whitespace-pre-wrap"
              />
              <p className="text-[10px] text-blue-500 mt-1">
                {countWords(chapterDraft).toLocaleString()} words in this chapter.
              </p>
            </div>
          )}

          {/* References are managed on a separate screen (Critical Appraisal / References tab). */}

          {/* Chapter files & argument audit */}
          {Array.isArray(result.chapters) && result.chapters.length > 0 && (
            <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText size={14} className="text-yellow-400" />
                  Chapter Files &amp; Argument Audit
                </h4>
                <span className="text-[10px] text-blue-400">{result.chapters.length} chapters</span>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {result.chapters.map((ch: any, idx: number) => {
                  const audit = ch.argumentAudit || {};
                  const score = typeof audit.logicalFlowScore === "number" ? audit.logicalFlowScore : 0;
                  const coverage = typeof audit.citationCoverage === "number" ? audit.citationCoverage : 0;
                  return (
                    <details key={idx} className="bg-blue-950/40 border border-blue-900 rounded-lg p-3">
                      <summary className="cursor-pointer text-xs text-blue-100 font-semibold flex items-center justify-between">
                        <span>Chapter {ch.chapterNumber || idx + 1}: {ch.chapterTitle || "Untitled"}</span>
                        <span className="text-[10px] text-blue-400 ml-2">{ch.wordCount || 0} words · {ch.citations?.length || 0} citations</span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => openChapterEditor(ch)}
                            className="text-[10px] bg-blue-900/50 text-blue-200 px-2.5 py-1 rounded hover:bg-blue-800/60 flex items-center gap-1"
                          >
                            <Edit2 size={10} /> Edit this chapter
                          </button>
                        </div>
                        {/* Audit scores */}
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="bg-blue-900/40 rounded p-2">
                            <div className="flex items-center justify-between text-blue-300">
                              <span>Logical flow</span>
                              <span className="text-white font-bold">{score}/100</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-blue-950 rounded"><div className="h-full bg-yellow-500 rounded" style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} /></div>
                          </div>
                          <div className="bg-blue-900/40 rounded p-2">
                            <div className="flex items-center justify-between text-blue-300">
                              <span>Citation coverage</span>
                              <span className="text-white font-bold">{coverage}%</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-blue-950 rounded"><div className="h-full bg-emerald-500 rounded" style={{ width: `${Math.min(Math.max(coverage, 0), 100)}%` }} /></div>
                          </div>
                        </div>

                        {Array.isArray(audit.claims) && audit.claims.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-yellow-300 mb-1">Claims</p>
                            <ul className="list-disc list-inside text-[11px] text-blue-200 space-y-0.5">
                              {audit.claims.slice(0, 6).map((c: string, i: number) => <li key={i}>{c}</li>)}
                            </ul>
                          </div>
                        )}

                        {Array.isArray(audit.evidenceGaps) && audit.evidenceGaps.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-red-300 mb-1">Evidence gaps</p>
                            <ul className="list-disc list-inside text-[11px] text-blue-200 space-y-0.5">
                              {audit.evidenceGaps.slice(0, 6).map((g: string, i: number) => <li key={i}>{g}</li>)}
                            </ul>
                          </div>
                        )}

                        {Array.isArray(audit.recommendations) && audit.recommendations.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-emerald-300 mb-1">Recommendations</p>
                            <ul className="list-disc list-inside text-[11px] text-blue-200 space-y-0.5">
                              {audit.recommendations.slice(0, 6).map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        )}

                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-blue-400">View chapter prose</summary>
                          <div className="mt-2 text-[11px] text-blue-200 whitespace-pre-wrap font-serif max-h-[240px] overflow-y-auto">
                            {ch.content || "(no content)"}
                          </div>
                        </details>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outline */}
          {result.outline && result.outline.chapters.length > 0 && (
            <details className="bg-[#0a1530] border border-blue-800 rounded-lg p-3">
              <summary className="cursor-pointer text-sm font-semibold text-blue-300 flex items-center justify-between">
                Thesis Outline
                <ChevronRight size={14} className="ml-2" />
              </summary>
              <div className="mt-3 text-xs text-blue-200 space-y-1 ml-2">
                {result.outline.chapters.map((c: any) => (
                  <div key={c.number} className="flex items-start gap-2">
                    <span className="text-yellow-400 font-bold">Ch {c.number}.</span>
                    <span>{c.title}</span>
                    <span className="text-blue-500 ml-1">({c.wordTarget || 0} words)</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
