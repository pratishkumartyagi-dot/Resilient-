"use client";

import React, { useState, useMemo, useCallback } from "react";
import { CheckSquare, Square, Trash2, FileText, Search, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, ExternalLink, BookOpen, X, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { deduplicatePapers, getDatabaseGroups, type DedupResult } from "@/lib/dedup-engine";
import { buildPRISMAFlowDiagram, type PRISMAFlowData } from "@/lib/medical-skills/prisma-utils";

export default function Step2Results() {
  const { state, dispatch } = useApp();
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedDbs, setExpandedDbs] = useState<Record<string, boolean>>({});
  const [showPrisma, setShowPrisma] = useState(false);
  const [excludeReasons, setExcludeReasons] = useState<Record<string, string>>({});

  const rawPapers = useMemo(() => state.papers.map((p) => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    year: typeof p.year === "number" ? p.year : parseInt(String(p.year)) || new Date().getFullYear(),
    doi: p.doi || "",
    journal: p.journal || "",
    database: p.database || "Unknown",
    abstract: p.abstract || "",
    url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
    selected: p.selected || false,
  })), [state.papers]);

  const deduped = useMemo<DedupResult>(() => deduplicatePapers(rawPapers), [rawPapers]);

  const { uniquePapers, duplicateGroups, stats } = deduped;

  const selectedCount = uniquePapers.filter((p) => p.selected).length;

  const toggleDbExpand = useCallback((db: string) => {
    setExpandedDbs((prev) => ({ ...prev, [db]: !prev[db] }));
  }, []);

  const toggleAllFromDatabase = useCallback((db: string, select: boolean) => {
    const updated = uniquePapers.map((p) => (p.database === db ? { ...p, selected: select } : p));
    dispatch({ type: "SET_PAPERS", payload: updated });
  }, [uniquePapers, dispatch]);

  const handleTogglePaper = useCallback((paperId: string) => {
    const updated = uniquePapers.map((p) => (p.id === paperId ? { ...p, selected: !p.selected } : p));
    dispatch({ type: "SET_PAPERS", payload: updated });
  }, [uniquePapers, dispatch]);

  const toggleAllUnique = useCallback(() => {
    const allSelected = uniquePapers.every((p) => p.selected);
    const updated = uniquePapers.map((p) => ({ ...p, selected: !allSelected }));
    dispatch({ type: "SET_PAPERS", payload: updated });
  }, [uniquePapers, dispatch]);

  const removeDuplicates = useCallback(() => {
    dispatch({ type: "SET_PAPERS", payload: uniquePapers });
  }, [uniquePapers, dispatch]);

  const proceedToSynthesis = useCallback(() => {
    const selected = uniquePapers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select at least one paper to proceed.");
      return;
    }
    dispatch({ type: "SET_PAPERS", payload: selected });
    dispatch({ type: "SET_STEP", payload: 3 });
  }, [uniquePapers, dispatch]);

  const getCitationBadge = (paper: any) => {
    if (state.citationValidationStatus === "running") {
      return <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Loader2 size={10} className="animate-spin" /> verifying</span>;
    }
    if (!paper.doi) return <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">no DOI</span>;
    const result = state.citationValidationResults[paper.doi.toLowerCase()];
    if (!result) return <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">unchecked</span>;
    if (result.valid) return <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle2 size={10} /> DOI verified</span>;
    return <span className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><XCircle size={10} /> DOI not found</span>;
  };

  const prismaFlowData: PRISMAFlowData = useMemo(() => ({
    identification: {
      recordsFromDatabases: stats.total,
      additionalRecordsFromOtherSources: 0,
      totalRecordsIdentified: stats.total,
    },
    screening: {
      recordsAfterDuplicatesRemoved: stats.unique,
      recordsScreenedByTitleAbstract: stats.unique,
      recordsExcludedByTitleAbstract: 0,
      fullTextArticlesAssessed: stats.unique,
      fullTextArticlesExcludedWithReasons: stats.duplicatesRemoved,
      studiesIncludedInQualitativeSynthesis: stats.unique,
      studiesIncludedInMetaAnalysis: state.srStudyTypeCategory === "meta" ? stats.unique : undefined,
    },
    excludedFullTextReasons: duplicateGroups.map((g) => ({
      reason: `Duplicate entry (${g.length} records in group)`,
      count: 1,
    })),
  }), [stats, duplicateGroups, state.srStudyTypeCategory]);

  const prismaDiagram = useMemo(() => buildPRISMAFlowDiagram(prismaFlowData), [prismaFlowData]);

  const filteredDbGroups = useMemo(() => {
    const base = state.papers.length > 0 && uniquePapers.length === 0 ? state.papers : uniquePapers;
    if (!searchFilter.trim()) return getDatabaseGroups(base);
    const q = searchFilter.toLowerCase();
    const filtered = base.filter((p) => p.title.toLowerCase().includes(q) || p.authors.toLowerCase().includes(q));
    return getDatabaseGroups(filtered);
  }, [uniquePapers, state.papers, searchFilter]);

  const rawDbGroups = useMemo(() => getDatabaseGroups(rawPapers), [rawPapers]);

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 2: Results & Deduplication</h2>
            <p className="text-sm text-blue-300">
              Total: {stats.total} | Unique: {stats.unique} | Duplicates removed: {stats.duplicatesRemoved} | Selected: {selectedCount}
              {state.citationValidationStatus === "done" && (
                <span className="ml-2 text-green-300">
                  · Citations verified: {Object.values(state.citationValidationResults).filter((r: any) => r.valid).length}/{uniquePapers.filter((p) => p.doi).length} DOIs
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrisma((p) => !p)}
              className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70 flex items-center gap-2"
            >
              <FileText size={14} />
              {showPrisma ? "Hide PRISMA" : "Show PRISMA 2020"}
            </button>
            <button
              onClick={toggleAllUnique}
              className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70"
            >
              {uniquePapers.length > 0 && uniquePapers.every((p) => p.selected) ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={removeDuplicates}
              disabled={duplicateGroups.length === 0}
              className="text-sm bg-red-900/50 text-red-300 px-4 py-2 rounded hover:bg-red-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <Trash2 size={14} /> Remove Duplicates
            </button>
          </div>
        </div>

        {showPrisma && (
          <div className="bg-[#0a1428] border border-blue-900/60 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText size={14} className="text-yellow-400" />
                PRISMA 2020 Flow Diagram
              </h3>
              <button onClick={() => setShowPrisma(false)} className="text-blue-300 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-950 border border-blue-900 rounded-lg p-3">
                  <div className="text-[10px] text-blue-400 uppercase tracking-wide mb-1">Identification through databases</div>
                  <div className="text-xl font-bold text-white">{stats.total}</div>
                  <div className="text-[10px] text-blue-300">records retrieved</div>
                </div>
                <div className="bg-blue-950 border border-blue-900 rounded-lg p-3">
                  <div className="text-[10px] text-blue-400 uppercase tracking-wide mb-1">Identification through other sources</div>
                  <div className="text-xl font-bold text-white">0</div>
                  <div className="text-[10px] text-blue-300">additional records</div>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="bg-indigo-950 border border-indigo-700 rounded-full px-6 py-2">
                  <div className="text-sm font-bold text-white">Total records identified: {stats.total}</div>
                </div>
              </div>

              <div className="flex justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-blue-600 mx-auto">
                  <path d="M12 4v16m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="bg-red-950 border border-red-700 rounded-full px-6 py-2 mx-auto">
                <div className="text-sm font-bold text-red-200">Records after duplicates removed: {stats.unique}</div>
              </div>

              <div className="flex justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-blue-600 mx-auto">
                  <path d="M12 4v16m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="bg-blue-950 border border-blue-900 rounded-lg p-3">
                <div className="text-xs text-blue-300">Records screened by title/abstract: <span className="font-bold text-white">{stats.unique}</span></div>
                <div className="text-xs text-blue-300">Records excluded: <span className="font-bold text-white">0</span></div>
              </div>

              <div className="flex justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-blue-600 mx-auto">
                  <path d="M12 4v16m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="bg-yellow-950 border border-yellow-700 rounded-lg p-3">
                <div className="text-xs text-yellow-300">Full-text articles assessed: <span className="font-bold text-white">{stats.unique}</span></div>
                <div className="text-xs text-yellow-300">Full-text excluded: <span className="font-bold text-white">{stats.duplicatesRemoved}</span></div>
              </div>

              <div className="flex justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-green-600 mx-auto">
                  <path d="M12 4v16m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="bg-green-950 border border-green-700 rounded-full px-6 py-2 mx-auto">
                <div className="text-sm font-bold text-green-200">Studies included in qualitative synthesis: {uniquePapers.length}</div>
              </div>

              {state.srStudyTypeCategory === "meta" && (
                <div className="bg-emerald-950 border border-emerald-700 rounded-full px-6 py-2 mx-auto">
                  <div className="text-sm font-bold text-emerald-200">Studies included in meta-analysis: {uniquePapers.length}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {duplicateGroups.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
            <p className="text-xs text-yellow-200">
              <strong>{duplicateGroups.length}</strong> duplicate groups detected. Click &quot;Remove Duplicates&quot; to keep only unique records, or manually select which papers to keep.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter papers by title or author..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        </div>

        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {Object.entries(filteredDbGroups).map(([db, papers]) => {
            const allSelected = papers.length > 0 && papers.every((p) => p.selected);
            const someSelected = papers.some((p) => p.selected);
            const isExpanded = expandedDbs[db] !== false;

            return (
              <div key={db} className="bg-blue-950/30 border border-blue-900/50 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleDbExpand(db)}
                      className="text-blue-300 hover:text-white"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <span className="text-sm font-semibold text-white">{db}</span>
                    <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">{papers.length}</span>
                    {someSelected && <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded-full">{papers.filter((p) => p.selected).length} selected</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAllFromDatabase(db, !allSelected)}
                      className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="divide-y divide-blue-900/30">
                    {papers.map((paper) => (
                      <div
                        key={paper.id}
                        className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                          paper.selected ? "bg-yellow-900/10" : "bg-blue-950/20 hover:bg-blue-900/20"
                        }`}
                        onClick={() => handleTogglePaper(paper.id)}
                      >
                        <div className="mt-1 flex-shrink-0">
                          {paper.selected ? (
                            <CheckSquare size={18} className="text-yellow-400" />
                          ) : (
                            <Square size={18} className="text-blue-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-white truncate">{paper.title}</h4>
                          <p className="text-xs text-blue-300 mt-0.5">{paper.authors}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded">{paper.journal}</span>
                            <span className="text-xs text-blue-400">{paper.year}</span>
                            {paper.doi && <span className="text-xs text-blue-400 font-mono">{paper.doi}</span>}
                            {paper.abstract && paper.abstract !== "No abstract available." && (
                              <span className="text-xs bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded flex items-center gap-0.5">
                                <BookOpen size={10} /> Abstract
                              </span>
                            )}
                            {paper.url && (
                              <a
                                href={paper.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                              >
                                <ExternalLink size={10} /> Link
                              </a>
                            )}
                            {getCitationBadge(paper)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => dispatch({ type: "SET_STEP", payload: 1 })}
            className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70"
          >
            Back to Search
          </button>
          <button
            onClick={proceedToSynthesis}
            disabled={selectedCount === 0}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            Generate Synthesis Table ({selectedCount} selected)
          </button>
        </div>
      </div>
    </div>
  );
}
