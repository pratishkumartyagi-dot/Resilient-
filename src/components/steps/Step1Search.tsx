"use client";

import React, { useState, useMemo } from "react";
import { Search, Database, ChevronRight, CheckSquare, Square, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateMockLegacy, webSearchPapers, verifyCitations, enrichPapersWithDois, type Paper } from "@/lib/database-apis";

const STUDY_TYPES = [
  "All Study Types",
  "Randomized Controlled Trial (RCT)",
  "Systematic Review",
  "Meta-Analysis",
  "Observational Study",
  "Cohort Study",
  "Case-Control Study",
  "Cross-Sectional Study",
  "Clinical Trial",
  "Qualitative Study",
  "Case Report / Case Series",
  "Review Article",
  "Guideline / Consensus Statement",
  "Dissertation / Thesis",
];

const DATABASES = [
  "PubMed",
  "OpenAlex",
  "Europe PMC",
  "DOAJ",
  "bioRxiv",
  "medRxiv",
  "Crossref",
  "arXiv",
  "OpenAIRE",
  "dblp",
  "Zenodo",
  "Google Scholar",
  "Semantic Scholar",
  "ClinicalTrials.gov",
];

const DATABASE_URLS: Record<string, string> = {
  "PubMed": "https://pubmed.ncbi.nlm.nih.gov/",
  "OpenAlex": "https://openalex.org/",
  "Europe PMC": "https://europepmc.org/",
  "DOAJ": "https://doaj.org/",
  "bioRxiv": "https://www.biorxiv.org/",
  "medRxiv": "https://www.medrxiv.org/",
  "Crossref": "https://www.crossref.org/",
  "arXiv": "https://arxiv.org/",
  "OpenAIRE": "https://www.openaire.eu/",
  "dblp": "https://dblp.org/",
  "Zenodo": "https://zenodo.org/",
  "Google Scholar": "https://scholar.google.com/",
  "Semantic Scholar": "https://www.semanticscholar.org/",
  "ClinicalTrials.gov": "https://clinicaltrials.gov/",
};

export default function Step1Search() {
  const { state, dispatch } = useApp();
  const [localQuery, setLocalQuery] = useState(state.searchQuery);
  const [localLogic, setLocalLogic] = useState(state.searchLogic);
  const [yearFrom, setYearFrom] = useState(state.yearFrom);
  const [yearTo, setYearTo] = useState(state.yearTo);
  const [studyType, setStudyType] = useState(state.studyType);
  const [selectedDbs, setSelectedDbs] = useState<string[]>(state.selectedDatabases);
  const [activeDbTab, setActiveDbTab] = useState<string>(DATABASES[0]);
  const [titleFilter, setTitleFilter] = useState("");
  const [perDatabaseResults, setPerDatabaseResults] = useState<Array<{ database: string; status: string; count: number; error?: string }>>([]);
  const [citationCounts, setCitationCounts] = useState<{ verified: number; unverified: number; noDoi: number }>({ verified: 0, unverified: 0, noDoi: 0 });

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };

  const selectAllDbs = () => {
    const allSelected = selectedDbs.length === DATABASES.length;
    const next = allSelected ? [] : DATABASES;
    setSelectedDbs(next);
    dispatch({ type: "SET_SELECTED_DATABASES", payload: next });
  };

  const clearDbs = () => {
    setSelectedDbs([]);
    dispatch({ type: "SET_SELECTED_DATABASES", payload: [] });
  };

  const handleSearch = async () => {
    if (!localQuery.trim() || selectedDbs.length === 0) {
      dispatch({ type: "SET_ERROR", payload: "Enter a search query and select at least one database." });
      return;
    }
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({
      type: "SET_SEARCH",
      payload: { query: localQuery, logic: localLogic, yearFrom, yearTo, studyType },
    });
    dispatch({ type: "SET_SELECTED_DATABASES", payload: selectedDbs });

    try {
      let papers: Paper[] = [];
      let perDb: Array<{ database: string; status: string; count: number; error?: string }> = [];

      try {
        const res = await fetch("/api/literature-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: localQuery,
            databases: selectedDbs,
            yearFrom: yearFrom || undefined,
            yearTo: yearTo || undefined,
            studyType: studyType === "All Study Types" ? undefined : studyType,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Search failed with status ${res.status}`);
        }
        const data = await res.json();
        papers = data.papers || [];
        perDb = data.perDatabaseResults || [];
        if (papers.length === 0) {
          throw new Error("No papers returned from literature search.");
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn("[Step1Search] Primary search failed, trying web fallback:", msg);
        try {
          const webPapers = await webSearchPapers(localQuery, 20);
          if (webPapers.length > 0) {
            papers = webPapers;
            const counts: Record<string, number> = {};
            webPapers.forEach((p) => {
              const db = p.database || "Web";
              counts[db] = (counts[db] || 0) + 1;
            });
            perDb = Object.entries(counts).map(([database, count]) => ({ database, status: "success", count }));
            dispatch({ type: "SET_ERROR", payload: `Live database search failed: ${msg}. Showing ${webPapers.length} results from web search fallback.` });
          } else {
            throw new Error("Web search returned 0 results");
          }
        } catch (webErr: any) {
          const webMsg = webErr?.message || String(webErr);
          console.warn("[Step1Search] Web search fallback failed:", webMsg);
          const mock = generateMockLegacy(localQuery, selectedDbs);
          papers = mock;
          perDb = selectedDbs.map((db) => ({ database: db, status: "success", count: papers.filter((p) => p.database === db).length }));
          dispatch({ type: "SET_ERROR", payload: `Live search failed: ${msg}. Web search fallback also failed: ${webMsg}. Showing ${mock.length} simulated results.` });
        }
      }

      if (papers.length > 0) {
        dispatch({ type: "SET_CITATION_STATUS", payload: "running" });
        try {
          const enrichedPapers = await enrichPapersWithDois(papers);
          const citationResults = await verifyCitations(enrichedPapers);
          dispatch({ type: "SET_CITATION_RESULTS", payload: Object.fromEntries(citationResults) });
          dispatch({ type: "SET_PAPERS", payload: enrichedPapers });
          let verified = 0, unverified = 0, noDoi = 0;
          enrichedPapers.forEach((p) => {
            if (!p.doi) { noDoi++; return; }
            const k = p.doi.toLowerCase();
            const r: any = citationResults.get(k);
            if (r?.valid) verified++; else unverified++;
          });
          setCitationCounts({ verified, unverified, noDoi });
        } catch {
          dispatch({ type: "SET_CITATION_RESULTS", payload: {} });
          dispatch({ type: "SET_PAPERS", payload: papers });
          setCitationCounts({ verified: 0, unverified: 0, noDoi: papers.filter((p) => !p.doi).length });
        } finally {
          dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
        }
        setPerDatabaseResults(perDb);
      } else {
        dispatch({ type: "SET_ERROR", payload: "No papers found. Try broader terms or more databases." });
      }
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Search failed. Please try again." });
      const mock = generateMockLegacy(localQuery, selectedDbs);
      dispatch({ type: "SET_PAPERS", payload: mock });
      setPerDatabaseResults(selectedDbs.map((db) => ({ database: db, status: "success", count: mock.filter((p) => p.database === db).length })));
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // Deduplicate by DOI/title for the on-screen Step 1 list (full dedup happens in Step 2)
  const uniquePapers = useMemo(() => {
    const seen = new Set<string>();
    const out: Paper[] = [];
    for (const p of state.papers) {
      const key = (p.doi && p.doi.length > 3 ? p.doi : p.title).toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }, [state.papers]);

  const papersByDatabase = useMemo(() => {
    const map: Record<string, Paper[]> = {};
    for (const p of uniquePapers) {
      const db = p.database || p.sourceBackend || "Unknown";
      if (!map[db]) map[db] = [];
      map[db].push(p);
    }
    return map;
  }, [uniquePapers]);

  const visiblePapers = useMemo(() => {
    const q = titleFilter.trim().toLowerCase();
    if (!q) return uniquePapers;
    return uniquePapers.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      (p.authors || "").toLowerCase().includes(q)
    );
  }, [uniquePapers, titleFilter]);

  const visibleByDatabase = useMemo(() => {
    const map: Record<string, Paper[]> = {};
    for (const p of visiblePapers) {
      const db = p.database || p.sourceBackend || "Unknown";
      if (!map[db]) map[db] = [];
      map[db].push(p);
    }
    return map;
  }, [visiblePapers]);

  const selectedCount = state.papers.filter((p) => p.selected).length;

  const togglePaper = (id: string) => {
    dispatch({ type: "TOGGLE_PAPER", payload: id });
  };

  const toggleAll = () => {
    const allSelected = uniquePapers.every((p) => p.selected);
    dispatch({ type: "SELECT_ALL_PAPERS", payload: !allSelected });
  };

  const toggleDatabase = (database: string) => {
    const dbPapers = papersByDatabase[database] || [];
    const allSelected = dbPapers.every((p) => p.selected);
    dbPapers.forEach((p) => {
      if (p.selected !== !allSelected) {
        dispatch({ type: "TOGGLE_PAPER", payload: p.id });
      }
    });
  };

  const proceedToStep2 = () => {
    if (selectedCount === 0) {
      dispatch({ type: "SET_ERROR", payload: "Select at least one paper before proceeding to Step 2." });
      return;
    }
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({ type: "SET_STEP", payload: 2 });
  };

  const getCitationBadge = (paper: Paper) => {
    if (state.citationValidationStatus === "running") {
      return <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Loader2 size={10} className="animate-spin" /> verifying</span>;
    }
    if (!paper.doi) return <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">no DOI</span>;
    const k = paper.doi.toLowerCase();
    const r: any = state.citationValidationResults[k];
    if (r?.valid) return <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle2 size={10} /> Verified</span>;
    return <span className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><AlertCircle size={10} /> Not verified</span>;
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 1: Broad Area of Research</h2>
        <p className="text-sm text-blue-300 mb-6">
          Enter your research topic with boolean logic, filters, and select databases for semantic search. Results are shown on this page grouped by database — select individual papers or all papers in a database, then proceed to Step 2.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">
              Search Query
            </label>
            <div className="flex gap-2">
              <select
                value={localLogic}
                onChange={(e) => setLocalLogic(e.target.value)}
                className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
              </select>
              <input
                type="text"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                placeholder="e.g., latent tuberculosis infection AND healthcare workers"
                className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <button
                onClick={handleSearch}
                disabled={state.isLoading || !localQuery.trim()}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                <Search size={16} />
                {state.isLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Year From</label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="e.g., 2010"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Year To</label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="e.g., 2025"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Study Type</label>
              <select
                value={studyType}
                onChange={(e) => setStudyType(e.target.value)}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
              >
                {STUDY_TYPES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          {state.error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {state.error}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-yellow-400" />
            <h3 className="text-lg font-bold text-white">Medical Databases</h3>
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">
              🔬 Semantic Search Active
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllDbs}
              className="text-xs bg-green-900/50 text-green-300 px-3 py-1 rounded hover:bg-green-900/70"
            >
              {selectedDbs.length === DATABASES.length ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={clearDbs}
              className="text-xs bg-red-900/50 text-red-300 px-3 py-1 rounded hover:bg-red-900/70"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="bg-blue-950 rounded-lg border border-blue-900 overflow-hidden">
          <div className="flex border-b border-blue-900 overflow-x-auto no-scrollbar">
            {DATABASES.map((db) => (
              <button
                key={db}
                onClick={() => setActiveDbTab(db)}
                className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-r border-blue-900 last:border-r-0 ${
                  activeDbTab === db
                    ? "bg-blue-800 text-white"
                    : "bg-blue-950 text-blue-300 hover:bg-blue-900/50"
                }`}
              >
                {db}
              </button>
            ))}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{activeDbTab}</p>
                <p className="text-xs text-blue-400">{DATABASE_URLS[activeDbTab] || `https://${activeDbTab.toLowerCase().replace(/\s/g, "")}.org/`}</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDbs.includes(activeDbTab)}
                  onChange={() => toggleDb(activeDbTab)}
                  className="w-4 h-4 rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm text-blue-200">Include</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {state.isLoading && (
        <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Searching {selectedDbs.length} databases…</p>
              <p className="text-blue-400 text-xs mt-1">Validating DOIs via Crossref…</p>
            </div>
          </div>
        </div>
      )}

      {!state.isLoading && state.papers.length > 0 && (
        <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Search Results — Select papers to proceed</h2>
              <p className="text-sm text-blue-300">
                <span className="text-white font-semibold">{state.papers.length}</span> records across {Object.keys(papersByDatabase).length} databases
                {" • "}<span className="text-white font-semibold">{uniquePapers.length}</span> unique after dedup
                {" • "}<span className="text-white font-semibold">{selectedCount}</span> selected
                {state.citationValidationStatus === "done" && (
                  <span className="ml-2 text-green-300">
                    · {citationCounts.verified} verified · {citationCounts.unverified} unverified · {citationCounts.noDoi} no-DOI
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-400" />
                <input
                  type="text"
                  value={titleFilter}
                  onChange={(e) => setTitleFilter(e.target.value)}
                  placeholder="Filter by title/author…"
                  className="bg-blue-950 border border-blue-800 text-white rounded pl-7 pr-3 py-1.5 text-xs placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <button
                onClick={toggleAll}
                className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-900/70"
              >
                {uniquePapers.every((p) => p.selected) && uniquePapers.length > 0 ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          {perDatabaseResults.length > 0 && (
            <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-2 text-[10px] text-blue-300 mb-4">
              <span className="font-semibold">Database summary:</span>{" "}
              {perDatabaseResults.filter((r) => r.status === "success").length} succeeded,{" "}
              {perDatabaseResults.filter((r) => r.status === "empty").length} returned 0 results,{" "}
              {perDatabaseResults.filter((r) => r.status === "failed").length} failed out of {selectedDbs.length} selected
              {perDatabaseResults.filter((r) => r.error).length > 0 && (
                <span className="text-red-300">
                  {" "}— failed: {perDatabaseResults.filter((r) => r.error).map((r) => `${r.database} (${r.error})`).join(", ")}
                </span>
              )}
            </div>
          )}

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {Object.entries(visibleByDatabase)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([database, dbPapers]) => {
                const dbSelectedCount = dbPapers.filter((p) => p.selected).length;
                const allDbSelected = dbPapers.every((p) => p.selected);
                return (
                  <div key={database} className="bg-blue-950/30 border border-blue-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Database size={14} className="text-yellow-400" />
                        <h3 className="text-sm font-bold text-white">{database}</h3>
                        <span className="text-xs text-blue-400">({dbPapers.length} papers)</span>
                        <span className="text-xs text-green-300">({dbSelectedCount} selected)</span>
                      </div>
                      <button
                        onClick={() => toggleDatabase(database)}
                        className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
                      >
                        {allDbSelected ? "Deselect All" : "Select All in DB"}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {dbPapers.map((paper) => (
                        <div
                          key={paper.id}
                          onClick={() => togglePaper(paper.id)}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            paper.selected
                              ? "bg-yellow-900/20 border-yellow-600/50"
                              : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                          }`}
                        >
                          <div className="mt-0.5">
                            {paper.selected ? (
                              <CheckSquare size={18} className="text-yellow-400" />
                            ) : (
                              <Square size={18} className="text-blue-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-white line-clamp-2">{paper.title}</h4>
                            <p className="text-xs text-blue-300 mt-0.5">{paper.authors} · {paper.year} · {paper.studyType}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {paper.journal && (
                                <span className="text-[10px] bg-blue-900/50 text-blue-200 px-1.5 py-0.5 rounded">{paper.journal}</span>
                              )}
                              {getCitationBadge(paper)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            {visiblePapers.length === 0 && (
              <p className="text-xs text-blue-400 py-6 text-center">No papers match the current filter.</p>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={proceedToStep2}
              disabled={selectedCount === 0 || state.isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              Proceed to Step 2 ({selectedCount} selected)
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
