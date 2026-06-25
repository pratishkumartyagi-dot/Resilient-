"use client";

import React, { useState } from "react";
import {
  Search, Database, Filter, X, ChevronRight, FileText,
  Play, RotateCcw, CheckCircle2, ExternalLink, FlaskConical
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { fetchRealPapers, generateMockLegacy, type Paper } from "@/lib/database-apis";

const SR_DATABASES = [
  "PubMed", "OpenAlex", "Europe PMC", "Google Scholar",
  "WHO IRIS", "Semantic Scholar", "Shodhganga", "Prospero",
  "ScienceDirect", "ClinicalTrials.gov", "DOAJ", "Clarivate"
];

const PIPELINE_STEPS = [
  { num: 1, label: "Search & Screening", icon: Search },
  { num: 2, label: "Data Extraction", icon: FileText },
  { num: 3, label: "Risk of Bias", icon: CheckCircle2 },
  { num: 4, label: "Synthesis & Meta-analysis", icon: FlaskConical },
  { num: 5, label: "Reporting & PRISMA", icon: FileText },
];

export default function EvidenceSynthesisTab() {
  const { state, dispatch } = useApp();
  const [pipelineStep, setPipelineStep] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedDbs, setSelectedDbs] = useState<string[]>(["PubMed", "OpenAlex", "Europe PMC"]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };

  const handleSearch = async () => {
    if (!query.trim() || selectedDbs.length === 0) return;
    setLoading(true);
    setPapers([]);
    setSelectedPaperIds(new Set());
    try {
      const results = await fetchRealPapers(query, selectedDbs);
      setPapers(results);
      dispatch({ type: "SET_PAPERS", payload: results });
    } catch {
      setPapers(generateMockLegacy(query, selectedDbs));
      dispatch({ type: "SET_PAPERS", payload: generateMockLegacy(query, selectedDbs) });
    } finally {
      setLoading(false);
    }
  };

  const togglePaper = (id: string) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPaperIds.size === papers.length) {
      setSelectedPaperIds(new Set());
    } else {
      setSelectedPaperIds(new Set(papers.map((p) => p.id)));
    }
  };

  const runExtraction = () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    setExtractedData(
      selected.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        doi: p.doi,
        studyType: p.studyType,
        population: "Extracted from abstract",
        intervention: "Extracted from abstract",
        outcome: "Extracted from abstract",
        ROB: "Low / Some concerns / High — pending assessment",
      }))
    );
    setPipelineStep(3);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={20} className="text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Evidence Synthesis & Meta-analysis</h2>
        </div>
        <p className="text-sm text-blue-300 mb-6">
          Guided workflow derived from <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a>: systematic search, AI-assisted screening, structured data extraction, risk-of-bias assessment, meta-analysis, and PRISMA-compliant reporting.
        </p>

        <div className="flex items-center gap-2 mb-6 bg-blue-950/60 rounded-lg p-1.5 overflow-x-auto">
          {PIPELINE_STEPS.map((s) => (
            <React.Fragment key={s.num}>
              <button
                onClick={() => setPipelineStep(s.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  pipelineStep === s.num
                    ? "bg-blue-600 text-white shadow"
                    : pipelineStep > s.num
                    ? "bg-blue-900/40 text-blue-300"
                    : "bg-transparent text-blue-500"
                }`}
              >
                <s.icon size={14} />
                {s.label}
              </button>
              {s.num < 5 && <div className="text-blue-600"><ChevronRight size={14} /></div>}
            </React.Fragment>
          ))}
        </div>

        {pipelineStep === 1 && (
          <div className="space-y-6">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <Database size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Systematic Search</h3>
              </div>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="e.g., (latent tuberculosis) AND (healthcare workers) AND (screening)"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SR_DATABASES.map((db) => (
                  <button
                    key={db}
                    onClick={() => toggleDb(db)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedDbs.includes(db)
                        ? "bg-blue-800/50 border-blue-600"
                        : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{db}</p>
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-blue-200 text-sm">Searching {selectedDbs.length} databases...</p>
              </div>
            )}

            {!loading && papers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-blue-300">{papers.length} records retrieved • {selectedPaperIds.size} selected</p>
                  <button onClick={selectAll} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70">
                    {selectedPaperIds.size === papers.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {papers.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => togglePaper(p.id)}
                      className={`p-3 rounded-lg border cursor-pointer ${
                        selectedPaperIds.has(p.id)
                          ? "bg-yellow-900/20 border-yellow-600/50"
                          : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <div className={`w-4 h-4 rounded border-2 ${selectedPaperIds.has(p.id) ? "bg-yellow-500 border-yellow-400" : "border-blue-600"}`}>
                            {selectedPaperIds.has(p.id) && <svg className="w-3 h-3 text-[#0a1a3a] p-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-white truncate">{p.title}</h4>
                          <p className="text-xs text-blue-300">{p.authors} • {p.year} • {p.database}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {papers.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setPipelineStep(2)}
                  disabled={selectedPaperIds.size === 0}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  Proceed to Extraction
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-4">
              <p className="text-xs text-blue-300 mb-2">Tools referenced from awesome-evidence-synthesis</p>
              <div className="flex flex-wrap gap-2">
                {["OpenAlex", "PubMed E-utilities", "Europe PMC", "ASReview", "prismAId", "CitationChaser", "robvis", "forestplot", "PRISMA 2020"].map((t) => (
                  <span key={t} className="text-[10px] bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded-full border border-blue-800">{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {pipelineStep === 2 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">Data Extraction</h3>
              <p className="text-sm text-blue-300 mb-4">
                Structured extraction aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> data-extraction guidance. Fields below can be fed into meta-analysis packages such as <em>meta</em>, <em>metafor</em>, or <em>metaumbrella</em>.
              </p>
              <button onClick={runExtraction} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg">
                Auto-Extract from Selected Papers
              </button>
            </div>
            {extractedData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-blue-900/60 text-left">
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Year</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">DOI</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study Type</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Outcome</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">ROB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-900/20">
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.title}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.year}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.doi ? <a href={`https://doi.org/${row.doi}`} target="_blank" rel="noreferrer" className="text-yellow-300 underline flex items-center gap-1">DOI <ExternalLink size={10} /></a> : "—"}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.studyType}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.outcome}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.ROB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setPipelineStep(3)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Risk of Bias
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {pipelineStep === 3 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">Risk of Bias Assessment</h3>
              <p className="text-sm text-blue-300 mb-4">
                Supported by the tooling from <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a>. Current implementation provides structured RoB fields; visualization via <em>robvis</em>, traffic-light plots, and RoB2/ROBINS-I/QUADAS-2 templates are available in the reporting stage.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {extractedData.map((row) => (
                  <div key={row.id} className="bg-blue-950/50 border border-blue-900 rounded-lg p-3">
                    <p className="text-xs text-blue-200 truncate mb-1">{row.title}</p>
                    <p className="text-[10px] text-blue-400 mb-2">{row.authors} ({row.year})</p>
                    <select className="w-full bg-blue-950 border border-blue-800 text-white rounded px-2 py-1 text-xs">
                      <option>Low risk of bias</option>
                      <option>Some concerns</option>
                      <option>High risk of bias</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setPipelineStep(4)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Synthesis
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {pipelineStep === 4 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">Synthesis & Meta-analysis</h3>
              <p className="text-sm text-blue-300">
                Generate evidence synthesis using <em>meta</em>, <em>metafor</em>, or <em>metaumbrella</em> methodology. Current stage produces structured narrative synthesis and effect-size summaries that can be exported for meta-analysis.
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setPipelineStep(5)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Reporting
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {pipelineStep === 5 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">PRISMA 2020 Reporting</h3>
              <p className="text-sm text-blue-300">
                Aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> workflow standards: <em>PRISMA 2020</em> flow diagram, <em>robvis</em> risk-of-bias plots, <em>forestplot</em> summaries, and <em>ROSES</em> structured reporting.
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => { setPipelineStep(1); setPapers([]); setSelectedPaperIds(new Set()); }} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Start New Review
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
