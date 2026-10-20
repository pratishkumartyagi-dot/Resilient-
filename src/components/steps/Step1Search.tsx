"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Search,
  Database,
  ChevronRight,
  CheckSquare,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ListTree,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateMockLegacy, webSearchPapers, type Paper } from "@/lib/database-apis";
import {
  extractConcepts,
  setConceptRequired,
  getRoleLabel,
  type ConceptBlock,
} from "@/lib/concept-extraction";
import { compileQueryPlan, summarizePlan } from "@/lib/query-compiler";

/** The 13 study types offered as checkboxes (combined with OR). */
const STUDY_TYPES = [
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
  PubMed: "https://pubmed.ncbi.nlm.nih.gov/",
  OpenAlex: "https://openalex.org/",
  "Europe PMC": "https://europepmc.org/",
  DOAJ: "https://doaj.org/",
  "bioRxiv": "https://www.biorxiv.org/",
  medRxiv: "https://www.medrxiv.org/",
  Crossref: "https://www.crossref.org/",
  arXiv: "https://arxiv.org/",
  OpenAIRE: "https://www.openaire.eu/",
  dblp: "https://dblp.org/",
  Zenodo: "https://zenodo.org/",
  "Google Scholar": "https://scholar.google.com/",
  "Semantic Scholar": "https://www.semanticscholar.org/",
  "ClinicalTrials.gov": "https://clinicaltrials.gov/",
};

const ROLE_STYLES: Record<string, string> = {
  condition: "bg-blue-900/50 text-blue-200 border-blue-700",
  predictor: "bg-teal-900/40 text-teal-200 border-teal-700",
  outcome: "bg-purple-900/50 text-purple-200 border-purple-700",
  design: "bg-amber-900/40 text-amber-200 border-amber-700",
};

export default function Step1Search() {
  const { state, dispatch } = useApp();
  const [localQuery, setLocalQuery] = useState(state.searchQuery);
  const [localLogic, setLocalLogic] = useState(state.searchLogic);
  const [yearFrom, setYearFrom] = useState(state.yearFrom);
  const [yearTo, setYearTo] = useState(state.yearTo);
  const [studyTypes, setStudyTypes] = useState<string[]>(state.studyTypes || []);
  const [selectedDbs, setSelectedDbs] = useState<string[]>(state.selectedDatabases);
  const [activeDbTab, setActiveDbTab] = useState<string>(DATABASES[0]);
  const [titleFilter, setTitleFilter] = useState("");
  const [perDatabaseResults, setPerDatabaseResults] = useState<
    Array<{ database: string; status: string; count: number; error?: string }>
  >([]);
  const [citationCounts, setCitationCounts] = useState<{
    verified: number;
    unverified: number;
    noDoi: number;
  }>({ verified: 0, unverified: 0, noDoi: 0 });
  const [semanticSearch, setSemanticSearch] = useState(true);
  const [medspacyFilter, setMedspacyFilter] = useState(true);
  const [medspacyMeta, setMedspacyMeta] = useState<{
    enabled: boolean;
    queryConcepts: string[];
    negationTerms: string[];
    filteredCount: number;
    totalCount: number;
  } | null>(null);
  const [concepts, setConcepts] = useState<ConceptBlock[]>(state.conceptBlocks || []);
  const [conceptSource, setConceptSource] = useState<"gemini" | "local" | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [planSummary, setPlanSummary] = useState<string[]>([]);
  const [rawRecordCount, setRawRecordCount] = useState(0);

  // -------------------------------------------------------------------------
  // Study type selection (OR logic)
  // -------------------------------------------------------------------------

  const toggleStudyType = (studyType: string) => {
    const next = studyTypes.includes(studyType)
      ? studyTypes.filter((t) => t !== studyType)
      : [...studyTypes, studyType];
    setStudyTypes(next);
    dispatch({ type: "SET_STUDY_TYPES", payload: next });
  };

  const clearStudyTypes = () => {
    setStudyTypes([]);
    dispatch({ type: "SET_STUDY_TYPES", payload: [] });
  };

  const selectAllStudyTypes = () => {
    setStudyTypes(STUDY_TYPES);
    dispatch({ type: "SET_STUDY_TYPES", payload: STUDY_TYPES });
  };

  // -------------------------------------------------------------------------
  // Database selection
  // -------------------------------------------------------------------------

  const toggleDb = (db: string) => {
    const next = selectedDbs.includes(db)
      ? selectedDbs.filter((d) => d !== db)
      : [...selectedDbs, db];
    setSelectedDbs(next);
    dispatch({ type: "SET_SELECTED_DATABASES", payload: next });
  };

  const selectAllDbs = () => {
    const next = selectedDbs.length === DATABASES.length ? [] : DATABASES;
    setSelectedDbs(next);
    dispatch({ type: "SET_SELECTED_DATABASES", payload: next });
  };

  const clearDbs = () => {
    setSelectedDbs([]);
    dispatch({ type: "SET_SELECTED_DATABASES", payload: [] });
  };

  // -------------------------------------------------------------------------
  // Concept extraction
  // -------------------------------------------------------------------------

  const handleExtractConcepts = useCallback(async () => {
    if (!localQuery.trim()) {
      dispatch({ type: "SET_ERROR", payload: "Enter a research area first." });
      return;
    }
    setExtracting(true);
    dispatch({ type: "SET_ERROR", payload: "" });
    try {
      const result = await extractConcepts(localQuery, state.geminiApiKey);
      setConcepts(result.blocks);
      setConceptSource(result.source);
      dispatch({ type: "SET_CONCEPT_BLOCKS", payload: result.blocks });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Concept extraction failed." });
    } finally {
      setExtracting(false);
    }
  }, [localQuery, state.geminiApiKey, dispatch]);

  const handleToggleConceptRequired = (id: string, required: boolean) => {
    const next = setConceptRequired(concepts, id, required);
    setConcepts(next);
    dispatch({ type: "SET_CONCEPT_BLOCKS", payload: next });
  };

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  const handleSearch = async () => {
    if (!localQuery.trim() || selectedDbs.length === 0) {
      dispatch({
        type: "SET_ERROR",
        payload: "Enter a search query and select at least one database.",
      });
      return;
    }
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({
      type: "SET_SEARCH",
      payload: { query: localQuery, logic: localLogic, yearFrom, yearTo },
    });
    dispatch({ type: "SET_SELECTED_DATABASES", payload: selectedDbs });
    dispatch({ type: "SET_STUDY_TYPES", payload: studyTypes });

    let effectiveConcepts = concepts;
    if (effectiveConcepts.length === 0) {
      const result = await extractConcepts(localQuery, state.geminiApiKey);
      effectiveConcepts = result.blocks;
      setConcepts(result.blocks);
      setConceptSource(result.source);
      dispatch({ type: "SET_CONCEPT_BLOCKS", payload: result.blocks });
    }

    const plan = compileQueryPlan({
      concepts: effectiveConcepts,
      studyTypes,
      databases: selectedDbs,
      searchLogic: localLogic === "OR" ? "OR" : localLogic === "NOT" ? "NOT" : "AND",
      rawQuery: localQuery,
    });
    setPlanSummary(summarizePlan(plan));

    try {
      let papers: Paper[] = [];
      let perDb: Array<{ database: string; status: string; count: number; error?: string }> = [];
      let rawCount = 0;
      let rawPerDb: Record<string, number> = {};
      let relevanceCount = 0;
      let validation: Record<string, { valid: boolean; title?: string; message: string }> = {};

      try {
        const res = await fetch("/api/literature-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: localQuery,
            databases: selectedDbs,
            yearFrom: yearFrom || undefined,
            yearTo: yearTo || undefined,
            studyTypes: studyTypes.length > 0 ? studyTypes : undefined,
            searchLogic: localLogic,
            semanticSearch,
            medspacyFilter,
            concepts: effectiveConcepts,
            useCompiledQueries: true,
            // Duplicates are collapsed by the DedupEndNote pass in Step 2, so
            // Step 1 keeps every raw record grouped by its source database.
            deduplicate: false,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Search failed with status ${res.status}`);
        }
        const data = await res.json();
        papers = data.papers || [];
        perDb = data.perDatabaseResults || [];
        rawCount = data.rawRecordCount || 0;
        rawPerDb = data.rawRecordsPerDatabase || {};
        relevanceCount = data.relevanceFilteredCount || papers.length;
        validation = data.citationValidation?.results || {};
        setMedspacyMeta(data.medspacy || null);
        if (Array.isArray(data.planSummary) && data.planSummary.length > 0) {
          setPlanSummary(data.planSummary);
        }
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
            perDb = Object.entries(counts).map(([database, count]) => ({
              database,
              status: "success",
              count,
            }));
            rawCount = webPapers.length;
            rawPerDb = counts;
            relevanceCount = webPapers.length;
            dispatch({
              type: "SET_ERROR",
              payload: `Live database search failed: ${msg}. Showing ${webPapers.length} results from web search fallback.`,
            });
          } else {
            throw new Error("Web search returned 0 results");
          }
        } catch (webErr: any) {
          const webMsg = webErr?.message || String(webErr);
          console.warn("[Step1Search] Web search fallback failed:", webMsg);
          const mock = generateMockLegacy(localQuery, selectedDbs);
          papers = mock;
          perDb = selectedDbs.map((db) => ({
            database: db,
            status: "success",
            count: mock.filter((p) => p.database === db).length,
          }));
          rawCount = mock.length;
          rawPerDb = Object.fromEntries(
            selectedDbs.map((db) => [
              db,
              mock.filter((p) => p.database === db).length,
            ])
          );
          relevanceCount = mock.length;
          dispatch({
            type: "SET_ERROR",
            payload: `Live search failed: ${msg}. Web search fallback also failed: ${webMsg}. Showing ${mock.length} simulated results.`,
          });
        }
      }

      if (papers.length > 0) {
        dispatch({ type: "SET_CITATION_RESULTS", payload: validation });
        dispatch({ type: "SET_PAPERS", payload: papers });
        dispatch({
          type: "SET_RAW_COUNTS",
          payload: {
            total: rawCount,
            perDatabase: rawPerDb,
            relevanceFiltered: relevanceCount,
          },
        });
        setRawRecordCount(rawCount);

        let verified = 0;
        let unverified = 0;
        let noDoi = 0;
        papers.forEach((p: any) => {
          if (p.citationStatus === "verified") verified++;
          else if (p.citationStatus === "unverified") unverified++;
          else noDoi++;
        });
        setCitationCounts({ verified, unverified, noDoi });
        dispatch({ type: "SET_CITATION_STATUS", payload: "done" });
        setPerDatabaseResults(perDb);
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: "No papers found. Try broader terms or more databases.",
        });
      }
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Search failed. Please try again." });
      const mock = generateMockLegacy(localQuery, selectedDbs);
      dispatch({ type: "SET_PAPERS", payload: mock });
      setPerDatabaseResults(
        selectedDbs.map((db) => ({
          database: db,
          status: "success",
          count: mock.filter((p) => p.database === db).length,
        }))
      );
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // -------------------------------------------------------------------------
  // Result display
  // -------------------------------------------------------------------------

  const papersByDatabase = useMemo(() => {
    const map: Record<string, Paper[]> = {};
    for (const p of state.papers) {
      const db = p.database || p.sourceBackend || "Unknown";
      if (!map[db]) map[db] = [];
      map[db].push(p);
    }
    return map;
  }, [state.papers]);

  const visibleByDatabase = useMemo(() => {
    const q = titleFilter.trim().toLowerCase();
    const map: Record<string, Paper[]> = {};
    for (const [db, dbPapers] of Object.entries(papersByDatabase)) {
      const filtered = q
        ? dbPapers.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              (p.authors || "").toLowerCase().includes(q)
          )
        : dbPapers;
      if (filtered.length > 0) map[db] = filtered;
    }
    return map;
  }, [papersByDatabase, titleFilter]);

  const visibleCount = useMemo(
    () => Object.values(visibleByDatabase).reduce((sum, list) => sum + list.length, 0),
    [visibleByDatabase]
  );

  const selectedCount = state.papers.filter((p) => p.selected).length;

  const togglePaper = (id: string) => {
    dispatch({ type: "TOGGLE_PAPER", payload: id });
  };

  const toggleAll = () => {
    const allSelected =
      state.papers.length > 0 && state.papers.every((p) => p.selected);
    dispatch({ type: "SELECT_ALL_PAPERS", payload: !allSelected });
  };

  const toggleDatabase = (database: string) => {
    const dbPapers = papersByDatabase[database] || [];
    if (dbPapers.length === 0) return;
    const allSelected = dbPapers.every((p) => p.selected);
    dbPapers.forEach((p) => {
      if (p.selected !== !allSelected) {
        dispatch({ type: "TOGGLE_PAPER", payload: p.id });
      }
    });
  };

  const proceedToStep2 = () => {
    if (selectedCount === 0) {
      dispatch({
        type: "SET_ERROR",
        payload: "Select at least one paper before proceeding to Step 2.",
      });
      return;
    }
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({ type: "SET_STEP", payload: 2 });
  };

  const getCitationBadge = (paper: Paper) => {
    if (state.citationValidationStatus === "running") {
      return (
        <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <Loader2 size={10} className="animate-spin" /> verifying
        </span>
      );
    }
    if ((paper as any).citationStatus === "verified") {
      return (
        <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <CheckCircle2 size={10} /> DOI verified
        </span>
      );
    }
    if (!paper.doi) {
      return (
        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
          no DOI
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
        <AlertCircle size={10} /> DOI unverified
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Search strategy                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">
          Step 1: Broad Area of Research &amp; Search Strategy
        </h2>
        <p className="text-sm text-blue-300 mb-6">
          Describe the broad research area, choose the boolean logic, year
          window and study types, then run the search. Concepts are expanded
          with MeSH headings and synonyms and compiled into a database-specific
          strategy for each of the three search tracks.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">
              Broad Area of Research
            </label>
            <div className="flex gap-2">
              <select
                value={localLogic}
                onChange={(e) => setLocalLogic(e.target.value)}
                className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
                title="Boolean logic applied between concepts"
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
                onClick={handleExtractConcepts}
                disabled={extracting || !localQuery.trim()}
                title="Extract searchable concepts with Gemini (falls back to the local parser)"
                className="bg-purple-900/50 hover:bg-purple-900/70 text-purple-200 font-semibold px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {extracting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {extracting ? "Extracting…" : "Extract Concepts"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">
                Year From
              </label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="e.g., 2010"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">
                Year To
              </label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="e.g., 2025"
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          </div>

          {/* Study types — multi-select, OR logic */}
          <div className="bg-blue-950/40 border border-blue-900/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-sm font-medium text-blue-200">
                Study Types{" "}
                <span className="text-[11px] text-blue-400 font-normal">
                  (select any combination — combined with OR)
                </span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllStudyTypes}
                  className="text-[11px] bg-green-900/50 text-green-300 px-2.5 py-1 rounded hover:bg-green-900/70"
                >
                  Select All
                </button>
                <button
                  onClick={clearStudyTypes}
                  className="text-[11px] bg-red-900/50 text-red-300 px-2.5 py-1 rounded hover:bg-red-900/70 flex items-center gap-1"
                >
                  <X size={11} /> Clear Filter
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {STUDY_TYPES.map((studyType) => (
                <label
                  key={studyType}
                  className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer bg-blue-950/60 border border-blue-800 rounded-lg px-2.5 py-1.5 hover:border-blue-600"
                >
                  <input
                    type="checkbox"
                    checked={studyTypes.includes(studyType)}
                    onChange={() => toggleStudyType(studyType)}
                    className="w-3.5 h-3.5 rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                  />
                  <span>{studyType}</span>
                </label>
              ))}
            </div>
            {studyTypes.length > 0 && (
              <p className="text-[11px] text-blue-400 mt-2">
                {studyTypes.length} study type(s) selected — PubMed and
                ClinicalTrials.gov apply the filter natively, the remaining
                databases filter locally with OR semantics.
              </p>
            )}
          </div>

          {/* Concept blocks */}
          {concepts.length > 0 && (
            <div className="bg-purple-950/20 border border-purple-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-purple-200 flex items-center gap-2">
                  <ListTree size={14} /> Extracted Concepts
                  {conceptSource && (
                    <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">
                      {conceptSource === "gemini" ? "Gemini" : "Local parser"}
                    </span>
                  )}
                </h3>
                <span className="text-[11px] text-purple-300">
                  Untick a concept to make it optional (OR)
                </span>
              </div>
              <div className="space-y-2">
                {concepts.map((concept) => (
                  <div
                    key={concept.id}
                    className="bg-purple-950/40 border border-purple-800/40 rounded-lg p-2.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={concept.required}
                        onChange={(e) =>
                          handleToggleConceptRequired(concept.id, e.target.checked)
                        }
                        className="w-3.5 h-3.5 rounded border-purple-700 bg-purple-950 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_STYLES[concept.role] || ROLE_STYLES.condition}`}
                      >
                        {getRoleLabel(concept.role)}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {concept.label}
                      </span>
                      <span className="text-[10px] text-purple-300">
                        {concept.required ? "AND (required)" : "OR (optional)"}
                      </span>
                    </div>
                    {(concept.synonyms.length > 0 || concept.meshTerms.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {concept.meshTerms.map((mesh) => (
                          <span
                            key={`mesh-${mesh}`}
                            className="text-[10px] bg-teal-900/40 text-teal-200 px-1.5 py-0.5 rounded"
                            title="MeSH heading"
                          >
                            MeSH: {mesh}
                          </span>
                        ))}
                        {concept.synonyms.map((synonym) => (
                          <span
                            key={`syn-${synonym}`}
                            className="text-[10px] bg-purple-900/40 text-purple-200 px-1.5 py-0.5 rounded"
                          >
                            {synonym}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compiled strategy preview */}
          {planSummary.length > 0 && (
            <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-3">
              <h3 className="text-xs font-bold text-blue-200 mb-1.5">
                Compiled search strategy
              </h3>
              <pre className="text-[10px] text-blue-300 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {planSummary.join("\n")}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSearch}
              disabled={state.isLoading || !localQuery.trim()}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Search size={16} />
              {state.isLoading ? "Searching…" : "Search"}
            </button>
            {state.isLoading && (
              <span className="text-xs text-blue-300">
                Searching {selectedDbs.length} databases with the compiled
                strategy…
              </span>
            )}
          </div>

          {state.error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {state.error}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Databases                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Database size={18} className="text-yellow-400" />
            <h3 className="text-lg font-bold text-white">Databases</h3>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none bg-blue-900/50 border border-blue-700 rounded-full px-3 py-0.5">
              <input
                type="checkbox"
                checked={semanticSearch}
                onChange={(e) => setSemanticSearch(e.target.checked)}
                className="w-3 h-3 rounded border-blue-600 text-yellow-500 focus:ring-yellow-500 bg-blue-950"
              />
              <span className={semanticSearch ? "text-yellow-300" : "text-blue-300"}>
                {semanticSearch ? "Semantic Search Active" : "Keyword Search"}
              </span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none bg-blue-900/50 border border-blue-700 rounded-full px-3 py-0.5">
              <input
                type="checkbox"
                checked={medspacyFilter}
                onChange={(e) => setMedspacyFilter(e.target.checked)}
                className="w-3 h-3 rounded border-purple-600 text-purple-400 focus:ring-purple-500 bg-blue-950"
              />
              <span className={medspacyFilter ? "text-purple-300" : "text-blue-300"}>
                {medspacyFilter ? "Medspacy Relevance Filter" : "Show All Results"}
              </span>
            </label>
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
                {selectedDbs.includes(db) && (
                  <span className="ml-1 text-green-400">●</span>
                )}
              </button>
            ))}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{activeDbTab}</p>
                <p className="text-xs text-blue-400">
                  {DATABASE_URLS[activeDbTab] ||
                    `https://${activeDbTab.toLowerCase().replace(/\s/g, "")}.org/`}
                </p>
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

      {/* ---------------------------------------------------------------- */}
      {/* Results                                                           */}
      {/* ---------------------------------------------------------------- */}
      {state.isLoading && (
        <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">
                Searching {selectedDbs.length} databases…
              </p>
              <p className="text-blue-400 text-xs mt-1">
                Validating DOIs via Crossref…
              </p>
            </div>
          </div>
        </div>
      )}

      {!state.isLoading && state.papers.length > 0 && (
        <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">
                Search Results — Select papers to proceed
              </h2>
              <p className="text-sm text-blue-300">
                <span className="text-white font-semibold">{rawRecordCount}</span>{" "}
                records identified across {Object.keys(papersByDatabase).length}{" "}
                databases
                {" • "}
                <span className="text-white font-semibold">
                  {state.papers.length}
                </span>{" "}
                shown after relevance filtering
                {" • "}
                <span className="text-white font-semibold">{selectedCount}</span>{" "}
                selected
                {state.citationValidationStatus === "done" && (
                  <span className="ml-2 text-green-300">
                    · {citationCounts.verified} verified · {citationCounts.unverified}{" "}
                    unverified · {citationCounts.noDoi} no-DOI
                  </span>
                )}
              </p>
              <p className="text-[11px] text-blue-400 mt-0.5">
                Duplicates across databases are collapsed by the DedupEndNote
                pass in Step 2.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-400"
                />
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
                {state.papers.length > 0 && state.papers.every((p) => p.selected)
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
          </div>

          {perDatabaseResults.length > 0 && (
            <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-2 text-[10px] text-blue-300 mb-4">
              <span className="font-semibold">Database summary:</span>{" "}
              {perDatabaseResults.filter((r) => r.status === "success").length}{" "}
              succeeded,{" "}
              {perDatabaseResults.filter((r) => r.status === "empty").length}{" "}
              returned 0 results,{" "}
              {perDatabaseResults.filter((r) => r.status === "failed").length}{" "}
              failed out of {selectedDbs.length} selected
              {perDatabaseResults.filter((r) => r.error).length > 0 && (
                <span className="text-red-300">
                  {" "}— failed:{" "}
                  {perDatabaseResults
                    .filter((r) => r.error)
                    .map((r) => `${r.database} (${r.error})`)
                    .join(", ")}
                </span>
              )}
            </div>
          )}

          {medspacyMeta && medspacyMeta.enabled && (
            <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-purple-300 mb-1">
                <span className="font-semibold">Medspacy Relevance Filter</span>
                <span className="bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded">
                  active
                </span>
              </div>
              <p className="text-[10px] text-purple-200">
                Query concepts: {medspacyMeta.queryConcepts.join(", ") || "none detected"}{" "}
                • Papers filtered: {medspacyMeta.filteredCount} of{" "}
                {medspacyMeta.totalCount} removed as irrelevant
                {medspacyMeta.negationTerms.length > 0 && (
                  <span className="block mt-0.5">
                    Negation terms detected: {medspacyMeta.negationTerms.join(", ")}
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {Object.entries(visibleByDatabase)
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
                      <div className="flex items-center gap-2">
                        <Database size={14} className="text-yellow-400" />
                        <h3 className="text-sm font-bold text-white">{database}</h3>
                        <span className="text-xs text-blue-400">
                          ({dbPapers.length} papers)
                        </span>
                        <span className="text-xs text-green-300">
                          ({dbSelectedCount} selected)
                        </span>
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
                            <h4 className="text-sm font-semibold text-white line-clamp-2">
                              {paper.title}
                            </h4>
                            <p className="text-xs text-blue-300 mt-0.5">
                              {paper.authors} · {paper.year} · {paper.studyType}
                            </p>
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {paper.journal && (
                                <span className="text-[10px] bg-blue-900/50 text-blue-200 px-1.5 py-0.5 rounded">
                                  {paper.journal}
                                </span>
                              )}
                              {getCitationBadge(paper)}
                              {paper.doi && (
                                <span className="text-[10px] bg-indigo-900/40 text-indigo-300 px-1.5 py-0.5 rounded">
                                  {paper.doi}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            {visibleCount === 0 && (
              <p className="text-xs text-blue-400 py-6 text-center">
                No papers match the current filter.
              </p>
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
