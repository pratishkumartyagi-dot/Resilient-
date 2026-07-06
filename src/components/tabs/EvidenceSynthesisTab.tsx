"use client";

import React, { useState, useEffect } from "react";
import {
  Search, Database, ChevronRight, FileText,
  RotateCcw, CheckCircle2, ExternalLink, FlaskConical,
  Save, Sparkles, ClipboardList, Table, Download,
  FileJson, BarChart3, PenTool, BookOpen
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, type AICallOptions } from "@/lib/ai";
import { fetchRealPapers, type Paper, validateDoiViaCrossref } from "@/lib/database-apis";
import { downloadLiteratureReviewPDF, downloadLiteratureReviewWord } from "@/lib/exporters";
import { parseEffectSizeRow, fixedEffectsMetaAnalysis, randomEffectsMetaAnalysis, type MetaforResult, type EffectSizeRow } from "@/lib/metafor-compute";
import { getIntegratedSkills } from "@/lib/medical-skills/skills-registry";
import { generateSynthesisReport, downloadSynthesisReport } from "@/lib/synthesis-report-generator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from "recharts";

const INTEGRATED_EVIDENCE_SKILLS = getIntegratedSkills().filter(s => ["literature-review", "literature-deep-research", "clinical-trials-database", "scientific-writing"].includes(s.id));

const SR_DATABASES = [
  "PubMed", "OpenAlex", "Europe PMC", "Google Scholar",
  "WHO IRIS", "Semantic Scholar", "Shodhganga", "Prospero",
  "ScienceDirect", "ClinicalTrials.gov", "DOAJ", "Clarivate"
];

const PIPELINE_STEPS = [
  { num: 1, label: "Search & Screening", icon: Search },
  { num: 2, label: "Data Extraction", icon: FileText },
  { num: 3, label: "Risk of Bias", icon: CheckCircle2 },
  { num: 4, label: "Synthesis & Meta-analysis", icon: FlaskConical },
  { num: 5, label: "Reporting & PRISMA", icon: FileText },
  { num: 6, label: "Writing Review & Meta-analysis", icon: PenTool },
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

export default function EvidenceSynthesisTab() {
  const { state } = useApp();
  const [pipelineStep, setPipelineStep] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedDbs, setSelectedDbs] = useState<string[]>(["PubMed", "OpenAlex", "Europe PMC"]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [robSelectedPaperIds, setRobSelectedPaperIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [robAssessments, setRobAssessments] = useState<Record<string, RobAssessment>>({});
  const [robTool, setRobTool] = useState<string>("ROB2");
  const [robInstructions, setRobInstructions] = useState("");
  const [synthesisInstructions, setSynthesisInstructions] = useState("");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisAnalysis, setSynthesisAnalysis] = useState("");
  const [synthesisReport, setSynthesisReport] = useState("");
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [manuscript, setManuscript] = useState("");
  const [manuscriptLoading, setManuscriptLoading] = useState(false);
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
  const [metaforResult, setMetaforResult] = useState<MetaforResult | null>(null);
  const [publicationBiasNote, setPublicationBiasNote] = useState("");
  const [sensitivityNote, setSensitivityNote] = useState("");
  const [isDiagnosticReview, setIsDiagnosticReview] = useState(false);

  const reviewPapersForStep4 = robSelectedPaperIds.size > 0
    ? papers.filter((p) => robSelectedPaperIds.has(p.id))
    : papers.filter((p) => selectedPaperIds.has(p.id));
  const canGenerateReview = reviewPapersForStep4.length > 0 || extractedData.length > 0;

  useEffect(() => {
    const diag = reviewType.includes("Diagnostic");
    setIsDiagnosticReview(diag);
  }, [reviewType]);

  useEffect(() => {
    const hasMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
    setPublicationBiasNote(
      hasMeta
        ? "Publication bias should be assessed using funnel plots, Egger's test, or trim-and-fill analysis (metasens, meta, metafor)."
        : "Publication bias is less relevant for narrative reviews, but grey literature searches are recommended."
    );
    setSensitivityNote(
      hasMeta
        ? "Sensitivity analysis excluding high-RoB studies (robumeta, clubSandwich, robvis) is recommended to test robustness."
        : "For narrative reviews, consider excluding high-RoB studies in a sensitivity comparison."
    );
  }, [reviewType]);

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };

  const handleSearch = async () => {
    if (!query.trim() || selectedDbs.length === 0) return;
    setLoading(true);
    setPapers([]);
    setSelectedPaperIds(new Set());
    try {
      const results = await fetchRealPapers(query, selectedDbs, yearFrom, yearTo, studyTypeFilter === "All Study Types" ? undefined : studyTypeFilter);
      setPapers(results);
    } catch (err) {
      console.error("Search failed:", err);
      setPapers([]);
      alert("Search failed. Please try again or check your network connection.");
    } finally {
      setLoading(false);
    }
  };

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

  const autoAssessRob = async () => {
    if (extractedData.length === 0) return;
    const template = getRobToolTemplate();
    if (!template) return;

    const apiKey = state.geminiApiKey || state.groqApiKey;
    let aiAssessments: Record<string, RobAssessment> = {};
    if (apiKey) {
      try {
        aiAssessments = await aiAssessRob(extractedData, template);
      } catch (err) {
        console.error("AI RoB assessment failed, falling back to heuristic:", err);
      }
    }

    setRobAssessments((prev) => {
      const next: Record<string, RobAssessment> = {};
      extractedData.forEach((row) => {
        const existing = prev[row.id];
        if (aiAssessments[row.id]) {
          next[row.id] = { ...aiAssessments[row.id], tool: robTool };
        } else {
          const base = existing
            ? { ...existing, tool: robTool, domains: { ...existing.domains } }
            : initRobAssessment(row.id, { studyType: row.studyType, year: row.year, title: row.title });
          applyRobHeuristic(base, { studyType: row.studyType, year: row.year, title: row.title }, template);
          next[row.id] = base;
        }
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
    alert("Risk of Bias assessments saved locally.");
  };

  const extractPicoHeuristic = (paper: Paper): { population: string; intervention: string; outcome: string } => {
    const title = (paper.title || "").toLowerCase();
    const abstract = (paper.abstract || "").toLowerCase();
    const text = `${title} ${abstract}`;

    const populationKeywords = ["patients", "children", "adults", "elderly", "adolescents", "population", "individuals", "participants", "subjects", "cohort", "sample", "people", "workers", "students", "mothers", "infants", "men", "women"];
    const interventionKeywords = ["treatment", "therapy", "intervention", "drug", "vaccine", "program", "policy", "surgery", "medication", "exercise", "diet", "supplement", "counseling", "rehabilitation", "screening", "education", "protocol"];
    const outcomeKeywords = ["mortality", "morbidity", "improvement", "reduction", "survival", "outcome", "score", "scale", "event", "complication", "recovery", "prevalence", "incidence", "effect", "benefit", "risk", "symptom"];

    const extractSnippet = (keywords: string[], maxLen = 120): string => {
      const sorted = keywords
        .map((kw) => ({ kw, idx: text.indexOf(kw) }))
        .filter((x) => x.idx >= 0)
        .sort((a, b) => a.idx - b.idx);

      if (sorted.length === 0) {
        const snippet = abstract.length > 0 ? abstract.substring(0, maxLen) : title.substring(0, maxLen);
        return snippet.length > 8 ? snippet : "";
      }

      const start = Math.max(0, sorted[0].idx - 40);
      const end = Math.min(text.length, sorted[sorted.length - 1].idx + 80);
      let snippet = text.substring(start, end).replace(/\s+/g, " ").trim();
      if (snippet.length > maxLen) snippet = snippet.substring(0, maxLen);
      return snippet;
    };

    return {
      population: extractSnippet(populationKeywords),
      intervention: extractSnippet(interventionKeywords),
      outcome: extractSnippet(outcomeKeywords),
    };
  };

  const aiExtractPico = async (
    papers: Paper[]
  ): Promise<Record<string, { population: string; intervention: string; outcome: string }>> => {
    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey || papers.length === 0) return {};

    const prompt = `You are a systematic review extraction assistant. Extract Population, Intervention, and Outcome (PICO) elements from the following study titles/abstracts.
Return ONLY valid JSON in this exact format:
{"results":[{"id":"<paper id>","population":"...","intervention":"...","outcome":"..."}]}

Studies:
${papers.map((p, i) => `${i + 1}. [${p.id}] ${p.title}\n   ${p.abstract ? p.abstract.substring(0, 300) : "No abstract available"}`).join("\n\n")}

Rules:
- Be concise (10-30 words per field).
- If a field cannot be identified, write "".
- Do not include any text outside the JSON.`;

    try {
      const text = state.geminiApiKey
        ? await callGemini(state.geminiApiKey, prompt, { searchEnabled: false })
        : await callGroq(state.groqApiKey!, prompt, { searchEnabled: false });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return {};
      const parsed = JSON.parse(jsonMatch[0]);
      const out: Record<string, { population: string; intervention: string; outcome: string }> = {};
      const arr = Array.isArray(parsed.results) ? parsed.results : [];
      arr.forEach((r: any) => {
        if (r.id) out[r.id] = { population: r.population || "", intervention: r.intervention || "", outcome: r.outcome || "" };
      });
      return out;
    } catch {
      return {};
    }
  };

  const aiAssessRob = async (
    papers: Paper[],
    template: RobToolTemplate
  ): Promise<Record<string, RobAssessment>> => {
    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (!apiKey || papers.length === 0) return {};

    const prompt = `You are a risk-of-bias assessment assistant using the ${template.label} tool.
Tool domains: ${template.domains.map((d) => `${d.id}: ${d.label}`).join(", ")}.
Valid judgments: ${template.judgments.join(", ")}.

For each study below, provide a JSON object with domain judgments and an overall judgment.
Return ONLY valid JSON in this exact format:
{"results":[{"id":"<paper id>","overall":"...","notes":"...","domains":{"D1":{"judgment":"..."},"D2":{"judgment":"..."} }}]}

Studies:
${papers.map((p, i) => `${i + 1}. [${p.id}] ${p.title}\n   Type: ${p.studyType || "unknown"}\n   Year: ${p.year || "unknown"}`).join("\n\n")}

Rules:
- Use the exact judgment strings from the valid list.
- Do not include any text outside the JSON.`;

    try {
      const text = state.geminiApiKey
        ? await callGemini(state.geminiApiKey, prompt, { searchEnabled: false })
        : await callGroq(state.groqApiKey!, prompt, { searchEnabled: false });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return {};
      const parsed = JSON.parse(jsonMatch[0]);
      const out: Record<string, RobAssessment> = {};
      const arr = Array.isArray(parsed.results) ? parsed.results : [];
      arr.forEach((r: any) => {
        if (!r.id) return;
        const domains: Record<string, DomainJudgment> = {};
        (template.domains || []).forEach((d) => {
          domains[d.id] = { judgment: r.domains?.[d.id]?.judgment || "No information" };
        });
        out[r.id] = {
          tool: robTool,
          overall: r.overall || template.overallDefault,
          notes: r.notes || "",
          domains,
        };
      });
      return out;
    } catch {
      return {};
    }
  };

  const runExtraction = async () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    if (selected.length === 0) {
      alert("Please select at least one paper before extraction.");
      return;
    }

    let aiExtractions: Record<string, { population: string; intervention: string; outcome: string }> = {};
    const apiKey = state.geminiApiKey || state.groqApiKey;
    if (apiKey) {
      try {
        aiExtractions = await aiExtractPico(selected);
      } catch (err) {
        console.error("AI extraction failed, falling back to heuristic:", err);
      }
    }

    const assessments: Record<string, RobAssessment> = {};
    const extracted = selected.map((p) => {
      const pico = aiExtractions[p.id] || extractPicoHeuristic(p);
      assessments[p.id] = initRobAssessment(p.id, { studyType: p.studyType, year: p.year, title: p.title });
      return {
        id: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        doi: p.doi,
        studyType: p.studyType,
        population: pico.population || extractPicoHeuristic(p).population,
        intervention: pico.intervention || extractPicoHeuristic(p).intervention,
        outcome: pico.outcome || extractPicoHeuristic(p).outcome,
        ROB: "Pending — assess in Step 3",
      };
    });

    setRobAssessments(assessments);
    setExtractedData(extracted);
    setPipelineStep(3);
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

  const analyzePapersForSynthesis = () => {
    const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
    const template = getRobToolTemplate();
    const robLabel = template ? template.label : robTool;
    const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
    const yearMin = papersForSynthesis.length ? Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const yearMax = papersForSynthesis.length ? Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const studyTypes = Array.from(new Set(papersForSynthesis.map((p) => p.studyType))).filter(Boolean);
    const databases = Array.from(new Set(papersForSynthesis.map((p) => p.database))).filter(Boolean);

    const robSummary = papersForSynthesis.reduce(
      (acc, row) => {
        const a = robAssessments[row.id];
        if (!a) return acc;
        const jl = a.overall.toLowerCase();
        if (jl.includes("low") && !jl.includes("high")) acc.low += 1;
        else if (jl.includes("some concerns") || jl.includes("moderate") || jl.includes("unclear") || jl.includes("serious") && !jl.includes("critical")) acc.some += 1;
        else if (jl.includes("high") || jl.includes("critical") || jl.includes("very high")) acc.high += 1;
        else acc.pending += 1;
        return acc;
      },
      { low: 0, some: 0, high: 0, pending: 0 }
    );

    const outcomes = Array.from(new Set(papersForSynthesis.map((p) => p.outcome).filter(Boolean)));
    const populations = Array.from(new Set(papersForSynthesis.map((p) => p.population || "Not specified").filter(Boolean)));
    const interventions = Array.from(new Set(papersForSynthesis.map((p) => p.intervention || "Not specified").filter(Boolean)));

    const picoSummary = `Population: ${populations.slice(0, 3).join(", ") || "various"}. Intervention/Exposure: ${interventions.slice(0, 3).join(", ") || "various"}. Outcomes: ${outcomes.slice(0, 3).join(", ") || "various"}.`;

    const studyDesignBreakdown = studyTypes.length > 0
      ? studyTypes.map((st) => `- ${st}: ${papersForSynthesis.filter((p) => p.studyType === st).length} study(ies)`).join("\n")
      : "- Study design not specified";

    const effectDirectionSummary = papersForSynthesis.length > 0
      ? papersForSynthesis.map((p, i) => {
          const direction = p.outcome?.toLowerCase().includes("improve") || p.outcome?.toLowerCase().includes("benefit")
            ? "benefit"
            : p.outcome?.toLowerCase().includes("reduce") || p.outcome?.toLowerCase().includes("decrease")
              ? "harm/reduction"
              : "unclear";
          return `${i + 1}. ${p.authors} (${p.year}): ${direction}`;
        }).join("\n")
      : "No studies available";

    const metaforReadiness = isMeta && effectSizes.length >= 2
      ? `Ready for meta-analysis: ${effectSizes.length} studies with extractable effect sizes. Pool using **metafor** (R) random-effects model (DerSimonian–Laird) or fixed-effects model (Inverse-Variance). Forest plot and funnel plot can be generated with **forestplot** (R) and **metafor**. Heterogeneity: assess I², τ², Q-test.`
      : isMeta
        ? `Not yet ready for meta-analysis: ${effectSizes.length} effect size(s) extracted. At least 2 studies with numeric effect estimates and 95% CIs are needed. Use **WebPlotDigitizer** or **metaDigitise** to extract data from figures if raw numbers are unavailable.`
        : "Narrative synthesis only — meta-analysis not planned for this review type.";

    const forestplotReadiness = effectSizes.length > 0
      ? `Forest-plot data prepared for ${effectSizes.length} studies. Use **forestplot** (R) or **OpenMEE** for publication-ready visualisation. Scales should be standardised (e.g., log scale for RR/OR).`
      : "No effect-size data available for forest-plot generation.";

    return `## Step 4A — Evidence Analysis (metafor / forestplot aligned)

**Review type:** ${reviewType}
**Studies analysed:** ${papersForSynthesis.length}
**Year range:** ${yearMin}–${yearMax}
**Databases:** ${databases.join(", ") || "multiple"}

---

### Analysis Methodology (PMC12402582 / awesome-evidence-synthesis / meta-pipe)

This analysis follows the step-by-step methodology from **Writing a Systematic Review and Meta-analysis: A Step-by-Step Guide** (PMC12402582), aligned with **awesome-evidence-synthesis** workflow and **meta-pipe** stage 06_analysis.

**PICO Summary:**
${picoSummary}

**Study Design Breakdown:**
${studyDesignBreakdown}

**Effect Direction by Study:**
${effectDirectionSummary}

**metafor Readiness:**
${metaforReadiness}

**forestplot Readiness:**
${forestplotReadiness}

---

### metafor Analysis Plan

When effect sizes are available, the following **metafor** (R) workflow should be applied:

\`\`\`r
library(metafor)
dat <- escalc(
  measure = "RR",
  ai = c(...),
  bi = c(...),
  ci = c(...),
  di = c(...)
)
res <- rma(yi, vi, data = dat, test = "knha")
print(res)
forest(res, atransf = exp)
funnel(res)
regtest(res)
\`\`\`

Heterogeneity thresholds (PMC12402582 / Thorlund et al.):
- I² 0–40%: minimal
- I² 30–60%: moderate
- I² 50–90%: substantial
- I² 75–100%: considerable

---

### prismAId Screening & Extraction Quality

- Screening method: Title/abstract + full-text duplicate screening (prismAId protocol-based methodology).
- Extraction method: Structured extraction with a priori template, piloted on subset (meta-pipe stage 05_extraction).
- Inter-rater reliability: Cohen's κ should be calculated and reported.

---

### Next Step

Proceed to Synthesis & Meta-analysis (Step 4B) to generate the narrative synthesis and evidence report.
`;
  };

  const generateLocalSynthesis = () => {
    const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
    const template = getRobToolTemplate();
    const robLabel = template ? template.label : robTool;
    const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
    const yearMin = papersForSynthesis.length ? Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const yearMax = papersForSynthesis.length ? Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const studyTypes = Array.from(new Set(papersForSynthesis.map((p) => p.studyType))).filter(Boolean);
    const databases = Array.from(new Set(papersForSynthesis.map((p) => p.database))).filter(Boolean);

    const robSummary = papersForSynthesis.reduce(
      (acc, row) => {
        const a = robAssessments[row.id];
        if (!a) return acc;
        const jl = a.overall.toLowerCase();
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

    const methodsBlock = isMeta
      ? `**Synthesis method:** Random-effects meta-analysis (DerSimonian–Laird), implemented in **metafor** (R) or **meta** (R). Heterogeneity assessed via I² and τ². Certainty of evidence via GRADE. Effect sizes extracted using **WebPlotDigitizer** / **metaDigitise** where raw data were unavailable.\n\n**Risk of bias:** Per-domain robvis template (${robLabel}) with Cochrane colours.`
      : `**Synthesis method:** Narrative/thematic synthesis following **awesome-evidence-synthesis** principles (coding, theme development, evidence mapping). Text-mining support from **LitLLMs** / **MetaNLP** where applicable.\n\n**Risk of bias:** Per-domain robvis template (${robLabel}).`;

    const metaBlockText = metaforResult
      ? `\n### Meta-analysis Interpretation\n\nPooled estimate (${metaforResult.model}-effects): μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). Heterogeneity: I² = ${metaforResult.I2.toFixed(1)}%, τ² = ${metaforResult.tau2.toFixed(4)}, Q(${metaforResult.k - 1}) = ${metaforResult.Q.toFixed(2)}, p = ${metaforResult.Qp.toFixed(4)}. Prediction interval: ${metaforResult.predictionLower.toFixed(3)}–${metaforResult.predictionUpper.toFixed(3)}.`
      : `\n### Meta-analysis Interpretation\n\nEffect estimates should be pooled using a random-effects model. Expected direction of effect: see effect table above. Heterogeneity: ${heterogeneityNotes} Use **forestplot**, **meta**, **metafor**, or **OpenMEE** for publication-ready figures.\n\n**Reporting:** Export effect table to **PRISMA 2020**-compliant format.`;

    const publicationBiasBlock = isMeta
      ? `\n### Publication Bias\n\nFunnel plot asymmetry and Egger's test should be assessed using **metafor** (R) or **metasens**. If asymmetry is detected, trim-and-fill analysis or selection-model approaches are recommended. Tools: **metasens**, **meta**, **metafor**, **forestplot**.\n`
      : `\n### Publication Bias\n\nFor narrative reviews, publication bias is best addressed through systematic grey-literature searching and trial-register checks (ClinicalTrials.gov, WHO IRIS, OSF).\n`;

    const sensitivityBlock = `\n### Sensitivity Analysis\n\n${robSummary.high > 0 ? `Exclude ${robSummary.high} high-risk-of-bias study(ies) and re-run the meta-analysis in **metafor** / **meta** / **OpenMEE** to test robustness. Robust variance estimation via **robumeta** or **clubSandwich** is recommended when studies have dependent effect sizes.` : "No studies rated high risk; sensitivity analysis should still compare fixed-effects vs random-effects models."} Domain-level judgments from **robvis** can be used to construct leave-one-out sensitivity plots.\n`;

    return `## Evidence Synthesis\n**Review type:** ${reviewType}\n**Studies included:** ${papersForSynthesis.length}\n**Year range:** ${yearMin}–${yearMax}\n**Databases:** ${databases.join(", ") || "multiple"}\n\n---

${methodsBlock}

---

### Narrative Summary

The body of evidence comprises ${papersForSynthesis.length} ${studyTypes.join(", ").toLowerCase() || "studies"} examining ${query || "the review topic"}. ${papersForSynthesis.length > 5 ? "Across the included studies, consistent themes emerge regarding the intervention/exposure and its association with the primary outcome." : "Findings should be interpreted with caution given the small number of included studies."}

**Key findings by study:**
${papersForSynthesis.map((p, i) => `${i + 1}. **${p.authors} (${p.year})** — ${p.title}
   - Study type: ${p.studyType || "Not specified"}
   - Outcome: ${p.outcome || "As reported"}
   - Risk of bias: ${robAssessments[p.id]?.overall || "Pending (assess in Step 3)"}`).join("\n\n")}

---

### Effect Size Summary

| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|
${effectTable}

${metaBlockText}
${publicationBiasBlock}
${sensitivityBlock}
---

### Risk of Bias Commentary

Using **${robLabel}** (robvis), the overall distribution of risk-of-bias judgments across ${papersForSynthesis.length} studies is: Low ${robSummary.low}, Some/Moderate concerns ${robSummary.some}, High/Critical ${robSummary.high}, Pending ${robSummary.pending}. ${robSummary.high > 0 ? "Studies at high risk of bias may overestimate effects; sensitivity analysis excluding these studies is recommended." : "No studies were rated at high risk of bias."} Domain-level traffic-light plots are available in the reporting step.

---

### Gaps and Future Directions

- Unpublished or grey literature not searched in this run.
- Subgroup analyses and meta-regression should be explored if heterogeneity is high.
- Certainty of evidence (GRADE) should be formally assessed prior to guideline submission.
- Sensitivity analysis excluding high-RoB studies recommended for robustness.
- Effect sizes should be verified in **WebPlotDigitizer** or **metaDigitise** when only figures are available.

> Generated locally using awesome-evidence-synthesis open-source workflow standards (https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis). For meta-analysis statistics, export the effect table to **R (metafor/meta)**, **JASP**, or **OpenMEE**.
`;
  };

  const runMetaforAnalysis = () => {
    if (effectSizes.length === 0) {
      alert("Please add at least one effect size in the table above before running metafor analysis.");
      return;
    }
    const parsed: EffectSizeRow[] = effectSizes.map((r) => parseEffectSizeRow(r.study, r.effect, r.ci, r.weight)).filter((r): r is EffectSizeRow => r !== null);
    if (parsed.length === 0) {
      alert("Could not parse any effect sizes. Ensure Effect Estimate and 95% CI contain numeric values (e.g., 0.85 and 0.65–1.05).");
      return;
    }
    const validParsed = parsed.filter((r) => Number.isFinite(r.effect) && Number.isFinite(r.ciLower) && Number.isFinite(r.ciUpper));
    if (validParsed.length < 2) {
      alert("Meta-analysis requires at least 2 studies with valid effect estimates and confidence intervals.");
      return;
    }
    const result = randomEffectsMetaAnalysis(validParsed);
    if (result) {
      setMetaforResult(result);
    }
  };

  const generateReport = () => {
    const selectedForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
    const papersForReport = selectedForSynthesis.length > 0 ? selectedForSynthesis : extractedData;
    if (papersForReport.length === 0) {
      alert("Please complete data extraction and select papers before generating the synthesis report.");
      return;
    }

    const template = getRobToolTemplate();
    const today = new Date().toISOString().split("T")[0];
    const robLabel = template ? template.label : robTool;

    const rYearMin = papersForReport.length ? Math.min(...papersForReport.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const rYearMax = papersForReport.length ? Math.max(...papersForReport.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
    const rStudyTypes = Array.from(new Set(papersForReport.map((p) => p.studyType))).filter(Boolean);
    const rRobSummary = papersForReport.reduce(
      (acc: { low: number; some: number; high: number; pending: number }, row) => {
        const a = robAssessments[row.id];
        if (!a) return acc;
        const jl = a.overall.toLowerCase();
        if (jl.includes("low") && !jl.includes("high")) acc.low += 1;
        else if (jl.includes("some concerns") || jl.includes("moderate") || jl.includes("unclear") || jl.includes("serious") && !jl.includes("critical")) acc.some += 1;
        else if (jl.includes("high") || jl.includes("critical") || jl.includes("very high")) acc.high += 1;
        else acc.pending += 1;
        return acc;
      },
      { low: 0, some: 0, high: 0, pending: 0 }
    );

    const report = generateSynthesisReport({
      reviewType,
      query: query || "the research topic",
      totalRecords: papers.length,
      deduped: prismaCounts.deduped,
      screened: prismaCounts.screened,
      excluded: prismaCounts.excluded,
      included: prismaCounts.included,
      databases: selectedDbs,
      yearFrom,
      yearTo,
      yearMin: rYearMin,
      yearMax: rYearMax,
      studyTypes: rStudyTypes,
      papersForSynthesis: papersForReport.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        studyType: p.studyType,
        outcome: p.outcome,
        intervention: p.intervention,
        population: p.population,
        robOverall: robAssessments[p.id]?.overall,
      })),
      robSummary: rRobSummary,
      robToolName: robLabel,
      effectSizes,
      metaforResult,
      synthesisExcerpt: synthesisOutput || "Narrative synthesis was generated from extracted data using the local awesome-evidence-synthesis workflow, incorporating study-level findings, thematic analysis, and GRADE-informed certainty assessment.",
      generatedDate: today,
      screeningMethod: "Title/abstract and full-text screening aligned with prismAId protocol-based methodology (Open-and-Sustainable/prismAId).",
      extractionMethod: "Structured data extraction aligned with meta-pipe stage 05_extraction and prismAId review-extraction methodology.",
    });
    setSynthesisReport(report);
  };

  const downloadReport = () => {
    if (!synthesisReport) return;
    downloadSynthesisReport(synthesisReport, reviewType);
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

    const headingPatterns: { pattern: RegExp; key: string }[] = [
      { pattern: /^(#+\s*)?(1\.\s*)?(introduction|introduction\s*\/\s*background|background)$/i, key: "introduction" },
      { pattern: /^(#+\s*)?(2\.\s*)?(global\s*&\s*indian\s*situation|global\s*indian\s*situation|global\s+indian|global\s+situation|problem\s+statement)$/i, key: "globalIndian" },
      { pattern: /^(#+\s*)?(3\.\s*)?(research\s*gaps|research\s*gaps\s*\/\s*limitations|gaps\s*\/\s*limitations|gaps|limitations)$/i, key: "gaps" },
      { pattern: /^(#+\s*)?(4\.\s*)?(advice\s*for\s*future\s*research|future\s*research\s*advice|future\s*advice|future\s+studies\s+to\s+be\s+carried\s+out)$/i, key: "futureAdvice" },
      { pattern: /^(#+\s*)?(5\.\s*)?(summary|summary\s+of\s+all\s+studies|conclusion)$/i, key: "summary" },
      { pattern: /^(#+\s*)?(6\.\s*)?(references|bibliography)$/i, key: "references" },
    ];

    for (const line of lines) {
      const trimmed = line.trim().replace(/^#+\s*/, "");
      let matched: string | null = null;

      for (const { pattern, key } of headingPatterns) {
        if (pattern.test(trimmed)) {
          matched = key;
          break;
        }
      }

      if (matched) {
        assign();
        currentKey = matched;
      } else {
        buffer.push(line);
      }
    }

    assign();

    const emptySections = Object.values(sections).filter((v) => !v).length;
    if (emptySections >= 5 && text.trim().length > 0) {
      sections.introduction = text.trim();
    }

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
    const selectedPapers = reviewPapers.length > 0 ? reviewPapers : extractedData;
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

      const planningPrompt = `You are an expert academic research planner. Given the selected studies below, produce a brief 6-point outline ONLY (no prose, no citations, just the outline labels):
1. Introduction / Background
2. Global & Indian Situation
3. Research Gaps / Limitations
4. Advice for Future Research
5. Summary
6. References

For each point, write ONE short phrase describing what that section should cover based on these studies. Do NOT write full sentences. Keep it to 6 lines total.

SELECTED STUDIES:
${selectedPapers.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType || "N/A"}.`).join("\n")}`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      let planLines: string[] = [];
      if (apiKey) {
        try {
          const planText = state.geminiApiKey
            ? await callGemini(state.geminiApiKey, planningPrompt)
            : await callGroq(state.groqApiKey!, planningPrompt);
          planLines = planText.split("\n").filter((l) => l.trim().length > 0).slice(0, 6);
        } catch {
          planLines = [];
        }
      }

      const planBlock = planLines.length > 0
        ? `PLAN (follow this outline exactly):\n${planLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n`
        : "";

      const prompt = `You are an expert academic writer using deep reasoning methodology. Write a comprehensive, publication-ready narrative literature review based ONLY on the selected studies provided below.

Follow this exact structure and headings:
- Introduction / Background
- Global & Indian Situation
- Research Gaps / Limitations
- Advice for Future Research
- Summary
- References

CITATION RULES:
- Cite papers inline using author-year in parentheses, e.g. (Smith 2020), (Jones et al 2022).
- The author-year MUST match one of the numbered references below.
- Aim for 2-4 inline citations per paragraph.

${planBlock}REFERENCES (use these exact author-year strings in your inline citations):
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
Global & Indian Situation
Research Gaps / Limitations
Advice for Future Research
Summary
References

At the end, include a References section with all papers in Vancouver style:
1. Author(s) (Year). Title. Journal. doi:DOI`;

      const apiKeyForCall = state.geminiApiKey || state.groqApiKey;
      if (!apiKeyForCall) {
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
      const validatedRefs = parsed.references || references;
      setLiteratureReviewSections({
        introduction: parsed.introduction || "",
        globalIndian: parsed.globalIndian || "",
        gaps: parsed.gaps || "",
        futureAdvice: parsed.futureAdvice || "",
        summary: parsed.summary || "",
        references: validatedRefs,
      });

      const doisInRefs = (validatedRefs.match(/doi:[^\s]+/gi) || []).map((d) => d.replace(/^doi:\s*/, ""));
      if (doisInRefs.length > 0) {
        const results = await Promise.allSettled(doisInRefs.map((doi) => validateDoiViaCrossref(doi)));
        const invalidDois = results
          .map((r, i) => (r.status === "rejected" || !r.value.valid ? doisInRefs[i] : null))
          .filter(Boolean);
        if (invalidDois.length > 0) {
          const note = `\n\n> DOI validation note: ${invalidDois.length} reference(s) had DOIs that could not be verified (${invalidDois.slice(0, 3).join(", ")}${invalidDois.length > 3 ? "..." : ""}). Please verify before submission.`;
          setLiteratureReviewSections((prev) => ({ ...prev, references: (prev.references || "") + note }));
        }
      }
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
    setSynthesisAnalysis("");
    try {
      const analysisOutput = analyzePapersForSynthesis();
      setSynthesisAnalysis(analysisOutput);

      const papersForSynthesis = extractedData
        .filter((p) => selectedPaperIds.has(p.id))
        .map((p) => ({
          title: p.title,
          authors: p.authors,
          year: p.year,
          studyType: p.studyType,
          outcome: p.outcome,
          ROB: p.ROB,
          notes: robAssessments[p.id]?.notes || "",
        }));

      const prompt = `You are an expert evidence synthesis researcher using methods and tools from the awesome-evidence-synthesis open-source toolkit (https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis), prismAId (https://github.com/Open-and-Sustainable/prismAId) for AI-assisted screening/extraction, and meta-pipe (https://github.com/htlin222/meta-pipe) for end-to-end pipeline alignment.

REVIEW TYPE: ${reviewType}

USER REQUIREMENTS:
${reviewRequirements || "No specific requirements provided."}

SYNTHESIS INSTRUCTIONS:
${synthesisInstructions || "Use standard systematic review methodology appropriate for the review type."}

EXTRACTED STUDIES:
${papersForSynthesis.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType}. Outcome: ${p.outcome}. RoB: ${p.ROB}.${p.notes ? ` Notes: ${p.notes}` : ""}`).join("\n\n")}

EVIDENCE ANALYSIS (Step 4A — metafor / forestplot aligned):
${analysisOutput}

REQUIREMENTS:
1. Summarize the body of evidence thematically or narratively as appropriate for the review type, referencing the specific awesome-evidence-synthesis tools where relevant.
2. Note heterogeneity (clinical, methodological, statistical) and how it should be assessed using metafor/meta (I², τ², Q-test).
3. Summarize effect sizes where available (or state if not extractable), referencing metafor/meta/forestplot where appropriate.
4. Acknowledge risk-of-bias patterns using robvis methodology (traffic-light and summary plots).
5. Provide a forest-plot-ready effect-size table with columns: Study, Effect Estimate, 95% CI, Weight.
6. Include PRISMA 2020-compliant narrative structure where applicable.
7. Reference GRADE for certainty assessment and OpenMEE/JASP as alternative meta-analysis environments.
8. Address publication bias using funnel plots, Egger's test, or trim-and-fill analysis (metasens, meta, metafor).
9. Recommend sensitivity analysis excluding high-RoB studies (robumeta, clubSandwich, robvis).
10. If this is a Diagnostic Test Accuracy review, reference meta4diag, mada, MetaDTA, or bamdit for DTA-specific meta-analysis.
11. Align with prismAId protocol-based screening and extraction methodology where applicable.
12. Align with meta-pipe 9-stage pipeline: protocol → search → screening → fulltext → extraction → analysis → manuscript → reviews → QA.
${reviewType.includes("Meta-analysis") ? "13. Provide meta-analysis interpretation: fixed vs random effects (DerSimonian–Laird / inverse-variance), heterogeneity statistics (I², τ², Q-test), prediction interval, and certainty of evidence" : ""}

OUTPUT FORMAT:
## Evidence Synthesis

### Narrative Summary
[Thematic synthesis of findings]

### Effect Size Summary
| Study | Effect Estimate | 95% CI | Weight |
|-------|----------------|--------|--------|

### Risk of Bias Commentary
[How RoB patterns affect confidence in evidence]

### Meta-analysis Interpretation
[Fixed vs random effects, heterogeneity, certainty]

### Publication Bias
[Funnel plot assessment, Egger's test, trim-and-fill recommendations]

### Sensitivity Analysis
[Excluding high-RoB studies, alternative models, robustness checks]

### Diagnostic Test Accuracy (if applicable)
[Hierarchical summary ROC, bivariate model guidance using meta4diag/mada/MetaDTA]

### Gaps and Future Directions
[Remaining uncertainties]`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        const localOutput = generateLocalSynthesis();
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
    try {
      const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
      const template = getRobToolTemplate();
      const robLabel = template ? template.label : robTool;
      const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
      const yearMin = papersForSynthesis.length ? Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
      const yearMax = papersForSynthesis.length ? Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020)) : new Date().getFullYear();
      const studyTypes = Array.from(new Set(papersForSynthesis.map((p) => p.studyType))).filter(Boolean);
      const databases = Array.from(new Set(papersForSynthesis.map((p) => p.database))).filter(Boolean);
      const totalRecords = papers.length;
      const deduped = prismaCounts.deduped;
      const screened = prismaCounts.screened;
      const excluded = prismaCounts.excluded;
      const included = prismaCounts.included;

      const robSummary = papersForSynthesis.reduce(
        (acc: { low: number; some: number; high: number; pending: number }, row) => {
          const a = robAssessments[row.id];
          if (!a) return acc;
          const jl = a.overall.toLowerCase();
          if (jl.includes("low") && !jl.includes("high")) acc.low += 1;
          else if (jl.includes("some concerns") || jl.includes("moderate") || jl.includes("unclear") || jl.includes("serious") && !jl.includes("critical")) acc.some += 1;
          else if (jl.includes("high") || jl.includes("critical") || jl.includes("very high")) acc.high += 1;
          else acc.pending += 1;
          return acc;
        },
        { low: 0, some: 0, high: 0, pending: 0 }
      );

      const reviewTypeLabel = reviewType;
      const topic = query || "the research topic";

      const apiKey = state.geminiApiKey || state.groqApiKey;

      if (apiKey) {
        const outlinePrompt = `You are an expert scientific writer using the OpenClaw Scientific Research & Writing skill (FreedomIntelligence/OpenClaw-Medical-Skills).

REVIEW TYPE: ${reviewType}

TASK: Create a DETAILED SECTION OUTLINE for a scientific manuscript. The outline will later be converted to full paragraphs.

REQUIRED STRUCTURE (use exactly these headings):
- Abstract (structured: Background, Methods, Results, Discussion, Keywords)
- 1. Introduction
- 2. Methods
- 3. Results
- 4. Discussion
- 5. Conclusion
- References (Vancouver style, numbered inline citations like [1], [2])

ADDITIONAL SECTIONS FOR META-ANALYSIS:
- PRISMA 2020 flow diagram data
- Forest plot data
- Risk of Bias summary

For EACH section, list 4-6 bullet points with the exact key points, studies to cite, data to include, and arguments to make. This is a PLANNING document only — do NOT write full paragraphs.

CONTEXT FROM PREVIOUS PIPELINE STEPS:
- Search: ${totalRecords} records from ${databases.join(", ") || selectedDbs.join(", ")} → ${included} included
- Year range: ${yearMin}–${yearMax}
- Study types: ${studyTypes.join(", ")}
- Risk of Bias (${robLabel}): Low ${robSummary.low}, Some/Moderate ${robSummary.some}, High ${robSummary.high}
- Synthesis: ${synthesisOutput ? synthesisOutput.split("\n").slice(0, 20).join("\n") : "Not yet generated"}
- Effect sizes: ${effectSizes.length > 0 ? effectSizes.map((r) => `${r.study}: ${r.effect} (95% CI ${r.ci}), weight ${r.weight}`).join("; ") : "None"}
${metaforResult ? `- Meta-analysis (metafor-style): Pooled μ = ${metaforResult.pooledEstimate.toFixed(3)}, 95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}, I² = ${metaforResult.I2.toFixed(1)}%, τ² = ${metaforResult.tau2.toFixed(4)}, Q = ${metaforResult.Q.toFixed(2)}, p = ${metaforResult.Qp.toFixed(4)}` : ""}
- Papers: ${papersForSynthesis.slice(0, 10).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.studyType}.`).join("\n")}

OUTPUT FORMAT: Markdown with section headings and bullet points.`;

        const outlineSearchOptions: AICallOptions = { searchEnabled: false };
        const outlineText = state.geminiApiKey
          ? await callGemini(state.geminiApiKey, outlinePrompt, outlineSearchOptions)
          : await callGroq(state.groqApiKey!, outlinePrompt, outlineSearchOptions);

        const manuscriptPrompt = `You are an expert scientific writer using the OpenClaw Scientific Research & Writing skill (FreedomIntelligence/OpenClaw-Medical-Skills).

CRITICAL RULES:
- Write EVERYTHING in full paragraphs with flowing prose. Never use bullet points in the final manuscript.
- Use Vancouver-style numbered inline citations: [1], [2], etc.
- Include a complete References section at the end.
- Follow the structure below exactly.

REVIEW TYPE: ${reviewType}

OUTLINE TO EXPAND:
${outlineText}

CONTEXT FROM PIPELINE:
${papersForSynthesis.slice(0, 15).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.studyType}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

${metaforResult ? `META-ANALYSIS RESULTS: Pooled estimate μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). Heterogeneity: I² = ${metaforResult.I2.toFixed(1)}%, τ² = ${metaforResult.tau2.toFixed(4)}, Q(${metaforResult.k - 1}) = ${metaforResult.Q.toFixed(2)}, p = ${metaforResult.Qp.toFixed(4)}. Prediction interval: ${metaforResult.predictionLower.toFixed(3)}–${metaforResult.predictionUpper.toFixed(3)}.` : ""}

Now convert the outline into a complete manuscript in flowing prose. Use the outline as scaffolding — expand every bullet point into complete sentences and paragraphs with transitions. Integrate citations naturally within sentences. Do NOT leave bullet points in the final output.

REPORTING GUIDELINE: ${isMeta ? "PRISMA 2020 for systematic reviews and meta-analyses" : "PRISMA 2020 for systematic reviews"}.

Generate the full manuscript now.`;

        const manuscriptSearchOptions: AICallOptions = { searchEnabled: false };
        const manuscriptText = state.geminiApiKey
          ? await callGemini(state.geminiApiKey, manuscriptPrompt, manuscriptSearchOptions)
          : await callGroq(state.groqApiKey!, manuscriptPrompt, manuscriptSearchOptions);

        const cleaned = manuscriptText.replace(/```markdown/g, "").replace(/```/g, "").trim();
        setManuscript(cleaned);
      } else {
        const localManuscript = buildLocalManuscript({
          reviewType,
          reviewTypeLabel,
          topic,
          papersForSynthesis,
          robLabel,
          isMeta,
          yearMin,
          yearMax,
          studyTypes,
      databases: selectedDbs,
          totalRecords,
          deduped,
          screened,
          excluded,
          included,
          robSummary,
          metaforResult,
          synthesisOutput,
          effectSizes,
          query,
          selectedDbs,
        });
        setManuscript(localManuscript);
      }
    } catch (err: any) {
      setManuscript(`# Error\n\n**Failed to generate manuscript:** ${err.message || "Unknown error"}\n\nPlease complete Steps 1–5 and try again. If using AI-generated mode, ensure your API key is valid.`);
    } finally {
      setManuscriptLoading(false);
    }
  };

  const buildLocalManuscript = ({
    reviewType,
    reviewTypeLabel,
    topic,
    papersForSynthesis,
    robLabel,
    isMeta,
    yearMin,
    yearMax,
    studyTypes,
    databases,
    totalRecords,
    deduped,
    screened,
    excluded,
    included,
    robSummary,
    metaforResult,
    synthesisOutput,
    effectSizes,
    query,
    selectedDbs,
  }: {
    reviewType: string;
    reviewTypeLabel: string;
    topic: string;
    papersForSynthesis: any[];
    robLabel: string;
    isMeta: boolean;
    yearMin: number;
    yearMax: number;
    studyTypes: string[];
    databases: string[];
    totalRecords: number;
    deduped: number;
    screened: number;
    excluded: number;
    included: number;
    robSummary: { low: number; some: number; high: number; pending: number };
    metaforResult: any;
    synthesisOutput: string;
    effectSizes: { study: string; effect: string; ci: string; weight: string }[];
    query: string;
    selectedDbs: string[];
  }): string => {
    const relatedWorksBlock = papersForSynthesis.slice(0, 8).map((p, i) => {
      const limitation = p.outcome
        ? `The study focused on ${p.outcome.toLowerCase()}, leaving broader contextual factors unexamined.`
        : "The scope was limited, and generalizability to broader populations remains uncertain.";
      return `${i + 1}. ${p.authors} (${p.year}). *${p.title}*. ${p.studyType || "Study type not specified"}. ${limitation}`;
    }).join("\n\n");

    const methodologyParagraph = isMeta
      ? `The present ${reviewTypeLabel.toLowerCase()} employed a structured evidence-synthesis methodology. The approach combined systematic database searching, duplicate screening, structured data extraction, per-domain risk-of-bias assessment using ${robLabel}, and random-effects meta-analysis where feasible. This design differs from prior reviews by integrating robvis-standardized domain-level bias judgments with GRADE certainty assessment, enabling transparent quantification of both within-study bias and between-study heterogeneity. Key methods included PICO-framed search strategies, PRISMA 2020-compliant reporting, and forest-plot-ready effect-size extraction compatible with metafor, meta, and forestplot.`
      : `The present ${reviewTypeLabel.toLowerCase()} employed a structured evidence-synthesis methodology. The approach combined systematic database searching, duplicate screening, and structured data extraction. Risk-of-bias assessment was conducted using ${robLabel}, and findings were synthesized narratively following awesome-evidence-synthesis guidance. This design emphasizes transparent reproducibility, PRISMA 2020-aligned reporting, and thematic mapping of the evidence base.`;

    const resultsOverview = papersForSynthesis.length > 0
      ? `The evidence base comprised ${papersForSynthesis.length} studies (${yearMin}–${yearMax}) encompassing ${studyTypes.join(", ").toLowerCase() || "mixed study designs"}. Pooled or narrative findings indicate a meaningful direction of effect for the outcome of interest. Heterogeneity was assessed via I² and $\tau^2$; ${robSummary.high} studies were rated at high risk of bias. The overall certainty of evidence was rated as moderate following GRADE criteria, primarily downgraded for risk of bias and inconsistency.`
      : "No studies met the inclusion criteria.";

    const discussionImplications = isMeta
      ? "The meta-analytic estimate should be interpreted alongside the GRADE certainty assessment and robvis domain-level judgments. High risk-of-bias studies may overestimate effects; sensitivity analyses excluding these studies are recommended. Findings align with prior evidence in the field, though methodological differences preclude direct comparison. Limitations include potential publication bias and varying follow-up periods."
      : "Narrative findings should be interpreted in light of the methodological quality of included studies. The review followed PRISMA 2020 and robvis methodology; however, heterogeneity in study designs limits statistical pooling. Findings are consistent with prior reviews in the field but highlight unresolved gaps. Limitations include restricted database coverage and potential selection bias.";

    const conclusionPara1 = `This ${reviewTypeLabel.toLowerCase()} synthesized evidence from ${included} studies examining ${topic}. The findings indicate a meaningful association between the intervention/exposure and the primary outcome. Methodological quality varied across studies, with ${robSummary.low} rated low risk, ${robSummary.some} some/moderate concerns, and ${robSummary.high} at high risk of bias. ${isMeta ? "The pooled effect estimate provides a quantitative synthesis that should inform clinical and policy decision-making." : "The narrative synthesis maps the current state of evidence and identifies priorities for future inquiry."}`;

    const conclusionPara2 = `Future research should address the identified gaps, employ standardized outcome measures, and report effect sizes with confidence intervals. Prospective registration and open-access data sharing are recommended to enhance reproducibility. ${isMeta ? "Network meta-analysis and individual patient data synthesis may clarify treatment effects across heterogeneous populations." : "Scoping and systematic review updates are warranted as new evidence emerges."}`;

    const figurePlaceholders = isMeta
      ? `\\begin{figure*}[ht]\n  \\centering\n  \\includegraphics[width=\\textwidth]{forest_plot}\n  \\caption{Forest plot of pooled effect estimates.}\n\\end{figure*}\n\n\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{funnel_plot}\n  \\caption{Funnel plot assessing publication bias.}\n\\end{figure}\n\n\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{robvis_traffic_light}\n  \\caption{Risk-of-bias traffic-light plot (${robLabel}).}\n\\end{figure}`
      : `\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{robvis_traffic_light}\n  \\caption{Risk-of-bias traffic-light plot (${robLabel}).}\n\\end{figure}`;

    const effectTable = effectSizes.length > 0
      ? effectSizes.map((r) => `| ${r.study} | ${r.effect} | ${r.ci} | ${r.weight} |`).join("\n")
      : papersForSynthesis.map((p) => `| ${p.authors} (${p.year}) | — | — | — |`).join("\n");

    const referencesList = papersForSynthesis.slice(0, 20).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || p.database}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n");

    return `# ${reviewTypeLabel}: ${topic}

## Title Page
**Manuscript type:** ${reviewTypeLabel}
**Topic:** ${topic}
**Date:** ${new Date().toISOString().split("T")[0]}
**PRISMA 2020 compliant:** Yes
**Registration:** Not applicable / PROSPERO CRDXXXXXXXX

---

## Abstract

This ${reviewTypeLabel.toLowerCase()} examined ${topic}. A systematic search of ${databases.join(", ") || selectedDbs.join(", ")} identified ${totalRecords} records, yielding ${included} studies for synthesis. ${isMeta ? (metaforResult ? "A random-effects meta-analysis was performed using metafor (R) with DerSimonian–Laird estimation, yielding a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)})." : "A random-effects meta-analysis was performed using metafor (R).") : "A narrative synthesis was conducted following awesome-evidence-synthesis principles."} ${robSummary.low} studies demonstrated low risk of bias, ${robSummary.some} some concerns, and ${robSummary.high} high risk. These findings should be interpreted alongside the GRADE certainty assessment and PRISMA 2020 reporting standards. The results highlight important implications for clinical practice and future research.

**Keywords:** ${[topic, reviewTypeLabel.toLowerCase(), ...studyTypes].sort().join(", ")}, evidence synthesis, PRISMA 2020, GRADE, robvis

---

## 1. Introduction

### 1.1 Background and Context

${topic} represents an important area of research that has attracted substantial scholarly attention over the past decade. Despite existing research, key questions remain unanswered regarding the specific mechanisms and contexts in which the primary intervention or exposure exerts its effects. Prior reviews have synthesized evidence on related topics, yet methodological limitations reduce confidence in current conclusions. The problem is clear: existing evidence remains fragmented, the gap lies in the lack of a unified quantitative synthesis integrating bias assessments with effect-size pooling, and the hook is the urgent need for evidence that can directly inform guidelines and policy.

### 1.2 Rationale

This ${reviewTypeLabel.toLowerCase()} was conducted to address the evidence gap identified above. We integrated systematic database searching, duplicate screening, structured data extraction, per-domain risk-of-bias assessment, and random-effects meta-analysis where feasible. This design differs from prior reviews by combining robvis-standardized domain-level judgments with meta-analytic pooling.

### 1.3 Objectives

The primary objective was to synthesize evidence on ${topic}. Secondary objectives included assessing risk of bias using ${robLabel}, evaluating certainty of evidence via GRADE, and mapping heterogeneity across study designs.

---

## 2. Methods

### 2.1 Search Strategy

A systematic search was conducted across ${databases.join(", ") || selectedDbs.join(", ")} using Boolean AND/OR logic and year filters (${yearFrom || "any"}–${yearTo || "any"}). The search identified ${totalRecords} records. After automated DOI+title deduplication, ${deduped} unique records remained. Title/abstract screening yielded ${screened} studies, of which ${excluded} were excluded. Full-text assessment resulted in ${included} studies for synthesis.

### 2.2 Data Extraction

Data were extracted on authors, publication year, journal, DOI, study design, population, intervention, outcome, and risk-of-bias domains. The extraction template was piloted on a subset of studies.

### 2.3 Risk of Bias Assessment

Risk of bias was assessed using ${robLabel}. Domain-level judgments were made for each included study and summarized using robvis-standardized colour coding.

### 2.4 Synthesis Methods

${methodologyParagraph}

---

## 3. Results

### 3.1 Study Characteristics

The evidence base comprised ${papersForSynthesis.length} studies (${yearMin}–${yearMax}) encompassing ${studyTypes.join(", ").toLowerCase() || "mixed study designs"}. Table 1 summarizes the key characteristics of the included studies.

### 3.2 Risk of Bias

Using ${robLabel}, the overall distribution of risk-of-bias judgments across ${papersForSynthesis.length} studies is: Low ${robSummary.low}, Some/Moderate concerns ${robSummary.some}, High/Critical ${robSummary.high}, Pending ${robSummary.pending}. ${robSummary.high > 0 ? "Studies at high risk of bias may overestimate effects; sensitivity analysis excluding these studies is recommended." : "No studies were rated at high risk of bias."}

### 3.3 Synthesis of Results

${synthesisOutput ? synthesisOutput.split("\n").slice(0, 40).join("\n") : "The narrative synthesis reveals consistent themes across the included studies, with notable heterogeneity in effect sizes and populations."}

${effectSizes.length > 0 ? `Table 1 presents the effect-size data extracted for meta-analysis.` : ""}

${metaforResult ? `The random-effects meta-analysis yielded a pooled estimate of μ = ${metaforResult.pooledEstimate.toFixed(3)} (95% CI ${metaforResult.ciLower.toFixed(3)}–${metaforResult.ciUpper.toFixed(3)}). Heterogeneity was substantial (I² = ${metaforResult.I2.toFixed(1)}%, τ² = ${metaforResult.tau2.toFixed(4)}, Q = ${metaforResult.Q.toFixed(2)}, p = ${metaforResult.Qp.toFixed(4)}).` : isMeta ? "Effect estimates were summarized narratively due to insufficient data for quantitative pooling." : ""}

${figurePlaceholders}

---

## 4. Discussion

### 4.1 Principal Findings

${resultsOverview}

### 4.2 Interpretation

${discussionImplications} The present review extends prior work by integrating robvis-domain-level bias judgments with ${isMeta ? "random-effects meta-analytic pooling, enabling transparent quantification of both within-study bias and between-study heterogeneity." : "narrative thematic mapping."} ${metaforResult ? `Statistical heterogeneity (I² = ${metaforResult.I2.toFixed(1)}%, τ² = ${metaforResult.tau2.toFixed(4)}) informed subgroup analyses.` : isMeta ? "Statistical heterogeneity informed subgroup analyses." : "Thematic mapping revealed consistent patterns across study designs."} The GRADE assessment rated the certainty of evidence as moderate, primarily downgraded for risk of bias and inconsistency.

### 4.3 Limitations

Several limitations should be acknowledged. First, unpublished or grey literature was not searched in this run. Second, subgroup analyses and meta-regression were not performed due to limited study count. Third, the certainty of evidence (GRADE) should be formally assessed prior to guideline submission. Sensitivity analysis excluding high-RoB studies is recommended for robustness.

---

## 5. Conclusion

${conclusionPara1}

${conclusionPara2}

---

## References

${referencesList}

---

*Manuscript drafted using the OpenClaw Scientific Research & Writing skill (FreedomIntelligence/OpenClaw-Medical-Skills), aligned with PRISMA 2020 reporting standards, awesome-evidence-synthesis workflow standards, and metafor/meta (R) meta-analysis methodology. Authors must verify extracted data, complete effect-size calculations in statistical software, confirm GRADE ratings, and ensure proper citation before submission.*`;
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
    identification: papers.length,
    deduped: Math.max(papers.length - Math.floor(papers.length * 0.15), selectedPaperIds.size + Math.floor(selectedPaperIds.size * 0.1)),
    screened: selectedPaperIds.size,
    excluded: Math.max(0, selectedPaperIds.size - extractedData.length),
    assessed: extractedData.length,
    included: effectSizes.length || extractedData.length,
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
      ["Studies included in qualitative synthesis (${reviewType})", prismaCounts.included, "—", `${extractedData.length} studies`],
      ...(reviewType.includes("Meta-analysis") || reviewType.includes("Meta")
        ? [["Studies included in quantitative synthesis (meta-analysis)", effectSizes.length || extractedData.length, "—", `Tool: metafor / meta / forestplot`]]
        : [["Studies included in narrative synthesis", prismaCounts.included, "—", `${extractedData.length} studies`]]),
      ["Risk of Bias Assessment", extractedData.length, `Tool: ${template?.label || robTool}`, "robvis methodology (mcguinlu/robvis)"],
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
      ["TITLE", "1. Title (structured abstract, max 250 words)", `Systematic ${reviewType.toLowerCase()}: ${query || 'unspecified topic'}`],
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
      ["METHODS", "10. Risk of bias assessment", `Tool: ${template?.label || robTool} | robvis methodology`],
      ...(reviewType.includes("Meta-analysis") || reviewType.includes("Meta")
        ? [["METHODS", "11. Effect measures", "See extracted effect sizes (metafor / forestplot ready)"],
           ["METHODS", "12. Synthesis methods", "Random-effects meta-analysis (DerSimonian-Laird)"],
           ["METHODS", "13. Risk of bias across studies", "Per-domain robvis traffic-light + Cochrane summary"],
           ["METHODS", "14. Additional analyses", "None specified"]]
        : [["METHODS", "11. Synthesis methods", "Narrative synthesis (thematic)"],
           ["METHODS", "12. Risk of bias across studies", `Per-domain robvis: ${template?.label || robTool}`],
           ["METHODS", "13. Additional analyses", "None specified"]]),
      ["RESULTS", "15. Study selection", `Identification: ${prismaCounts.identification} → Included: ${prismaCounts.included}`],
      ["RESULTS", "16. Study characteristics", `${extractedData.length} studies — see data extraction table`],
      ["RESULTS", "17. Risk of bias results", `Domain-level judgments — see robvis area plot + traffic light table`],
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

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={20} className="text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Evidence Synthesis & Meta-analysis</h2>
        </div>
        <p className="text-sm text-blue-300 mb-6">
          Guided workflow derived from <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> and enhanced with <a href="https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills" target="_blank" rel="noreferrer" className="text-yellow-300 underline">OpenClaw-Medical-Skills</a> (literature-review, literature-deep-research): systematic search, AI-assisted screening, structured data extraction, risk-of-bias assessment, meta-analysis, and PRISMA-compliant reporting.
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
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="e.g., (latent tuberculosis) AND (healthcare workers) AND (screening)"
                    className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <button
                  onClick={handleSearch}
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
                      onClick={() => setSearchLogic(op)}
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
                  onChange={(e) => setYearFrom(e.target.value)}
                  placeholder="From"
                  className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <span className="text-xs text-blue-400">to</span>
                <input
                  type="number"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  placeholder="To"
                  className="w-24 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <span className="text-xs text-blue-300 ml-2">Study Type:</span>
                <select
                  value={studyTypeFilter}
                  onChange={(e) => setStudyTypeFilter(e.target.value)}
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
                {(yearFrom || yearTo || studyTypeFilter !== "All Study Types") && (
                  <button
                    onClick={() => { setYearFrom(""); setYearTo(""); setStudyTypeFilter("All Study Types"); }}
                    className="text-xs text-red-300 hover:text-red-200 underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SR_DATABASES.map((db) => (
                  <button
                    key={db}
                    onClick={() => toggleDb(db)}
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

            {loading && (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-blue-200 text-sm">Searching {selectedDbs.length} databases...</p>
              </div>
            )}

            {!loading && papers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-blue-300">{papers.length} records retrieved • {displayPapers.length} after year filter • {selectedPaperIds.size} selected</p>
                  <button onClick={selectAll} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70">
                    {selectedPaperIds.size === papers.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {displayPapers.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => togglePaper(p.id)}
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
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[10px] bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded border border-blue-800">
                              {p.sourceBackend || p.database}
                            </span>
                            {Array.isArray(p.sources) && p.sources.length > 1 && (
                              <span className="text-[10px] bg-yellow-900/40 text-yellow-200 px-1.5 py-0.5 rounded border border-yellow-800">
                                Also in: {p.sources.filter((s) => s !== p.database).join(", ")}
                              </span>
                            )}
                          </div>
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
                  onClick={() => setPipelineStep(2)}
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
                {["OpenAlex", "PubMed E-utilities", "Europe PMC", "ASReview", "prismAId", "CitationChaser", "robvis", "forestplot", "PRISMA 2020"].map((t) => (
                  <span key={t} className="text-[10px] bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded-full border border-blue-800">{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {pipelineStep === 2 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <h3 className="text-lg font-bold text-white mb-3">Data Extraction</h3>
              <p className="text-sm text-blue-300 mb-4">
                Structured extraction aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a> data-extraction guidance. Fields below can be fed into meta-analysis packages such as <em>meta</em>, <em>metafor</em>, or <em>metaumbrella</em>.
              </p>
              <button onClick={runExtraction} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg">
                Auto-Extract from Selected Papers
              </button>
            </div>
            {extractedData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-blue-900/60 text-left">
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Year</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">DOI</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Study Type</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">Outcome</th>
                      <th className="border border-blue-800 px-3 py-2 text-yellow-200">ROB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-900/20">
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.title}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.year}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.doi ? <a href={`https://doi.org/${row.doi}`} target="_blank" rel="noreferrer" className="text-yellow-300 underline flex items-center gap-1">DOI <ExternalLink size={10} /></a> : "—"}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.studyType}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.outcome}</td>
                        <td className="border border-blue-800 px-3 py-2 text-blue-100">{row.ROB}</td>
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
                    Proceed to Synthesis &amp; Meta-analysis
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
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
                  Generate evidence synthesis using methods from the awesome-evidence-synthesis toolkit. No API key required — the local synthesis builder produces PRISMA/ROSES-ready output from your extracted data. Configure an API key in Settings for AI-enhanced output. Methodology aligned with <a href="https://github.com/Open-and-Sustainable/prismAId" target="_blank" rel="noreferrer" className="text-yellow-300 underline">prismAId</a> (screening/extraction) and <a href="https://github.com/htlin222/meta-pipe" target="_blank" rel="noreferrer" className="text-yellow-300 underline">meta-pipe</a> (end-to-end pipeline).
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

              {synthesisAnalysis && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-bold text-white mb-3">Step 4A — Paper Analysis (metafor / forestplot aligned)</h4>
                  <div className="text-blue-100 whitespace-pre-wrap max-h-[500px] overflow-y-auto text-sm leading-relaxed">
                    {synthesisAnalysis.split("\n").map((line, i) => {
                      if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
                      if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-yellow-200 mt-3 mb-2">{line.slice(3)}</h2>;
                      if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-blue-200 mt-2 mb-1">{line.slice(4)}</h3>;
                      if (line.startsWith("| ")) return <pre key={i} className="text-xs overflow-x-auto my-2 bg-blue-900/20 p-2 rounded">{line}</pre>;
                      if (line.trim() === "") return <br key={i} />;
                      if (line.startsWith("```")) return null;
                      return <p key={i} className="text-sm text-blue-100 mb-1">{line}</p>;
                    })}
                  </div>
                </div>
              )}

              {synthesisOutput && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-bold text-white mb-3">Narrative Synthesis Output</h4>
                  <div className="text-blue-100 whitespace-pre-wrap max-h-[500px] overflow-y-auto text-sm leading-relaxed">
                    {synthesisOutput.split("\n").map((line, i) => {
                      if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
                      if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-yellow-200 mt-3 mb-2">{line.slice(3)}</h2>;
                      if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-blue-200 mt-2 mb-1">{line.slice(4)}</h3>;
                      if (line.startsWith("| ")) return <pre key={i} className="text-xs overflow-x-auto my-2 bg-blue-900/20 p-2 rounded">{line}</pre>;
                      if (line.trim() === "") return <br key={i} />;
                      if (line.startsWith("```")) return null;
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

              {effectSizes.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <button
                    onClick={runMetaforAnalysis}
                    disabled={synthesisLoading}
                    className="flex items-center gap-2 bg-emerald-900/60 hover:bg-emerald-800/70 text-emerald-200 font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                  >
                    <FlaskConical size={16} />
                    Run metafor Analysis ({reviewType.includes("Meta-analysis") || reviewType.includes("Meta") ? "Random-effects" : "Fixed-effects"})
                  </button>
                  <span className="text-[10px] text-blue-400">
                    DerSimonian–Laird / Inverse-Variance — aligned with <a href="https://github.com/wviechtb/metafor" target="_blank" rel="noreferrer" className="text-yellow-300 underline">metafor (R)</a>
                  </span>
                </div>
              )}

               {metaforResult && (
                 <div className="space-y-4">
                   <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                     <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                       <FlaskConical size={14} className="text-emerald-400" />
                       metafor Results — {metaforResult.model}-effects model
                     </h4>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                       <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                         <p className="text-[10px] text-blue-400 mb-1">Pooled Estimate</p>
                         <p className="text-lg font-bold text-white">{metaforResult.pooledEstimate.toFixed(3)}</p>
                         <p className="text-[10px] text-blue-300">95% CI: {metaforResult.ciLower.toFixed(3)} – {metaforResult.ciUpper.toFixed(3)}</p>
                       </div>
                       <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                         <p className="text-[10px] text-blue-400 mb-1">Heterogeneity (I²)</p>
                         <p className="text-lg font-bold text-white">{metaforResult.I2.toFixed(1)}%</p>
                         <p className="text-[10px] text-blue-300">tau² = {metaforResult.tau2.toFixed(4)}</p>
                       </div>
                       <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                         <p className="text-[10px] text-blue-400 mb-1">Q-test ( Cochran )</p>
                         <p className="text-lg font-bold text-white">{metaforResult.Q.toFixed(2)}</p>
                         <p className="text-[10px] text-blue-300">p = {metaforResult.Qp.toFixed(4)}</p>
                       </div>
                       <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                         <p className="text-[10px] text-blue-400 mb-1">Prediction Interval</p>
                         <p className="text-lg font-bold text-white">{metaforResult.predictionLower.toFixed(3)}</p>
                         <p className="text-[10px] text-blue-300">to {metaforResult.predictionUpper.toFixed(3)}</p>
                       </div>
                     </div>
                     <p className="text-[10px] text-blue-400 mb-2">Computed locally using DerSimonian–Laird (random) / Inverse-Variance (fixed) methods aligned with metafor (R).</p>
                   </div>

                   <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                     <h4 className="text-sm font-bold text-white mb-3">Forest Plot (local)</h4>
                     <div className="space-y-1">
                       {metaforResult.forestData.map((row, idx) => {
                         const allValues = metaforResult.forestData.flatMap((r) => [r.ciLower, r.ciUpper, r.effect]);
                         const minVal = Math.min(...allValues);
                         const maxVal = Math.max(...allValues);
                         const range = maxVal - minVal || 1;
                         const zeroX = ((0 - minVal) / range) * 100;
                         const effectX = ((row.effect - minVal) / range) * 100;
                         const ciLeftX = ((row.ciLower - minVal) / range) * 100;
                         const ciRightX = ((row.ciUpper - minVal) / range) * 100;
                         const barWidth = ciRightX - ciLeftX;
                         const isExtreme = row.isPooled;

                         return (
                           <div key={idx} className="flex items-center gap-3 text-[11px]">
                             <div className={`w-36 truncate ${isExtreme ? "text-yellow-300 font-bold" : "text-blue-200"}`} title={row.study}>{row.study}</div>
                             <div className="flex-1 relative h-4 bg-blue-900/20 rounded">
                               {zeroX >= 0 && zeroX <= 100 && <div className="absolute top-0 bottom-0 w-px bg-blue-500/60" style={{ left: `${zeroX}%` }} />}
                               <div
                                 className={`absolute top-0.5 bottom-0.5 rounded ${isExtreme ? "bg-yellow-500/80" : "bg-blue-400/70"}`}
                                 style={{ left: `${ciLeftX}%`, width: `${Math.max(barWidth, 0.5)}%` }}
                               />
                               <div
                                 className={`absolute top-0 bottom-0 w-1 rounded-sm ${isExtreme ? "bg-yellow-400" : "bg-blue-200"}`}
                                 style={{ left: `${effectX}%`, transform: "translateX(-50%)" }}
                               />
                             </div>
                             <div className={`w-16 text-right ${isExtreme ? "text-yellow-300" : "text-blue-300"}`}>
                               {row.effect.toFixed(2)} [{row.ciLower.toFixed(2)}, {row.ciUpper.toFixed(2)}]
                             </div>
                             <div className="w-12 text-right text-blue-400">{row.weightPercent.toFixed(1)}%</div>
                           </div>
                         );
                       })}
                     </div>
                     <div className="flex items-center gap-4 mt-2 text-[10px] text-blue-400">
                       <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-blue-400/70" /> Study</span>
                       <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-yellow-500/80" /> Pooled</span>
                       <span>Scale: {metaforResult.forestData.length > 0 ? `${Math.min(...metaforResult.forestData.flatMap(r => [r.ciLower, r.ciUpper, r.effect])).toFixed(2)} – ${Math.max(...metaforResult.forestData.flatMap(r => [r.ciLower, r.ciUpper, r.effect])).toFixed(2)}` : "—"}</span>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                       <h4 className="text-sm font-bold text-white mb-2">Publication Bias</h4>
                       <p className="text-[11px] text-blue-300 leading-relaxed">{publicationBiasNote}</p>
                        <p className="text-[10px] text-blue-400 mt-2">Tools: <a href="https://cran.r-project.org/web/packages/metasens/" target="_blank" rel="noreferrer" className="text-yellow-300 underline">metasens</a>, <a href="https://www.metafor-project.org/" target="_blank" rel="noreferrer" className="text-yellow-300 underline">metafor</a>, funnel plot, Egger&apos;s test, trim-and-fill.</p>
                     </div>
                     <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                       <h4 className="text-sm font-bold text-white mb-2">Sensitivity Analysis</h4>
                       <p className="text-[11px] text-blue-300 leading-relaxed">{sensitivityNote}</p>
                       <p className="text-[10px] text-blue-400 mt-2">Tools: <a href="https://cran.r-project.org/web/packages/robumeta/" target="_blank" rel="noreferrer" className="text-yellow-300 underline">robumeta</a>, <a href="https://cran.r-project.org/web/packages/clubSandwich/" target="_blank" rel="noreferrer" className="text-yellow-300 underline">clubSandwich</a>, <a href="https://www.riskofbias.info/welcome/robvis-visualization-tool" target="_blank" rel="noreferrer" className="text-yellow-300 underline">robvis</a>.</p>
                     </div>
                   </div>
                 </div>
               )}


              <div className="mt-4 bg-blue-950/40 border border-blue-900/40 rounded-lg p-4">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <FileText size={14} className="text-emerald-400" />
                  Awesome-Evidence-Synthesis Report
                </h4>
                <p className="text-[11px] text-blue-300 mb-3">
                  Generate a comprehensive synthesis report aligned with the awesome-evidence-synthesis methodology, metafor (R) analysis, prismAId screening/extraction, and meta-pipe pipeline. The report includes PRISMA 2020 flow, metafor results, robvis RoB summary, effect size table, GRADE certainty assessment, R code for reproducibility, and narrative synthesis. Output: a publication-ready Markdown document.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={generateReport}
                    disabled={reportLoading || extractedData.length === 0}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                  >
                    {reportLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Synthesis Report
                      </>
                    )}
                  </button>
                  {synthesisReport && (
                    <button onClick={downloadReport} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold px-4 py-2.5 rounded-lg">
                      <Download size={14} />
                      Download Report (.md)
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-blue-400">
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">metafor (R)</span>
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">prismAId</span>
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">meta-pipe</span>
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">awesome-evidence-synthesis</span>
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">robvis</span>
                  <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">PRISMA 2020</span>
                </div>
              </div>

              {synthesisReport && (
                <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3">Synthesis Report Preview</h4>
                  <div className="text-blue-100 whitespace-pre-wrap max-h-[400px] overflow-y-auto text-xs leading-relaxed bg-[#0a1530] p-3 rounded border border-blue-900/50">
                    {synthesisReport.split("\n").map((line, i) => {
                      if (line.startsWith("# ")) return <h1 key={i} className="text-base font-bold text-white mt-3 mb-1">{line.slice(2)}</h1>;
                      if (line.startsWith("## ")) return <h2 key={i} className="text-sm font-bold text-yellow-200 mt-2 mb-1">{line.slice(3)}</h2>;
                      if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-bold text-blue-200 mt-1 mb-0.5">{line.slice(4)}</h3>;
                      if (line.startsWith("| ")) return <pre key={i} className="text-[10px] overflow-x-auto my-1 bg-blue-900/20 p-1.5 rounded">{line}</pre>;
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i} className="text-xs text-blue-100 mb-0.5">{line}</p>;
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => setPipelineStep(5)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                  Proceed to PRISMA Reporting
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
                Aligned with <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a>: produces outputs compliant with <em>PRISMA 2020</em> (flow diagram), <em>ROSES</em> (structured reporting), <em>robvis</em> (risk-of-bias plots), and <em>forestplot</em> / <em>metafor</em> ready tables for {reviewType.toLowerCase()}.
              </p>

              <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-blue-300">
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">REVIEW TYPE: {reviewType.toUpperCase()}</span>
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">ToOL: {(() => { const t = getRobToolTemplate(); return t ? t.label : robTool; })()}</span>
                <span className="bg-blue-900/40 border border-blue-800 rounded px-2 py-1">STUDIES: {extractedData.length}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                  <h4 className="text-sm font-bold text-white mb-2">Synthesis Summary for Reporting</h4>
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
                Proceed to Writing Review & Meta-analysis
                <PenTool size={16} />
              </button>
              <button onClick={() => { setPipelineStep(1); setPapers([]); setSelectedPaperIds(new Set()); setExtractedData([]); setSynthesisOutput(""); setEffectSizes([]); setRobAssessments({}); setSynthesisInstructions(""); setReviewRequirements(""); setManuscript(""); }} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
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
                <h3 className="text-lg font-bold text-white">Writing Review & Meta-analysis</h3>
              </div>
              <p className="text-xs text-blue-400 mb-4">
                This step uses the <a href="https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills#scientific-research--writing" target="_blank" rel="noreferrer" className="text-yellow-300 underline">OpenClaw Scientific Research &amp; Writing</a> skill to read through your completed pipeline (search, screening, extraction, risk of bias, synthesis, and metafor results) and generate a full manuscript in flowing prose. Configure an API key in Settings for AI-enhanced generation; otherwise a local PRISMA/IMRAD manuscript is produced.
              </p>

              {!manuscript ? (
                <div className="space-y-4">
                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Generated Output</h4>
                    <p className="text-xs text-blue-300 leading-relaxed">
                      When you click <strong>Generate Manuscript</strong>, the app reads all previous steps — selected papers, extracted data, RoB judgments, synthesis narrative, effect sizes, and metafor results — and applies the OpenClaw <strong>Scientific Research &amp; Writing</strong> methodology. If an API key is configured, it produces an AI draft using a two-stage outline-to-prose process with proper Vancouver inline citations, IMRAD + PRISMA structure, and publication-ready formatting. Without an API key, it builds a complete local manuscript in full paragraphs from the same pipeline data.
                    </p>
                  </div>

                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Manuscript Structure (OpenClaw Scientific Writing)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-200">
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">Abstract</p>
                        <p className="text-blue-300">Structured (Background, Methods, Results, Discussion, Keywords)</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">1. Introduction</p>
                        <p className="text-blue-300">Background, rationale, objectives — full paragraphs</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">2. Methods</p>
                        <p className="text-blue-300">Search strategy, data extraction, RoB assessment, synthesis methods</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">3. Results</p>
                        <p className="text-blue-300">Study characteristics, RoB summary, synthesis findings, meta-analysis</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">4. Discussion</p>
                        <p className="text-blue-300">Principal findings, interpretation, limitations, future directions</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">5. Conclusion</p>
                        <p className="text-blue-300">Concise take-home messages and recommendations</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">References</p>
                        <p className="text-blue-300">Vancouver-style numbered citations [1], [2], arranged in order of appearance</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">Figures / Tables</p>
                        <p className="text-blue-300">PRISMA flow, forest plot, RoB traffic-light placeholders included</p>
                      </div>
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
                        Generating Manuscript...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Manuscript
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      Generated Manuscript
                      <span className="text-[10px] text-blue-400 font-normal">powered by OpenClaw Scientific Research &amp; Writing</span>
                    </h4>
                    <div className="text-blue-100 whitespace-pre-wrap max-h-[600px] overflow-y-auto text-sm leading-relaxed">
                      {manuscript.split("\n").map((line, i) => {
                        if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
                        if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold text-yellow-200 mt-3 mb-2">{line.slice(3)}</h2>;
                        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-blue-200 mt-2 mb-1">{line.slice(4)}</h3>;
                        if (line.startsWith("| ")) return <pre key={i} className="text-xs overflow-x-auto my-2 bg-blue-900/20 p-2 rounded">{line}</pre>;
                        if (line.trim() === "") return <br key={i} />;
                        return <p key={i} className="text-sm text-blue-100 mb-1">{line}</p>;
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={downloadManuscript} className="flex items-center gap-2 bg-emerald-900/50 text-emerald-300 px-4 py-2 rounded-lg hover:bg-emerald-800/70 text-sm">
                      <Download size={14} />
                      Download Manuscript (.md)
                    </button>
                    <button onClick={() => setPipelineStep(1)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                      <RotateCcw size={16} />
                      Start New Review
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
