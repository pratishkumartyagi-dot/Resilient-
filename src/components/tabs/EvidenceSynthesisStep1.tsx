"use client";

import React from "react";
import { Search, Database, ChevronRight } from "lucide-react";
import { type Paper } from "@/lib/database-apis";

export interface EvidenceSynthesisStep1Props {
  databases: string[];
  query: string;
  onQueryChange: (value: string) => void;
  selectedDbs: string[];
  onToggleDb: (db: string) => void;
  onSelectAllDbs: () => void;
  onDeselectAllDbs: () => void;
  papers: Paper[];
  selectedPaperIds: Set<string>;
  onTogglePaper: (id: string) => void;
  onSelectAllPapers: () => void;
  loading: boolean;
  searchError: string | null;
  perDatabaseResults: Array<{ database: string; status: string; count: number; error?: string }>;
  totalIdentified: number;
  dedupedCount: number;
  yearFrom: string;
  onYearFromChange: (value: string) => void;
  yearTo: string;
  onYearToChange: (value: string) => void;
  searchLogic: string;
  onSearchLogicChange: (value: string) => void;
  studyTypeFilter: string;
  onStudyTypeFilterChange: (value: string) => void;
  onSearch: () => void;
  onProceed: () => void;
  onClearFilters: () => void;
  showVerifiedOnly: boolean;
  onShowVerifiedOnlyChange: (value: boolean) => void;
  citationValidationCounts?: { verified: number; unverified: number; noDoi: number };
}

export default function EvidenceSynthesisStep1({
  databases,
  query,
  onQueryChange,
  selectedDbs,
  onToggleDb,
  onSelectAllDbs,
  onDeselectAllDbs,
  papers,
  selectedPaperIds,
  onTogglePaper,
  onSelectAllPapers,
  loading,
  searchError,
  perDatabaseResults,
  totalIdentified,
  dedupedCount,
  yearFrom,
  onYearFromChange,
  yearTo,
  onYearToChange,
  searchLogic,
  onSearchLogicChange,
  studyTypeFilter,
  onStudyTypeFilterChange,
  onSearch,
  onProceed,
  onClearFilters,
  showVerifiedOnly,
  onShowVerifiedOnlyChange,
  citationValidationCounts,
}: EvidenceSynthesisStep1Props) {
  const getFilteredPapers = () => {
    return papers.filter((p) => {
      const y = typeof p.year === "number" ? p.year : parseInt(String(p.year), 10);
      if (isNaN(y)) return false;
      if (yearFrom && y < parseInt(yearFrom, 10)) return false;
      if (yearTo && y > parseInt(yearTo, 10)) return false;
      if (studyTypeFilter !== "All Study Types" && p.studyType !== studyTypeFilter) return false;
      if (showVerifiedOnly && p.citationStatus !== "verified") return false;
      return true;
    });
  };

  const displayPapers = getFilteredPapers();
  const hasActiveFilters = yearFrom || yearTo || studyTypeFilter !== "All Study Types" || showVerifiedOnly;

  return (
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
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="e.g., (latent tuberculosis) AND (healthcare workers) AND (screening)"
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <button
            onClick={onSearch}
            disabled={loading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-blue-300">Boolean:</span>
          <div className="flex rounded-lg overflow-hidden border border-blue-800">
            {["AND", "OR", "NOT"].map((op) => (
              <button
                key={op}
                onClick={() => onSearchLogicChange(op)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  searchLogic === op
                    ? "bg-yellow-500 text-[#0a1a3a]"
                    : "bg-blue-900/50 text-blue-200 hover:bg-blue-900/70"
                }`}
              >
                {op}
              </button>
            ))}
          </div>
          <span className="text-xs text-blue-300 ml-2">Year:</span>
          <input
            type="number"
            value={yearFrom}
            onChange={(e) => onYearFromChange(e.target.value)}
            placeholder="From"
            className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <span className="text-xs text-blue-400">to</span>
          <input
            type="number"
            value={yearTo}
            onChange={(e) => onYearToChange(e.target.value)}
            placeholder="To"
            className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <span className="text-xs text-blue-300 ml-2">Study Type:</span>
          <select
            value={studyTypeFilter}
            onChange={(e) => onStudyTypeFilterChange(e.target.value)}
            className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            <option value="All Study Types">All Study Types</option>
            <option value="Randomized Controlled Trial (RCT)">Randomized Controlled Trial (RCT)</option>
            <option value="Systematic Review">Systematic Review</option>
            <option value="Meta-Analysis">Meta-Analysis</option>
            <option value="Observational Study">Observational Study</option>
            <option value="Cohort Study">Cohort Study</option>
            <option value="Case-Control Study">Case-Control Study</option>
            <option value="Cross-Sectional Study">Cross-Sectional Study</option>
            <option value="Clinical Trial">Clinical Trial</option>
            <option value="Qualitative Study">Qualitative Study</option>
            <option value="Case Report / Case Series">Case Report / Case Series</option>
            <option value="Review Article">Review Article</option>
            <option value="Guideline / Consensus Statement">Guideline / Consensus Statement</option>
            <option value="Dissertation / Thesis">Dissertation / Thesis</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs text-red-300 hover:text-red-200 underline"
            >
              Clear filters
            </button>
          )}
          {citationValidationCounts && (
            <button
              onClick={() => onShowVerifiedOnlyChange(!showVerifiedOnly)}
              className={`text-xs px-3 py-1.5 rounded border ${
                showVerifiedOnly
                  ? "bg-green-900/50 text-green-200 border-green-700"
                  : "bg-blue-900/50 text-blue-200 border-blue-800 hover:bg-blue-900/70"
              }`}
            >
              {showVerifiedOnly ? "Showing verified only" : "Show verified citations only"}
              {!showVerifiedOnly && citationValidationCounts.verified > 0 && (
                <span className="ml-1 text-[10px] text-green-300">({citationValidationCounts.verified})</span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onSelectAllDbs} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70">
            Select All Databases
          </button>
          <button onClick={onDeselectAllDbs} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70">
            Deselect All
          </button>
          <span className="text-xs text-blue-300">{selectedDbs.length} of {databases.length} selected</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {databases.map((db) => (
            <button
              key={db}
              onClick={() => onToggleDb(db)}
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

      {searchError && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-xs">
          {searchError}
        </div>
      )}
      {loading && (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-200 text-sm">Searching {selectedDbs.length} databases...</p>
        </div>
      )}

      {!loading && papers.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-blue-300">
                <span className="text-white font-semibold">{totalIdentified || papers.length}</span> records identified across {selectedDbs.length} databases
                {totalIdentified > papers.length && (<>
                  {" • "}<span className="text-white font-semibold">{papers.length}</span> unique after deduplication
                </>)}
                {" • "}{displayPapers.length} after filters • {selectedPaperIds.size} selected
              </p>
              <span className="text-blue-700">|</span>
              <div className="flex flex-wrap gap-1">
                {selectedDbs.map((db) => {
                  const result = perDatabaseResults.find((r) => r.database === db);
                  if (!result) {
                    return (
                      <span key={db} className="text-[10px] bg-blue-900/60 text-blue-200 border border-blue-800 rounded px-1.5 py-0.5">
                        {db}: pending
                      </span>
                    );
                  }
                  if (result.status === "success") {
                    return (
                      <span key={db} className="text-[10px] bg-green-900/60 text-green-200 border border-green-800 rounded px-1.5 py-0.5">
                        {db}: {result.count}
                      </span>
                    );
                  }
                  if (result.status === "empty") {
                    return (
                      <span key={db} className="text-[10px] bg-yellow-900/60 text-yellow-200 border border-yellow-800 rounded px-1.5 py-0.5">
                        {db}: 0
                      </span>
                    );
                  }
                  return (
                    <span key={db} className="text-[10px] bg-red-900/60 text-red-200 border border-red-800 rounded px-1.5 py-0.5" title={result.error || "Failed"}>
                      {db}: failed
                    </span>
                  );
                })}
              </div>
            </div>
            <button onClick={onSelectAllPapers} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70">
              {selectedPaperIds.size === papers.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          {perDatabaseResults.length > 0 && (
            <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-2 text-[10px] text-blue-300">
              <span className="font-semibold">Database summary:</span>{" "}
              {perDatabaseResults.filter((r) => r.status === "success").length} succeeded,{" "}
              {perDatabaseResults.filter((r) => r.status === "empty").length} returned 0 results,{" "}
              {perDatabaseResults.filter((r) => r.status === "failed").length} failed out of {selectedDbs.length} selected
              {perDatabaseResults.filter((r) => r.error).length > 0 && (
                <span className="text-red-300">
                  {" "}
                  — failed: {perDatabaseResults.filter((r) => r.error).map((r) => `${r.database} (${r.error})`).join(", ")}
                </span>
              )}
            </div>
          )}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {displayPapers.map((p) => (
              <div
                key={p.id}
                onClick={() => onTogglePaper(p.id)}
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
            {displayPapers.length === 0 && (
              <p className="text-xs text-blue-400 py-4 text-center">No papers match the selected year range.</p>
            )}
          </div>
        </div>
      )}

      {papers.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onProceed}
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
          {["OpenAlex", "PubMed", "Google Scholar", "Semantic Scholar", "ScienceDirect", "paper-search-mcp (arXiv, bioRxiv, medRxiv, CORE, Semantic Scholar, OpenAlex, Zenodo, DOAJ, HAL, SSRN)", "ASReview", "prismAId", "CitationChaser", "robvis", "forestplot", "PRISMA 2020"].map((t) => (
            <span key={t} className="text-[10px] bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded-full border border-blue-800">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
