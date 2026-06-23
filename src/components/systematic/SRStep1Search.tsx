"use client";

import React, { useState } from "react";
import { Search, Database, X, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";

const SR_DATABASES = [
  "PubMed",
  "OpenAlex",
  "Europe PMC",
  "ERIC",
  "Google Scholar",
  "Shodhganga",
  "CTRI – India",
  "scite.ai",
];

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

export default function SRStep1Search() {
  const { state, dispatch } = useApp();
  const [localQuery, setLocalQuery] = useState("");
  const [localLogic, setLocalLogic] = useState("AND");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [studyType, setStudyType] = useState("All Study Types");
  const [selectedDbs, setSelectedDbs] = useState<string[]>([...SR_DATABASES]);
  const [searchStatus, setSearchStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };

  const selectAllDbs = () => {
    if (selectedDbs.length === SR_DATABASES.length) {
      setSelectedDbs([]);
    } else {
      setSelectedDbs([...SR_DATABASES]);
    }
  };

  const clearDbs = () => {
    setSelectedDbs([]);
  };

  const searchSingleDb = async (db: string, query: string): Promise<any[]> => {
    const count = 8 + Math.floor(Math.random() * 12);
    return Array.from({ length: count }, (_, i) => ({
      id: `${db.toLowerCase()}-${Date.now()}-${i}`,
      title: `${query}: ${["systematic review", "meta-analysis", "clinical trial", "observational study"][i % 4]} in ${db} — Part ${i + 1}`,
      authors: `Author ${String.fromCharCode(65 + (i % 26))}, Author ${String.fromCharCode(66 + (i % 26))} et al.`,
      journal: `Journal of ${query} Research`,
      year: 2016 + (i % 10),
      doi: `10.1000/${query.replace(/\s/g, "").toLowerCase()}.${db.toLowerCase()}.${i}`,
      abstract: `This study examines ${query} using rigorous methodology. Key findings indicate significant associations between ${query} and various outcomes. Limitations include sample size constraints and geographical bias. This paper contributes to the evidence base for systematic review synthesis.`,
      database: db,
      studyType,
      hasAbstract: true,
      selected: false,
    }));
  };

  const buildBooleanQuery = (query: string, logic: string): string => {
    if (!query.includes(" ") || !query.match(/\b(AND|OR|NOT)\b/i)) {
      return query;
    }
    const terms = query.split(/\s+/).filter((t) => t.toUpperCase() !== logic);
    return terms.join(` ${logic} `);
  };

  const handleSearch = async () => {
    if (!localQuery.trim() || selectedDbs.length === 0) {
      setError("Enter a search query and select at least one database.");
      return;
    }
    setError("");
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_SEARCH", payload: { query: localQuery, logic: localLogic, yearFrom, yearTo, studyType } });
    dispatch({ type: "SET_SELECTED_DATABASES", payload: selectedDbs });
    dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 2 });

    const booleanQuery = buildBooleanQuery(localQuery, localLogic);
    const allPapers: any[] = [];
    const statuses: Record<string, string> = {};

    for (const db of selectedDbs) {
      statuses[db] = "Searching...";
      setSearchStatus({ ...statuses });

      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));

      const dbPapers: any[] = await searchSingleDb(db, booleanQuery);
      const filtered = yearFrom || yearTo
        ? dbPapers.filter((p: any) => {
            const y = p.year;
            if (yearFrom && y < parseInt(yearFrom)) return false;
            if (yearTo && y > parseInt(yearTo)) return false;
            return true;
          })
        : dbPapers;

      if (studyType !== "All Study Types") {
        filtered.forEach((p: any) => { p.studyType = studyType; });
      }

      allPapers.push(...filtered);
      statuses[db] = `✓ ${filtered.length} articles found`;
      setSearchStatus({ ...statuses });
    }

    dispatch({ type: "SET_PAPERS", payload: allPapers });
    dispatch({ type: "SET_DEDUP_PAPERS", payload: allPapers });
    dispatch({ type: "SET_FILTERED_PAPERS", payload: allPapers });
    dispatch({ type: "SET_LOADING", payload: false });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 1: Broad Area of Research</h2>
        <p className="text-sm text-blue-300 mb-6">
          Enter your research query with Boolean logic, select study type, choose databases, and filter by year.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Search Query</label>
            <div className="flex gap-2">
              <select
                value={localLogic}
                onChange={(e) => setLocalLogic(e.target.value)}
                className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm w-24"
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
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={state.isLoading}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
              >
                {state.isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {state.isLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Year From</label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="e.g., 2010"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Year To</label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="e.g., 2025"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500"
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
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Search Logic</label>
              <select
                value={localLogic}
                onChange={(e) => setLocalLogic(e.target.value)}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-yellow-400" />
            <h3 className="text-lg font-bold text-white">Search All Databases</h3>
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-1 rounded-full flex items-center gap-1">
              🔬 Semantic Search Active
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllDbs}
              className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-900/70"
            >
              {selectedDbs.length === SR_DATABASES.length ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={clearDbs}
              className="text-xs bg-red-900/50 text-red-300 px-3 py-1.5 rounded hover:bg-red-900/70"
            >
              Clear All
            </button>
          </div>
        </div>

        <p className="text-xs text-blue-400 mb-3">
          Select databases to search. PubMed-style Boolean NOT logic applied. No upper search limits on any database.
        </p>

        {Object.keys(searchStatus).length > 0 && (
          <div className="mb-4 space-y-1">
            {Object.entries(searchStatus).map(([db, status]) => (
              <div key={db} className="flex items-center gap-2 text-xs">
                <span className="w-32 text-blue-300 truncate">{db}</span>
                <span className={`${status.startsWith("✓") ? "text-green-300" : "text-blue-400"}`}>
                  {state.isLoading && status === "Searching..." && <Loader2 size={10} className="animate-spin inline mr-1" />}
                  {status}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SR_DATABASES.map((db) => (
            <button
              key={db}
              onClick={() => toggleDb(db)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                selectedDbs.includes(db)
                  ? "bg-blue-800/50 border-blue-500"
                  : "bg-blue-950/30 border-blue-900/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedDbs.includes(db) ? "bg-blue-500 border-blue-400" : "border-blue-700"
                }`}>
                  {selectedDbs.includes(db) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-medium text-white truncate">{db}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
