"use client";

import React, { useState } from "react";
import { Search, Database, Filter, X } from "lucide-react";
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
  "paper-search-mcp",
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
  "paper-search-mcp": "https://github.com/openags/paper-search-mcp",
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
            dispatch({ type: "SET_ERROR", payload: `Live database search failed: ${msg}. Showing ${webPapers.length} results from web search fallback.` });
          } else {
            throw new Error("Web search returned 0 results");
          }
        } catch (webErr: any) {
          const webMsg = webErr?.message || String(webErr);
          console.warn("[Step1Search] Web search fallback failed:", webMsg);
          const mock = generateMockLegacy(localQuery, selectedDbs);
          papers = mock;
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
        } catch {
          dispatch({ type: "SET_CITATION_RESULTS", payload: {} });
          dispatch({ type: "SET_PAPERS", payload: papers });
        } finally {
          dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
        }
      } else {
        dispatch({ type: "SET_ERROR", payload: "No papers found. Try broader terms or more databases." });
      }
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Search failed. Please try again." });
      dispatch({ type: "SET_PAPERS", payload: generateMockLegacy(localQuery, selectedDbs) });
    } finally {
      dispatch({ type: "SET_STEP", payload: 2 });
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const generateMockPapers = (query: string, dbs: string[]) => {
    const papers: any[] = [];
    const count = dbs.length > 0 ? dbs.length * 15 : 20;
    for (let i = 0; i < count; i++) {
      const db = dbs[i % dbs.length] || DATABASES[0];
      papers.push({
        id: `paper-${Date.now()}-${i}`,
        title: `${query}: A comprehensive ${["review", "study", "analysis", "investigation"][i % 4]} - Part ${i + 1}`,
        authors: `Author A, Author B, Author C et al.`,
        journal: `Journal of ${query} Research`,
        year: 2018 + (i % 8),
        doi: `10.1000/${query.replace(/\s/g, "")}${i}`,
        abstract: `This study examines ${query} using mixed methods across multiple settings. Key findings indicate significant associations between ${query} and various outcomes. Limitations include sample size constraints and geographical bias.`,
        database: db,
        studyType: STUDY_TYPES[1 + (i % (STUDY_TYPES.length - 1))],
        selected: false,
      });
    }
    return papers;
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 1: Broad Area of Research</h2>
        <p className="text-sm text-blue-300 mb-6">
          Enter your research topic with boolean logic, filters, and select databases for semantic search.
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
    </div>
  );
}
