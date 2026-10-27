"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  Sparkles,
  Gauge,
  CheckCircle,
  XCircle,
  Loader2,
  Brain,
  FileText,
  MessageSquareQuote,
  Target,
  ShieldCheck,
  PenLine,
  ClipboardCheck,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, type AICallOptions } from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";
import {
  ARS_MODES,
  JOURNAL_PROFILES,
  REVIEWER_LENSES,
  buildAcademicPaperPrompt,
  buildConcessionThresholdBlock,
  buildPipelineContext,
  buildReviewerPrompt,
  buildRevisionCoachPrompt,
  buildRevisionPrompt,
  buildSocraticPlanningPrompt,
  buildStyleCalibrationBlock,
  buildWritingQualityCheckPrompt,
  getJournalProfile,
  type ArsMode,
  type JournalProfile,
  type ReviewerLens,
} from "@/lib/ars-skills";

type Stage = "plan" | "outline" | "draft" | "review" | "revise" | "audit";

const STAGE_ORDER: Stage[] = ["plan", "outline", "draft", "review", "revise", "audit"];

const STAGE_META: Record<Stage, { label: string; icon: React.ElementType; hint: string }> = {
  plan: { label: "Plan", icon: Brain, hint: "Socratic planning — questions and decision map" },
  outline: { label: "Outline", icon: Target, hint: "Evidence-mapped section plan" },
  draft: { label: "Draft", icon: PenLine, hint: "Full manuscript in target-journal style" },
  review: { label: "Review", icon: MessageSquareQuote, hint: "Criterion-bound multi-perspective peer review" },
  revise: { label: "Revise", icon: ClipboardCheck, hint: "Point-by-point response and revised manuscript" },
  audit: { label: "Audit", icon: ShieldCheck, hint: "Writing quality check and sign-off" },
};

interface RubricItem {
  criterion: string;
  score: number;
  note: string;
}

interface Analysis {
  rubric: RubricItem[];
}

const clamp = (n: number) => Math.max(20, Math.min(100, Math.round(n)));

const computeRubric = (text: string, mode: "academic" | "reviewer"): RubricItem[] => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const headings = (text.match(/^#{1,4}\s+.+$/gm) || []).length;
  const has = (re: RegExp) => re.test(text);

  const lengthScore = clamp(35 + words / 12);
  const headingScore = clamp(40 + headings * 5);
  const base = clamp(lengthScore * 0.5 + headingScore * 0.5);

  const hasAbstract = has(/^#+\s*abstract/im) || has(/\babstract\b/i);
  const hasIntro = has(/^#+\s*introduction/im) || has(/\bintroduction\b/i);
  const hasMethods = has(/^#+\s*method/im) || has(/\bmethod/i);
  const hasResults = has(/^#+\s*results?/im) || has(/\bresults?\b/i);
  const hasDiscussion = has(/^#+\s*discussion/im) || has(/\bdiscussion\b/i);
  const hasConclusion = has(/^#+\s*conclusion/im) || has(/\bconclusion\b/i);
  const hasReferences = has(/^#+\s*references/im) || has(/\breferences?\b/i);
  const hasStats = has(/\b(regression|confidence interval|p-value|odds ratio|hazard ratio|statistic|significance|effect size)\b/i);
  const hasEthics = has(/\b(ethic|consent|institutional review|irb|approval)\b/i);
  const hasLimitations = has(/\blimitation/i);
  const hasCitations = has(/\[\d+\]|\(\w+[^)]*\d{4}\)/) || hasReferences;
  const hasDeclarations = has(/\b(declaration|funding|competing interest|data availability|consent)\b/i);
  const hasGuideline = has(/\b(CONSORT|STROBE|PRISMA|EQUATOR|GATHER|ICMJE)\b/i);
  const hasPlaceholders = has(/\[FIGURE \d+ ABOUT HERE|\[CITATION NEEDED\]|requires author input/i);
  const longEnough = words > 250;
  const bonus = longEnough ? 6 : 0;

  if (mode === "reviewer") {
    return [
      { criterion: "Summary completeness", score: clamp(base + (hasAbstract || hasIntro ? 8 : -10)), note: "How clearly the report summarises the reviewed manuscript." },
      { criterion: "Criterion-bound judgements", score: clamp(base + (has(/criterion/i) ? 12 : -12)), note: "Each judgement bound to a named criterion." },
      { criterion: "Severity tagging", score: clamp(base + (has(/critical|major|minor/i) ? 10 : -10)), note: "Issues tagged by severity." },
      { criterion: "Journal-fit assessment", score: clamp(base + (has(/journal/i) ? 8 : -8)), note: "Scope and readiness for the target journal." },
      { criterion: "Devil's Advocate present", score: clamp(base + (has(/devil|adversarial|refute|alternative explanation/i) ? 12 : -14)), note: "Adversarial stress test of the central claim." },
      { criterion: "Attack intensity preserved", score: clamp(base + (has(/attack intensity|hardest to answer/i) ? 10 : -8)), note: "Critique is not softened." },
      { criterion: "Methodological concerns", score: clamp(base + (hasMethods ? 8 : -8) + bonus), note: "Depth of methodological critique." },
      { criterion: "Statistical concerns", score: clamp(base + (hasStats ? 12 : -10)), note: "Whether statistical issues are raised." },
      { criterion: "Ethical & equity concerns", score: clamp(base + (hasEthics ? 10 : -8)), note: "Coverage of ethics, consent, and equity." },
      { criterion: "Actionable revision list", score: clamp(base + (has(/required revision|revision/i) ? 10 : -12)), note: "Itemised, actionable revision requests." },
      { criterion: "Author queries", score: clamp(base + (has(/author quer/i) ? 8 : -8)), note: "Specific questions for the authors." },
      { criterion: "Evidence anchoring", score: clamp(base + (hasCitations ? 9 : -8)), note: "Critique anchored to manuscript text." },
    ];
  }

  return [
    { criterion: "Abstract accuracy & completeness", score: clamp(base + (hasAbstract ? 10 : -18) + bonus), note: hasAbstract ? "Structured abstract detected." : "No abstract detected; add a structured abstract." },
    { criterion: "Reporting guideline conformance", score: clamp(base + (hasGuideline ? 12 : -12)), note: hasGuideline ? "Reporting guideline named." : "No reporting guideline referenced." },
    { criterion: "Introduction — gap articulation", score: clamp(base + (hasIntro ? 8 : -14)), note: hasIntro ? "Introduction present; verify the research gap is explicit." : "No introduction detected." },
    { criterion: "Methods — reproducibility", score: clamp(base + (hasMethods ? 8 : -12) + bonus), note: hasMethods ? "Methods present; check reproducibility detail." : "Methods section missing." },
    { criterion: "Statistical analysis rigour", score: clamp(base + (hasStats ? 12 : -10)), note: hasStats ? "Statistical terminology detected." : "No statistical analysis detail detected." },
    { criterion: "Results presentation", score: clamp(base + (hasResults ? 10 : -14)), note: hasResults ? "Results section present." : "Results section missing." },
    { criterion: "Discussion — limitations", score: clamp(base + (hasDiscussion ? 8 : -12) + (hasLimitations ? 6 : 0)), note: hasLimitations ? "Limitations discussed." : "Add an explicit limitations discussion." },
    { criterion: "Declarations & ethics", score: clamp(base + (hasDeclarations ? 12 : -10)), note: hasDeclarations ? "Declaration language detected." : "Add funding, competing interest, and data availability statements." },
    { criterion: "Citation & reference integrity", score: clamp(base + (hasCitations ? 10 : -12)), note: hasReferences ? "Reference list detected." : "No reference list detected." },
    { criterion: "Anti-leakage compliance", score: clamp(base + (hasPlaceholders ? 6 : -10)), note: hasPlaceholders ? "Missing items declared rather than invented." : "No explicit declaration of missing inputs." },
    { criterion: "Journal match & word economy", score: clamp(base + (headings >= 6 ? 8 : -6) + bonus), note: "Structural completeness relative to the target journal." },
  ];
};

export default function PaperWriterTab() {
  const { state } = useApp();
  const [mode, setMode] = useState<"academic" | "reviewer">("academic");
  const [arsMode, setArsMode] = useState<ArsMode>("full");
  const [inputText, setInputText] = useState("");
  const [targetJournal, setTargetJournal] = useState(JOURNAL_PROFILES[0].id);
  const [yearFrom, setYearFrom] = useState(state.yearFrom || "");
  const [yearTo, setYearTo] = useState(state.yearTo || "");
  const [searchedReferences, setSearchedReferences] = useState<{
    authors: string;
    year: number | string;
    title: string;
    journal: string;
    doi?: string;
    database: string;
  }[]>([]);
  const [searchingRefs, setSearchingRefs] = useState(false);
  const [refsError, setRefsError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<Stage>("plan");
  const [draft, setDraft] = useState("");
  const [reviewReport, setReviewReport] = useState("");
  const [revisionCoach, setRevisionCoach] = useState("");
  const [finalManuscript, setFinalManuscript] = useState("");
  const [auditReport, setAuditReport] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [selectedLenses, setSelectedLenses] = useState<string[]>(
    REVIEWER_LENSES.map((l) => l.id)
  );

  const journal: JournalProfile = useMemo(
    () => getJournalProfile(targetJournal),
    [targetJournal]
  );

  // Paper Writer & Reviewer pipeline uses Gemini / Groq API keys only — no
  // local model fallback. Gemini first, Groq as fallback.
  const callModel = useCallback(
    async (prompt: string): Promise<string> => {
      const options: AICallOptions = {
        searchEnabled: false,
        searchQuery: state.searchQuery,
      };
      let text = "";
      try {
        if (state.geminiApiKey) {
          text = await callGemini(state.geminiApiKey, prompt, options);
        } else if (state.groqApiKey) {
          text = await callGroq(state.groqApiKey, prompt, options);
        }
        // Intentional: no local model (DeepSeek) fallback in this pipeline.
      } catch {
        text = "";
      }
      return text;
    },
    [state.geminiApiKey, state.groqApiKey, state.searchQuery]
  );

  // Search references from the app's own databases (uses From/To year bounds).
  const searchReferences = async () => {
    const topic = (inputText || state.searchQuery || "").trim();
    if (!topic) {
      setRefsError("Please enter a research topic before searching references.");
      return;
    }
    setRefsError("");
    setSearchingRefs(true);
    setSearchedReferences([]);
    try {
      const res = await fetch("/api/literature-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: topic,
          databases: state.selectedDatabases.length > 0 ? state.selectedDatabases : undefined,
          yearFrom: yearFrom || undefined,
          yearTo: yearTo || undefined,
          studyType: state.studyType === "All Study Types" ? undefined : state.studyType,
          searchLogic: state.searchLogic,
          semanticSearch: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Reference search failed with status ${res.status}`);
      }
      const data = await res.json();
      const papers = (data.papers || []).slice(0, 30);
      const refs = papers.map((p: any) => ({
        authors: p.authors || "Unknown authors",
        year: p.year || "n.d.",
        title: p.title || "Untitled",
        journal: p.journal || "journal",
        doi: p.doi || undefined,
        database: p.database || p.sourceBackend || "unknown",
      }));
      setSearchedReferences(refs);
    } catch (err: any) {
      setRefsError(err?.message || "Reference search failed.");
    } finally {
      setSearchingRefs(false);
    }
  };

  // Assemble the research-pipeline context (synthesis, lit review, aim, methods,
  // protocol, impact) so the writer grounds the manuscript in real pipeline output.
  const pipelineContext = useMemo(
    () =>
      buildPipelineContext({
        searchQuery: state.searchQuery,
        synthesisTable: state.synthesisTable,
        literatureReview: state.literatureReview,
        researchQuestions: state.researchQuestions,
        aimObjectives: state.aimObjectives,
        methodology: state.methodology as unknown as Record<string, unknown>,
        protocol: state.protocol as unknown as Record<string, unknown>,
        impactAssessment: state.impactAssessment,
        references: searchedReferences,
      }),
    [
      state.searchQuery,
      state.synthesisTable,
      state.literatureReview,
      state.researchQuestions,
      state.aimObjectives,
      state.methodology,
      state.protocol,
      state.impactAssessment,
      searchedReferences,
    ]
  );

  const effectiveInput = useMemo(() => {
    const own = inputText.trim();
    if (own) return own;
    if (pipelineContext) return pipelineContext;
    return state.searchQuery || "";
  }, [inputText, pipelineContext, state.searchQuery]);

  const runStage = useCallback(
    async (target: Stage): Promise<string> => {
      const lenses: ReviewerLens[] = REVIEWER_LENSES.filter((l) =>
        selectedLenses.includes(l.id)
      );
      const concession = buildConcessionThresholdBlock();

      switch (target) {
        case "plan":
          return await callModel(
            buildSocraticPlanningPrompt(state.searchQuery, pipelineContext)
          );
        case "outline":
          return await callModel(
            buildAcademicPaperPrompt(journal, effectiveInput, pipelineContext, "outline-only")
          );
        case "draft":
          return await callModel(
            buildAcademicPaperPrompt(journal, effectiveInput, pipelineContext, arsMode)
          );
        case "review":
          return await callModel(
            buildReviewerPrompt(
              draft || effectiveInput,
              journal,
              lenses,
              reviewReport || undefined
            )
          );
        case "revise": {
          const coach = await callModel(
            buildRevisionCoachPrompt(draft || effectiveInput, reviewReport, journal)
          );
          setRevisionCoach(coach);
          const revised = await callModel(
            buildRevisionPrompt(
              draft || effectiveInput,
              reviewReport,
              journal,
              concession
            )
          );
          return revised;
        }
        case "audit":
          return await callModel(
            buildWritingQualityCheckPrompt(finalManuscript || draft, journal)
          );
        default:
          return "";
      }
    },
    [
      callModel,
      state.searchQuery,
      pipelineContext,
      journal,
      effectiveInput,
      draft,
      reviewReport,
      finalManuscript,
      arsMode,
      selectedLenses,
    ]
  );

  const handleGenerate = async () => {
    if (!effectiveInput.trim()) {
      setError(
        mode === "academic"
          ? "Please paste your research content or run the research pipeline first."
          : "Please paste the paper you want reviewed before starting the simulation."
      );
      return;
    }
    setError("");
    setIsGenerating(true);
    setStage("plan");
    setDraft("");
    setReviewReport("");
    setRevisionCoach("");
    setFinalManuscript("");
    setAuditReport("");

    try {
      if (mode === "reviewer") {
        // Reviewer path: manuscript -> review -> revision -> audit
        const lenses = REVIEWER_LENSES.filter((l) => selectedLenses.includes(l.id));
        const report = await callModel(
          buildReviewerPrompt(effectiveInput, journal, lenses)
        );
        const reviewText = report.trim() || buildLocalReview(journal, effectiveInput);
        setReviewReport(reviewText);
        setStage("review");
        setAnalysis({ rubric: computeRubric(reviewText, "reviewer") });
        setDraft(reviewText);
        return;
      }

      // Academic path: plan -> outline -> draft -> review -> revise -> audit
      const plan = await runStage("plan");
      if (plan.trim()) {
        setDraft(plan);
        setStage("plan");
      }

      setStage("outline");
      const outline = await runStage("outline");
      if (outline.trim()) {
        setDraft((prev) => (prev ? `${prev}\n\n---\n\n${outline}` : outline));
      }

      setStage("draft");
      const manuscript = await runStage("draft");
      const draftText = manuscript.trim() || buildLocalDraft(journal, effectiveInput, searchedReferences);
      setDraft(draftText);

      setStage("review");
      const report = await callModel(
        buildReviewerPrompt(draftText, journal, REVIEWER_LENSES)
      );
      const reviewText = report.trim() || buildLocalReview(journal, draftText);
      setReviewReport(reviewText);

      setStage("revise");
      const coach = await callModel(
        buildRevisionCoachPrompt(draftText, reviewText, journal)
      );
      setRevisionCoach(coach);
      const revised = await callModel(
        buildRevisionPrompt(draftText, reviewText, journal, buildConcessionThresholdBlock())
      );
      const finalText = revised.trim() || draftText;
      setFinalManuscript(finalText);

      setStage("audit");
      const audit = await callModel(
        buildWritingQualityCheckPrompt(finalText, journal)
      );
      setAuditReport(audit.trim());

      setAnalysis({ rubric: computeRubric(finalText, "academic") });
    } catch (err: any) {
      setError(err?.message || "Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunStage = async (target: Stage) => {
    setIsGenerating(true);
    setError("");
    setStage(target);
    try {
      const out = await runStage(target);
      if (out.trim()) {
        if (target === "review") {
          setReviewReport(out);
          setDraft(out);
          setAnalysis({ rubric: computeRubric(out, "reviewer") });
        } else if (target === "revise") {
          setFinalManuscript(out);
        } else if (target === "audit") {
          setAuditReport(out);
        } else {
          setDraft((prev) => (prev ? `${prev}\n\n---\n\n${out}` : out));
        }
      }
    } catch (err: any) {
      setError(err?.message || "Stage failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setDraft("");
    setReviewReport("");
    setRevisionCoach("");
    setFinalManuscript("");
    setAuditReport("");
    setAnalysis(null);
    setError("");
    setStage("plan");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(finalManuscript || draft);
    } catch {
      /* ignore */
    }
  };

  const toggleLens = (id: string) => {
    setSelectedLenses((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  const overallScore =
    analysis && analysis.rubric.length > 0
      ? Math.round(analysis.rubric.reduce((s, r) => s + r.score, 0) / analysis.rubric.length)
      : null;

  const outputText = finalManuscript || draft;

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              Paper Writer &amp; Reviewer
            </h2>
            <p className="text-sm text-blue-300">
              Academic Research Skills (ARS) protocol pipeline — 12-agent writing,
              7-perspective criterion-bound review, concession-threshold revision,
              and writing-quality audit. Uses the Gemini / Groq keys already configured
              in this app.
            </p>
          </div>
          <span className="text-[10px] bg-blue-900/40 text-blue-300 px-2 py-1 rounded">
            Based on ARS by Cheng-I Wu · CC BY-NC 4.0
          </span>
        </div>

        {/* Mode + journal selection */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => setMode("academic")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === "academic" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/50 text-blue-300"}`}
          >
            ✍️ Academic Paper Writing
          </button>
          <button
            onClick={() => setMode("reviewer")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === "reviewer" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/50 text-blue-300"}`}
          >
            📝 Academic Paper Reviewer
          </button>
          <div className="relative">
            <select
              value={targetJournal}
              onChange={(e) => setTargetJournal(e.target.value)}
              className="appearance-none bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm pr-8"
            >
              {JOURNAL_PROFILES.map((j) => (
                <option key={j.id} value={j.id}>{`Target: ${j.name}`}</option>
              ))}
            </select>
            <ChevronRight
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 rotate-[-90deg] pointer-events-none"
            />
          </div>
        </div>

        {/* Journal style calibration panel */}
        <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-bold text-yellow-300 mb-2 flex items-center gap-1.5">
            <ShieldCheck size={13} /> Style Calibration — {journal.name}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-blue-200">
            <p><span className="text-blue-400">Guideline:</span> {journal.reportingGuideline}</p>
            <p><span className="text-blue-400">References:</span> {journal.referenceStyle}</p>
            <p><span className="text-blue-400">Word limits:</span> abstract ≤ {journal.wordLimits.abstract}, main ≤ {journal.wordLimits.main}, total ≤ {journal.wordLimits.total}</p>
            <p><span className="text-blue-400">Abstract headings:</span> {journal.abstractHeadings.join(", ")}</p>
          </div>
          <p className="text-[11px] text-blue-300 mt-2 leading-relaxed">{journal.styleNotes}</p>
        </div>

        {/* ARS mode selector (writing only) */}
        {mode === "academic" && (
          <div className="flex flex-wrap gap-2 mb-4">
            {ARS_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setArsMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  arsMode === m.id
                    ? "bg-yellow-500 text-[#0a1a3a] border-yellow-400"
                    : "bg-blue-900/40 text-blue-300 border-blue-800 hover:bg-blue-800/50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Reviewer lens selector */}
        {mode === "reviewer" && (
          <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4 mb-4">
            <h4 className="text-xs font-bold text-yellow-300 mb-2">
              Review Perspectives ({selectedLenses.length}/{REVIEWER_LENSES.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {REVIEWER_LENSES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleLens(l.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    selectedLenses.includes(l.id)
                      ? "bg-purple-700/60 text-purple-100 border-purple-500"
                      : "bg-blue-900/30 text-blue-400 border-blue-800"
                  }`}
                  title={l.focus}
                >
                  {l.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-blue-400 mt-2">
              Devil&apos;s Advocate is included by default and is never softened —
              attack intensity is preserved through the revision cycle.
            </p>
          </div>
        )}

        {/* Reference search (by year) */}
        <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4 mb-4">
          <h4 className="text-xs font-bold text-yellow-300 mb-2 flex items-center gap-1.5">
            <FileText size={13} /> Search References (From / To Year)
          </h4>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-blue-300">From Year</label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                min="1000"
                max={new Date().getFullYear()}
                placeholder="e.g. 2015"
                className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-blue-300">To Year</label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                min="1000"
                max={new Date().getFullYear()}
                placeholder="e.g. 2026"
                className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={searchReferences}
              disabled={searchingRefs || !(inputText.trim() || state.searchQuery)}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {searchingRefs ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {searchingRefs ? "Searching..." : "Search References"}
            </button>
            <span className="text-[11px] text-blue-400">
              {searchedReferences.length} papers found
            </span>
            {refsError && (
              <span className="text-[11px] text-red-400">{refsError}</span>
            )}
          </div>
          {searchedReferences.length > 0 && (
            <div className="mt-3 max-h-[200px] overflow-y-auto space-y-1">
              {searchedReferences.map((r, i) => (
                <div key={i} className="text-[10px] text-blue-200 truncate flex items-center gap-2">
                  <span className="text-blue-500">{i + 1}.</span>
                  <span className="flex-1">{r.authors} ({r.year}). {r.title}.</span>
                  <span className="text-blue-400">{r.journal}</span>
                  {r.doi && <span className="text-green-400">✓ doi</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                {mode === "academic"
                  ? "Research content / notes (blank = use pipeline output: synthesis, literature review, aim, methods, protocol)"
                  : "Upload paper to review"}
              </label>
              <textarea
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (error) setError("");
                }}
                placeholder={
                  mode === "academic"
                    ? "Paste your research notes, aim, objectives, or section outline. If left blank, the ARS pipeline uses the output of Steps 3–11 of the research pipeline."
                    : "Paste the paper you want reviewed..."
                }
                rows={4}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
              />
              {error && (
                <p className="mt-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isGenerating
                    ? "Running pipeline..."
                    : mode === "academic"
                      ? "Run Full ARS Pipeline"
                      : "Start Review Simulation"}
                </button>
                {draft && (
                  <button
                    onClick={handleReset}
                    className="bg-blue-900/50 text-blue-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Pipeline stage bar */}
            <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
              <h4 className="text-xs font-bold text-blue-200 mb-2 flex items-center gap-1.5">
                <Target size={13} /> ARS Pipeline Stages
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {STAGE_ORDER.map((s) => {
                  const meta = STAGE_META[s];
                  const Icon = meta.icon;
                  const active = stage === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleRunStage(s)}
                      disabled={isGenerating}
                      title={meta.hint}
                      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium border disabled:opacity-40 ${
                        active
                          ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-200"
                          : "bg-blue-900/30 border-blue-800 text-blue-300 hover:bg-blue-800/40"
                      }`}
                    >
                      {active && isGenerating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Icon size={14} />
                      )}
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-blue-400 mt-2">
                {STAGE_META[stage].hint}
                {mode === "reviewer" && stage === "review" && " (Reviewer path runs manuscript → review → revise → audit.)"}
              </p>
            </div>

            {/* Final manuscript output */}
            {outputText && (
              <div className="bg-blue-950 border border-blue-900 rounded-lg p-5 max-h-[560px] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
                    <FileText size={14} />
                    {mode === "reviewer"
                      ? `Peer Review Report · ${journal.name}`
                      : `Manuscript · ${journal.name}`}
                  </h3>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <pre className="text-sm text-blue-100 whitespace-pre-wrap font-serif leading-relaxed">
                  {outputText}
                </pre>
              </div>
            )}

            {/* Review report */}
            {reviewReport && mode === "academic" && (
              <div className="bg-purple-950/30 border border-purple-900/50 rounded-lg p-5 max-h-[400px] overflow-y-auto">
                <h3 className="text-sm font-bold text-purple-300 mb-2 flex items-center gap-1.5">
                  <MessageSquareQuote size={14} /> Peer Review Report
                </h3>
                <pre className="text-xs text-purple-100 whitespace-pre-wrap leading-relaxed">
                  {reviewReport}
                </pre>
              </div>
            )}

            {/* Revision coach roadmap */}
            {revisionCoach && (
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-5 max-h-[400px] overflow-y-auto">
                <h3 className="text-sm font-bold text-emerald-300 mb-2 flex items-center gap-1.5">
                  <ClipboardCheck size={14} /> Revision Roadmap &amp; Response Letter Skeleton
                </h3>
                <pre className="text-xs text-emerald-100 whitespace-pre-wrap leading-relaxed">
                  {revisionCoach}
                </pre>
              </div>
            )}

            {/* Audit report */}
            {auditReport && (
              <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-5 max-h-[400px] overflow-y-auto">
                <h3 className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Writing Quality Audit
                </h3>
                <pre className="text-xs text-amber-100 whitespace-pre-wrap leading-relaxed">
                  {auditReport}
                </pre>
              </div>
            )}
          </div>

          {/* Right rail: rubric + exports */}
          <div className="space-y-4">
            {analysis && analysis.rubric.length > 0 && (
              <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Gauge size={14} className="text-yellow-400" />
                  Quality Grid
                  {overallScore !== null && (
                    <span className="ml-auto text-xs bg-yellow-500 text-[#0a1a3a] px-2 py-0.5 rounded-full font-bold">
                      {overallScore}/100
                    </span>
                  )}
                </h4>
                <div className="space-y-2">
                  {analysis.rubric.map((item, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-blue-200 truncate flex-1">
                          {item.criterion}
                        </span>
                        <span
                          className={`text-xs font-bold ml-1 ${
                            item.score >= 85
                              ? "text-green-400"
                              : item.score >= 70
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {item.score}
                        </span>
                      </div>
                      <div className="h-1.5 bg-blue-900 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.score >= 85
                              ? "bg-green-500"
                              : item.score >= 70
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-blue-400 mt-0.5">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {outputText && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    void downloadMarkdownAsWord(outputText, "paper.docx");
                  }}
                  className="w-full bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} /> Export to DOCX
                </button>
                <button
                  onClick={() => downloadMarkdownAsPDF(outputText, "review-report.pdf")}
                  className="w-full bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/60 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} /> Export Review Report
                </button>
                {reviewReport && (
                  <button
                    onClick={() => downloadMarkdownAsPDF(reviewReport, "peer-review.pdf")}
                    className="w-full bg-purple-900/50 text-purple-200 px-4 py-2 rounded-lg hover:bg-purple-800/60 flex items-center justify-center gap-2 text-sm"
                  >
                    <Download size={14} /> Export Peer Review
                  </button>
                )}
              </div>
            )}

            {/* Pipeline context availability */}
            <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-400" />
                Pipeline Context
              </h4>
              <ul className="text-[11px] text-blue-300 space-y-1">
                <li>Synthesis table: {state.synthesisTable.length} rows</li>
                <li>Literature review: {state.literatureReview ? "available" : "not generated"}</li>
                <li>Research questions: {state.researchQuestions.length}</li>
                <li>Aim &amp; objectives: {state.aimObjectives?.aim ? "available" : "not set"}</li>
                <li>Methodology: {state.methodology?.population ? "available" : "not set"}</li>
                <li>Protocol: {state.protocol?.background ? "available" : "not set"}</li>
                <li>Impact assessment: {state.impactAssessment ? "available" : "not set"}</li>
                <li>API key in use:{" "}
                  {state.geminiApiKey ? "Gemini" : state.groqApiKey ? "Groq" : "No API key configured"}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local fallbacks (no-AI path) — keep the pipeline usable offline.
// ---------------------------------------------------------------------------

const buildLocalDraft = (
  journal: JournalProfile,
  input: string,
  references: {
    authors: string;
    year: number | string;
    title: string;
    journal: string;
    doi?: string;
  }[]
): string => {
  const trimmed = input.trim();
  const firstLine = trimmed.split("\n").map((l) => l.trim()).find(Boolean) || "Untitled Research";
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const abstractSeed = words.slice(0, 60).join(" ");

  const vancouverRefs = references
    .map(
      (r, i) =>
        `${i + 1}. ${r.authors}. ${r.title}. ${r.journal}${r.doi ? ` doi:${r.doi}` : ""}`
    )
    .join("\n");

  return `# ${title}
Target journal: ${journal.name}

## ${journal.abstractHeadings[0] ?? "Background"}
${abstractSeed}${words.length > 60 ? "..." : ""}

> This is a structural scaffold generated without an AI provider. Configure Gemini or Groq in Settings for a full ARS draft.

## ${journal.sectionOrder[1] ?? "Introduction"}
${trimmed}

## ${journal.sectionOrder[2] ?? "Methods"}
Study design, setting, population, inclusion/exclusion criteria, intervention, comparators, outcomes, sample size, and statistical analysis to be expanded from the source content above.

## ${journal.sectionOrder[3] ?? "Results"}
Present the primary and secondary outcomes here. Insert tables and figures referenced in the Methods. No numeric results were supplied, so no values are reported.

## ${journal.sectionOrder[4] ?? "Discussion"}
Interpret the findings against the existing literature, state the principal findings, compare with prior work, and address limitations and generalisability.

## ${journal.sectionOrder[5] ?? "Conclusion"}
Summarise the main contribution and its implications for ${journal.name}'s readership.

## ${journal.sectionOrder[6] ?? "References"}
${vancouverRefs || "[REFERENCES TO BE SUPPLIED BY AUTHOR]"}

---

## Source Content (verbatim)
${trimmed}`;
};

const buildLocalReview = (journal: JournalProfile, input: string): string => {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const abstractSeed = words.slice(0, 60).join(" ");

  return `# Peer Review Report — ${journal.name}

## Manuscript Summary
${abstractSeed}${words.length > 60 ? "..." : ""}

## Overall Assessment
This report was produced without an AI provider. Configure Gemini or Groq in Settings for a criterion-bound multi-perspective review. Preliminary assessment: the manuscript addresses a recognisable question but requires methodological strengthening before submission.

## Perspective-by-Perspective Review

### Perspective 1: Journal-Fit Reviewer
*Criterion: scope fit* — Scope alignment with ${journal.name} could not be assessed from the supplied text alone.

### Perspective 2: Methods & Validity Reviewer
*Criterion: reproducibility* — Methodological detail appears insufficient for reproducibility; study design, sampling, and recruitment flow require full documentation.

### Perspective 3: Statistical Reviewer
*Criterion: inference validity* — Sample-size justification and statistical test selection are not evident. Effect sizes with confidence intervals are required.

### Perspective 4: Clinical Translation Reviewer
*Criterion: generalisability* — Generalisability claims could not be verified from the supplied text.

### Perspective 5: Ethics & Equity Reviewer
*Criterion: ethical conduct* — Ethics approval, informed consent, registration, funding, competing interests, and data availability statements are not evident.

### Perspective 6: Presentation & Reporting Reviewer
*Criterion: reporting conformance* — Conformance to ${journal.reportingGuideline} could not be verified.

### Perspective 7: Devil's Advocate
*Criterion: claim robustness* — The central claim may rest on a single, potentially confounded analysis. An alternative explanation has not been excluded. Evidence needed: adjusted analyses with prespecified covariates and independent replication.

## Critical Issues
1. Statistical analysis plan and sample-size justification are missing.
2. Ethics, consent, and registration statements are absent.

## Strengths
- The manuscript addresses a recognisable gap and states a clear research aim.

## Required Revisions
1. Expand the methods to a reproducible level of detail.
2. Add effect sizes with confidence intervals and a limitations subsection.
3. Provide ethics approval, consent, registration, and data availability statements.
4. Supply a point-by-point response to each concern above.

## Author Queries
1. What was the primary outcome and how was it pre-specified?
2. How was sample size determined?
3. Which analysis plan was registered, and where?

## Attack Intensity Note
The Devil's Advocate objections above are the hardest to answer and must not be dismissed in the response letter. They require new analysis or a materially narrowed claim.

---

## Reviewed Manuscript (verbatim)
${trimmed}`;
};
