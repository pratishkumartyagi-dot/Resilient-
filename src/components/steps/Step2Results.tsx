"use client";

import React, { useState, useMemo, useCallback } from "react";
import { CheckSquare, Square, Trash2, FileText, Search, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, BookOpen, XCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { deduplicatePapers, getDatabaseGroups, type DedupResult } from "@/lib/dedup-engine";
import { buildPRISMA2020FlowDiagram, type PRISMA2020FlowData } from "@/lib/medical-skills/prisma-utils";

const PRISMA_NODE_COLORS: Record<string, string> = {
  identification: "#1e3a5f",
  duplicates: "#e5e7eb",
  screened: "#3b82f6",
  eligible: "#f59e0b",
  included: "#10b981",
  meta: "#059669",
};

function PRISMA2020Diagram({ data }: { data: PRISMA2020FlowData }) {
  const { nodes, edges } = buildPRISMA2020FlowDiagram(data);
  const nodeHeight = 56;
  const nodeWidth = 220;
  const arrowSize = 8;
  const spacing = 28;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={Math.max(600, nodes.length * (nodeWidth + 40))} height={nodes.length * (nodeHeight + spacing) + 40} className="mx-auto">
        {nodes.map((node, idx) => {
          const x = 20;
          const y = 20 + idx * (nodeHeight + spacing);
          const color = PRISMA_NODE_COLORS[node.type] || "#374151";

          return (
            <g key={node.id}>
              <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx={8} fill={color} stroke="#111827" strokeWidth={1.5} />
              <text x={x + nodeWidth / 2} y={y + nodeHeight / 2 - 4} textAnchor="middle" fill="#ffffff" fontSize={11} fontFamily="sans-serif" fontWeight="600">
                {node.label.split("\n")[0]}
              </text>
              {node.label.split("\n").slice(1).map((line: string, i: number) => (
                <text key={i} x={x + nodeWidth / 2} y={y + nodeHeight / 2 + 10 + i * 13} textAnchor="middle" fill="#e5e7eb" fontSize={10} fontFamily="sans-serif">
                  {line}
                </text>
              ))}
              {idx < nodes.length - 1 && (
                <line x1={x + nodeWidth / 2} y1={y + nodeHeight} x2={x + nodeWidth / 2} y2={y + nodeHeight + spacing - arrowSize} stroke="#6b7280" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Step2Results() {
  const { state, dispatch } = useApp();
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedDbs, setExpandedDbs] = useState<Record<string, boolean>>({});
  const [showPrisma, setShowPrisma] = useState(false);

  const rawPapers = useMemo(() => state.papers.map((p) => ({
    id: p.id,
    title: p.title || "",
    authors: p.authors || "",
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

  const prismaFlowData: PRISMA2020FlowData = useMemo(() => ({
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

  const filteredDbGroups = useMemo(() => {
    const base = state.papers.length > 0 && uniquePapers.length === 0 ? state.papers : uniquePapers;
    if (!searchFilter.trim()) return getDatabaseGroups(base);
    const q = searchFilter.toLowerCase();
    const filtered = base.filter((p) => (p.title || "").toLowerCase().includes(q) || (p.authors || "").toLowerCase().includes(q));
    return getDatabaseGroups(filtered);
  }, [uniquePapers, state.papers, searchFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 2: Results & Deduplication</h2>
            <p className="text-sm text-blue-300">
              Total: {stats.total} | Unique: {stats.unique} | Duplicates removed: {stats.duplicatesRemoved} | Selected: {selectedCount}
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
            <PRISMA2020Diagram data={prismaFlowData} />
          </div>
        )}

        {duplicateGroups.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
            <p className="text-xs text-yellow-200">
              <strong>{duplicateGroups.length}</strong> duplicate groups detected via BibexPy Smart Merge (DOI-determinative + Jaro-Winkler confidence scoring). Click &quot;Remove Duplicates&quot; to keep only unique records, or manually select which papers to keep.
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
            className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70 flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Back to Search
          </button>
          <button
            onClick={proceedToSynthesis}
            disabled={selectedCount === 0}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            Generate Synthesis Table ({selectedCount} selected) <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
