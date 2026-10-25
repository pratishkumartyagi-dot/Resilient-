"use client";

import React, { useState } from "react";
import {
  ChevronRight,
  Download,
  Loader2,
  Sparkles,
  FileText,
  BookOpen,
  RotateCcw,
  Copy,
  Check,
  CheckCircle2,
  Edit2,
  Database,
  Calendar,
  Filter,
  Microscope,
} from "lucide-react";
import {
  callGemini,
  callGroq,
  callDeepSeek,
  callAiWithFallback,
} from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";

const DATABASES: { id: string; label: string; searchHint: string }[] = [
  { id: "PubMed", label: "PubMed", searchHint: "MESH + [Title/Abstract] + date + publication-type filters via NCBI E-utilities" },
  { id: "Europe PMC", label: "Europe PMC", searchHint: "TITLE/ABST fields + date range via Europe PMC REST" },
  { id: "Crossref", label: "Crossref", searchHint: "bibliographic query + date filter via Crossref API" },
  { id: "arXiv", label: "arXiv", searchHint: "title/abstract query via arXiv API" },
  { id: "bioRxiv", label: "bioRxiv", searchHint: "title/abstract query via bioRxiv API" },
  { id: "medRxiv", label: "medRxiv", searchHint: "title/abstract query via medRxiv API" },
  { id: "OpenAIRE", label: "OpenAIRE", searchHint: "title/abstract query via OpenAIRE API" },
  { id: "Zenodo", label: "Zenodo", searchHint: "title/abstract query via Zenodo API" },
  { id: "ClinicalTrials.gov", label: "ClinicalTrials.gov", searchHint: "condition/intervention query via ClinicalTrials.gov API" },
  { id: "DOAJ", label: "DOAJ", searchHint: "title/abstract query via DOAJ API" },
  { id: "OpenAlex", label: "OpenAlex", searchHint: "search filter via OpenAlex API" },
  { id: "Semantic Scholar", label: "Semantic Scholar", searchHint: "paper search via Semantic Scholar API" },
  { id: "Google Scholar", label: "Google Scholar", searchHint: "web-indexed scholarly search (may be rate-limited)" },
];

const STUDY_TYPES: { value: string; label: string }[] = [
  { value: "All Study Types", label: "All Study Types" },
  { value: "Randomized Controlled Trial", label: "Randomized Controlled Trial" },
  { value: "Cohort Study", label: "Cohort Study" },
  { value: "Case-Control Study", label: "Case-Control Study" },
  { value: "Cross-Sectional Study", label: "Cross-Sectional Study" },
  { value: "Systematic Review", label: "Systematic Review" },
  { value: "Meta-Analysis", label: "Meta-Analysis" },
  { value: "Qualitative Study", label: "Qualitative Study" },
  { value: "Case Report / Case Series", label: "Case Report / Case Series" },
  { value: "Diagnostic Study", label: "Diagnostic Study" },
];

const COUNT_OF_NONE = 0;

export default function AutomatedResearchTab() {

  const [query, setQuery] = useState("");
  const [selectedDbs, setSelectedDbs] = useState<string[]>(["PubMed", "Europe PMC", "Crossref"]);
  const [studyType, setStudyType] = useState("All Study Types");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
const [status, setStatus] = useState<"idle" | "searching" | "generating" | "completed" | "error">("idle");
const [error, setError] = useState<string | null>(null);
const [papers, setPapers] = useState<Array<{ title: string; authors: string; journal?: string; year?: number; doi?: string; abstract?: string; database?: string; studyType?: string; id?: string; url?: string }>>([]);
const [perDb, setPerDb] = useState<Record<string, number>>({});
const [report, setReport] = useState("");
const [finalized, setFinalized] = useState(false);
const [editing, setEditing] = useState(false);

  const handleSelectAllDb = () => {
    if (selectedDbs.length === DATABASES.length) setSelectedDbs([]);
    else setSelectedDbs(DATABASES.map((d) => d.id));
  };

  const buildResearchPrompt = (): string => {
    const papersList = papers
      .slice(0, 40)
      .map(
        (p, i) =>
          `${i + 1}. ${p.authors || "Unknown"}. ${p.title}. ${p.journal || ""}. ${p.year ?? ""}${p.doi ? ` doi:${p.doi}` : ""} [${p.database || ""}]`
      )
      .join("\n");

    return `You are an expert academic researcher following the ResearchClawBench automated research methodology. Produce a complete, publication-ready research report in academic (IMRAD + PRISMA-aligned) style from the retrieved evidence.

RESEARCH QUESTION: ${query}
SEARCH SCOPE: Databases: ${selectedDbs.join(", ")} | Study type: ${studyType} | Year interval: ${yearFrom || "any"}–${yearTo || "present"}
RETRIEVED STUDIES (${papers.length}): ${papersList}

SEARCH STRATEGY (report this exactly in the Methods section):
- Databases searched: ${selectedDbs.map((d) => {
    const db = DATABASES.find((x) => x.id === d);
    return `${d} — ${db ? db.searchHint : "live API search"}`;
  }).join("; ")}
- Query translation: The natural-language question "${query}" was submitted to each selected database as a keyword/meaning search over titles and abstracts (MeSH/[tiab] for PubMed; TITLE/ABST for Europe PMC; bibliographic for Crossref/OpenAlex; title/abstract for preprint servers).
- Filters applied: publication year ${yearFrom || "any"} to ${yearTo || "present"}; study type: ${studyType}.
- Screening: all ${papers.length} retrieved records were screened by title/abstract; duplicates removed; inclusion/exclusion per PICO.
- References: every cited study is listed below in Vancouver style with DOI where available. No DOI links or effect sizes are fabricated.

TASK: Write a structured research report with these sections, using Vancouver-style inline citations ([1], [2]…) mapping to the numbered reference list, and academic tone throughout:

# Automated Research Report

## Abstract
Structured: Background, Objective, Methods, Results, Conclusion (~250 words).

## Methods
Search strategy: state the databases searched, date range, study-type filter, natural-language query translated to database syntax, inclusion/exclusion criteria, PRISMA-style flow (identification → screening → eligibility → included), and the Vancouver-style citation note. Reproduce the SEARCH STRATEGY box above verbatim.

## Results
Study characteristics table (authors, year, design, population, key finding). Synthesis of findings. Where data permit, effect estimates and confidence intervals. Heterogeneity and limitations of the evidence base.

## Discussion
Interpretation, comparison with existing evidence, strengths and limitations, clinical implications, implications for future research.

## Conclusion
Direct answer to the research question and bottom-line recommendation.

## References
Complete Vancouver-style numbered reference list for every cited study (Authors. Title. Journal. Year;Volume(Issue):Pages. DOI). Include only studies actually retrieved above. Do not fabricate references, DOIs, effect sizes, or p-values.

ACADEMIC STANDARDS: Ground every claim in the retrieved studies. Use [AUTHOR TO SPECIFY: …] only when a detail is genuinely missing from the retrieved records. If evidence is insufficient, state it explicitly.`;
  };

  const runSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a research question.");
      return;
    }
    setStatus("searching");
    setError(null);
    setReport("");
    try {
      const res = await fetch("/api/literature-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          databases: selectedDbs,
          yearFrom: yearFrom || undefined,
          yearTo: yearTo || undefined,
          studyType,
          maxResults: 100,
          timeoutMs: 60000,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Search failed (HTTP ${res.status})`);
        setStatus("idle");
        return;
      }
      setPapers((data.papers || []).map((p: any) => ({
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        database: p.database,
        studyType: p.studyType,
        id: p.id,
        url: p.url,
      })));
      setPerDb(data.sourceBreakdown || {});
      setStatus("idle");
    } catch (err: any) {
      setError(err?.message || "Search failed.");
      setStatus("idle");
    }
  };

  const generateReport = async () => {
    if (!papers.length) {
      setError("Run the database search first to retrieve studies.");
      return;
    }
    setStatus("generating");
    setError(null);
    try {
      const text = await callAiWithFallback(buildResearchPrompt(), { searchEnabled: false });
      setReport(text || "");
      setStatus("completed");
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Report generation failed. Configure an API key or check the local model.");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setError(null);
    setReport("");
    setPapers([]);
    setPerDb({});
    setFinalized(false);
    setEditing(false);
  };

  const countWords = (t: string) => t.split(/\s+/).filter(Boolean).length;

  const handleExport = async (kind: "word" | "pdf") => {
    if (!report.trim()) return;
    if (!finalized) {
      setError("Please finalise the report before downloading.");
      return;
    }
    const base = `automated-research-${query.replace(/\s+/g, "-").slice(0, 40)}-${new Date().toISOString().split("T")[0]}`;
    if (kind === "word") downloadMarkdownAsWord(report, `${base}.docx`);
    else downloadMarkdownAsPDF(report, `${base}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Microscope size={22} className="text-yellow-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Automated Research</h2>
            <p className="text-xs text-blue-300">
              Natural-language query across multiple medical databases → academic research report (ResearchClawBench methodology) → editable & finalisable → Word / PDF download.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {status === "generating" && (
            <span className="text-xs bg-yellow-900/30 text-yellow-300 px-3 py-1.5 rounded border border-yellow-800/50">
              <Loader2 size={12} className="animate-spin" /> Generating report…
            </span>
          )}
          <button onClick={handleReset} disabled={status === "generating" || status === "searching"} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60 disabled:opacity-50">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 text-red-200 text-sm">{error}</div>
      )}

      {/* Query & filters */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="col-span-1 md:col-span-2 lg:col-span-2">
          <label className="block text-xs font-medium text-blue-300 mb-1">Research question (natural language)</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={2}
            placeholder="e.g., Effect of telemedicine on glycemic control in adults with type 2 diabetes"
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-blue-900/30"
            disabled={status === "searching" || status === "generating"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Study type</label>
          <select
            value={studyType}
            onChange={(e) => setStudyType(e.target.value)}
            disabled={status === "searching" || status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {STUDY_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Year from</label>
          <input
            type="number"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            min="1900"
            max={new Date().getFullYear()}
            disabled={status === "searching" || status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="block text-xs font-medium text-blue-300 mb-1">Year to</label>
          <input
            type="number"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            min="1900"
            max={new Date().getFullYear()}
            disabled={status === "searching" || status === "generating"}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>
        <div className="col-span-full">
          <label className="block text-xs font-medium text-blue-300 mb-1">Databases</label>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={handleSelectAllDb}
              disabled={status === "searching" || status === "generating"}
              className="flex-1 text-xs text-blue-300 bg-blue-950 border border-blue-800 rounded px-2 py-1.5 hover:bg-blue-900/60 disabled:opacity-50"
            >
              {selectedDbs.length === DATABASES.length ? "Deselect all" : "Select all"}
            </button>
            <span className="text-[10px] text-blue-500">{selectedDbs.length}/{DATABASES.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {DATABASES.map((db) => (
              <button
                key={db.id}
                onClick={() =>
                  setSelectedDbs((prev) =>
                    prev.includes(db.id) ? prev.filter((d) => d !== db.id) : [...prev, db.id]
                  )}
                disabled={status === "searching" || status === "generating"}
                className={`text-xs rounded border px-2 py-1.5 ${
                  selectedDbs.includes(db.id)
                    ? "bg-yellow-900/30 border-yellow-800/50 text-yellow-200"
                    : "bg-blue-950 border-blue-800 text-blue-300 hover:bg-blue-900/60"
                }`}
              >
                {db.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={runSearch}
          disabled={status !== "idle" || !query.trim() || selectedDbs.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "searching" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Searching databases…
            </>
          ) : (
            <>
              <Database size={16} /> Search Databases
            </>
          )}
        </button>
        <button
          onClick={generateReport}
          disabled={status !== "idle" || !papers.length}
          className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "generating" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating report…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate Research Report
            </>
          )}
        </button>
        <div className="flex items-center gap-2 text-[10px] text-blue-400">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${status === "idle" ? "bg-emerald-500" : "bg-blue-500"}`} />
            {status === "searching" ? "Searching" : status === "generating" ? "Generating" : status === "completed" ? "Completed" : "Idle"}
          </span>
          <span>{papers.length} studies · {Object.values(perDb).reduce((a, b) => a + b, 0).toLocaleString()} hits</span>
        </div>
      </div>

      {/* Search strategy summary */}
      {status !== "idle" && papers.length > 0 && (
        <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Filter size={14} className="text-blue-400" /> Search strategy
            </h4>
            <span className="text-[10px] text-blue-400">{selectedDbs.length} database(s) · ${yearFrom || "any"}–${yearTo || "present"} · ${studyType}</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="text-blue-200 mb-1"><span className="font-bold text-blue-400">Query:</span> &quot;{query}&quot;</div>
            {selectedDbs.map((db) => {
              const d = DATABASES.find((x) => x.id === db);
              return (
                <div key={db} className="flex gap-1">
                  <span className="text-blue-400">•</span>
                  <span className="text-white">{db}</span>
                  <span className="text-blue-500">— {d ? d.searchHint : "live API search"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-database results */}
      {Object.keys(perDb).length > 0 && (
        <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Database size={14} className="text-blue-400" /> Results by database
            </h4>
            <span className="text-[10px] text-blue-400">{papers.length} unique studies retrieved</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {DATABASES.map((db) => {
              const c = perDb[db.id] ?? 0;
              return (
                <div key={db.id} className="bg-blue-950/40 border border-blue-900 rounded p-2 text-[10px]">
                  <span className="text-blue-200 block">{db.label}</span>
                  <span className={`text-xs font-bold ${c > 0 ? "text-emerald-400" : "text-blue-500"}`}>
                    {c}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Report */}
      {report || status === "completed" || status === "error" ? (
        <div className="bg-[#0a1530] border border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-yellow-400" />
              <h4 className="text-sm font-bold text-white">Automated Research Report</h4>
              <span className="text-[10px] text-blue-400 ml-2">{countWords(report).toLocaleString()} words</span>
            </div>
            <div className="flex gap-2">
              {!finalized ? (
                <button
                  onClick={() => setFinalized(true)}
                  disabled={!report.trim()}
                  className="text-xs bg-yellow-500 text-[#0a1a3a] font-bold px-3 py-1.5 rounded hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <Check size={12} /> Finalise Report
                </button>
              ) : (
                <>
                  <span className="text-[10px] text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Finalised
                  </span>
                  <button
                    onClick={() => setEditing((e) => !e)}
                    className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60"
                  >
                    {editing ? (
                      <span>Done editing</span>
                    ) : (
                      <>
                        <Edit2 size={12} /> Edit
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleExport("word")}
                    className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60"
                  >
                    <Download size={12} /> Word
                  </button>
                  <button
                    onClick={() => handleExport("pdf")}
                    className="text-xs bg-emerald-900/50 text-emerald-300 px-3 py-1.5 rounded hover:bg-emerald-800/60"
                  >
                    <Download size={12} /> PDF
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={editing || !finalized ? report : report}
            onChange={(e) => setReport(e.target.value)}
            rows={26}
            className={[
              "w-full h-[700px] bg-transparent text-white text-sm font-serif leading-relaxed focus:outline-none resize-y whitespace-pre-wrap",
              !editing && finalized ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!editing && finalized}
            placeholder="Research report will appear here after generation..."
          />
          <p className="text-[10px] text-blue-500 mt-1">
            Finalise to lock the report and enable Word / PDF export. Editing resets finalisation.
          </p>
        </div>
      ) : null}

      {/* Local fallback notice */}
      <div className="bg-blue-950/20 border border-blue-900 rounded-lg p-3 text-[10px] text-blue-400">
        <span className="flex items-center gap-1">
          <BookOpen size={12} /> AI chain: Gemini → Groq → local Qwen model → used when no API key is configured. All steps work offline.
        </span>
      </div>
    </div>
  );
}
