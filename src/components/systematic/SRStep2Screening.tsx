"use client";

import React, { useState, useMemo } from "react";
import { Search, CheckSquare, Square, Trash2, ChevronRight, Copy } from "lucide-react";
import { useApp } from "@/context/AppContext";

function deduplicatePapers(papers: any[]): any[] {
  const seen = new Map<string, any>();
  for (const paper of papers) {
    const key = paper.doi || paper.title.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, paper);
    } else {
      const existing = seen.get(key);
      existing.database = [existing.database, paper.database].flat().filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(", ");
      existing.sourceDbs = [...(existing.sourceDbs || [existing.database]), paper.database].filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
    }
  }
  return Array.from(seen.values());
}

export default function SRStep2Screening() {
  const { state, dispatch } = useApp();
  const [searchFilter, setSearchFilter] = useState("");
  const [dbFilter, setDbFilter] = useState<string>("all");
  const [onlyWithAbstract, setOnlyWithAbstract] = useState(false);

  const deduped = useMemo(() => deduplicatePapers(state.dedupPapers || state.papers), [state.dedupPapers, state.papers]);
  dispatch({ type: "SET_DEDUP_PAPERS", payload: deduped });

  const filtered = useMemo(() => {
    let result = deduped;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.authors.toLowerCase().includes(q) ||
          (p.abstract && p.abstract.toLowerCase().includes(q))
      );
    }
    if (dbFilter !== "all") {
      result = result.filter((p) => (p.database || "").includes(dbFilter));
    }
    if (onlyWithAbstract) {
      result = result.filter((p) => p.hasAbstract && p.abstract && p.abstract.length > 40);
    }
    return result;
  }, [deduped, searchFilter, dbFilter, onlyWithAbstract]);

  const databasesInResults = useMemo(() => {
    const dbs = new Set<string>();
    deduped.forEach((p) => {
      (p.database || "").split(", ").forEach((d: string) => dbs.add(d));
    });
    return Array.from(dbs);
  }, [deduped]);

  const selectedCount = state.selectedPapers.length;
  const totalUnique = deduped.length;
  const removedCount = state.papers.length - totalUnique;

  const togglePaper = (paper: any) => {
    const exists = state.selectedPapers.find((p: any) => p.doi === paper.doi || p.id === paper.id);
    if (exists) {
      dispatch({ type: "SET_SELECTED_PAPERS", payload: state.selectedPapers.filter((p: any) => p.doi !== paper.doi && p.id !== paper.id) });
    } else {
      dispatch({ type: "SET_SELECTED_PAPERS", payload: [...state.selectedPapers, paper] });
    }
  };

  const selectAllFiltered = () => {
    const allSelected = filtered.every((p) => state.selectedPapers.some((sp: any) => sp.doi === p.doi || sp.id === p.id));
    if (allSelected) {
      const idsToKeep = new Set(filtered.map((p) => p.doi || p.id));
      dispatch({ type: "SET_SELECTED_PAPERS", payload: state.selectedPapers.filter((p: any) => !idsToKeep.has(p.doi || p.id)) });
    } else {
      const existingDois = new Set(state.selectedPapers.map((p: any) => p.doi || p.id));
      const toAdd = filtered.filter((p) => !existingDois.has(p.doi || p.id));
      dispatch({ type: "SET_SELECTED_PAPERS", payload: [...state.selectedPapers, ...toAdd] });
    }
  };

  const goToStep3 = () => {
    if (selectedCount === 0) {
      alert("Please select at least one paper to proceed to synthesis.");
      return;
    }
    dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 3 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 2: Screening & Deduplication</h2>
            <p className="text-sm text-blue-300">
              Total retrieved: {state.papers.length} | Unique after dedup: {totalUnique} | Duplicates removed: {removedCount} | Selected: {selectedCount}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllFiltered}
              className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70"
            >
              {filtered.every((p) => state.selectedPapers.some((sp: any) => sp.doi === p.doi || sp.id === p.id)) ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={goToStep3}
              disabled={selectedCount === 0}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              Generate Synthesis Table ({selectedCount}) <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by title, author, or abstract content..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm"
            />
          </div>
          <select
            value={dbFilter}
            onChange={(e) => setDbFilter(e.target.value)}
            className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Databases</option>
            {databasesInResults.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer bg-blue-950 border border-blue-800 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={onlyWithAbstract}
              onChange={(e) => setOnlyWithAbstract(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs text-blue-200 whitespace-nowrap">Abstract only</span>
          </label>
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.map((paper) => {
            const isSelected = state.selectedPapers.some((p: any) => p.doi === paper.doi || p.id === paper.id);
            return (
              <div
                key={paper.doi || paper.id}
                onClick={() => togglePaper(paper)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-yellow-900/20 border-yellow-600/50"
                    : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isSelected ? (
                    <CheckSquare size={18} className="text-yellow-400" />
                  ) : (
                    <Square size={18} className="text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{paper.title}</h4>
                  <p className="text-xs text-blue-300 mt-0.5">{paper.authors} • {paper.year}</p>
                  {paper.abstract && (
                    <p className="text-xs text-blue-400 mt-1.5 line-clamp-2 leading-relaxed">{paper.abstract.substring(0, 200)}...</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded">{paper.database}</span>
                    <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded">{paper.studyType}</span>
                    {paper.doi && (
                      <span className="text-xs text-teal-400 flex items-center gap-0.5">
                        <Copy size={10} /> DOI: {paper.doi}
                      </span>
                    )}
                    {!paper.hasAbstract && (
                      <span className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded">No abstract</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && state.papers.length > 0 && (
          <div className="text-center py-12 text-blue-400">
            <Search size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No papers match your current filters.</p>
          </div>
        )}

        {state.papers.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Search size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No papers searched yet. Go to Step 1 to search databases.</p>
          </div>
        )}
      </div>
    </div>
  );
}
