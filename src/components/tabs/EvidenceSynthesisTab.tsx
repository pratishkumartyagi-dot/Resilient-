"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search, Database, ChevronRight, FileText,
  RotateCcw, CheckCircle2, ExternalLink, FlaskConical,
  Save, Sparkles, ClipboardList, Table, Download,
  FileJson, BarChart3, PenTool, BookOpen, FileCode,
  Bot, ShieldCheck, Loader2, Zap
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, type AICallOptions } from "@/lib/ai";
import { fetchRealPapers, generateMockLegacy, webSearchPapers, type Paper } from "@/lib/database-apis";
import { generateLocalLiteratureReview, generateLitLLMSynthesis } from "@/lib/local-synthesis";
import { downloadLiteratureReviewPDF, downloadLiteratureReviewWord, downloadMarkdownAsPDF, downloadMarkdownAsWord, downloadMarkdownAsLaTeX } from "@/lib/exporters";
import { marked } from "marked";
import { getIntegratedSkills } from "@/lib/medical-skills/skills-registry";
import {
  buildAcademicWritingManuscriptPrompt,
  buildAcademicWritingReviewPrompt,
  buildIncorporateReviewPrompt,
  formatPrinciplesForPrompt,
  formatAgentsForPrompt,
  type ReviewFinding,
} from "@/lib/academic-writing-agents";
import {
  buildSTORMOutlinePrompt,
  buildSTORMOutlineDraftPrompt,
  buildSTORMReviewPrompt,
} from "@/lib/storm-draft-generator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from "recharts";
import EvidenceSynthesisStep1, { type EvidenceSynthesisStep1Props } from "./EvidenceSynthesisStep1";

const INTEGRATED_EVIDENCE_SKILLS = getIntegratedSkills().filter(s => ["literature-review", "literature-deep-research", "clinical-trials-database"].includes(s.id));

const SR_DATABASES = [
  "PubMed",
  "OpenAlex",
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

const PIPELINE_STEPS = [
  { num: 1, label: "Search & Screening", icon: Search },
  { num: 2, label: "Data Extraction", icon: FileText },
  { num: 3, label: "Risk of Bias", icon: CheckCircle2 },
  { num: 4, label: "Synthesis & Meta-analysis", icon: FlaskConical },
  { num: 5, label: "Reporting & PRISMA", icon: FileText },
  { num: 6, label: "Research Paper Draft", icon: PenTool },
];

const REVIEW_TYPES = [
  "Systematic Review",
  "Systematic Review & Meta-analysis",
  "Narrative Review",
  "Umbrella Review",
  "Scoping Review",
  "Rapid Review",
  "Mixed Methods Review",
  "Diagnostic Test Accuracy Review",
];

interface DomainJudgment {
  judgment: string;
}

interface RobAssessment {
  tool: string;
  overall: string;
  notes: string;
  domains: Record<string, DomainJudgment>;
}

interface RobToolTemplate {
  id: string;
  label: string;
  domains: { id: string; label: string }[];
  judgments: string[];
  overallDefault: string;
}

const ROB_TOOL_TEMPLATES: RobToolTemplate[] = [
  {
    id: "ROB2",
    label: "Cochrane RoB 2.0",
    domains: [
      { id: "D1", label: "Bias arising from the randomization process" },
      { id: "D2", label: "Bias due to deviations from intended interventions" },
      { id: "D3", label: "Bias due to missing outcome data" },
      { id: "D4", label: "Bias in measurement of the outcome" },
      { id: "D5", label: "Bias in selection of the reported result" },
    ],
    judgments: ["Low risk of bias", "Some concerns", "High risk of bias", "No information"],
    overallDefault: "Some concerns",
  },
  {
    id: "ROB2-Cluster",
    label: "RoB 2.0 (Cluster RCTs)",
    domains: [
      { id: "D1a", label: "Bias arising from the randomization process" },
      { id: "D1b", label: "Bias in cluster identification" },
      { id: "D2", label: "Bias due to deviations from intended interventions" },
      { id: "D3", label: "Bias due to missing outcome data" },
      { id: "D4", label: "Bias in measurement of the outcome" },
      { id: "D5", label: "Bias in selection of the reported result" },
    ],
    judgments: ["Low risk of bias", "Some concerns", "High risk of bias", "No information", "Not applicable"],
    overallDefault: "Some concerns",
  },
  {
    id: "ROBINS-I",
    label: "ROBINS-I (Non-randomized)",
    domains: [
      { id: "D1", label: "Confounding" },
      { id: "D2", label: "Selection of participants" },
      { id: "D3", label: "Classification of interventions" },
      { id: "D4", label: "Deviations from intended interventions" },
      { id: "D5", label: "Missing data" },
      { id: "D6", label: "Measurement of outcomes" },
      { id: "D7", label: "Selection of the reported result" },
    ],
    judgments: ["Low risk of bias", "Moderate", "Serious", "Critical", "No information"],
    overallDefault: "Serious",
  },
  {
    id: "ROBINS-E",
    label: "ROBINS-E (Environmental/Non-RCT)",
    domains: [
      { id: "D1", label: "Confounding" },
      { id: "D2", label: "Selection of participants into the study" },
      { id: "D3", label: "Classification of interventions/exposures" },
      { id: "D4", label: "Deviations from intended interventions" },
      { id: "D5", label: "Missing data" },
      { id: "D6", label: "Measurement of outcomes" },
      { id: "D7", label: "Selection of the reported result" },
    ],
    judgments: ["Low risk of bias", "Some concerns", "High", "Very high", "No information"],
    overallDefault: "High",
  },
  {
    id: "QUADAS-2",
    label: "QUADAS-2 (Diagnostic Test Accuracy)",
    domains: [
      { id: "D1", label: "Patient selection" },
      { id: "D2", label: "Index test" },
      { id: "D3", label: "Reference standard" },
      { id: "D4", label: "Flow and timing" },
    ],
    judgments: ["Low risk of bias", "Some concerns", "High risk of bias", "No information"],
    overallDefault: "Some concerns",
  },
  {
    id: "QUIPS",
    label: "QUIPS (Prognostic Studies)",
    domains: [
      { id: "D1", label: "Study participation" },
      { id: "D2", label: "Study attrition" },
      { id: "D3", label: "Prognostic factor measurement" },
      { id: "D4", label: "Outcome measurement" },
      { id: "D5", label: "Confounding measurement and account" },
      { id: "D6", label: "Analysis and reporting" },
    ],
    judgments: ["Low risk of bias", "Moderate", "High risk of bias", "No information"],
    overallDefault: "Moderate",
  },
  {
    id: "Generic",
    label: "Generic",
    domains: [
      { id: "D1", label: "Domain 1" },
      { id: "D2", label: "Domain 2" },
      { id: "D3", label: "Domain 3" },
      { id: "D4", label: "Domain 4" },
      { id: "D5", label: "Domain 5" },
    ],
    judgments: ["Critical", "High", "Unclear", "Some concerns", "Moderate", "Low", "No information", "Not applicable"],
    overallDefault: "Unclear",
  },
];

const ROB_JUDGMENT_COLORS: Record<string, Record<string, string>> = {
  cochrane: {
    "Low risk of bias": "#02C100",
    "Some concerns": "#E2DF07",
    "High risk of bias": "#BF0000",
    "No information": "#4EA1F7",
    "Low": "#02C100",
    "Moderate": "#E2DF07",
    "Serious": "#d95f0e",
    "Critical": "#993404",
    "Very high": "#820000",
    "Unclear": "#E2DF07",
    "Not applicable": "#cccccc",
  },
  colourblind: {
    "Low risk of bias": "#4d9221",
    "Some concerns": "#e66101",
    "High risk of bias": "#e7298a",
    "No information": "#7570b3",
    "Low": "#4d9221",
    "Moderate": "#e66101",
    "Serious": "#d95f0e",
    "Critical": "#993404",
    "Very high": "#820000",
    "Unclear": "#e66101",
    "Not applicable": "#cccccc",
  },
};

const ROB_DOMAIN_COLORS: Record<string, string> = {
  "Low risk of bias": "#02C100",
  "Some concerns": "#E2DF07",
  "High risk of bias": "#BF0000",
  "No information": "#4EA1F7",
  "Moderate": "#e66101",
  "Serious": "#d95f0e",
  "Critical": "#993404",
  "Very high": "#820000",
  "Unclear": "#E2DF07",
  "Not applicable": "#cccccc",
    "Low": "#02C100",
  };

interface ProbastDomainJudgment {
  judgment: string;
}

interface ProbastAssessment {
  overallRob: string;
  overallApplicability: string;
  notes: string;
  domains: Record<string, ProbastDomainJudgment>;
  applicability: Record<string, ProbastDomainJudgment>;
}

const PROBAST_ROB_DOMAINS: { id: string; label: string }[] = [
  { id: "D1", label: "Participants" },
  { id: "D2", label: "Predictors" },
  { id: "D3", label: "Outcome" },
  { id: "D4", label: "Analysis" },
];

const PROBAST_APPLICABILITY_DOMAINS: { id: string; label: string }[] = [
  { id: "A1", label: "Participants" },
  { id: "A2", label: "Predictors" },
  { id: "A3", label: "Outcome" },
];

const PROBAST_ROB_JUDGMENTS = ["Low risk of bias", "High risk of bias", "Unclear"];
const PROBAST_APPLICABILITY_JUDGMENTS = ["Low concern", "High concern", "Unclear"];

const PROBAST_COLOR_MAP: Record<string, string> = {
  "Low risk of bias": "#02C100",
  "High risk of bias": "#BF0000",
  "Unclear": "#E2DF07",
  "Low concern": "#02C100",
  "High concern": "#BF0000",
};

const getProbastColor = (judgment: string): string => PROBAST_COLOR_MAP[judgment] || "#E2DF07";

export default function EvidenceSynthesisTab() {
  const { state } = useApp();
  const [pipelineStep, setPipelineStep] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedDbs, setSelectedDbs] = useState<string[]>(["OpenAlex", "DOAJ", "bioRxiv", "medRxiv", "Crossref", "OpenAIRE", "dblp", "PubMed"]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [robSelectedPaperIds, setRobSelectedPaperIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dbSearchStatus, setDbSearchStatus] = useState<Record<string, number>>({});
  const [failedDatabases, setFailedDatabases] = useState<string[]>([]);
  const [totalIdentified, setTotalIdentified] = useState(0);
  const [dedupedCount, setDedupedCount] = useState(0);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [synthesisTable, setSynthesisTable] = useState<any[]>([]);
  const [synthesisTableLoading, setSynthesisTableLoading] = useState(false);
  const [robAssessments, setRobAssessments] = useState<Record<string, RobAssessment>>({});
  const [robTool, setRobTool] = useState<string>("ROB2");
  const [robInstructions, setRobInstructions] = useState("");
  const [robMode, setRobMode] = useState<"robvis" | "probast">("robvis");
  const [probastAssessments, setProbastAssessments] = useState<Record<string, ProbastAssessment>>({});
  const [probastAiLoading, setProbastAiLoading] = useState(false);
  const [probastAnalysis, setProbastAnalysis] = useState("");
  const [synthesisInstructions, setSynthesisInstructions] = useState("");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [manuscript, setManuscript] = useState("");
  const [manuscriptLoading, setManuscriptLoading] = useState(false);
  const [reviewReport, setReviewReport] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [finalManuscript, setFinalManuscript] = useState("");
  const [finalManuscriptLoading, setFinalManuscriptLoading] = useState(false);
  const [stormMode, setStormMode] = useState<"academic-agents" | "storm">("academic-agents");
  const [stormDraft, setStormDraft] = useState("");
  const [stormLoading, setStormLoading] = useState(false);
  const [stormReview, setStormReview] = useState("");
  const [stormReviewLoading, setStormReviewLoading] = useState(false);
  const [stormFinal, setStormFinal] = useState("");
  const [stormFinalLoading, setStormFinalLoading] = useState(false);
  const [literatureReviewSections, setLiteratureReviewSections] = useState({
    introduction: "",
    globalIndian: "",
    gaps: "",
    futureAdvice: "",
    summary: "",
    references: "",
  });
  const [literatureReviewLoading, setLiteratureReviewLoading] = useState(false);
  const [effectSizes, setEffectSizes] = useState<{ study: string; effect: string; ci: string; weight: string }[]>([]);
  const [reviewType, setReviewType] = useState("Systematic Review & Meta-analysis");
  const [reviewRequirements, setReviewRequirements] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [searchLogic, setSearchLogic] = useState("AND");
  const [studyTypeFilter, setStudyTypeFilter] = useState("All Study Types");
  const [perDatabaseResults, setPerDatabaseResults] = useState<Array<{ database: string; status: string; count: number; error?: string }>>([]);
  const [citationValidationResults, setCitationValidationResults] = useState<Record<string, { valid: boolean; title?: string; message: string }>>({});
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };

  const selectAllDbs = () => {
    setSelectedDbs([...SR_DATABASES]);
  };

  const deselectAllDbs = () => {
    setSelectedDbs([]);
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setSearchError("Please enter a search query.");
      return;
    }
    setLoading(true);
    setPapers([]);
    setSelectedPaperIds(new Set());
    setSearchError(null);
    setPerDatabaseResults([]);
    try {
      const dbs = selectedDbs.length > 0 ? selectedDbs : ["OpenAlex", "Semantic Scholar", "Crossref", "PubMed"];
      const res = await fetch("/api/literature-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          databases: dbs,
          yearFrom: yearFrom || undefined,
          yearTo: yearTo || undefined,
          studyType: studyTypeFilter === "All Study Types" ? undefined : studyTypeFilter,
        }),
      });
      const data = await res.json();

      // Handle both success and error responses - data.papers may contain mock data
      const apiPapers = data.papers || [];
      setPapers(apiPapers);
      setDbSearchStatus(data.sourceBreakdown || {});
      setFailedDatabases(data.failedDatabases || []);
      setPerDatabaseResults(data.perDatabaseResults || []);
      setTotalIdentified(data.totalBeforeDedup ?? (data.papers?.length || 0));
      setDedupedCount(data.dedupedCount ?? (data.papers?.length || 0));
      setCitationValidationResults(data.citationValidation?.results || {});

      // Show warnings if APIs failed but we have mock/simulated results
      const hasErrors = Object.keys(data.errors || {}).length > 0;
      const allFailed = data.databasesFailed > 0 && data.databasesSucceeded === 0;
      if (hasErrors && allFailed) {
        setSearchError(`Note: Live database access unavailable. Showing ${apiPapers.length} simulated results.`);
      } else if (hasErrors) {
        const errorEntries = Object.entries(data.errors || {}).map(([db, msg]) => `${db}: ${msg}`).join("; ");
        setSearchError(`${errorEntries}`);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn("[EvidenceSynthesis] Search failed:", msg);
      // Always provide some results via mock
      const mock = generateMockLegacy(query, selectedDbs);
      setPapers(mock);
      setTotalIdentified(mock.length);
      setDedupedCount(mock.length);
      setSearchError(`Search error: ${msg}. Showing ${mock.length} simulated results.`);
    } finally {
      setLoading(false);
    }
  };

  const dbBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    papers.forEach((p) => {
      const db = p.database || p.sourceBackend || "Unknown";
      map[db] = (map[db] || 0) + 1;
    });
    return map;
  }, [papers]);

  const togglePaper = (id: string) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPaperIds.size === papers.length) {
      setSelectedPaperIds(new Set());
    } else {
      setSelectedPaperIds(new Set(papers.map((p) => p.id)));
    }
  };

  const toggleRobPaper = (id: string) => {
    setRobSelectedPaperIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllRobPapers = () => {
    const robPaperIds = extractedData.map((p) => p.id);
    if (robSelectedPaperIds.size === robPaperIds.length) {
      setRobSelectedPaperIds(new Set());
    } else {
      setRobSelectedPaperIds(new Set(robPaperIds));
    }
  };

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

  const getRobToolTemplate = (): RobToolTemplate | undefined => {
    return ROB_TOOL_TEMPLATES.find((t) => t.id === robTool);
  };

  const getRobJudgmentColor = (judgment: string): string => {
    return ROB_DOMAIN_COLORS[judgment] || "#4EA1F7";
  };

  const initRobAssessment = (id: string, paperMeta?: { studyType?: string; year?: number; title?: string }): RobAssessment => {
    const template = getRobToolTemplate();
    if (!template) {
      return { tool: robTool, overall: "Unclear", notes: "", domains: {} };
    }
    const domains: Record<string, DomainJudgment> = {};
    template.domains.forEach((d) => {
      domains[d.id] = { judgment: "No information" };
    });
    const assessed = { tool: robTool, overall: template.overallDefault, notes: "", domains };
    if (paperMeta) {
      applyRobHeuristic(assessed, paperMeta, template);
    }
    return assessed;
  };

  const applyRobHeuristic = (assessment: RobAssessment, meta: { studyType?: string; year?: number; title?: string }, template: RobToolTemplate) => {
    const y = typeof meta.year === "number" ? meta.year : parseInt(String(meta.year || "2000"), 10);
    const isRecent = !isNaN(y) && y >= 2020;
    const st = (meta.studyType || "").toLowerCase();
    const isRCT = st.includes("rct") || st.includes("randomized") || st.includes("randomised") || st.includes("clinical trial");
    const isNonRandomized = st.includes("cohort") || st.includes("observational") || st.includes("non-randomized") || st.includes("non-randomised");
    const isDiagnostic = st.includes("diagnostic") || st.includes("accuracy");

    switch (template.id) {
      case "ROB2": {
        const d1 = isRCT ? (isRecent ? "Low risk of bias" : "Some concerns") : "High risk of bias";
        const d2 = isRecent ? "Low risk of bias" : "Some concerns";
        const d3 = isRecent ? "Low risk of bias" : "Some concerns";
        const d4 = "Low risk of bias";
        const d5 = isRecent ? "Low risk of bias" : "Some concerns";
        const overall = [d1, d2, d3, d4, d5].filter(v => v === "High risk of bias").length >= 2 ? "High risk of bias"
          : [d1, d2, d3, d4, d5].filter(v => v === "Some concerns").length >= 2 ? "Some concerns"
          : "Low risk of bias";
        Object.assign(assessment.domains, { D1: { judgment: d1 }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 }, D5: { judgment: d5 } });
        assessment.overall = overall;
        break;
      }
      case "ROB2-Cluster": {
        const d1a = isRCT ? "Low risk of bias" : "High risk of bias";
        const d1b = "Some concerns";
        const d2 = isRecent ? "Low risk of bias" : "Some concerns";
        const d3 = isRecent ? "Low risk of bias" : "Some concerns";
        const d4 = "Low risk of bias";
        const d5 = isRecent ? "Low risk of bias" : "Some concerns";
        const overall = "Some concerns";
        Object.assign(assessment.domains, { D1a: { judgment: d1a }, D1b: { judgment: d1b }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 }, D5: { judgment: d5 } });
        assessment.overall = overall;
        break;
      }
      case "ROBINS-I": {
        const d1 = isNonRandomized ? "Moderate" : "Serious";
        const d2 = "Moderate";
        const d3 = "Low";
        const d4 = "Low";
        const d5 = isRecent ? "Low" : "Moderate";
        const d6 = "Low";
        const d7 = isRecent ? "Low" : "Moderate";
        const overall = [d1, d2, d5, d7].filter(v => v === "Serious" || v === "Critical").length >= 2 ? "High risk of bias" : [d1, d2, d5, d7].filter(v => v === "Moderate").length >= 2 ? "Moderate" : "Low risk of bias";
        Object.assign(assessment.domains, { D1: { judgment: d1 }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 }, D5: { judgment: d5 }, D6: { judgment: d6 }, D7: { judgment: d7 } });
        assessment.overall = overall;
        break;
      }
      case "ROBINS-E": {
        const d1 = "Moderate";
        const d2 = "Moderate";
        const d3 = "Low";
        const d4 = "Low";
        const d5 = isRecent ? "Low" : "Moderate";
        const d6 = "Low";
        const d7 = isRecent ? "Low" : "Moderate";
        const overall = "High";
        Object.assign(assessment.domains, { D1: { judgment: d1 }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 }, D5: { judgment: d5 }, D6: { judgment: d6 }, D7: { judgment: d7 } });
        assessment.overall = overall;
        break;
      }
      case "QUADAS-2": {
        const d1 = isDiagnostic ? "Some concerns" : "No information";
        const d2 = "Low risk of bias";
        const d3 = "Low risk of bias";
        const d4 = "Some concerns";
        Object.assign(assessment.domains, { D1: { judgment: d1 }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 } });
        assessment.overall = "Some concerns";
        break;
      }
      case "QUIPS": {
        const d1 = "Moderate";
        const d2 = isRecent ? "Low risk of bias" : "Moderate";
        const d3 = "Low risk of bias";
        const d4 = "Low risk of bias";
        const d5 = "Moderate";
        const d6 = "Moderate";
        Object.assign(assessment.domains, { D1: { judgment: d1 }, D2: { judgment: d2 }, D3: { judgment: d3 }, D4: { judgment: d4 }, D5: { judgment: d5 }, D6: { judgment: d6 } });
        assessment.overall = "Moderate";
        break;
      }
      default: {
        template.domains.forEach((d, idx) => {
          const options = template.judgments;
          const fallback = idx === 0 ? "Low" : idx === template.domains.length - 1 ? "No information" : "Moderate";
          assessment.domains[d.id] = { judgment: fallback };
        });
        assessment.overall = template.overallDefault;
      }
    }
  };

  const autoAssessRob = () => {
    if (extractedData.length === 0) return;
    const template = getRobToolTemplate();
    if (!template) return;
    setRobAssessments((prev) => {
      const next: Record<string, RobAssessment> = {};
      extractedData.forEach((row) => {
        const existing = prev[row.id];
        const base = existing ? { ...existing, tool: robTool, domains: { ...existing.domains } } : initRobAssessment(row.id, { studyType: row.studyType, year: row.year, title: row.title });
        applyRobHeuristic(base, { studyType: row.studyType, year: row.year, title: row.title }, template);
        next[row.id] = base;
      });
      return next;
    });
  };

  useEffect(() => {
    if (pipelineStep === 3 && extractedData.length > 0) {
      autoAssessRob();
    }
    // autoAssessRob uses robTool and pipelineStep
    // extractedData is not a dep to avoid firing on every state update during editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robTool, pipelineStep]);

  const updateRobDomain = (paperId: string, domainId: string, judgment: string) => {
    setRobAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return {
        ...prev,
        [paperId]: {
          ...existing,
          domains: { ...existing.domains, [domainId]: { judgment } },
        },
      };
    });
  };

  const updateRobOverall = (paperId: string, overall: string) => {
    setRobAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, overall } };
    });
  };

  const updateRobNotes = (paperId: string, notes: string) => {
    setRobAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, notes } };
    });
  };

  const getRobJudgmentForPaper = (paperId: string, domainId: string): string => {
    const a = robAssessments[paperId];
    if (!a) return "No information";
    if (domainId === "Overall") return a.overall || "Pending";
    return a.domains[domainId]?.judgment || "No information";
  };

  const robCounts = extractedData.reduce(
    (acc: { low: number; some: number; high: number; pending: number; moderate: number; serious: number; critical: number; veryHigh: number }, row) => {
      const template = getRobToolTemplate();
      if (!template) return acc;
      template.domains.forEach((d) => {
        const j = getRobJudgmentForPaper(row.id, d.id);
        const jl = j.toLowerCase();
        if (jl.includes("no information")) acc.pending += 1;
        else if (jl.includes("low risk of bias") || jl === "low") acc.low += 1;
        else if (jl.includes("some concerns") || jl.includes("unclear") || jl === "moderate") acc.some += 1;
        else if (jl.includes("high risk of bias") || jl.includes("high") && !jl.includes("very")) acc.high += 1;
        else if (jl.includes("very high")) acc.veryHigh += 1;
        else if (jl.includes("critical")) acc.critical += 1;
        else if (jl.includes("moderate")) acc.moderate += 1;
        else if (jl.includes("serious")) acc.serious += 1;
      });
      return acc;
    },
    { low: 0, some: 0, high: 0, pending: 0, moderate: 0, serious: 0, critical: 0, veryHigh: 0 }
  );

  const getRobSummaryData = () => {
    const template = getRobToolTemplate();
    if (!template || extractedData.length === 0) return [];
    return [
      { name: "Overall", ...Object.fromEntries(template.domains.map((d) => {
        const counts: Record<string, number> = { low: 0, some: 0, high: 0, pending: 0 };
        extractedData.forEach((row) => {
          const j = getRobJudgmentForPaper(row.id, "Overall");
          const jl = j.toLowerCase();
          if (jl.includes("no information")) counts.pending += 1;
          else if (jl.includes("low risk of bias") || jl === "low") counts.low += 1;
          else if (jl.includes("some concerns") || jl.includes("unclear") || jl === "moderate" || jl === "serious") counts.some += 1;
          else if (jl.includes("high risk of bias") || jl.includes("high") || jl.includes("very high") || jl.includes("critical")) counts.high += 1;
        });
        return [d.id, counts];
      })) },
    ];
  };

  const saveRobAssessments = () => {
    try {
      localStorage.setItem("resilient_rob_assessments", JSON.stringify(robAssessments));
      alert("Risk of Bias assessments saved locally.");
    } catch {
      alert("Risk of Bias assessments saved in session.");
    }
  };

  const initProbastAssessment = (): ProbastAssessment => ({
    overallRob: "Unclear",
    overallApplicability: "Unclear",
    notes: "",
    domains: Object.fromEntries(PROBAST_ROB_DOMAINS.map((d) => [d.id, { judgment: "Unclear" }])),
    applicability: Object.fromEntries(PROBAST_APPLICABILITY_DOMAINS.map((d) => [d.id, { judgment: "Unclear" }])),
  });

  const autoAssessProbast = () => {
    if (extractedData.length === 0) return;
    setProbastAssessments((prev) => {
      const next: Record<string, ProbastAssessment> = {};
      extractedData.forEach((row) => {
        const existing = prev[row.id];
        const base = existing || initProbastAssessment();
        const isAI = /(ai|artificial intelligence|machine learning|deep learning|neural|prediction model|algorithm)/i.test(`${row.title} ${row.studyType || ""}`);
        const robDefaults: Record<string, string> = {
          D1: "Low risk of bias",
          D2: isAI ? "Unclear" : "Low risk of bias",
          D3: "Low risk of bias",
          D4: isAI ? "High risk of bias" : "Unclear",
        };
        const appDefaults: Record<string, string> = {
          A1: "Low concern",
          A2: isAI ? "High concern" : "Low concern",
          A3: "Low concern",
        };
        const domains: Record<string, ProbastDomainJudgment> = {};
        PROBAST_ROB_DOMAINS.forEach((d) => { domains[d.id] = { judgment: robDefaults[d.id] || "Unclear" }; });
        const applicability: Record<string, ProbastDomainJudgment> = {};
        PROBAST_APPLICABILITY_DOMAINS.forEach((d) => { applicability[d.id] = { judgment: appDefaults[d.id] || "Unclear" }; });
        const overallRob = Object.values(robDefaults).includes("High risk of bias") ? "High risk of bias" : "Low risk of bias";
        const overallApp = Object.values(appDefaults).includes("High concern") ? "High concern" : "Low concern";
        next[row.id] = { ...base, domains, applicability, overallRob, overallApplicability: overallApp };
      });
      return next;
    });
  };

  const updateProbastDomain = (paperId: string, domainId: string, judgment: string) => {
    setProbastAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, domains: { ...existing.domains, [domainId]: { judgment } } } };
    });
  };

  const updateProbastApplicability = (paperId: string, domainId: string, judgment: string) => {
    setProbastAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, applicability: { ...existing.applicability, [domainId]: { judgment } } } };
    });
  };

  const updateProbastOverallRob = (paperId: string, v: string) => {
    setProbastAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, overallRob: v } };
    });
  };

  const updateProbastOverallApplicability = (paperId: string, v: string) => {
    setProbastAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, overallApplicability: v } };
    });
  };

  const updateProbastNotes = (paperId: string, notes: string) => {
    setProbastAssessments((prev) => {
      const existing = prev[paperId];
      if (!existing) return prev;
      return { ...prev, [paperId]: { ...existing, notes } };
    });
  };

  const getProbastJudgment = (paperId: string, group: "domains" | "applicability", domainId: string): string => {
    const a = probastAssessments[paperId];
    if (!a) return "Unclear";
    return a[group][domainId]?.judgment || "Unclear";
  };

  const saveProbastAssessments = () => {
    try {
      localStorage.setItem("resilient_probast_assessments", JSON.stringify(probastAssessments));
      alert("PROBAST+AI assessments saved locally.");
    } catch {
      alert("PROBAST+AI assessments saved in session.");
    }
  };

  const runProbastAi = async () => {
    if (extractedData.length === 0) {
      alert("Extract papers first (Step 2) to run PROBAST+AI assessment.");
      return;
    }
    setProbastAiLoading(true);
    try {
      autoAssessProbast();
      if (state.geminiApiKey || state.groqApiKey) {
        try {
          const studyList = extractedData
            .map((p, i) => `${i + 1}. ${p.title} (${p.authors || "Unknown"}, ${p.year || "n/d"}) — type: ${p.studyType || "prediction model study"}${p.doi ? `; DOI: ${p.doi}` : ""}`)
            .join("\n");
          const prompt = `You are PROBAST-AI, an expert tool for assessing risk of bias and applicability of prediction-model studies (including AI/ML models). Assess the following ${extractedData.length} studies using the 4 PROBAST risk-of-bias domains (Participants, Predictors, Outcome, Analysis) and 3 applicability domains (Participants, Predictors, Outcome). For each study give a short verdict (Low/High/Unclear risk of bias; Low/High concern applicability) and a one-line rationale, flagging AI-specific risks (data leakage, inappropriate train/test split, lack of external validation, poor reporting of preprocessing).

Studies:
${studyList}

Return a concise markdown report with a "## PROBAST+AI Assessment" heading and a per-study bullet list.`;
          const content = await callGemini(state.geminiApiKey || state.groqApiKey!, prompt);
          if (content) {
            setProbastAnalysis(content);
            return;
          }
        } catch {
          /* fall through to local summary */
        }
      }
      const highRob = extractedData.filter((p) => probastAssessments[p.id]?.overallRob === "High risk of bias").length;
      const highApp = extractedData.filter((p) => probastAssessments[p.id]?.overallApplicability === "High concern").length;
      setProbastAnalysis(
        `## PROBAST+AI Assessment\n\n**Studies assessed:** ${extractedData.length}\n**High risk of bias:** ${highRob}\n**High concern applicability:** ${highApp}\n\nDomains evaluated per study: Risk of bias — Participants, Predictors, Outcome, Analysis; Applicability — Participants, Predictors, Outcome. For AI/ML studies, pay special attention to domain D4 (Analysis): data source/splitting, preprocessing, model architecture, and external validation.\n\n> Generated locally using the PROBAST+AI methodology (probast.org/probast_ai). Configure an API key in Settings for AI-assisted narrative assessment.`
      );
    } finally {
      setProbastAiLoading(false);
    }
  };

  const runExtraction = async () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    if (selected.length === 0) {
      alert("Please select at least one paper in Step 1.");
      return;
    }
    setExtractionLoading(true);
    const assessments: Record<string, RobAssessment> = {};
    selected.forEach((p) => {
      assessments[p.id] = initRobAssessment(p.id, { studyType: p.studyType, year: p.year, title: p.title });
    });
    setRobAssessments(assessments);

    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey) {
      const fallback = selected.map((p) => {
        const doiLink = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${p.doi}</a>` : "";
        const urlLink = p.url && !p.doi ? `<a href="${p.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
        const vancouverRef = `${p.authors}. ${p.title}. ${p.journal || "Unknown journal"}. ${p.year}. ${doiLink} ${urlLink}`.trim();
        return {
          id: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          doi: p.doi,
          studyType: p.studyType,
          population: "Extracted from abstract",
          intervention: "Extracted from abstract",
          outcome: "Extracted from abstract",
          ROB: "Pending — assess in Step 3",
          vancouverReference: vancouverRef,
        };
      });
      setExtractedData(fallback);
      setPipelineStep(3);
      setExtractionLoading(false);
      return;
    }

    try {
      const papersContext = selected
        .map(
          (p, i) =>
            `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || "Unknown journal"}. DOI: ${p.doi || "N/A"}. Type: ${p.studyType || "N/A"}. Abstract: ${p.abstract || "No abstract"}`
        )
        .join("\n\n");

      const prompt = `You are an expert systematic review researcher applying the decipher-research-agent deep-reasoning methodology (https://github.com/mtwn105/decipher-research-agent) and the research-gaps extraction framework (https://gist.github.com/t0mst0ne/f3dd82637861384e6b2ffe3c9370f4d8).

## Task
Perform deep reasoning on the following selected papers and extract structured data for each paper. For each paper, analyze the abstract and metadata to populate the fields below. Ground every extraction in the provided text; do not fabricate data.

## Papers
${papersContext}

## Required Output
Return ONLY a JSON array (no markdown fences, no extra text) with one object per paper. Each object must have exactly these keys:
- id: string (the paper id from the input)
- title: string
- authors: string
- year: number
- doi: string or null
- studyType: string
- population: string (who was studied, or "Not specified")
- intervention: string (what was tested/exposed, or "Not specified")
- comparison: string (what it was compared against, or "Not specified")
- outcome: string (main findings/outcomes)
- sampleSize: string (e.g. "120 adults" or "Not specified")
- effectEstimate: string (main effect size if reported, or "Not reported")
- ci: string (95% CI if reported, or "Not reported")
- ROB: string (initial assessment: "Low risk / Some concerns / High risk / Pending")
- vancouverReference: string (format: "Authors. Title. Journal. Year. doi:DOI" with clickable DOI link if available, otherwise URL link)
- researchGaps: string (format: "Limitations: [author-acknowledged limits]; Exclusions: [reported exclusion criteria]; Gaps: [unanswered questions]")
- evidenceLevel: string (T1 mechanistic, T2 experimental, T3 observational, T4 mention, based on study type)

Apply deep reasoning:
1. Identify themes and patterns across papers
2. Extract only information explicitly stated in the abstracts
3. Use "Not specified" when information is absent
4. Maintain consistency across all extracted fields
`;

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed: any[];
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("AI returned invalid JSON. Please try again.");
        parsed = JSON.parse(jsonMatch[0]);
      }

      const mapped = parsed.map((item: any) => {
        const paper = selected.find((p) => p.id === item.id) || selected[0];
        const doiLink = paper.doi ? `<a href="https://doi.org/${paper.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${paper.doi}</a>` : "";
        const urlLink = paper.url && !paper.doi ? `<a href="${paper.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
        const vancouverRef = `${item.authors || paper.authors}. ${item.title || paper.title}. ${paper.journal || "Unknown journal"}. ${item.year || paper.year}. ${doiLink} ${urlLink}`.trim();
        return {
          id: item.id || paper.id,
          title: item.title || paper.title,
          authors: item.authors || paper.authors,
          year: item.year || paper.year,
          doi: item.doi || paper.doi,
          studyType: item.studyType || paper.studyType,
          population: item.population || "Not specified",
          intervention: item.intervention || "Not specified",
          comparison: item.comparison || "Not specified",
          outcome: item.outcome || "Not specified",
          sampleSize: item.sampleSize || "Not specified",
          effectEstimate: item.effectEstimate || "Not reported",
          ci: item.ci || "Not reported",
          ROB: item.ROB || "Pending — assess in Step 3",
          vancouverReference: vancouverRef,
          researchGaps: item.researchGaps || "",
          evidenceLevel: item.evidenceLevel || "T4 mention",
        };
      });

      setExtractedData(mapped);
      setPipelineStep(3);
    } catch (err: any) {
      alert("AI extraction failed: " + (err.message || "Unknown error") + ". Falling back to local extraction.");
      const fallback = selected.map((p) => {
        const doiLink = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${p.doi}</a>` : "";
        const urlLink = p.url && !p.doi ? `<a href="${p.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
        const vancouverRef = `${p.authors}. ${p.title}. ${p.journal || "Unknown journal"}. ${p.year}. ${doiLink} ${urlLink}`.trim();
        return {
          id: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          doi: p.doi,
          studyType: p.studyType,
          population: "Extracted from abstract",
          intervention: "Extracted from abstract",
          outcome: "Extracted from abstract",
          ROB: "Pending — assess in Step 3",
          vancouverReference: vancouverRef,
        };
      });
      setExtractedData(fallback);
      setPipelineStep(3);
    } finally {
      setExtractionLoading(false);
    }
  };

  const generateSynthesisTable = async () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    if (selected.length === 0) {
      alert("Please select at least one paper in Step 1.");
      return;
    }
    setSynthesisTableLoading(true);
    try {
      const papersContext = selected
        .map(
          (p, i) =>
            `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || "Unknown journal"}. DOI: ${p.doi || "N/A"}. Abstract: ${p.abstract || "No abstract"}`
        )
        .join("\n\n");

      const prompt = `You are an expert systematic review researcher. Deep analyze the following selected papers and produce a structured synthesis table aligned with the decipher-research-agent reasoning approach and the research-gaps format from https://gist.github.com/t0mst0ne/f3dd82637861384e6b2ffe3c9370f4d8.

For each paper, extract:
- Study reference: Author(s) (Year) — short title
- Year
- Setting: Where the study was conducted
- Population: Who was studied
- Intervention / exposure: What was tested
- Comparison: What it was compared against
- Outcome: Main findings/outcomes
- Sample size
- Effect estimate: Main effect size if reported
- Risk Ratio (95% CI): If reported
- Study type/Design
- Research Gaps (Author acknowledged Limits/limitations/exclusion criteria): Use the format: "Limitations: [author-acknowledged limits]; Exclusions: [reported exclusion criteria]; Gaps: [unanswered questions]"

 PAPERS:
${papersContext}

Return ONLY a markdown table with these exact columns:
| Study reference | Year | Setting | Population | Intervention / exposure | Comparison | Outcome | Sample size | Effect estimate | Risk Ratio (95% CI) | Study type/Design | Research Gaps |`;

      const response = await callGemini(state.geminiApiKey || state.groqApiKey!, prompt);

      const tableText = response || "No table generated.";
      const rows = parseSynthesisTable(tableText);
      setSynthesisTable(rows);
      setPipelineStep(2);
    } catch (err: any) {
      console.error("Synthesis table generation failed:", err);
      alert("Failed to generate synthesis table: " + (err?.message || String(err)));
    } finally {
      setSynthesisTableLoading(false);
    }
  };

  const parseSynthesisTable = (text: string): any[] => {
    const lines = text.split("\n");
    const rows: any[] = [];
    let inTable = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      if (/^|\s*[-]+\s*\|/.test(trimmed) || trimmed.includes("---")) continue;
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length >= 12) {
        rows.push({
          id: `synth-${rows.length}`,
          reference: cells[0] || "—",
          year: cells[1] || "—",
          setting: cells[2] || "—",
          population: cells[3] || "—",
          intervention: cells[4] || "—",
          comparison: cells[5] || "—",
          outcome: cells[6] || "—",
          sampleSize: cells[7] || "—",
          effectEstimate: cells[8] || "—",
          riskRatio: cells[9] || "—",
          studyType: cells[10] || "—",
          researchGaps: cells[11] || "—",
        });
      }
    }
    return rows;
  };

  const updateRobAssessment = (id: string, field: keyof RobAssessment, value: string) => {
    setRobAssessments((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return {
        ...prev,
        [id]: { ...existing, [field]: value },
      };
    });
  };

  const generateLocalSynthesis = () => {
    const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
    const template = getRobToolTemplate();
    const robLabel = robMode === "probast" ? "PROBAST + AI" : (template ? template.label : robTool);
    const isProbast = robMode === "probast";
    const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
    const yearMin = Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
    const yearMax = Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
    const studyTypes = Array.from(new Set(papersForSynthesis.map((p) => p.studyType))).filter(Boolean);
    const databases = Array.from(new Set(papersForSynthesis.map((p) => p.database))).filter(Boolean);

    const robOverallFor = (row: any) =>
      isProbast ? (probastAssessments[row.id]?.overallRob || "") : (robAssessments[row.id]?.overall || "");

    const robSummary = papersForSynthesis.reduce(
      (acc, row) => {
        const jl = robOverallFor(row).toLowerCase();
        if (!jl) { acc.pending += 1; return acc; }
        if (jl.includes("low") && !jl.includes("high")) acc.low += 1;
        else if (jl.includes("some concerns") || jl.includes("moderate") || jl.includes("unclear") || jl.includes("serious") && !jl.includes("critical")) acc.some += 1;
        else if (jl.includes("high") || jl.includes("critical") || jl.includes("very high")) acc.high += 1;
        else acc.pending += 1;
        return acc;
      },
      { low: 0, some: 0, high: 0, pending: 0 }
    );

    const heterogeneityNotes = studyTypes.length > 1
      ? "Studies span multiple design types, contributing to clinical/methodological heterogeneity."
      : `Heterogeneity should be assessed (I², τ²) using metafor/meta.`;

    const effectTable = effectSizes.length > 0
      ? effectSizes.map((r) => `| ${r.study} | ${r.effect} | ${r.ci} | ${r.weight} |`).join("\n")
      : papersForSynthesis.map((p) => `| ${p.authors} (${p.year}) | — | — | — |`).join("\n");

    const robMethodology = isProbast
      ? "PROBAST+AI (D1 Participants, D2 Predictors, D3 Outcome, D4 Analysis; applicability A1–A3) with PROBAST+AI colours"
      : `robvis template (${robLabel}) with Cochrane colours`;
    const methodsBlock = isMeta
      ? `**Synthesis method:** Random-effects meta-analysis (DerSimonian–Laird), implemented in **metafor** (R) or **meta** (R). Heterogeneity assessed via I² and τ². Certainty of evidence via GRADE/${isProbast ? "PROBAST+AI" : "robvis"} integration.\n\n**Risk of bias:** Per-domain ${robMethodology}.`
      : `**Synthesis method:** Narrative/thematic synthesis following **awesome-evidence-synthesis** principles: coding, theme development, and mapping.\n\n**Risk of bias:** Per-domain ${robMethodology}.`;

    const metaBlock = isMeta
      ? `\n### Meta-analysis Interpretation\n\nEffect estimates should be pooled using a random-effects model. Expected direction of effect: see effect table above. Heterogeneity: ${heterogeneityNotes} Use **forestplot**, **meta**, **metafor**, or **OpenMEE** for publication-ready figures.\n\n**Reporting:** Export effect table to **PRISMA 2020**-compliant format.\n`
      : "";

    return `## Evidence Synthesis\n**Review type:** ${reviewType}\n**Studies included:** ${papersForSynthesis.length}\n**Year range:** ${yearMin}–${yearMax}\n**Databases:** ${databases.join(", ") || "multiple"}\n\n---

${methodsBlock}\n\n---

### Narrative Summary\n\nThe body of evidence comprises ${papersForSynthesis.length} ${studyTypes.join(", ").toLowerCase() || "studies"} examining ${query || "the review topic"}. ${papersForSynthesis.length > 5 ? "Across the included studies, consistent themes emerge regarding the intervention/exposure and its association with the primary outcome." : "Findings should be interpreted with caution given the small number of included studies."}\n\n**Key findings by study:**\n${papersForSynthesis.map((p, i) => `${i + 1}. **${p.authors} (${p.year})** — ${p.title}\n   - Study type: ${p.studyType || "Not specified"}\n   - Outcome: ${p.outcome || "As reported"}\n   - Risk of bias: ${robMode === "probast" ? (probastAssessments[p.id]?.overallRob || "Pending (assess in Step 3)") : (robAssessments[p.id]?.overall || "Pending (assess in Step 3)")}`).join("\n\n")}\n\n---

### Effect Size Summary\n\n| Study | Effect Estimate | 95% CI | Weight |\n|-------|----------------|--------|--------|\n${effectTable}\n\n---

### Risk of Bias Commentary\n\nUsing **${robLabel}** (${isProbast ? "PROBAST+AI" : "robvis"}), the overall distribution of risk-of-bias judgments across ${papersForSynthesis.length} studies is: Low ${robSummary.low}, Some/Moderate concerns ${robSummary.some}, High/Critical ${robSummary.high}, Pending ${robSummary.pending}. ${robSummary.high > 0 ? "Studies at high risk of bias may overestimate effects; sensitivity analysis excluding these studies is recommended." : "No studies were rated at high risk of bias."} ${isProbast ? "Domain-level PROBAST+AI traffic-light plots (D1–D4 + applicability A1–A3) are available in the reporting step." : "Domain-level traffic-light plots are available in the reporting step."}\n\n---\n\n### Gaps and Future Directions\n\n- Unpublished or grey literature not searched in this run.\n- Subgroup analyses and meta-regression should be explored if heterogeneity is high.\n- Certainty of evidence (GRADE) should be formally assessed prior to guideline submission.\n- Sensitivity analysis excluding high-RoB studies recommended for robustness.\n\n> Generated locally using awesome-evidence-synthesis open-source workflow standards. For meta-analysis statistics, export the effect table to **R (metafor/meta)**, **JASP**, or **OpenMEE**.\n`;
  };

  const parseLiteratureReview = (text: string): Record<string, string> => {
    const sections: Record<string, string> = {
      introduction: "",
      globalIndian: "",
      gaps: "",
      futureAdvice: "",
      summary: "",
      references: "",
    };

    const lines = text.split("\n");
    let currentKey: string | null = null;
    let buffer: string[] = [];

    const assign = () => {
      if (!currentKey) return;
      const content = buffer.join("\n").trim();
      if (content && currentKey) {
        sections[currentKey] = content;
      }
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      let matched: string | null = null;

      if (/^(1\.\s*introduction|introduction|background|introduction\s*\/\s*background)$/i.test(trimmed)) matched = "introduction";
      else if (/^(2\.\s*global\s*&\s*indian\s*situation|global\s*&\s*indian\s*situation|global\s*indian|global\s+situation)$/i.test(trimmed)) matched = "globalIndian";
      else if (/^(3\.\s*research\s*gaps|research\s*gaps\s*\/\s*limitations|research\s*gaps|gaps\s*\/\s*limitations|gaps|limitations)$/i.test(trimmed)) matched = "gaps";
      else if (/^(4\.\s*advice\s*for\s*future\s*research|advice\s*for\s*future\s*research|future\s*research\s*advice|future\s*advice)$/i.test(trimmed)) matched = "futureAdvice";
      else if (/^(5\.\s*summary|summary|summary\s*of\s*all\s*studies)$/i.test(trimmed)) matched = "summary";
      else if (/^(6\.\s*references|references|bibliography)$/i.test(trimmed)) matched = "references";

      if (matched) {
        assign();
        currentKey = matched;
      } else {
        buffer.push(line);
      }
    }

    assign();
    return sections;
  };

  const generateLiteratureReview = async () => {
    const reviewPapers = robSelectedPaperIds.size > 0
      ? papers.filter((p) => robSelectedPaperIds.has(p.id))
      : papers.filter((p) => selectedPaperIds.has(p.id));

    if (reviewPapers.length === 0 && extractedData.length === 0) {
      alert("Please select papers in Risk of Bias Assessment first.");
      return;
    }
    const selectedPapers = reviewPapers;
    const references = selectedPapers
      .map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || p.database}.${p.doi ? ` doi:${p.doi}` : ""}`)
      .join("\n");

    setLiteratureReviewLoading(true);
    setLiteratureReviewSections({
      introduction: "",
      globalIndian: "",
      gaps: "",
      futureAdvice: "",
      summary: "",
      references: "",
    });
    try {
      const numberedRefs = selectedPapers
        .map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || p.database}.${p.doi ? ` doi:${p.doi}` : ""}`)
        .join("\n");

      const prompt = `You are an expert academic writer using deep reasoning methodology. Write a comprehensive, publication-ready narrative literature review based ONLY on the selected studies provided below.

Follow this exact structure and headings:
- Introduction / Background
- Problem Statement (with subsections: Global, South-East Asia, India)
- Research Gaps
- Future Studies to Be Carried Out
- Conclusion
- References

CITATION RULES:
- Cite papers inline using author-year in parentheses, e.g. (Smith 2020), (Jones et al 2022).
- The author-year MUST match one of the numbered references below.
- Aim for 2-4 inline citations per paragraph.

REFERENCES (use these exact author-year strings in your inline citations):
${selectedPapers.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || p.database}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

SELECTED STUDIES:
${selectedPapers.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType || "Not specified"}. Database: ${p.database}.${p.doi ? ` DOI: ${p.doi}` : ""}`).join("\n\n")}

EXTRACTED DATA:
${extractedData.filter((p) => selectedPapers.some((sp) => sp.id === p.id)).map((p) => `- ${p.title}: ${p.outcome || "Outcome not specified"}`).join("\n")}

DEEP REASONING RULES:
1. Think step-by-step before drafting each section.
2. Explicitly acknowledge conflicting or limited evidence.
3. Ensure global, South-East Asia, and India perspectives are all addressed where relevant.
4. Use ONLY author-year inline citations (Author Year). Include a complete References section at the end.

OUTPUT FORMAT:
Use plain text with these exact headings on their own lines:
Introduction / Background
Problem Statement (Global, South-East Asia, India)
Research Gaps
Future Studies to Be Carried Out
Conclusion
References

At the end, include a References section with all papers in Vancouver style:
1. Author(s) (Year). Title. Journal. doi:DOI`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setLiteratureReviewSections({
          introduction: "No API key configured. Please add your Gemini or Groq API key in Settings to generate the literature review.",
          globalIndian: "",
          gaps: "",
          futureAdvice: "",
          summary: "",
          references: references,
        });
         setLiteratureReviewLoading(false);
         return;
       }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      const parsed = parseLiteratureReview(cleaned);
      setLiteratureReviewSections({
        introduction: parsed.introduction || "",
        globalIndian: parsed.globalIndian || "",
        gaps: parsed.gaps || "",
        futureAdvice: parsed.futureAdvice || "",
        summary: parsed.summary || "",
        references: parsed.references || references,
      });
    } catch (err: any) {
      setLiteratureReviewSections({
        introduction: `Error generating review: ${err.message || "Unknown error"}. Please ensure your API key is valid and try again.`,
        globalIndian: "",
        gaps: "",
        futureAdvice: "",
        summary: "",
        references: references,
      });
    } finally {
      setLiteratureReviewLoading(false);
    }
  };

  const generateSynthesis = async () => {
    if (extractedData.length === 0) {
      alert("Please complete data extraction first.");
      return;
    }
    setSynthesisLoading(true);
    setSynthesisOutput("");
    try {
  const papersForSynthesis = extractedData
    .filter((p) => selectedPaperIds.has(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      studyType: p.studyType,
      outcome: p.outcome,
      ROB: p.ROB,
      notes: robAssessments[p.id]?.notes || "",
    }));

  const isNarrative = reviewType.includes("Narrative");
  const isSystematic = reviewType.includes("Systematic");
  const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
  const isScoping = reviewType.includes("Scoping");
  const isUmbrella = reviewType.includes("Umbrella");
  const isRapid = reviewType.includes("Rapid");
  const isMixed = reviewType.includes("Mixed Methods");
  const isDTA = reviewType.includes("Diagnostic Test Accuracy");

  const robToolNameForPrompt = robMode === "probast" ? "PROBAST + AI (D1 Participants, D2 Predictors, D3 Outcome, D4 Analysis; applicability A1–A3)" : `robvis (${getRobToolTemplate()?.label || robTool})`;
  const robForPrompt = (p: any) =>
    robMode === "probast"
      ? (probastAssessments[p.id]?.overallRob || p.ROB || "Pending")
      : (robAssessments[p.id]?.overall || p.ROB || "Pending");

  const prompt = `You are an expert evidence synthesis researcher using methods from the awesome-evidence-synthesis toolkit (metafor, meta, metaumbrella, ${robMode === "probast" ? "PROBAST+AI" : "robvis"}, PRISMA 2020).

REVIEW TYPE: ${reviewType}

RISK OF BIAS TOOL IN USE (from Step 3): ${robToolNameForPrompt}
- Use this tool's framework and terminology consistently when discussing risk of bias across the synthesis, narrative, and reporting.

USER REQUIREMENTS:
${reviewRequirements || "No specific requirements provided."}

SYNTHESIS INSTRUCTIONS:
${synthesisInstructions || "Use standard systematic review methodology appropriate for the review type."}

EXTRACTED STUDIES:
${papersForSynthesis.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType}. Outcome: ${p.outcome}. RoB (${robMode === "probast" ? "PROBAST+AI" : "robvis"}): ${robForPrompt(p)}.${p.notes ? ` Notes: ${p.notes}` : ""}`).join("\n\n")}

REQUIREMENTS:
1. Summarize the body of evidence thematically or narratively as appropriate for the review type
2. Note heterogeneity (clinical, methodological, statistical)
3. Summarize effect sizes where available (or state if not extractable)
4. Acknowledge risk-of-bias patterns
5. Provide a forest-plot-ready effect-size table with columns: Study, Effect Estimate, 95% CI, Weight
6. Include PRISMA-compliant narrative structure (for reviews where PRISMA applies)
7. Reference tools: metafor, meta, metaumbrella, robvis, forestplot, PRISMA 2020
${isMeta ? "8. Provide meta-analysis interpretation: fixed vs random effects, heterogeneity statistics (I², τ²), certainty of evidence" : ""}

OUTPUT FORMAT:
${isNarrative ? `## Evidence Synthesis

### Narrative Summary

[Title]: [Research Topic] — A Narrative Systematic Review
[Subtitle line]: Prepared to inform [protocol or study name]

#### 1. Background and Rationale
[Context, pathophysiology, and rationale for the review]

#### 2. Objective
[Stated objectives of the narrative review]

#### 3. Methods and a Note on Scope
[Search strategy, databases, date range, inclusion/exclusion criteria, quality assessment approach, and explicit caveat about narrative synthesis vs formal PRISMA-registered systematic review]

#### 4. Findings by Predictor Category
[Organize findings into numbered subsections relevant to the research question, e.g.:]

##### 4.1 [Category 1]
[Synthesis of evidence for this category]

##### 4.2 [Category 2]
[Synthesis of evidence for this category]

##### 4.3 [Category 3]
[Synthesis of evidence for this category]

#### 5. Population-Specific Evidence
[Evidence specific to the target population or subgroup]

#### 6. Comparative Summary
| Category | Representative markers | Key reported strength | Relevant limitation |
|----------|----------------------|----------------------|---------------------|
| ... | ... | ... | ... |

#### 7. Relevance to [Protocol/Study Name]
[Direct implications for the protocol or study under development]

#### 8. Limitations of This Review
[Explicit limitations of the narrative synthesis approach]

### References
[Complete Vancouver-style reference list with DOIs]` : (isSystematic || isMeta) ? `## Evidence Synthesis

### Narrative Summary

[Complete systematic review manuscript in the following format:]

# [Research Topic]: A Systematic Review

## Abstract

**Background:** [Context and significance]

**Objective:** [Stated objectives using PICO framework]

**Methods:** [Search strategy, databases, date range, inclusion/exclusion criteria, quality assessment approach, and data synthesis method]

**Results:** [Number of studies included, key findings summary]

**Conclusion:** [Summary statement and implications]

## 1. Introduction

### 1.1 Background and Significance
[Context and rationale for the review]

### 1.2 Epidemiology and Global Burden
[Epidemiological data and burden of disease]

### 1.3 Pathophysiological Mechanisms
[Underlying mechanisms if applicable]

### 1.4 Risk Factors and Clinical Outcomes
[Risk factors and associated outcomes]

### 1.5 Current Guidelines and Knowledge Gaps
[Current guidelines and identified gaps]

## 2. Methods

### 2.1 Eligibility Criteria (PICOS)
[Population, Intervention/Exposure, Comparator, Outcomes, Study Design]

### 2.2 Search Strategy
[Databases searched, search terms, date range, any limitations]

### 2.3 Data Extraction and Quality Assessment
[Extraction process, quality assessment tools used]

### 2.4 Data Synthesis and Statistical Analysis
[Synthesis approach, meta-analysis methods if applicable, heterogeneity assessment]

## 3. Results

### 3.1 Study Selection and Characteristics
[PRISMA flow, Table 1 with study characteristics]

### 3.2 Risk of Bias Assessment
[Summary of risk of bias across studies]

### 3.3 Primary Outcomes
[Main findings organized thematically]

### 3.4 Secondary Outcomes
[Secondary findings]

### 3.5 Subgroup and Sensitivity Analyses
[Subgroup and sensitivity analyses if applicable]

## 4. Discussion

### 4.1 Principal Findings
[Summary of main findings]

### 4.2 Strengths and Limitations
[Review strengths and limitations]

### 4.3 Implications for Practice and Future Research
[Clinical implications and research priorities]

## 5. Conclusion
[Concluding statement]

## References
[Complete Vancouver-style reference list with DOIs]` : isScoping ? `## Evidence Synthesis

### Narrative Summary
[Thematic mapping of evidence]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Gaps and Future Directions
[Remaining uncertainties]` : isUmbrella ? `## Evidence Synthesis

### Narrative Summary
[Overview of systematic reviews and meta-analyses]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Gaps and Future Directions
[Remaining uncertainties]` : isRapid ? `## Evidence Synthesis

### Narrative Summary
[Streamlined synthesis of findings]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Gaps and Future Directions
[Remaining uncertainties]` : isMixed ? `## Evidence Synthesis

### Narrative Summary
[Integrated quantitative and qualitative synthesis]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Gaps and Future Directions
[Remaining uncertainties]` : isDTA ? `## Evidence Synthesis

### Narrative Summary
[Diagnostic test accuracy synthesis]

### Effect Size Summary
| Study | Sensitivity | Specificity | AUC |
|-------|-------------|-------------|-----|
| ... | ... | ... | ... |

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Gaps and Future Directions
[Remaining uncertainties]` : `## Evidence Synthesis

### Narrative Summary
[Thematic synthesis of findings]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Meta-analysis Interpretation
[Fixed vs random effects, heterogeneity, certainty]

### Gaps and Future Directions
[Remaining uncertainties]`}`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        const localOutput = generateLitLLMSynthesis(
          papers.filter((p) => selectedPaperIds.has(p.id)),
          reviewType,
          query,
          reviewRequirements,
          synthesisInstructions
        );
        setSynthesisOutput(localOutput);
        const tableLines = localOutput.split("\n").filter((l) => l.includes("|") && !l.includes("---"));
        const resultRows = tableLines.slice(1).map((l) => {
          const parts = l.split("|").map((s) => s.trim()).filter(Boolean);
          if (parts.length < 4) return null;
          return { study: parts[0] || "", effect: parts[1] || "", ci: parts[2] || "", weight: parts[3] || "" };
        }).filter((r): r is { study: string; effect: string; ci: string; weight: string } => r !== null);
        if (resultRows.length > 0) setEffectSizes(resultRows);
        setSynthesisLoading(false);
        return;
      }

          let text: string;
          const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
          if (state.geminiApiKey) {
            text = await callGemini(state.geminiApiKey, prompt, searchOptions);
          } else if (state.groqApiKey) {
            text = await callGroq(state.groqApiKey!, prompt, searchOptions);
         } else {
           throw new Error("No API key configured. Please open Settings (gear icon).");
         }

        const cleaned = text.replace(/```markdown/g, "").replace(/```/g, "").trim();
        setSynthesisOutput(cleaned);

      const tableMatch = cleaned.match(/\| Study[\s\S]*?\|/);
      if (tableMatch) {
        const lines = cleaned.split("\n").filter((l) => l.includes("|") && !l.includes("---"));
        const rows = lines.slice(1).map((l) => {
          const parts = l.split("|").map((s) => s.trim()).filter(Boolean);
          return {
            study: parts[0] || "",
            effect: parts[1] || "",
            ci: parts[2] || "",
            weight: parts[3] || "",
          };
        });
        if (rows.length > 0) setEffectSizes(rows);
      }
    } catch (err: any) {
      setSynthesisOutput(`## Evidence Synthesis\n\n**Error generating synthesis:** ${err.message || "Unknown error"}\n\nPlease try again, adjust your instructions, or use local synthesis (no API key required).`);
    } finally {
      setSynthesisLoading(false);
    }
  };

  const updateEffectSize = (index: number, field: string, value: string) => {
    setEffectSizes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const generateManuscript = async () => {
    if (extractedData.length === 0) {
      alert("Please complete data extraction first.");
      return;
    }
    setManuscriptLoading(true);
    setManuscript("");
    setReviewReport("");
    setFinalManuscript("");
    try {
      const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
      const prompt = buildAcademicWritingManuscriptPrompt({
        topic: query || "the research topic",
        reviewType,
        papersForSynthesis: papersForSynthesis.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          studyType: p.studyType,
          outcome: p.outcome,
          ROB: p.ROB,
          notes: robAssessments[p.id]?.notes || "",
        })),
        extractedData,
        synthesisOutput,
        effectSizes,
        robAssessments,
        robTool,
        robMode,
        reviewRequirements,
        synthesisInstructions,
        prismaCounts: {
          identification: totalIdentified || papers.length,
          deduped: dedupedCount || papers.length,
          screened: selectedPaperIds.size,
          excluded: Math.max(0, selectedPaperIds.size - extractedData.length),
          assessed: extractedData.length,
          included: extractedData.length || effectSizes.length,
        },
        selectedDbs,
        query,
      });

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setManuscript(`# ${reviewType}: ${query || "the research topic"}\n\n## Abstract\n\nNo API key configured. Please add your Gemini or Groq API key in Settings to generate the AI-powered manuscript using the Academic Writing Agents methodology.\n\n## References\n\n1. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement. BMJ. 2021;372:n71.\n`);
         setManuscriptLoading(false);
         return;
       }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setManuscript(cleaned);
    } catch (err: any) {
      setManuscript(`# Error\n\n**Failed to generate manuscript:** ${err.message || "Unknown error"}\n\nPlease complete Steps 1–5 and try again.`);
    } finally {
      setManuscriptLoading(false);
    }
  };

  const generateReview = async () => {
    if (!manuscript) {
      alert("Please generate a manuscript first before running the review.");
      return;
    }
    setReviewLoading(true);
    setReviewReport("");
    setFinalManuscript("");
    try {
      const prompt = buildAcademicWritingReviewPrompt({ manuscript });
      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setReviewReport("No API key configured. Please add your Gemini or Groq API key in Settings to run the Academic Writing Agents review.");
        setReviewLoading(false);
        return;
      }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: false, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setReviewReport(cleaned);
    } catch (err: any) {
      setReviewReport(`# Error\n\n**Failed to generate review:** ${err.message || "Unknown error"}\n\nPlease ensure your API key is valid and try again.`);
    } finally {
      setReviewLoading(false);
    }
  };

  const incorporateReviewAndRegenerate = async () => {
    if (!manuscript || !reviewReport) {
      alert("Please generate both a manuscript and a review report first.");
      return;
    }
    setFinalManuscriptLoading(true);
    setFinalManuscript("");
    try {
      const prompt = buildIncorporateReviewPrompt({
        manuscript,
        reviewReport,
        reviewType,
        topic: query || "the research topic",
      });

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setFinalManuscript("No API key configured. Please add your Gemini or Groq API key in Settings to regenerate the final manuscript.");
        setFinalManuscriptLoading(false);
        return;
      }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: false, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setFinalManuscript(cleaned);
    } catch (err: any) {
      setFinalManuscript(`# Error\n\n**Failed to regenerate final manuscript:** ${err.message || "Unknown error"}\n\nPlease ensure your API key is valid and try again.`);
    } finally {
      setFinalManuscriptLoading(false);
    }
  };

  const generateStormDraft = async () => {
    if (extractedData.length === 0) {
      alert("Please complete data extraction first.");
      return;
    }
    setStormLoading(true);
    setStormDraft("");
    setStormReview("");
    setStormFinal("");
    try {
      const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
      const prompt = buildSTORMOutlinePrompt({
        topic: query || "the research topic",
        reviewType,
        papers: papersForSynthesis.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          studyType: p.studyType,
          outcome: p.outcome,
          abstract: p.abstract || "",
        })),
        extractedData,
        synthesisOutput,
        effectSizes,
        robAssessments,
        prismaCounts: {
          identification: totalIdentified || papers.length,
          deduped: dedupedCount || papers.length,
          screened: selectedPaperIds.size,
          excluded: Math.max(0, selectedPaperIds.size - extractedData.length),
          assessed: extractedData.length,
          included: extractedData.length || effectSizes.length,
        },
        query,
      });

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setStormDraft("# STORM Draft\n\nNo API key configured. Please add your Gemini or Groq API key in Settings to generate the STORM research-paper draft.\n\n## References\n\n1. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement. BMJ. 2021;372:n71.\n");
        setStormLoading(false);
        return;
      }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setStormDraft(cleaned);
    } catch (err: any) {
      setStormDraft(`# Error\n\n**Failed to generate STORM draft:** ${err.message || "Unknown error"}\n\nPlease complete Steps 1–5 and try again.`);
    } finally {
      setStormLoading(false);
    }
  };

  const runStormReview = async () => {
    if (!stormDraft) {
      alert("Please generate a STORM draft first before running the review.");
      return;
    }
    setStormReviewLoading(true);
    setStormReview("");
    setStormFinal("");
    try {
      const prompt = buildSTORMReviewPrompt({ draft: stormDraft, topic: query || "the research topic" });
      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setStormReview("No API key configured. Please add your Gemini or Groq API key in Settings to run the STORM self-review.");
        setStormReviewLoading(false);
        return;
      }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: false, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setStormReview(cleaned);
    } catch (err: any) {
      setStormReview(`# Error\n\n**Failed to generate STORM review:** ${err.message || "Unknown error"}\n\nPlease ensure your API key is valid and try again.`);
    } finally {
      setStormReviewLoading(false);
    }
  };

  const incorporateStormReview = async () => {
    if (!stormDraft || !stormReview) {
      alert("Please generate both a STORM draft and a review first.");
      return;
    }
    setStormFinalLoading(true);
    setStormFinal("");
    try {
      const prompt = `You are STORM (Synthesis of Topic Outlines through Research and Multi-perspective Questioning). Incorporate the review feedback below into the research-paper draft and produce a final polished version.

## Original Draft
${stormDraft}

## Review Feedback
${stormReview}

## Instructions
- Address every point raised in the review
- Maintain the academic tone and structure
- Do not remove any required sections (Title Page, Abstract, Introduction, Methods, Results, Discussion, Conclusion, References, Self-Review Checklist)
- Output the complete final draft in Markdown
`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setStormFinal("No API key configured. Please add your Gemini or Groq API key in Settings to regenerate the final STORM draft.");
        setStormFinalLoading(false);
        return;
      }

      let text: string;
      const searchOptions: AICallOptions = { searchEnabled: false, searchQuery: query };
      if (state.geminiApiKey) {
        text = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        text = await callGroq(state.groqApiKey!, prompt, searchOptions);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = text.replace(/```/g, "").trim();
      setStormFinal(cleaned);
    } catch (err: any) {
      setStormFinal(`# Error\n\n**Failed to regenerate final STORM draft:** ${err.message || "Unknown error"}\n\nPlease ensure your API key is valid and try again.`);
    } finally {
      setStormFinalLoading(false);
    }
  };

  const downloadManuscript = () => {
    if (!manuscript) return;
    const blob = new Blob([manuscript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `manuscript-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const prismaCounts = {
    identification: totalIdentified || papers.length,
    deduped: dedupedCount || papers.length,
    screened: selectedPaperIds.size,
    excluded: Math.max(0, selectedPaperIds.size - extractedData.length),
    assessed: extractedData.length,
    included: extractedData.length || effectSizes.length,
  };

  const downloadPrismaCsv = () => {
    const template = getRobToolTemplate();
    const rows = [
      ["Stage", "Count", "Source Database(s)", "Notes"],
      ["Identification (Records identified from databases)", prismaCounts.identification, selectedDbs.join("; "), `Search: "${query || 'unspecified'}"`],
      ["Identification (Records identified from registers)", 0, "—", "No register searched"],
      ["Deduplication (Records after duplicates removed)", prismaCounts.deduped, selectedDbs.join("; "), "Automated DOI+title deduplication"],
      ["Screening (Records screened)", prismaCounts.screened, selectedDbs.join("; "), "Title/abstract screening"],
      ["Excluded (Records excluded after screening)", prismaCounts.excluded, "—", `Reason: not meeting inclusion criteria (${prismaCounts.excluded})`],
      ["Reports assessed for eligibility", prismaCounts.assessed, "—", "Full-text assessment"],
      ["Excluded (Reports excluded after eligibility)", Math.max(0, prismaCounts.assessed - effectSizes.length), "—", "Not meeting final inclusion criteria"],
      ["Studies included in qualitative synthesis (" + reviewType + ")", prismaCounts.included, "—", extractedData.length + " studies"],
      ...(reviewType.includes("Meta-analysis") || reviewType.includes("Meta")
        ? [["Studies included in quantitative synthesis (meta-analysis)", effectSizes.length || extractedData.length, "—", `Tool: metafor / meta / forestplot`]]
        : [["Studies included in narrative synthesis", prismaCounts.included, "—", `${extractedData.length} studies`]]),
      ["Risk of Bias Assessment", extractedData.length, `Tool: ${robMode === "probast" ? "PROBAST + AI" : (template?.label || robTool)}`, robMode === "probast" ? "PROBAST+AI methodology (probast.org/probast_ai)" : "robvis methodology (mcguinlu/robvis)"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PRISMA2020-flow-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadRoses = () => {
    const template = getRobToolTemplate();
    const roseEntries = [
      ["Section", "Item", "Response"],
      ["TITLE", "1. Title (structured abstract, max 250 words)", "Systematic " + reviewType.toLowerCase() + ": " + (query || "unspecified topic")],
      ["ABSTRACT", "2a. Background", "See synthesis summary"],
      ["ABSTRACT", "2b. Methods", `Databases: ${selectedDbs.join(", ")} | Tool: ${template?.label || robTool}`],
      ["ABSTRACT", "2c. Results", `${extractedData.length} studies included | See synthesis summary`],
      ["ABSTRACT", "2d. Conclusion", "See synthesis summary"],
      ["INTRODUCTION", "3. Rationale", `${query || 'Systematic review'} — conducted to synthesize evidence`],
      ["INTRODUCTION", "4. Objective(s)", `Synthesize evidence on: ${query || 'see review protocol'}`],
      ["METHODS", "5. Eligibility criteria", `Study types: ${studyTypeFilter === "All Study Types" ? "All" : studyTypeFilter}`],
      ["METHODS", "6. Information sources", selectedDbs.join(", ")],
      ["METHODS", "7. Search strategy", `Boolean AND/OR logic; year range: ${yearFrom || "any"}–${yearTo || "any"}`],
      ["METHODS", "8. Screening", "Title/abstract → full-text (AI-assisted + manual curation)"],
      ["METHODS", "9. Data extraction", `Extracted fields: title, authors, year, studyType, population, intervention, outcome, ROB`],
      ["METHODS", "10. Risk of bias assessment", `Tool: ${robMode === "probast" ? "PROBAST + AI" : (template?.label || robTool)} | ${robMode === "probast" ? "PROBAST+AI methodology (probast.org/probast_ai)" : "robvis methodology"}`],
      ...(reviewType.includes("Meta-analysis") || reviewType.includes("Meta")
        ? [["METHODS", "11. Effect measures", "See extracted effect sizes (metafor / forestplot ready)"],
           ["METHODS", "12. Synthesis methods", "Random-effects meta-analysis (DerSimonian-Laird)"],
           ["METHODS", "13. Risk of bias across studies", `Per-domain ${robMode === "probast" ? "PROBAST+AI" : "robvis"} traffic-light + ${robMode === "probast" ? "applicability" : "Cochrane"} summary`],
           ["METHODS", "14. Additional analyses", "None specified"]]
        : [["METHODS", "11. Synthesis methods", "Narrative synthesis (thematic)"],
           ["METHODS", "12. Risk of bias across studies", `Per-domain ${robMode === "probast" ? "PROBAST+AI" : `robvis: ${template?.label || robTool}`}`],
           ["METHODS", "13. Additional analyses", "None specified"]]),
      ["RESULTS", "15. Study selection", `Identification: ${prismaCounts.identification} → Included: ${prismaCounts.included}`],
      ["RESULTS", "16. Study characteristics", `${extractedData.length} studies — see data extraction table`],
      ["RESULTS", "17. Risk of bias results", `Domain-level judgments — see ${robMode === "probast" ? "PROBAST+AI" : "robvis"} area plot + traffic light table`],
      ["RESULTS", "18. Synthesis of results", synthesisOutput ? "AI-generated — see synthesis section" : "Not yet generated"],
      ...(reviewType.includes("Meta-analysis") || reviewType.includes("Meta")
        ? [["RESULTS", "19. Risk of bias across studies", "See prisma section (bias by domain, count by judgment)"]]
        : []),
    ];
    const csv = roseEntries.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ROSES-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadRobCsv = () => {
    const template = getRobToolTemplate();
    const domainCols = template ? template.domains.map((d) => d.id) : [];
    const header = ["Study", "Title", "Year", ...domainCols, "Overall", "Notes"];
    const rows = [
      header,
      ...extractedData.map((row) => {
        const a = robAssessments[row.id];
        return [
          row.id,
          row.title,
          row.year,
          ...domainCols.map((d) => a?.domains[d]?.judgment || "No information"),
          a?.overall || "Pending",
          a?.notes || "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `risk-of-bias-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadProbastCsv = () => {
    const robCols = PROBAST_ROB_DOMAINS.map((d) => d.id);
    const appCols = PROBAST_APPLICABILITY_DOMAINS.map((d) => d.id);
    const header = ["Study", "Title", "Year", ...robCols, "Overall RoB", ...appCols, "Overall Applicability", "Notes"];
    const rows = [
      header,
      ...extractedData.map((row) => {
        const a = probastAssessments[row.id];
        return [
          row.id,
          row.title,
          row.year,
          ...robCols.map((d) => a?.domains[d]?.judgment || "Unclear"),
          a?.overallRob || "Unclear",
          ...appCols.map((d) => a?.applicability[d]?.judgment || "Unclear"),
          a?.overallApplicability || "Unclear",
          a?.notes || "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `probast-ai-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={20} className="text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Evidence Synthesis & Meta-analysis</h2>
        </div>
        <p className="text-sm text-blue-300 mb-6">
          Guided workflow derived from <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> and enhanced with <a href="https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills" target="_blank" rel="noreferrer" className="text-yellow-300 underline">OpenClaw-Medical-Skills</a> (literature-review, literature-deep-research, scientific-writing, research-paper-writing) and <a href="https://github.com/andrehuang/academic-writing-agents" target="_blank" rel="noreferrer" className="text-yellow-300 underline">academic-writing-agents</a>: unified multi-database search across PubMed, OpenAlex, Europe PMC, Crossref, arXiv, bioRxiv, medRxiv, and other open academic platforms, AI-assisted screening, structured data extraction, risk-of-bias assessment, meta-analysis, and PRISMA-compliant reporting.
        </p>

        <div className="flex items-center gap-2 mb-6 bg-blue-950/60 rounded-lg p-1.5 overflow-x-auto">
          {PIPELINE_STEPS.map((s) => (
            <React.Fragment key={s.num}>
              <button
                onClick={() => setPipelineStep(s.num)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  pipelineStep === s.num
                    ? "bg-blue-600 text-white shadow"
                    : pipelineStep > s.num
                    ? "bg-blue-900/40 text-blue-300"
                    : "bg-transparent text-blue-500"
                }`}
              >
                <s.icon size={14} />
                {s.label}
              </button>
              {s.num < PIPELINE_STEPS.length && <div className="text-blue-600"><ChevronRight size={14} /></div>}
            </React.Fragment>
          ))}
        </div>

        {pipelineStep === 1 && (
          <EvidenceSynthesisStep1
            databases={SR_DATABASES}
            query={query}
            onQueryChange={setQuery}
            selectedDbs={selectedDbs}
            onToggleDb={toggleDb}
            onSelectAllDbs={selectAllDbs}
            onDeselectAllDbs={deselectAllDbs}
            papers={papers}
            selectedPaperIds={selectedPaperIds}
            onTogglePaper={togglePaper}
            onSelectAllPapers={selectAll}
            loading={loading}
            searchError={searchError}
            perDatabaseResults={perDatabaseResults}
            totalIdentified={totalIdentified}
            dedupedCount={dedupedCount}
            yearFrom={yearFrom}
            onYearFromChange={setYearFrom}
            yearTo={yearTo}
            onYearToChange={setYearTo}
            searchLogic={searchLogic}
            onSearchLogicChange={setSearchLogic}
            studyTypeFilter={studyTypeFilter}
            onStudyTypeFilterChange={setStudyTypeFilter}
            onSearch={handleSearch}
            onProceed={() => setPipelineStep(2)}
            onClearFilters={() => { setYearFrom(""); setYearTo(""); setStudyTypeFilter("All Study Types"); }}
            showVerifiedOnly={showVerifiedOnly}
             onShowVerifiedOnlyChange={setShowVerifiedOnly}
             citationValidationCounts={{
               verified: papers.filter((p) => p.citationStatus === "verified").length,
               unverified: papers.filter((p) => p.citationStatus === "unverified").length,
               noDoi: papers.filter((p) => p.citationStatus === "no-doi").length,
             }}
           />
        )}

        {pipelineStep === 2 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">Data Extraction</h3>
              <p className="text-sm text-blue-300 mb-4">
                Structured extraction aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> data-extraction guidance. Fields below can be fed into meta-analysis packages such as <em>meta</em>, <em>metafor</em>, or <em>metaumbrella</em>.
              </p>
              <button onClick={runExtraction} disabled={extractionLoading} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg disabled:opacity-50">
                {extractionLoading ? "Extracting..." : "Auto-Extract from Selected Papers"}
              </button>
            </div>
             {extractedData.length > 0 && (
               <div className="overflow-x-auto">
                 <table className="w-full border-collapse text-sm">
                   <thead>
                     <tr className="bg-blue-900/60 text-left">
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Vancouver style reference with DOI &amp; Searchable</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Year</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Population</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Intervention</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Comparison</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Outcome</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Sample Size</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Effect Estimate</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">95% CI</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study Type</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">ROB</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Research Gaps</th>
                       <th className="border border-blue-800 px-3 py-2 text-yellow-200">Evidence Level</th>
                     </tr>
                   </thead>
                   <tbody>
                     {extractedData.map((row) => (
                       <tr key={row.id} className="hover:bg-blue-900/20">
                         <td className="border border-blue-800 px-3 py-2 text-blue-100" dangerouslySetInnerHTML={{ __html: row.vancouverReference || "" }} />
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.title}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.year}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.population || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.intervention || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.comparison || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.outcome || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.sampleSize || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.effectEstimate || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.ci || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.studyType || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.ROB || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.researchGaps || "—"}</td>
                         <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.evidenceLevel || "—"}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
             <div className="flex justify-end">
              <button onClick={() => setPipelineStep(3)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Risk of Bias
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {pipelineStep === 3 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Risk of Bias Assessment</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs text-blue-300 mr-1">Assessment tool:</span>
                <button
                  onClick={() => setRobMode("robvis")}
                  className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border ${robMode === "robvis" ? "bg-yellow-500 text-[#0a1a3a] border-yellow-500 font-bold" : "bg-blue-900/50 text-blue-200 border-blue-700/50 hover:bg-blue-800/60"}`}
                >
                  <ClipboardList size={12} /> robvis (Cochrane)
                </button>
                <button
                  onClick={() => setRobMode("probast")}
                  className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border ${robMode === "probast" ? "bg-yellow-500 text-[#0a1a3a] border-yellow-500 font-bold" : "bg-blue-900/50 text-blue-200 border-blue-700/50 hover:bg-blue-800/60"}`}
                >
                  <Bot size={12} /> PROBAST + AI
                </button>
                <a href="https://www.probast.org/probast_ai/downloads/" target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 underline ml-1">About PROBAST+AI</a>
              </div>

              {robMode === "robvis" && (
               <>
               <p className="text-xs text-blue-400 mb-4">
                 Auto-assessment uses robvis tool templates. Select papers using the checkboxes and click <strong>Re-assess</strong> (or edit any cell) to override heuristic judgments with manual ratings. Use <strong>Select All</strong> to toggle all papers.
               </p>

               <div className="mb-3 flex flex-wrap items-center gap-2">
                 <button
                   onClick={autoAssessRob}
                   className="flex items-center gap-1.5 text-[11px] bg-emerald-900/50 text-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-800/60 border border-emerald-700/50"
                 >
                   <Sparkles size={12} /> Re-assess with robvis template
                 </button>
                 <button
                   onClick={selectAllRobPapers}
                   className="text-[11px] bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-800/60 border border-blue-700/50"
                 >
                   {robSelectedPaperIds.size === extractedData.length && extractedData.length > 0 ? "Deselect All" : "Select All"}
                 </button>
                 <span className="text-[10px] text-blue-400">
                   Tool: {(() => { const t = getRobToolTemplate(); return t ? t.label : robTool; })()}
                   &nbsp;·&nbsp;{extractedData.length} studies · {robSelectedPaperIds.size} selected for review
                 </span>
               </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Assessment Tool</label>
                  <select
                    value={robTool}
                    onChange={(e) => setRobTool(e.target.value)}
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    {ROB_TOOL_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Assessor Instructions</label>
                  <textarea
                    value={robInstructions}
                    onChange={(e) => setRobInstructions(e.target.value)}
                    placeholder="e.g., use ROB2 for RCTs, ROBINS-I for quasi-experimental; focus on blinding and allocation concealment..."
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 min-h-[60px]"
                  />
                </div>
              </div>

              {(() => {
                const template = getRobToolTemplate();
                if (!template) return null;
                return (
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                       <thead>
                         <tr className="bg-blue-900/60 text-left">
                           <th className="border border-blue-800 px-2 py-2 text-yellow-200 sticky left-0 bg-blue-900/90 z-10">
                             <input
                               type="checkbox"
                               checked={robSelectedPaperIds.size === extractedData.length && extractedData.length > 0}
                               onChange={selectAllRobPapers}
                               className="rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                             />
                           </th>
                           <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                          {template.domains.map((d) => (
                            <th key={d.id} className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[100px]" title={d.label}>
                              {d.id}
                            </th>
                          ))}
                          <th className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[100px]">Overall</th>
                          <th className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[120px]">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedData.map((row) => {
                          const assessment = robAssessments[row.id];
                          if (!assessment) return null;
                          return (
                            <tr key={row.id} className="hover:bg-blue-900/20">
                              <td className="border border-blue-800 px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={robSelectedPaperIds.has(row.id)}
                                  onChange={() => toggleRobPaper(row.id)}
                                  className="rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                                />
                              </td>
                              <td className="border border-blue-800 px-3 py-2 text-blue-100">
                                <span className="truncate block max-w-[200px]" title={row.title}>{row.title}</span>
                                <span className="text-[10px] text-blue-400">{row.authors} ({row.year})</span>
                              </td>
                              {template.domains.map((d) => {
                                const judgment = assessment.domains[d.id]?.judgment || "No information";
                                return (
                                  <td key={d.id} className="border border-blue-800 px-1 py-1.5 text-center">
                                    <span
                                      className="block rounded-sm cursor-pointer"
                                      style={{
                                        backgroundColor: getRobJudgmentColor(judgment),
                                        opacity: judgment === "No information" ? 0.5 : 1,
                                        width: 28,
                                        height: 18,
                                        margin: "0 auto",
                                      }}
                                      title={`${d.id}: ${judgment}`}
                                    />
                                    <select
                                      value={judgment}
                                      onChange={(e) => updateRobDomain(row.id, d.id, e.target.value)}
                                      className="mt-1 bg-blue-950 border border-blue-700 text-white rounded px-1 py-0.5 w-full text-[10px] focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                    >
                                      {template.judgments.map((j) => (
                                        <option key={j} value={j}>{j}</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              })}
                              <td className="border border-blue-800 px-1 py-1.5 text-center">
                                <select
                                  value={assessment.overall}
                                  onChange={(e) => updateRobOverall(row.id, e.target.value)}
                                  className="bg-blue-950 border border-blue-700 text-white rounded px-1 py-1 w-full text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                >
                                  {template.judgments.map((j) => (
                                    <option key={j} value={j}>{j}</option>
                                  ))}
                                </select>
                                <span
                                  className="block rounded-sm mt-1"
                                  style={{
                                    backgroundColor: getRobJudgmentColor(assessment.overall),
                                    width: 28,
                                    height: 18,
                                    margin: "0 auto",
                                  }}
                                  title={`Overall: ${assessment.overall}`}
                                />
                              </td>
                              <td className="border border-blue-800 px-1 py-1.5">
                                <input
                                  type="text"
                                  value={assessment.notes}
                                  onChange={(e) => updateRobNotes(row.id, e.target.value)}
                                  placeholder="Notes..."
                                  className="bg-blue-950 border border-blue-700 text-white rounded px-1 py-1 w-full text-[10px] placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between">
                <div className="text-xs text-blue-400">
                  {extractedData.length} studies · {(() => { const t = getRobToolTemplate(); return t ? `${t.domains.length} domains` : ''; })()}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveRobAssessments} className="flex items-center gap-2 bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 text-sm">
                    <Save size={14} />
                    Save Assessments
                  </button>
                  <button onClick={() => setPipelineStep(4)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                    Proceed to Synthesis & Meta-analysis
                    <FlaskConical size={16} />
                  </button>
                </div>
              </div>
              </>
              )}

              {robMode === "probast" && (
                <>
                  <p className="text-xs text-blue-400 mb-4">
                    PROBAST+AI assesses risk of bias and applicability of prediction-model studies (including AI/ML models). Four risk-of-bias domains (Participants, Predictors, Outcome, Analysis) and three applicability domains. Click <strong>Auto-assess</strong> for a heuristic baseline or <strong>Run PROBAST+AI Assessment</strong> for an AI-assisted verdict (needs an API key in Settings).
                  </p>

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={autoAssessProbast}
                      className="flex items-center gap-1.5 text-[11px] bg-emerald-900/50 text-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-800/60 border border-emerald-700/50"
                    >
                      <Sparkles size={12} /> Auto-assess (PROBAST heuristic)
                    </button>
                    <button
                      onClick={runProbastAi}
                      disabled={probastAiLoading || extractedData.length === 0}
                      className="flex items-center gap-1.5 text-[11px] bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-800/60 border border-blue-700/50 disabled:opacity-50"
                    >
                      {probastAiLoading ? (<><Loader2 size={12} className="animate-spin" /> Assessing...</>) : (<><Bot size={12} /> Run PROBAST+AI Assessment</>)}
                    </button>
                    <span className="text-[10px] text-blue-400">{extractedData.length} studies</span>
                  </div>

                  {extractedData.length > 0 && (
                    <div className="mb-4 overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-blue-900/60 text-left">
                            <th className="border border-blue-800 px-3 py-2 text-yellow-200 sticky left-0 bg-blue-900/90 z-10">Study</th>
                            {PROBAST_ROB_DOMAINS.map((d) => (
                              <th key={d.id} className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[110px]" title={d.label}>{d.id}</th>
                            ))}
                            <th className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[110px]">Overall RoB</th>
                            {PROBAST_APPLICABILITY_DOMAINS.map((d) => (
                              <th key={d.id} className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[110px]" title={d.label}>{d.id}</th>
                            ))}
                            <th className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[110px]">Applicability</th>
                            <th className="border border-blue-800 px-2 py-2 text-yellow-200 min-w-[120px]">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extractedData.map((row) => {
                            const a = probastAssessments[row.id];
                            if (!a) return null;
                            return (
                              <tr key={row.id} className="hover:bg-blue-900/20">
                                <td className="border border-blue-800 px-3 py-2 text-blue-100">
                                  <span className="truncate block max-w-[200px]" title={row.title}>{row.title}</span>
                                  <span className="text-[10px] text-blue-400">{row.authors} ({row.year})</span>
                                </td>
                                {PROBAST_ROB_DOMAINS.map((d) => {
                                  const j = getProbastJudgment(row.id, "domains", d.id);
                                  return (
                                    <td key={d.id} className="border border-blue-800 px-1 py-1.5 text-center">
                                      <span className="block rounded-sm" style={{ backgroundColor: getProbastColor(j), opacity: j === "Unclear" ? 0.5 : 1, width: 28, height: 18, margin: "0 auto" }} title={`${d.id}: ${j}`} />
                                      <select value={j} onChange={(e) => updateProbastDomain(row.id, d.id, e.target.value)} className="mt-1 bg-blue-950 border border-blue-700 text-white rounded px-1 py-0.5 w-full text-[10px] focus:outline-none focus:ring-1 focus:ring-yellow-500">
                                        {PROBAST_ROB_JUDGMENTS.map((jj) => (<option key={jj} value={jj}>{jj}</option>))}
                                      </select>
                                    </td>
                                  );
                                })}
                                <td className="border border-blue-800 px-1 py-1.5 text-center">
                                  <select value={a.overallRob} onChange={(e) => updateProbastOverallRob(row.id, e.target.value)} className="bg-blue-950 border border-blue-700 text-white rounded px-1 py-1 w-full text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500">
                                    {PROBAST_ROB_JUDGMENTS.map((jj) => (<option key={jj} value={jj}>{jj}</option>))}
                                  </select>
                                  <span className="block rounded-sm mt-1" style={{ backgroundColor: getProbastColor(a.overallRob), width: 28, height: 18, margin: "0 auto" }} title={`Overall RoB: ${a.overallRob}`} />
                                </td>
                                {PROBAST_APPLICABILITY_DOMAINS.map((d) => {
                                  const j = getProbastJudgment(row.id, "applicability", d.id);
                                  return (
                                    <td key={d.id} className="border border-blue-800 px-1 py-1.5 text-center">
                                      <span className="block rounded-sm" style={{ backgroundColor: getProbastColor(j), opacity: j === "Unclear" ? 0.5 : 1, width: 28, height: 18, margin: "0 auto" }} title={`${d.id}: ${j}`} />
                                      <select value={j} onChange={(e) => updateProbastApplicability(row.id, d.id, e.target.value)} className="mt-1 bg-blue-950 border border-blue-700 text-white rounded px-1 py-0.5 w-full text-[10px] focus:outline-none focus:ring-1 focus:ring-yellow-500">
                                        {PROBAST_APPLICABILITY_JUDGMENTS.map((jj) => (<option key={jj} value={jj}>{jj}</option>))}
                                      </select>
                                    </td>
                                  );
                                })}
                                <td className="border border-blue-800 px-1 py-1.5 text-center">
                                  <select value={a.overallApplicability} onChange={(e) => updateProbastOverallApplicability(row.id, e.target.value)} className="bg-blue-950 border border-blue-700 text-white rounded px-1 py-1 w-full text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500">
                                    {PROBAST_APPLICABILITY_JUDGMENTS.map((jj) => (<option key={jj} value={jj}>{jj}</option>))}
                                  </select>
                                </td>
                                <td className="border border-blue-800 px-1 py-1.5">
                                  <input type="text" value={a.notes} onChange={(e) => updateProbastNotes(row.id, e.target.value)} placeholder="Notes..." className="bg-blue-950 border border-blue-700 text-white rounded px-1 py-1 w-full text-[10px] placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-yellow-500" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {probastAnalysis && (
                    <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-blue-200 flex items-center gap-1.5"><ShieldCheck size={13} className="text-yellow-400" /> PROBAST+AI Analysis</p>
                        <button onClick={() => setProbastAnalysis("")} className="text-[10px] bg-blue-900/60 text-blue-200 px-3 py-1 rounded-lg hover:bg-blue-800/60 border border-blue-700/50">Clear</button>
                      </div>
                      <div className="text-blue-100 whitespace-pre-wrap max-h-[320px] overflow-y-auto text-[11px] leading-relaxed">
                        {probastAnalysis.split("\n").map((line, i) => {
                          if (line.startsWith("## ")) return <h2 key={i} className="text-xs font-bold text-yellow-200 mt-2 mb-1">{line.slice(3)}</h2>;
                          if (line.startsWith("# ")) return <h1 key={i} className="text-sm font-bold text-white mt-3 mb-1">{line.slice(2)}</h1>;
                          if (line.trim() === "") return <br key={i} />;
                          return <p key={i} className="text-[11px] text-blue-100 mb-1">{line}</p>;
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-blue-400">{extractedData.length} studies · PROBAST+AI (probast.org)</div>
                    <div className="flex items-center gap-2">
                      <button onClick={saveProbastAssessments} className="flex items-center gap-2 bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 text-sm">
                        <Save size={14} /> Save Assessments
                      </button>
                      <button onClick={() => setPipelineStep(4)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                        Proceed to Synthesis & Meta-analysis
                        <FlaskConical size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {pipelineStep === 4 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Table size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Synthesis & Meta-analysis</h3>
              </div>
               <p className="text-sm text-blue-300 mb-4">
                 Generate evidence synthesis using methods from the awesome-evidence-synthesis toolkit. No API key required — the local synthesis builder produces PRISMA/ROSES-ready output from your extracted data. Configure an API key in Settings for AI-enhanced output.
               </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Review Type</label>
                  <select
                    value={reviewType}
                    onChange={(e) => setReviewType(e.target.value)}
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    {REVIEW_TYPES.map((rt) => (
                      <option key={rt} value={rt}>{rt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Specific Requirements</label>
                  <textarea
                    value={reviewRequirements}
                    onChange={(e) => setReviewRequirements(e.target.value)}
                    placeholder="e.g., subgroup by age and sex; include only RCTs; use GRADE for certainty assessment; meta-regression by dose..."
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 min-h-[60px]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-200 mb-2">Additional Synthesis Instructions</label>
                <textarea
                  value={synthesisInstructions}
                  onChange={(e) => setSynthesisInstructions(e.target.value)}
                  placeholder="e.g., Focus on IGRA vs TST diagnostic accuracy; use random-effects model; include funnel plot assessment..."
                  className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 min-h-[80px]"
                />
              </div>

              <button
                onClick={generateSynthesis}
                disabled={synthesisLoading || extractedData.length === 0}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 mb-4"
              >
                {synthesisLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                    Generating Synthesis...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    {(state.geminiApiKey || state.groqApiKey)
                      ? `Generate AI Synthesis (${reviewType})`
                      : `Generate Local Synthesis (${reviewType})`}
                  </>
                )}
              </button>

              {synthesisOutput && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="text-sm font-bold text-white">Narrative Synthesis Output</h4>
                    <span className="text-[10px] bg-purple-900/50 text-purple-100 border border-purple-700 rounded px-2 py-0.5">
                      RoB tool: {robMode === "probast" ? "PROBAST + AI" : (getRobToolTemplate()?.label || robTool)}
                    </span>
                  </div>
                  <div className="text-blue-100 whitespace-pre-wrap max-h-[500px] overflow-y-auto text-sm leading-relaxed">
                    {synthesisOutput.split("\n").map((line, i) => {
                      if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
                      if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-yellow-200 mt-3 mb-2">{line.slice(3)}</h2>;
                      if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-blue-200 mt-2 mb-1">{line.slice(4)}</h3>;
                      if (line.startsWith("| ")) return <pre key={i} className="text-xs overflow-x-auto my-2 bg-blue-900/20 p-2 rounded">{line}</pre>;
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i} className="text-sm text-blue-100 mb-1">{line}</p>;
                    })}
                  </div>
                </div>
              )}

              {effectSizes.length > 0 && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Table size={14} className="text-yellow-400" />
                    Effect Size Summary (meta-analysis input)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-blue-900/60 text-left">
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Effect Estimate</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">95% CI</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectSizes.map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-900/20">
                            <td className="border border-blue-800 px-3 py-2">
                              <input
                                type="text"
                                value={row.study}
                                onChange={(e) => updateEffectSize(idx, "study", e.target.value)}
                                className="bg-transparent text-blue-100 w-full focus:outline-none"
                              />
                            </td>
                            <td className="border border-blue-800 px-3 py-2">
                              <input
                                type="text"
                                value={row.effect}
                                onChange={(e) => updateEffectSize(idx, "effect", e.target.value)}
                                className="bg-transparent text-blue-100 w-full focus:outline-none"
                              />
                            </td>
                            <td className="border border-blue-800 px-3 py-2">
                              <input
                                type="text"
                                value={row.ci}
                                onChange={(e) => updateEffectSize(idx, "ci", e.target.value)}
                                className="bg-transparent text-blue-100 w-full focus:outline-none"
                              />
                            </td>
                            <td className="border border-blue-800 px-3 py-2">
                              <input
                                type="text"
                                value={row.weight}
                                onChange={(e) => updateEffectSize(idx, "weight", e.target.value)}
                                className="bg-transparent text-blue-100 w-full focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-blue-400 mt-2">Editable — tune values before exporting to metafor / meta / OpenMEE / JASP</p>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => setPipelineStep(5)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                  Proceed to Reporting
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {pipelineStep === 5 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-1">PRISMA 2020 Reporting & Visualization</h3>
              <p className="text-xs text-blue-400 mb-3">
                Aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a>: produces outputs compliant with <em>PRISMA 2020</em> (flow diagram), <em>ROSES</em> (structured reporting), <em>robvis</em> / <em>PROBAST+AI</em> (risk-of-bias plots), and <em>forestplot</em> / <em>metafor</em> ready tables for {reviewType.toLowerCase()}.
              </p>

              <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-blue-300">
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">REVIEW TYPE: {reviewType.toUpperCase()}</span>
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">RoB ToOL: {robMode === "probast" ? "PROBAST + AI" : (() => { const t = getRobToolTemplate(); return t ? t.label : robTool; })()}</span>
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">STUDIES: {extractedData.length}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {robMode === "robvis" && (
                <>
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <BarChart3 size={14} className="text-yellow-400" />
                    robvis — Risk of Bias Summary
                  </h4>
                  {(() => {
                    const template = getRobToolTemplate();
                    if (!template || extractedData.length === 0) {
                      return (
                        <p className="text-xs text-blue-400 py-8 text-center">
                          Complete assessments in Step 3 to generate a robvis summary.
                        </p>
                      );
                    }
                    const total = extractedData.length;
                    const data = template.domains
                      .map((d) => {
                        const counts = { low: 0, some: 0, high: 0, noInfo: 0 } as Record<string, number>;
                        extractedData.forEach((row) => {
                          const jl = getRobJudgmentForPaper(row.id, d.id).toLowerCase();
                          if (jl.includes("no information")) counts.noInfo += 1;
                          else if (jl.includes("low risk of bias") || jl === "low") counts.low += 1;
                          else if (jl.includes("some concerns") || jl.includes("unclear") || jl === "moderate") counts.some += 1;
                          else if (jl.includes("high risk of bias") || jl.includes("high") || jl.includes("very high") || jl.includes("critical")) counts.high += 1;
                          else if (jl.includes("moderate") || jl.includes("serious")) counts.some += 1;
                        });
                        return {
                          name: `${d.id}: ${d.label}`,
                          Low: counts.low,
                          SomeConcerns: counts.some,
                          High: counts.high,
                          NoInfo: counts.noInfo,
                        };
                      })
                      .concat([{
                        name: "Overall",
                        Low: extractedData.filter((r) => { const j = getRobJudgmentForPaper(r.id, "Overall"); const jl = j.toLowerCase(); return jl.includes("low risk of bias") || jl === "low"; }).length,
                        SomeConcerns: extractedData.filter((r) => { const j = getRobJudgmentForPaper(r.id, "Overall"); const jl = j.toLowerCase(); return jl.includes("some concerns") || jl.includes("unclear") || jl === "moderate" || jl.includes("serious"); }).length,
                        High: extractedData.filter((r) => { const j = getRobJudgmentForPaper(r.id, "Overall"); const jl = j.toLowerCase(); return jl.includes("high risk of bias") || jl.includes("high") || jl.includes("very high") || jl.includes("critical"); }).length,
                        NoInfo: extractedData.filter((r) => { const j = getRobJudgmentForPaper(r.id, "Overall"); const jl = j.toLowerCase(); return jl.includes("no information"); }).length,
                      }]);
                    const chartHeight = Math.max(150, data.length * 38 + 40);
                    return (
                      <div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[10px]">
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#02C100" }} /> Low risk</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#E2DF07" }} /> Some concerns</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#BF0000" }} /> High risk</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#4EA1F7" }} /> No information</span>
                        </div>
                        <ResponsiveContainer width="100%" height={chartHeight}>
                          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                            <XAxis type="number" stroke="#4ea1f7" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" stroke="#4ea1f7" tick={{ fontSize: 10, fill: "#93c5fd" }} width={80} />
                            <Tooltip
                              contentStyle={{ background: "#0a1530", border: "1px solid #1e3a5f", borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: "#e2e8f0" }}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="Low" stackId="bias" fill="#02C100" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="SomeConcerns" stackId="bias" fill="#E2DF07" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="High" stackId="bias" fill="#BF0000" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="NoInfo" stackId="bias" fill="#4EA1F7" radius={[0, 2, 2, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex gap-2">
                    <button onClick={downloadRobCsv} className="flex items-center gap-1 text-[10px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60">
                      <Download size={10} /> CSV
                    </button>
                  </div>
                </div>

                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Table size={14} className="text-yellow-400" />
                    robvis — Traffic Light Plot
                  </h4>
                  {(() => {
                    const template = getRobToolTemplate();
                    if (!template || extractedData.length === 0) {
                      return (
                        <p className="text-xs text-blue-400 py-8 text-center">
                          Complete assessments in Step 3 to generate the robvis traffic light plot.
                        </p>
                      );
                    }
                    const allColumns = template.domains.map((d) => d.id).concat(["Overall"]);
                    return (
                      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                        <table className="w-full border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-blue-900/60 text-left sticky top-0">
                              <th className="border border-blue-800 px-2 py-1.5 text-yellow-200 sticky left-0 bg-blue-900/90 z-10">Study</th>
                              {template.domains.map((d) => (
                                <th key={d.id} className="border border-blue-800 px-1 py-1.5 text-yellow-200" title={d.label}>{d.id}</th>
                              ))}
                              <th className="border border-blue-800 px-1 py-1.5 text-yellow-200">Overall</th>
                            </tr>
                          </thead>
                          <tbody>
                            {extractedData.map((row) => {
                              const assessment = robAssessments[row.id];
                              if (!assessment) return null;
                              return (
                                <tr key={row.id} className="hover:bg-blue-900/20">
                                  <td className="border border-blue-800 px-2 py-1 text-blue-200 whitespace-nowrap" title={row.title}>
                                    {row.authors} ({row.year})
                                  </td>
                                  {template.domains.map((d) => {
                                    const judgment = assessment.domains[d.id]?.judgment || "No information";
                                    const bg = getRobJudgmentColor(judgment);
                                    const isPending = judgment === "No information";
                                    return (
                                      <td
                                        key={d.id}
                                        className="border border-blue-800 px-1 py-1 text-center"
                                        title={`${d.id} (${d.label}): ${judgment}`}
                                      >
                                        <span
                                          className="inline-block rounded-sm"
                                          style={{ backgroundColor: bg, opacity: isPending ? 0.5 : 1, width: 20, height: 14 }}
                                        />
                                      </td>
                                    );
                                  })}
                                  <td className="border border-blue-800 px-1 py-1 text-center">
                                    <span
                                      className="inline-block rounded-sm"
                                      style={{ backgroundColor: getRobJudgmentColor(assessment.overall), width: 20, height: 14 }}
                                      title={`Overall: ${assessment.overall}`}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  <p className="text-[9px] text-blue-400 mt-2">
                    {(() => {
                      const t = getRobToolTemplate();
                      return t ? `Reference: ${t.label}` : "";
                    })()}
                  </p>
                </div>
                </>
                )}

                {robMode === "probast" && (
                <>
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <ShieldCheck size={14} className="text-yellow-400" />
                    PROBAST+AI — Risk of Bias Summary
                  </h4>
                  {extractedData.length === 0 ? (
                    <p className="text-xs text-blue-400 py-8 text-center">Complete assessments in Step 3 (PROBAST+AI) to generate a summary.</p>
                  ) : (() => {
                    const robData = PROBAST_ROB_DOMAINS.map((d) => {
                      const counts = { low: 0, high: 0, unclear: 0 };
                      extractedData.forEach((row) => {
                        const j = getProbastJudgment(row.id, "domains", d.id);
                        if (j === "Low risk of bias") counts.low += 1;
                        else if (j === "High risk of bias") counts.high += 1;
                        else counts.unclear += 1;
                      });
                      return { name: `${d.id}: ${d.label}`, Low: counts.low, High: counts.high, Unclear: counts.unclear };
                    }).concat([{
                      name: "Overall RoB",
                      Low: extractedData.filter((r) => probastAssessments[r.id]?.overallRob === "Low risk of bias").length,
                      High: extractedData.filter((r) => probastAssessments[r.id]?.overallRob === "High risk of bias").length,
                      Unclear: extractedData.filter((r) => !(probastAssessments[r.id]?.overallRob === "Low risk of bias" || probastAssessments[r.id]?.overallRob === "High risk of bias")).length,
                    }]);
                    const chartHeight = Math.max(150, robData.length * 38 + 40);
                    return (
                      <div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[10px]">
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#02C100" }} /> Low risk of bias</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#BF0000" }} /> High risk of bias</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#E2DF07" }} /> Unclear</span>
                        </div>
                        <ResponsiveContainer width="100%" height={chartHeight}>
                          <BarChart data={robData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                            <XAxis type="number" stroke="#4ea1f7" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" stroke="#4ea1f7" tick={{ fontSize: 10, fill: "#93c5fd" }} width={80} />
                            <Tooltip contentStyle={{ background: "#0a1530", border: "1px solid #1e3a5f", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e2e8f0" }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="Low" stackId="bias" fill="#02C100" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="High" stackId="bias" fill="#BF0000" radius={[0, 2, 2, 0]} />
                            <Bar dataKey="Unclear" stackId="bias" fill="#E2DF07" radius={[0, 2, 2, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex gap-2">
                    <button onClick={downloadProbastCsv} className="flex items-center gap-1 text-[10px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60">
                      <Download size={10} /> CSV
                    </button>
                  </div>
                </div>

                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Table size={14} className="text-yellow-400" />
                    PROBAST+AI — Traffic Light Plot
                  </h4>
                  {extractedData.length === 0 ? (
                    <p className="text-xs text-blue-400 py-8 text-center">Complete assessments in Step 3 (PROBAST+AI) to generate the traffic light plot.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-blue-900/60 text-left sticky top-0">
                            <th className="border border-blue-800 px-2 py-1.5 text-yellow-200 sticky left-0 bg-blue-900/90 z-10">Study</th>
                            {PROBAST_ROB_DOMAINS.map((d) => (
                              <th key={d.id} className="border border-blue-800 px-1 py-1.5 text-yellow-200" title={d.label}>{d.id}</th>
                            ))}
                            <th className="border border-blue-800 px-1 py-1.5 text-yellow-200">RoB</th>
                            {PROBAST_APPLICABILITY_DOMAINS.map((d) => (
                              <th key={d.id} className="border border-blue-800 px-1 py-1.5 text-yellow-200" title={d.label}>{d.id}</th>
                            ))}
                            <th className="border border-blue-800 px-1 py-1.5 text-yellow-200">App.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extractedData.map((row) => {
                            const a = probastAssessments[row.id];
                            if (!a) return null;
                            return (
                              <tr key={row.id} className="hover:bg-blue-900/20">
                                <td className="border border-blue-800 px-2 py-1 text-blue-200 whitespace-nowrap" title={row.title}>{row.authors} ({row.year})</td>
                                {PROBAST_ROB_DOMAINS.map((d) => {
                                  const j = a.domains[d.id]?.judgment || "Unclear";
                                  return (
                                    <td key={d.id} className="border border-blue-800 px-1 py-1 text-center" title={`${d.id} (${d.label}): ${j}`}>
                                      <span className="inline-block rounded-sm" style={{ backgroundColor: getProbastColor(j), opacity: j === "Unclear" ? 0.5 : 1, width: 20, height: 14 }} />
                                    </td>
                                  );
                                })}
                                <td className="border border-blue-800 px-1 py-1 text-center" title={`Overall RoB: ${a.overallRob}`}>
                                  <span className="inline-block rounded-sm" style={{ backgroundColor: getProbastColor(a.overallRob), width: 20, height: 14 }} />
                                </td>
                                {PROBAST_APPLICABILITY_DOMAINS.map((d) => {
                                  const j = a.applicability[d.id]?.judgment || "Unclear";
                                  return (
                                    <td key={d.id} className="border border-blue-800 px-1 py-1 text-center" title={`${d.id} (${d.label}): ${j}`}>
                                      <span className="inline-block rounded-sm" style={{ backgroundColor: getProbastColor(j), opacity: j === "Unclear" ? 0.5 : 1, width: 20, height: 14 }} />
                                    </td>
                                  );
                                })}
                                <td className="border border-blue-800 px-1 py-1 text-center" title={`Applicability: ${a.overallApplicability}`}>
                                  <span className="inline-block rounded-sm" style={{ backgroundColor: getProbastColor(a.overallApplicability), width: 20, height: 14 }} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-[9px] text-blue-400 mt-2">Reference: PROBAST+AI (probast.org/probast_ai) — risk of bias (D1–D4) + applicability (A1–A3).</p>
                </div>
                </>
                )}

              </div>

              <div className="mb-4">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  PRISMA 2020 Flow Diagram
                  <span className="text-[9px] text-blue-400 font-normal">(via <a href="https://estech.shinyapps.io/PRISMA_flowdiagram_latest/" target="_blank" rel="noreferrer" className="underline">estech Shiny app</a>)</span>
                </h4>
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-blue-200">
                    <div className="flex flex-col items-center gap-0.5 bg-blue-900/40 border border-blue-800 rounded px-3 py-2">
                      <span className="text-[9px] text-blue-400">Identification</span>
                      <span className="font-bold text-white">{prismaCounts.identification}</span>
                      <span className="text-[8px] text-blue-400">Records identified from<br/>{selectedDbs.length} databases</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-blue-900/40 border border-blue-800 rounded px-3 py-2">
                      <span className="text-[9px] text-blue-400">Deduplication</span>
                      <span className="font-bold text-white">{prismaCounts.deduped}</span>
                      <span className="text-[8px] text-blue-400">Records after<br/>duplicates removed</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-blue-900/40 border border-blue-800 rounded px-3 py-2">
                      <span className="text-[9px] text-blue-400">Screening</span>
                      <span className="font-bold text-white">{prismaCounts.screened}</span>
                      <span className="text-[8px] text-blue-400">Records screened<br/>(title/abstract)</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-red-900/30 border border-red-800 rounded px-3 py-2">
                      <span className="text-[9px] text-red-300">Excluded</span>
                      <span className="font-bold text-red-200">{prismaCounts.excluded}</span>
                      <span className="text-[8px] text-red-300">Records excluded</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-blue-900/40 border border-blue-800 rounded px-3 py-2">
                      <span className="text-[9px] text-blue-400">Eligibility</span>
                      <span className="font-bold text-white">{prismaCounts.assessed}</span>
                      <span className="text-[8px] text-blue-400">Reports assessed<br/>for eligibility</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-red-900/30 border border-red-800 rounded px-3 py-2">
                      <span className="text-[9px] text-red-300">Excluded</span>
                      <span className="font-bold text-red-200">{Math.max(0, prismaCounts.assessed - prismaCounts.included)}</span>
                      <span className="text-[8px] text-red-300">Reports excluded</span>
                    </div>
                    <ChevronRight size={12} className="text-blue-500 hidden sm:block" />
                    <div className="flex flex-col items-center gap-0.5 bg-green-900/30 border border-green-800 rounded px-3 py-2">
                      <span className="text-[9px] text-green-300">Included</span>
                      <span className="font-bold text-green-200">{prismaCounts.included}</span>
                      <span className="text-[8px] text-green-300">Studies included in<br/>{reviewType.toLowerCase()}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-[9px] text-blue-400 px-1">
                    <a href="https://estech.shinyapps.io/PRISMA_flowdiagram_latest/" target="_blank" rel="noreferrer" className="underline text-yellow-300">Generate publication-quality PRISMA 2020 flow diagram</a> — import this data into the official estech Shiny app.
                  </div>
                </div>
              </div>

              {synthesisOutput && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-sm font-bold text-white">Synthesis Summary for Reporting</h4>
                    <span className="text-[10px] bg-purple-900/50 text-purple-100 border border-purple-700 rounded px-2 py-0.5">
                      RoB tool: {robMode === "probast" ? "PROBAST + AI" : (getRobToolTemplate()?.label || robTool)}
                    </span>
                  </div>
                  <div className="text-xs text-blue-200 whitespace-pre-wrap max-h-[300px] overflow-y-auto">{synthesisOutput}</div>
                </div>
              )}
              {effectSizes.length > 0 && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-bold text-white mb-2">Effect Size Table for PRISMA / forestplot</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-blue-900/60 text-left">
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Effect</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">95% CI</th>
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectSizes.map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-900/20">
                            <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.study}</td>
                            <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.effect}</td>
                            <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.ci}</td>
                            <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.weight}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={downloadPrismaCsv} className="flex items-center gap-1 text-[10px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60">
                      <Download size={10} /> PRISMA 2020 CSV
                    </button>
                    <button onClick={downloadRoses} className="flex items-center gap-1 text-[10px] bg-emerald-900/50 text-emerald-200 px-2 py-1 rounded hover:bg-emerald-800/60">
                      <Download size={10} /> ROSES CSV
                    </button>
                    <button onClick={downloadRobCsv} className="flex items-center gap-1 text-[10px] bg-purple-900/50 text-purple-200 px-2 py-1 rounded hover:bg-purple-800/60">
                      <Download size={10} /> RoB CSV (robvis)
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPipelineStep(6)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Academic Writing Agents Review
                <PenTool size={16} />
              </button>
              <button onClick={() => { setPipelineStep(1); setPapers([]); setSelectedPaperIds(new Set()); setExtractedData([]); setSynthesisOutput(""); setEffectSizes([]); setRobAssessments({}); setSynthesisInstructions(""); setReviewRequirements(""); setManuscript(""); setReviewReport(""); setFinalManuscript(""); }} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Start New Review
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        )}
        {pipelineStep === 6 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <PenTool size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Research Paper Draft</h3>
              </div>
              <p className="text-xs text-blue-400 mb-4">
                Generate a complete research-paper draft from the source papers gathered in Risk of Bias, Synthesis &amp; Meta-analysis, and Reporting &amp; PRISMA steps. The draft is editable below. After review and approval, export to PDF, Word, or LaTeX.
              </p>

              <div className="flex items-center gap-2 mb-6 bg-blue-950/60 rounded-lg p-1.5">
                <button
                  onClick={() => setStormMode("academic-agents")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    stormMode === "academic-agents"
                      ? "bg-yellow-500 text-[#0a1a3a] shadow"
                      : "bg-transparent text-blue-300 hover:text-white"
                  }`}
                >
                  <BookOpen size={14} />
                  Academic Writing Agents
                </button>
                <button
                  onClick={() => setStormMode("storm")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    stormMode === "storm"
                      ? "bg-yellow-500 text-[#0a1a3a] shadow"
                      : "bg-transparent text-blue-300 hover:text-white"
                  }`}
                >
                  <Zap size={14} />
                  STORM (Stanford)
                </button>
              </div>

              {stormMode === "academic-agents" && (
                <>
                  {!manuscript ? (
                    <div className="space-y-4">
                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-2">Academic Writing Agents Pipeline</h4>
                        <div className="text-xs text-blue-200 space-y-1">
                          <p>• <strong>Research phase:</strong> gathers included studies from Steps 3–5</p>
                          <p>• <strong>Structure phase:</strong> builds academic outline with GPS Rhythm (Goal-Problem-Solution)</p>
                          <p>• <strong>Writing phase:</strong> drafts each section with academic tone, applying 30 principles</p>
                          <p>• <strong>Citation phase:</strong> cites only verified pipeline studies with Vancouver style</p>
                          <p>• <strong>Polish phase:</strong> refines language and applies self-review checklist</p>
                          <p>• <strong>Review phase:</strong> 12 specialist agents review for consistency, logic, technical correctness, and style</p>
                          <p>• <strong>Export phase:</strong> PDF, Word (.docx), or LaTeX source</p>
                        </div>
                      </div>

                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-2">30 Writing Principles Applied</h4>
                        <div className="text-xs text-blue-200 grid grid-cols-2 gap-1">
                          <span>A1–A7 Structure &amp; Narrative</span>
                          <span>B1–B8 Prose &amp; Style</span>
                          <span>C1–C3 Math &amp; Equations</span>
                          <span>D1–D7 Figures &amp; Tables</span>
                          <span>E1–E3 Citations &amp; Bibliography</span>
                          <span>F1–F2 Process &amp; Meta</span>
                        </div>
                      </div>

                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-2">12 Specialist Review Agents</h4>
                        <div className="text-xs text-blue-200 grid grid-cols-2 gap-1">
                          <span>Consistency Checker</span>
                          <span>Logic Reviewer</span>
                          <span>Technical Reviewer</span>
                          <span>Writing Reviewer</span>
                          <span>Bibliography Auditor</span>
                          <span>Research Analyst</span>
                          <span>Prose Polisher</span>
                          <span>Section Drafter</span>
                          <span>LaTeX Figure Specialist</span>
                          <span>LaTeX Layout Auditor</span>
                          <span>Brainstormer</span>
                          <span>Paper Crawler</span>
                        </div>
                      </div>

                      <button
                        onClick={generateManuscript}
                        disabled={manuscriptLoading || extractedData.length === 0}
                        className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                      >
                        {manuscriptLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                            Generating Draft...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            Generate Research Draft
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-white">Generated Manuscript (editable)</h4>
                          <span className="text-[10px] text-blue-400">Edit the draft below, then export when ready</span>
                        </div>
                        <textarea
                          value={manuscript}
                          onChange={(e) => setManuscript(e.target.value)}
                          className="w-full h-[600px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-mono leading-relaxed placeholder:text-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-blue-300 mr-auto">Export format:</span>
                        <button
                          onClick={() => downloadMarkdownAsPDF(finalManuscript || manuscript, `academic-writing-agents-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`)}
                          className="flex items-center gap-1.5 bg-emerald-900/50 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-800/70 text-sm"
                        >
                          <Download size={14} />
                          Export PDF
                        </button>
                        <button
                          onClick={() => downloadMarkdownAsWord(finalManuscript || manuscript, `academic-writing-agents-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.docx`)}
                          className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                        >
                          <Download size={14} />
                          Export Word
                        </button>
                        <button
                          onClick={() => downloadMarkdownAsLaTeX(finalManuscript || manuscript, `academic-writing-agents-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.tex`)}
                          className="flex items-center gap-1.5 bg-purple-900/50 text-purple-200 px-4 py-2 rounded-lg hover:bg-purple-800/70 text-sm"
                        >
                          <FileCode size={14} />
                          Export LaTeX
                        </button>
                        <button
                          onClick={generateReview}
                          disabled={reviewLoading}
                          className="flex items-center gap-1.5 bg-indigo-900/50 text-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-800/70 text-sm disabled:opacity-50"
                        >
                          {reviewLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-indigo-200 border-t-transparent rounded-full animate-spin" />
                              Reviewing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Run Academic Writing Agents Review
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => { setManuscript(""); setReviewReport(""); setFinalManuscript(""); }}
                          className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                        >
                          <RotateCcw size={14} />
                          Regenerate
                        </button>
                      </div>

                      {reviewReport && (
                        <div className="bg-indigo-950/50 border border-indigo-900 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-white mb-2">Academic Writing Agents Review Report</h4>
                          <textarea
                            value={reviewReport}
                            onChange={(e) => setReviewReport(e.target.value)}
                            className="w-full h-[400px] bg-indigo-950 border border-indigo-800 text-white rounded-lg p-4 text-sm font-mono leading-relaxed placeholder:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y whitespace-pre-wrap"
                          />
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <button
                              onClick={incorporateReviewAndRegenerate}
                              disabled={finalManuscriptLoading}
                              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                            >
                              {finalManuscriptLoading ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                                  Regenerating Final Manuscript...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} />
                                  Incorporate Review &amp; Regenerate Final Manuscript
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {finalManuscript && (
                        <div className="bg-green-950/50 border border-green-900 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-white">Final Manuscript (review-incorporated)</h4>
                            <span className="text-[10px] text-green-400">Read-only final output — export as PDF, Word, or LaTeX</span>
                          </div>
                          <div
                            className="w-full h-[600px] bg-green-950 border border-green-800 text-white rounded-lg p-4 text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: marked.parse(finalManuscript) as string }}
                          />
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <span className="text-xs text-green-300 mr-auto">Export final manuscript:</span>
                            <button
                              onClick={() => downloadMarkdownAsPDF(finalManuscript, `academic-writing-agents-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`)}
                              className="flex items-center gap-1.5 bg-emerald-900/50 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-800/70 text-sm"
                            >
                              <Download size={14} />
                              Export PDF
                            </button>
                            <button
                              onClick={() => downloadMarkdownAsWord(finalManuscript, `academic-writing-agents-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.docx`)}
                              className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                            >
                              <Download size={14} />
                              Export Word
                            </button>
                            <button
                              onClick={() => downloadMarkdownAsLaTeX(finalManuscript, `academic-writing-agents-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.tex`)}
                              className="flex items-center gap-1.5 bg-purple-900/50 text-purple-200 px-4 py-2 rounded-lg hover:bg-purple-800/70 text-sm"
                            >
                              <FileCode size={14} />
                              Export LaTeX
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {stormMode === "storm" && (
                <>
                  {!stormDraft ? (
                    <div className="space-y-4">
                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-2">STORM Pipeline (Stanford)</h4>
                        <p className="text-xs text-blue-300 mb-3">
                          STORM (Synthesis of Topic Outlines through Research and Multi-perspective Questioning) — https://github.com/stanford-oval/storm
                        </p>
                        <div className="text-xs text-blue-200 space-y-1">
                          <p>• <strong>Perspective-Seeking:</strong> identifies 3–5 distinct expert perspectives on your topic</p>
                          <p>• <strong>Information-Gathering:</strong> uses your extracted studies as the evidence base</p>
                          <p>• <strong>Outline-Generation:</strong> creates a structured academic outline</p>
                          <p>• <strong>Drafting:</strong> writes each section with academic tone and rigor</p>
                          <p>• <strong>Self-Review:</strong> ensures internal consistency, proper citations, and completeness</p>
                          <p>• <strong>Export phase:</strong> PDF, Word (.docx), or LaTeX source</p>
                        </div>
                      </div>

                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-2">STORM Methodology</h4>
                        <div className="text-xs text-blue-200 grid grid-cols-2 gap-1">
                          <span>Multi-perspective reasoning</span>
                          <span>Knowledge-grounded drafting</span>
                          <span>Iterative outline refinement</span>
                          <span>Self-review &amp; polish</span>
                          <span>Vancouver citation style</span>
                          <span>PRISMA 2020 compliant</span>
                        </div>
                      </div>

                      <button
                        onClick={generateStormDraft}
                        disabled={stormLoading || extractedData.length === 0}
                        className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                      >
                        {stormLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                            Generating STORM Draft...
                          </>
                        ) : (
                          <>
                            <Zap size={16} />
                            Generate STORM Research Draft
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-white">STORM Draft (editable)</h4>
                          <span className="text-[10px] text-blue-400">Edit the draft below, then export when ready</span>
                        </div>
                        <textarea
                          value={stormDraft}
                          onChange={(e) => setStormDraft(e.target.value)}
                          className="w-full h-[600px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-mono leading-relaxed placeholder:text-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-blue-300 mr-auto">Export format:</span>
                        <button
                          onClick={() => downloadMarkdownAsPDF(stormFinal || stormDraft, `storm-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`)}
                          className="flex items-center gap-1.5 bg-emerald-900/50 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-800/70 text-sm"
                        >
                          <Download size={14} />
                          Export PDF
                        </button>
                        <button
                          onClick={() => downloadMarkdownAsWord(stormFinal || stormDraft, `storm-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.docx`)}
                          className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                        >
                          <Download size={14} />
                          Export Word
                        </button>
                        <button
                          onClick={() => downloadMarkdownAsLaTeX(stormFinal || stormDraft, `storm-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.tex`)}
                          className="flex items-center gap-1.5 bg-purple-900/50 text-purple-200 px-4 py-2 rounded-lg hover:bg-purple-800/70 text-sm"
                        >
                          <FileCode size={14} />
                          Export LaTeX
                        </button>
                        <button
                          onClick={runStormReview}
                          disabled={stormReviewLoading}
                          className="flex items-center gap-1.5 bg-indigo-900/50 text-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-800/70 text-sm disabled:opacity-50"
                        >
                          {stormReviewLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-indigo-200 border-t-transparent rounded-full animate-spin" />
                              Reviewing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Run STORM Self-Review
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => { setStormDraft(""); setStormReview(""); setStormFinal(""); }}
                          className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                        >
                          <RotateCcw size={14} />
                          Regenerate
                        </button>
                      </div>

                      {stormReview && (
                        <div className="bg-indigo-950/50 border border-indigo-900 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-white mb-2">STORM Self-Review Report</h4>
                          <textarea
                            value={stormReview}
                            onChange={(e) => setStormReview(e.target.value)}
                            className="w-full h-[400px] bg-indigo-950 border border-indigo-800 text-white rounded-lg p-4 text-sm font-mono leading-relaxed placeholder:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y whitespace-pre-wrap"
                          />
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <button
                              onClick={incorporateStormReview}
                              disabled={stormFinalLoading}
                              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                            >
                              {stormFinalLoading ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                                  Regenerating Final Draft...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} />
                                  Incorporate Review &amp; Regenerate Final Draft
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {stormFinal && (
                        <div className="bg-green-950/50 border border-green-900 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-white">Final STORM Draft (review-incorporated)</h4>
                            <span className="text-[10px] text-green-400">Read-only final output — export as PDF, Word, or LaTeX</span>
                          </div>
                          <div
                            className="w-full h-[600px] bg-green-950 border border-green-800 text-white rounded-lg p-4 text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: marked.parse(stormFinal) as string }}
                          />
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <span className="text-xs text-green-300 mr-auto">Export final draft:</span>
                            <button
                              onClick={() => downloadMarkdownAsPDF(stormFinal, `storm-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`)}
                              className="flex items-center gap-1.5 bg-emerald-900/50 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-800/70 text-sm"
                            >
                              <Download size={14} />
                              Export PDF
                            </button>
                            <button
                              onClick={() => downloadMarkdownAsWord(stormFinal, `storm-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.docx`)}
                              className="flex items-center gap-1.5 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/70 text-sm"
                            >
                              <Download size={14} />
                              Export Word
                            </button>
                            <button
                              onClick={() => downloadMarkdownAsLaTeX(stormFinal, `storm-final-${reviewType.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.tex`)}
                              className="flex items-center gap-1.5 bg-purple-900/50 text-purple-200 px-4 py-2 rounded-lg hover:bg-purple-800/70 text-sm"
                            >
                              <FileCode size={14} />
                              Export LaTeX
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
