"use client";

import React, { useState } from "react";
import {
  Search, Database, Filter, X, ChevronRight, FileText,
  RotateCcw, Play, MessageSquare, Gauge
} from "lucide-react";

const SR_DATABASES = [
  { id: "pubmed", label: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/" },
  { id: "openalex", label: "OpenAlex", url: "https://openalex.org" },
  { id: "europepmc", label: "Europe PMC", url: "https://europepmc.org" },
  { id: "eric", label: "ERIC", url: "https://eric.ed.gov" },
  { id: "googlescholar", label: "Google Scholar (via CrossRef)", url: "https://scholar.google.com" },
  { id: "shodhganga", label: "Shodhganga", url: "https://shodhganga.inflibnet.ac.in" },
  { id: "ctri", label: "CTRI India", url: "https://ctri.nic.in" },
  { id: "sciteai", label: "scite.ai", url: "https://scite.ai" },
];

const SR_STEPS = [
  { num: 1, label: "Search" },
  { num: 2, label: "Screening" },
  { num: 3, label: "Extraction" },
  { num: 4, label: "Synthesis" },
];

const generateMockSRPaper = (query: string, db: string) => ({
  id: `sr-${db}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: `${query}: Systematic evaluation in ${db} database — study variant`,
  authors: `Author A, Author B, et al.`,
  year: 2020 + Math.floor(Math.random() * 6),
  doi: `10.1000/sr.${db}.${Math.random().toString(36).slice(2, 6)}`,
  abstract: `Systematic review protocol registered on PROSPERO (${Math.floor(Math.random() * 400000)}). ${Math.floor(Math.random() * 30 + 5)} studies met inclusion criteria. Quality appraisal using AMSTAR 2. Pooled analysis yielded significant heterogeneity (I²=${Math.floor(Math.random() * 60 + 20)}%).`,
  database: db,
});

export default function SystematicReviewTab() {
  const [srStep, setSrStep] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedDbs, setSelectedDbs] = useState<string[]>(["pubmed", "openalex"]);
  const [papers, setPapers] = useState<any[]>([]);
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [srLoading, setSrLoading] = useState(false);
  const [useAsReview, setUseAsReview] = useState(false);
  const [usePrismAId, setUsePrismAId] = useState(false);
  const [showManalyzer, setShowManalyzer] = useState(false);

  const toggleDb = (id: string) => {
    setSelectedDbs((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSRSearch = async () => {
    if (!query.trim()) return;
    setSrLoading(true);
    setPapers([]);
    setTimeout(() => {
      const results: any[] = [];
      selectedDbs.forEach((db) => {
        for (let i = 0; i < 3; i++) {
          results.push(generateMockSRPaper(query, db));
        }
      });
      setPapers(results);
      setSrLoading(false);
    }, 2000);
  };

  const togglePaper = (id: string) => {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runManalyzer = () => {
    setShowManalyzer(false);
    alert(
      "Manalyzer meta-analysis launched (mock).\n\nMeta-Analysis Configuration:\n– Model: Random-effects DerSimonian-Laird\n– Outcome: Dichotomous (OR)\n– Heterogeneity: τ² estimation in progress\n– Funnel plot asymmetry test: Begg's & Egger's\n– Please wait for results..."
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Systematic Review / RCT Pipeline</h2>
        <p className="text-sm text-blue-300 mb-6">
          Conduct a full systematic review or RCT protocol using dedicated pipelines and tools including ASReview, prismAId, and Manalyzer.
        </p>

        <div className="flex items-center gap-2 mb-6 bg-blue-950/60 rounded-lg p-1.5">
          {SR_STEPS.map((s) => (
            <React.Fragment key={s.num}>
              <button
                onClick={() => setSrStep(s.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  srStep === s.num
                    ? "bg-blue-600 text-white shadow"
                    : srStep > s.num
                    ? "bg-blue-900/40 text-blue-300"
                    : "bg-transparent text-blue-500"
                }`}
              >
                <span className="text-xs font-bold">{s.num}</span>
                {s.label}
              </button>
              {s.num < 4 && <div className="text-blue-600"><ChevronRight size={14} /></div>}
            </React.Fragment>
          ))}
        </div>

        {srStep === 1 && (
          <div className="space-y-6">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <Database size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Systematic Review Search</h3>
              </div>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSRSearch()}
                    placeholder="e.g., (latent tuberculosis) AND (healthcare workers) AND (screening)"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <button
                  onClick={handleSRSearch}
                  disabled={srLoading}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
                >
                  {srLoading ? "Searching..." : "Search"}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SR_DATABASES.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => toggleDb(db.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedDbs.includes(db.id)
                        ? "bg-blue-800/50 border-blue-600"
                        : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{db.label}</p>
                    <p className="text-[10px] text-blue-400 truncate">{db.url}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 bg-purple-900/20 border border-purple-700/40 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAsReview}
                  onChange={(e) => setUseAsReview(e.target.checked)}
                  className="w-4 h-4 rounded border-purple-600 bg-purple-950 text-yellow-500"
                />
                <div>
                  <p className="text-sm text-white">ASReview</p>
                  <p className="text-[10px] text-purple-300">AI-assisted screening</p>
                </div>
              </label>
              <label className="flex items-center gap-2 bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePrismAId}
                  onChange={(e) => setUsePrismAId(e.target.checked)}
                  className="w-4 h-4 rounded border-blue-600 bg-blue-950 text-yellow-500"
                />
                <div>
                  <p className="text-sm text-white">prismAId</p>
                  <p className="text-[10px] text-blue-300">PRISMA 2020 automation</p>
                </div>
              </label>
              <button
                onClick={() => setShowManalyzer(!showManalyzer)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  showManalyzer
                    ? "bg-green-900/30 border-green-600 text-green-200"
                    : "bg-green-900/10 border-green-800 text-green-400 hover:bg-green-900/30"
                }`}
              >
                <Gauge size={16} />
                Manalyzer (Meta-Analysis)
              </button>
            </div>

            {showManalyzer && (
              <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-green-200 mb-3">Manalyzer Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-green-300 mb-1">Effect Measure</label>
                    <select className="w-full bg-green-950 border border-green-800 text-white rounded-lg px-3 py-2 text-sm">
                      <option>Odds Ratio (OR)</option>
                      <option>Risk Ratio (RR)</option>
                      <option>Mean Difference (MD)</option>
                      <option>Standardized MD (SMD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-green-300 mb-1">Model</label>
                    <select className="w-full bg-green-950 border border-green-800 text-white rounded-lg px-3 py-2 text-sm">
                      <option>Random Effects (D-L)</option>
                      <option>Fixed Effects (M-H)</option>
                      <option>Bayesian</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-green-300 mb-1">Heterogeneity</label>
                    <select className="w-full bg-green-950 border border-green-800 text-white rounded-lg px-3 py-2 text-sm">
                      <option>τ² (Restricted ML)</option>
                      <option>DerSimonian-Laird</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={runManalyzer}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-2"
                >
                  <Play size={16} />
                  Run Meta-Analysis
                </button>
              </div>
            )}

            {srLoading && (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-blue-200 text-sm">Searching {selectedDbs.length} databases...</p>
              </div>
            )}

            {!srLoading && papers.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <p className="text-sm text-blue-300 mb-2">{papers.length} records retrieved • Proceed to screening</p>
                {papers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => togglePaper(p.id)}
                    className={`p-3 rounded-lg border cursor-pointer ${
                      selectedPapers.has(p.id)
                        ? "bg-yellow-900/20 border-yellow-600/50"
                        : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <div className={`w-4 h-4 rounded border-2 ${selectedPapers.has(p.id) ? "bg-yellow-500 border-yellow-400" : "border-blue-600"}`}>
                          {selectedPapers.has(p.id) && <svg className="w-3 h-3 text-[#0a1a3a] p-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
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
            )}

            {papers.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setSrStep(2)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2"
                >
                  Proceed to Screening
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {srStep === 2 && (
          <div className="py-12 text-center text-blue-400">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Title and abstract screening module. (Full ASReview / prismAId integration would continue from here.)</p>
            <button onClick={() => setSrStep(3)} className="mt-4 bg-yellow-500 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg">Skip to Step 3</button>
          </div>
        )}
        {srStep === 3 && (
          <div className="py-12 text-center text-blue-400">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Full-text review and data extraction module. (Data extraction form would appear here.)</p>
            <button onClick={() => setSrStep(4)} className="mt-4 bg-yellow-500 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg">Skip to Step 4</button>
          </div>
        )}
        {srStep === 4 && (
          <div className="py-12 text-center text-blue-400">
            <RotateCcw size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Evidence synthesis (meta-analysis / narrative) module. Manalyzer configuration available via toggle in Step 1.</p>
            <button onClick={() => { setSrStep(1); setPapers([]); }} className="mt-4 bg-yellow-500 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg">Start New SR</button>
          </div>
        )}
      </div>
    </div>
  );
}
