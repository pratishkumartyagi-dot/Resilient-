"use client";

import React, { useState, useEffect } from "react";
import { CheckSquare, Square, Trash2, FileText, Search, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function Step2Results() {
  const { state, dispatch } = useApp();
  const [searchFilter, setSearchFilter] = useState("");
  const [validating, setValidating] = useState(false);

  const papers = state.papers.filter((p) =>
    p.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.authors.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const selectedCount = state.papers.filter((p) => p.selected).length;
  
  const deduplicatePapers = (papers: typeof state.papers) => {
    const seen = new Map<string, typeof state.papers[0]>();
    papers.forEach((p) => {
      const doiKey = p.doi?.toLowerCase().trim();
      const titleKey = p.title.toLowerCase().trim().slice(0, 80);
      const key = doiKey || titleKey;
      
      if (!key) {
        seen.set(`${p.id}-${p.database}`, p);
        return;
      }
      
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        if (!existing.doi && p.doi) existing.doi = p.doi;
        if (!existing.abstract && p.abstract) existing.abstract = p.abstract;
        if (!existing.url && p.url) existing.url = p.url;
      } else {
        seen.set(key, { ...p });
      }
    });
    return Array.from(seen.values());
  };
  
  const uniquePapers = deduplicatePapers(papers);
  
  const papersByDatabase = uniquePapers.reduce((acc, paper) => {
    const db = paper.database || "Unknown";
    if (!acc[db]) acc[db] = [];
    acc[db].push(paper);
    return acc;
  }, {} as Record<string, typeof uniquePapers>);

  useEffect(() => {
    const validateCitations = async () => {
      if (state.papers.length === 0 || state.citationValidationStatus === "done") return;

      setValidating(true);
      dispatch({ type: "SET_CITATION_STATUS", payload: "running" });

      try {
        const papersToValidate = uniquePapers.slice(0, 100).map((p) => ({
          doi: p.doi || "",
          title: p.title,
          authors: p.authors || "",
          year: p.year,
          journal: p.journal,
        }));

        const res = await fetch("/api/doi-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ papers: papersToValidate }),
        });

        if (!res.ok) throw new Error(`Verification failed: ${res.status}`);

        const data = await res.json();
        const results: Record<string, { valid: boolean; title?: string; message: string; source?: string }> = {};

        if (data.results) {
          data.results.forEach((r: any, idx: number) => {
            const paper = uniquePapers[idx];
            if (paper) {
              const key = paper.doi?.toLowerCase() || paper.title.toLowerCase();
              results[key] = {
                valid: r.valid,
                title: r.verified_title,
                message: r.message,
                source: r.source,
              };
            }
          });
        }

        dispatch({ type: "SET_CITATION_RESULTS", payload: results });
        dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
      } catch (err: any) {
        console.warn("[Step2Results] DOI verification failed:", err?.message);
        dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
      } finally {
        setValidating(false);
      }
    };

    validateCitations();
  }, [state.papers, state.citationValidationStatus, dispatch, uniquePapers]);

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

  const handleSelectUnique = (paper: any) => {
    dispatch({ type: "TOGGLE_PAPER", payload: paper.id });
  };

  const proceedToSynthesis = () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select at least one paper to proceed.");
      return;
    }
    dispatch({ type: "SET_STEP", payload: 3 });
  };

  const getCitationBadge = (paper: any) => {
    if (state.citationValidationStatus === "running") {
      return <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Loader2 size={10} className="animate-spin" /> verifying</span>;
    }
    const key = paper.doi?.toLowerCase() || paper.title.toLowerCase();
    const result = state.citationValidationResults[key];
    if (!result) return <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">unchecked</span>;
    if (result.valid) return <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle2 size={10} /> Verified via {result.source || "DOI"}</span>;
    return <span className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><AlertCircle size={10} /> Not verified</span>;
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 2: Results & Deduplication</h2>
            <p className="text-sm text-blue-300">
              Total: {state.papers.length} papers | Unique: {uniquePapers.length} | Selected: {selectedCount}
              {state.citationValidationStatus === "running" && " | Verifying citations..."}
              {state.citationValidationStatus === "done" && (
                <span className="ml-2 text-green-300">
                  · Citations checked: {Object.values(state.citationValidationResults).filter((r: any) => r.valid).length}/{uniquePapers.length} verified
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dispatch({ type: "TOGGLE_PRISMA", payload: !state.showPrisma })}
              className="text-xs bg-purple-900/50 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-900/70 flex items-center gap-1"
            >
              <FileText size={14} />
              {state.showPrisma ? "Hide" : "Show"} PRISMA 2020
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
              placeholder="Filter papers by title or author..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <button
            onClick={toggleAll}
            className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70"
          >
            {uniquePapers.every((p) => p.selected) ? "Deselect All" : "Select All"}
          </button>
        </div>

        {state.showPrisma && (
          <div className="bg-white rounded-lg p-4 mb-4">
            <h3 className="font-bold text-gray-800 text-center mb-2">PRISMA 2020 Flow Diagram</h3>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
              <div className="border-2 border-gray-800 rounded p-2 text-center">
                <div className="font-bold">Identification</div>
                <div>Records identified from: {state.selectedDatabases.length} databases</div>
                <div className="font-bold mt-1">n = {state.papers.length}</div>
              </div>
              <div className="text-xl">→</div>
              <div className="border-2 border-gray-800 rounded p-2 text-center">
                <div className="font-bold">Screening</div>
                <div>Duplicates removed</div>
                <div className="font-bold mt-1">n = {uniquePapers.length}</div>
              </div>
              <div className="text-xl">→</div>
              <div className="border-2 border-gray-800 rounded p-2 text-center">
                <div className="font-bold">Included</div>
                <div>Studies included in synthesis</div>
                <div className="font-bold mt-1">n = {selectedCount}</div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {Object.entries(papersByDatabase).map(([database, dbPapers]) => {
            const dbSelectedCount = dbPapers.filter((p) => p.selected).length;
            const allDbSelected = dbPapers.every((p) => p.selected);
            
            return (
              <div key={database} className="bg-blue-950/30 border border-blue-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{database}</h3>
                    <span className="text-xs text-blue-400">({dbPapers.length} papers)</span>
                    <span className="text-xs text-green-300">({dbSelectedCount} selected)</span>
                  </div>
                  <button
                    onClick={() => toggleDatabase(database)}
                    className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
                  >
                    {allDbSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-2">
                  {dbPapers.map((paper) => (
                    <div
                      key={paper.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        paper.selected
                          ? "bg-yellow-900/20 border-yellow-600/50"
                          : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                      }`}
                      onClick={() => handleSelectUnique(paper)}
                    >
                      <div className="mt-1">
                        {paper.selected ? (
                          <CheckSquare size={20} className="text-yellow-400" />
                        ) : (
                          <Square size={20} className="text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{paper.title}</h4>
                        <p className="text-xs text-blue-300">{paper.authors}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded">
                            {paper.journal}
                          </span>
                          <span className="text-xs text-blue-400">{paper.year}</span>
                          <span className="text-xs bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded">
                            {paper.studyType}
                          </span>
                          {getCitationBadge(paper)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
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
