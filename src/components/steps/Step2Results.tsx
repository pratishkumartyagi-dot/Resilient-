"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Square,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
} from "lucide-react";
import { useApp, type Paper } from "@/context/AppContext";
import {
  deduplicatePapers as deduplicateEndNote,
  hasAbstract,
  type DedupResult,
} from "@/lib/dedup-endnote";
import Prisma2020Diagram, {
  EMPTY_PRISMA_COUNTS,
  type Prisma2020Counts,
} from "@/components/Prisma2020Diagram";

type ValidationStatus =
  | "valid"
  | "mismatch"
  | "unresolved"
  | "no-doi"
  | "not-found"
  | "unchecked";

interface ValidationInfo {
  status: ValidationStatus;
  message: string;
  source?: string;
  similarity?: number;
}

export default function Step2Results() {
  const { state, dispatch } = useApp();
  const [searchFilter, setSearchFilter] = useState("");
  const [onlyWithAbstract, setOnlyWithAbstract] = useState(true);
  const [validations, setValidations] = useState<Record<string, ValidationInfo>>({});
  const [isValidating, setIsValidating] = useState(false);
  const validationStartedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Deduplication (DedupEndNote-style) and abstract/full-paper filtering
  // -------------------------------------------------------------------------

  const dedup: DedupResult = useMemo(
    () => deduplicateEndNote(state.papers),
    [state.papers]
  );

  const abstractFiltered = useMemo(
    () =>
      onlyWithAbstract
        ? dedup.unique.filter((p) => hasAbstract(p))
        : dedup.unique,
    [dedup.unique, onlyWithAbstract]
  );

  const filteredPapers = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return abstractFiltered;
    return abstractFiltered.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.authors || "").toLowerCase().includes(q)
    );
  }, [abstractFiltered, searchFilter]);

  // Group the unique papers by the database they are displayed under. A paper
  // found in several databases is shown once, under its primary database, with
  // the other sources listed.
  const papersByDatabase = useMemo(() => {
    const acc: Record<string, Paper[]> = {};
    for (const paper of filteredPapers) {
      const db = (paper.database as string) || "Unknown";
      if (!acc[db]) acc[db] = [];
      acc[db].push(paper as Paper);
    }
    return acc;
  }, [filteredPapers]);

  // Papers that could not be screened because they have no abstract.
  const excludedNoAbstract = useMemo(
    () => dedup.unique.filter((p) => !hasAbstract(p)).length,
    [dedup.unique]
  );

  const selectedCount = state.papers.filter((p) => p.selected).length;

  // -------------------------------------------------------------------------
  // Citation validation
  // -------------------------------------------------------------------------

  const validateCitations = useCallback(async () => {
    if (dedup.unique.length === 0) return;
    if (state.citationValidationStatus === "running") return;
    if (validationStartedRef.current) return;
    validationStartedRef.current = true;

    dispatch({ type: "SET_CITATION_STATUS", payload: "running" });
    setIsValidating(true);

    try {
      const res = await fetch("/api/citation-validator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: dedup.unique.slice(0, 100).map((p) => ({
            id: p.id as string,
            doi: (p.doi as string) || "",
            title: p.title as string,
            authors: (p.authors as string) || "",
            year: p.year as number,
            journal: p.journal as string,
          })),
        }),
      });

      if (!res.ok) throw new Error(`Verification failed: ${res.status}`);

      const data = await res.json();
      const map: Record<string, ValidationInfo> = {};
      (data.results || []).forEach((r: any) => {
        const key = (r.doi || r.title || "").toLowerCase();
        if (!key) return;
        map[key] = {
          status: r.status as ValidationStatus,
          message: r.message,
          source: r.source,
          similarity: r.similarity,
        };
      });
      setValidations(map);
      dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
    } catch (err: any) {
      console.warn("[Step2Results] Citation validation failed:", err?.message);
      dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
    } finally {
      setIsValidating(false);
    }
  }, [dedup.unique, state.citationValidationStatus, dispatch]);

  useEffect(() => {
    validateCitations();
  }, [validateCitations]);

  // Record the duplicate count so the PRISMA diagram and other steps can use it.
  useEffect(() => {
    if (state.duplicatesRemoved !== dedup.duplicatesRemoved) {
      dispatch({
        type: "SET_DUPLICATES_REMOVED",
        payload: dedup.duplicatesRemoved,
      });
    }
  }, [dedup.duplicatesRemoved, state.duplicatesRemoved, dispatch]);

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  const toggleAll = () => {
    const allSelected =
      filteredPapers.length > 0 && filteredPapers.every((p) => p.selected);
    const ids: string[] = [];
    for (const p of filteredPapers) {
      for (const id of (p.memberIds as string[]) || [p.id]) {
        ids.push(id);
      }
    }
    dispatch({ type: "SET_PAPER_SELECTION", payload: { ids, selected: !allSelected } });
  };

  const toggleDatabase = (database: string) => {
    const dbPapers = papersByDatabase[database] || [];
    if (dbPapers.length === 0) return;
    const allSelected = dbPapers.every((p) => p.selected);
    const ids: string[] = [];
    for (const p of dbPapers) {
      for (const id of (p.memberIds as string[]) || [p.id]) {
        ids.push(id);
      }
    }
    dispatch({ type: "SET_PAPER_SELECTION", payload: { ids, selected: !allSelected } });
  };

  const handleSelectUnique = (paper: Paper) => {
    // A unique paper may collapse several raw records across databases — all of
    // them are toggled so the selection stays consistent.
    const memberIds = (paper.memberIds as string[]) || [paper.id];
    dispatch({
      type: "SET_PAPER_SELECTION",
      payload: { ids: memberIds, selected: !paper.selected },
    });
  };

  const proceedToSynthesis = () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      dispatch({
        type: "SET_ERROR",
        payload: "Please select at least one paper to proceed.",
      });
      return;
    }
    dispatch({ type: "SET_ERROR", payload: "" });

    // Commit the deduplicated set so downstream steps do not count the same
    // article once per source database.
    const uniqueSelected = dedup.unique.filter((p) => p.selected);
    if (uniqueSelected.length > 0) {
      dispatch({ type: "SET_PAPERS", payload: uniqueSelected as unknown as Paper[] });
    }

    dispatch({ type: "SET_STEP", payload: 3 });
  };

  // -------------------------------------------------------------------------
  // PRISMA 2020 counts
  // -------------------------------------------------------------------------

  const prismaCounts: Prisma2020Counts = useMemo(() => {
    if (dedup.totalRecords === 0) return EMPTY_PRISMA_COUNTS;

    // "Records identified" is the number of records the databases returned for
    // the search strategy, before any screening.
    const identified = state.rawRecordCount || dedup.totalRecords;
    // Records removed by the automated relevance filter (medspacy concepts +
    // keyword presence) — counted as automation removals in PRISMA.
    const automationRemoved = Math.max(
      0,
      identified - (state.relevanceFilteredCount || dedup.totalRecords)
    );
    const duplicatesRemoved = dedup.duplicatesRemoved;
    // Records that survive deduplication and go forward to screening.
    const screened = dedup.unique.length;
    // Records excluded at screening because they have no abstract/full text.
    const excludedNoAbstractCount = excludedNoAbstract;
    const assessedForEligibility = abstractFiltered.length;
    const included = dedup.unique.filter((p) => p.selected).length;

    return {
      identified,
      duplicatesRemoved,
      automationRemoved,
      otherRemoved: 0,
      screened,
      screenedExcluded: excludedNoAbstractCount,
      soughtForRetrieval: screened,
      notRetrieved: 0,
      assessedForEligibility,
      eligibilityExcluded: {
        "No abstract or full text available": excludedNoAbstractCount,
      },
      included,
      perDatabase: state.rawRecordsPerDatabase || {},
    };
  }, [
    dedup.totalRecords,
    dedup.duplicatesRemoved,
    dedup.unique,
    excludedNoAbstract,
    abstractFiltered.length,
    state.rawRecordCount,
    state.relevanceFilteredCount,
    state.rawRecordsPerDatabase,
  ]);

  const getCitationBadge = (paper: Paper) => {
    if (isValidating) {
      return (
        <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <Loader2 size={10} className="animate-spin" /> verifying
        </span>
      );
    }
    const key = (paper.doi || paper.title || "").toLowerCase();
    const info = validations[key];
    if (!info) {
      return (
        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
          unchecked
        </span>
      );
    }
    if (info.status === "valid") {
      return (
        <span
          className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"
          title={info.message}
        >
          <CheckCircle2 size={10} /> DOI verified
        </span>
      );
    }
    if (info.status === "mismatch") {
      return (
        <span
          className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"
          title={info.message}
        >
          <AlertCircle size={10} /> DOI mismatch
        </span>
      );
    }
    if (info.status === "unresolved") {
      return (
        <span
          className="text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"
          title={info.message}
        >
          <AlertCircle size={10} /> DOI unresolved
        </span>
      );
    }
    return (
      <span
        className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded"
        title={info.message}
      >
        no DOI
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-white">
              Step 2: Screening, Deduplication &amp; Eligibility
            </h2>
            <p className="text-sm text-blue-300">
              Records: {dedup.totalRecords} · Duplicates removed:{" "}
              {dedup.duplicatesRemoved} · Unique: {dedup.unique.length} · With
              abstract: {abstractFiltered.length} · Selected: {selectedCount}
            </p>
            <p className="text-[11px] text-blue-400 mt-0.5">
              Duplicates matched by DOI (
              {dedup.matchBreakdown.doi + dedup.matchBreakdown.doiPrefix}), title (
              {dedup.matchBreakdown.title}), fuzzy title (
              {dedup.matchBreakdown.fuzzyTitle})
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

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"
            />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter papers by title or author..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer bg-blue-950/60 border border-blue-800 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={onlyWithAbstract}
              onChange={(e) => setOnlyWithAbstract(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
            />
            Only papers with abstract / full text
            {excludedNoAbstract > 0 && (
              <span className="text-blue-400">({excludedNoAbstract} excluded)</span>
            )}
          </label>
          <button
            onClick={toggleAll}
            className="text-sm bg-blue-900/50 text-blue-200 px-4 py-2 rounded hover:bg-blue-900/70"
          >
            {filteredPapers.length > 0 && filteredPapers.every((p) => p.selected)
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>

        {state.showPrisma && (
          <div className="mb-4">
            <Prisma2020Diagram counts={prismaCounts} />
          </div>
        )}

        {/* Unique papers grouped by database */}
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {Object.entries(papersByDatabase)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([database, dbPapers]) => {
              const dbSelectedCount = dbPapers.filter((p) => p.selected).length;
              const allDbSelected =
                dbPapers.length > 0 && dbPapers.every((p) => p.selected);

              return (
                <div
                  key={database}
                  className="bg-blue-950/30 border border-blue-900 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{database}</h3>
                      <span className="text-xs text-blue-400">
                        ({dbPapers.length} unique papers)
                      </span>
                      <span className="text-xs text-green-300">
                        ({dbSelectedCount} selected)
                      </span>
                    </div>
                    <button
                      onClick={() => toggleDatabase(database)}
                      className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
                    >
                      {allDbSelected ? "Deselect All" : "Select All from this database"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {dbPapers.map((paper) => {
                      const sources = (paper.sources as string[]) || [];
                      const otherSources = sources.filter(
                        (s) => s && s !== database
                      );
                      return (
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
                            <h4 className="text-sm font-semibold text-white">
                              {paper.title}
                            </h4>
                            <p className="text-xs text-blue-300">{paper.authors}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {paper.journal && (
                                <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded">
                                  {paper.journal}
                                </span>
                              )}
                              <span className="text-xs text-blue-400">{paper.year}</span>
                              <span className="text-xs bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded">
                                {paper.studyType}
                              </span>
                              {getCitationBadge(paper)}
                              {otherSources.length > 0 && (
                                <span
                                  className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded"
                                  title={`Also found in: ${otherSources.join(", ")}`}
                                >
                                  <Copy size={9} className="inline mr-1" />
                                  also in {otherSources.length} other database
                                  {otherSources.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            {otherSources.length > 0 && (
                              <p className="text-[10px] text-blue-400 mt-1">
                                Also found in: {otherSources.join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          {filteredPapers.length === 0 && (
            <p className="text-xs text-blue-400 py-6 text-center">
              {onlyWithAbstract
                ? "No papers with an abstract match the current filter."
                : "No papers match the current filter."}
            </p>
          )}
        </div>

        {state.error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mt-3">
            {state.error}
          </div>
        )}

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
