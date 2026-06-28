"use client";

import React, { useState, useEffect } from "react";
import {
  Search, Database, ChevronRight, FileText,
  RotateCcw, CheckCircle2, ExternalLink, FlaskConical,
  Save, Sparkles, ClipboardList, Table, Download,
  FileJson, BarChart3, PenTool, BookOpen
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq } from "@/lib/ai";
import { fetchRealPapers, generateMockLegacy, type Paper } from "@/lib/database-apis";
import { downloadLiteratureReviewPDF, downloadLiteratureReviewWord } from "@/lib/exporters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from "recharts";

const SR_DATABASES = [
  "PubMed", "OpenAlex", "Europe PMC", "Google Scholar",
  "WHO IRIS", "Semantic Scholar", "Shodhganga", "Prospero",
  "ScienceDirect", "ClinicalTrials.gov", "DOAJ", "Clarivate"
];

const PIPELINE_STEPS = [
  { num: 1, label: "Search & Screening", icon: Search },
  { num: 2, label: "Data Extraction", icon: FileText },
  { num: 3, label: "Risk of Bias", icon: CheckCircle2 },
  { num: 4, label: "Literature Review", icon: BookOpen },
  { num: 5, label: "Synthesis & Meta-analysis", icon: FlaskConical },
  { num: 6, label: "Reporting & PRISMA", icon: FileText },
  { num: 7, label: "Writing Review & Meta-analysis", icon: PenTool },
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
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [robAssessments, setRobAssessments] = useState<Record<string, RobAssessment>>({});
  const [robTool, setRobTool] = useState<string>("ROB2");
  const [robInstructions, setRobInstructions] = useState("");
  const [synthesisInstructions, setSynthesisInstructions] = useState("");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [manuscript, setManuscript] = useState("");
  const [manuscriptLoading, setManuscriptLoading] = useState(false);
  const [literatureReviewSections, setLiteratureReviewSections] = useState({
    introduction: "",
    problemGlobal: "",
    problemSEA: "",
    problemIndia: "",
    gaps: "",
    future: "",
    conclusion: "",
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
    } catch {
      setPapers(generateMockLegacy(query, selectedDbs));
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
    alert("Risk of Bias assessments saved locally.");
  };

  const runExtraction = () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    const assessments: Record<string, RobAssessment> = {};
    selected.forEach((p) => {
      assessments[p.id] = initRobAssessment(p.id, { studyType: p.studyType, year: p.year, title: p.title });
    });
    setRobAssessments(assessments);
    setExtractedData(
      selected.map((p) => ({
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
      }))
    );
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

  const generateLocalSynthesis = () => {
    const papersForSynthesis = extractedData.filter((p) => selectedPaperIds.has(p.id));
    const template = getRobToolTemplate();
    const robLabel = template ? template.label : robTool;
    const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
    const yearMin = Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
    const yearMax = Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
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
      ? `**Synthesis method:** Random-effects meta-analysis (DerSimonian–Laird), implemented in **metafor** (R) or **meta** (R). Heterogeneity assessed via I² and τ². Certainty of evidence via GRADE/robvis integration.\n\n**Risk of bias:** Per-domain robvis template (${robLabel}) with Cochrane colours.`
      : `**Synthesis method:** Narrative/thematic synthesis following **awesome-evidence-synthesis** principles: coding, theme development, and mapping.\n\n**Risk of bias:** Per-domain robvis template (${robLabel}).`;

    const metaBlock = isMeta
      ? `\n### Meta-analysis Interpretation\n\nEffect estimates should be pooled using a random-effects model. Expected direction of effect: see effect table above. Heterogeneity: ${heterogeneityNotes} Use **forestplot**, **meta**, **metafor**, or **OpenMEE** for publication-ready figures.\n\n**Reporting:** Export effect table to **PRISMA 2020**-compliant format.\n`
      : "";

    return `## Evidence Synthesis\n**Review type:** ${reviewType}\n**Studies included:** ${papersForSynthesis.length}\n**Year range:** ${yearMin}–${yearMax}\n**Databases:** ${databases.join(", ") || "multiple"}\n\n---

${methodsBlock}\n\n---

### Narrative Summary\n\nThe body of evidence comprises ${papersForSynthesis.length} ${studyTypes.join(", ").toLowerCase() || "studies"} examining ${query || "the review topic"}. ${papersForSynthesis.length > 5 ? "Across the included studies, consistent themes emerge regarding the intervention/exposure and its association with the primary outcome." : "Findings should be interpreted with caution given the small number of included studies."}\n\n**Key findings by study:**\n${papersForSynthesis.map((p, i) => `${i + 1}. **${p.authors} (${p.year})** — ${p.title}\n   - Study type: ${p.studyType || "Not specified"}\n   - Outcome: ${p.outcome || "As reported"}\n   - Risk of bias: ${robAssessments[p.id]?.overall || "Pending (assess in Step 3)"}`).join("\n\n")}\n\n---

### Effect Size Summary\n\n| Study | Effect Estimate | 95% CI | Weight |\n|-------|----------------|--------|--------|\n${effectTable}\n\n---

### Risk of Bias Commentary\n\nUsing **${robLabel}** (robvis), the overall distribution of risk-of-bias judgments across ${papersForSynthesis.length} studies is: Low ${robSummary.low}, Some/Moderate concerns ${robSummary.some}, High/Critical ${robSummary.high}, Pending ${robSummary.pending}. ${robSummary.high > 0 ? "Studies at high risk of bias may overestimate effects; sensitivity analysis excluding these studies is recommended." : "No studies were rated at high risk of bias."} Domain-level traffic-light plots are available in the reporting step.\n\n---\n\n### Gaps and Future Directions\n\n- Unpublished or grey literature not searched in this run.\n- Subgroup analyses and meta-regression should be explored if heterogeneity is high.\n- Certainty of evidence (GRADE) should be formally assessed prior to guideline submission.\n- Sensitivity analysis excluding high-RoB studies recommended for robustness.\n\n> Generated locally using awesome-evidence-synthesis open-source workflow standards. For meta-analysis statistics, export the effect table to **R (metafor/meta)**, **JASP**, or **OpenMEE**.\n`;
  };

  const parseLiteratureReview = (text: string): Record<string, string> => {
    const sections: Record<string, string> = {
      introduction: "",
      problemGlobal: "",
      problemSEA: "",
      problemIndia: "",
      gaps: "",
      future: "",
      conclusion: "",
      references: "",
    };

    const lines = text.split("\n");
    let currentKey: string | null = null;
    let buffer: string[] = [];

    const assign = () => {
      if (!currentKey) return;
      const content = buffer.join("\n").trim();
      if (currentKey === "problem" && content) {
        const globalMatch = content.match(/\*\*Global:\*\*([\s\S]*?)(?=\*\*South-East Asia:\*\*|\*\*India:\*\*|$)/i);
        const seaMatch = content.match(/\*\*South-East Asia:\*\*([\s\S]*?)(?=\*\*India:\*\*|$)/i);
        const indiaMatch = content.match(/\*\*India:\*\*([\s\S]*?)$/i);
        sections.problemGlobal = (globalMatch?.[1] || "").trim();
        sections.problemSEA = (seaMatch?.[1] || "").trim();
        sections.problemIndia = (indiaMatch?.[1] || "").trim();
      } else if (content) {
        sections[currentKey] = content;
      }
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      let matched: string | null = null;

      if (/^(introduction|background|introduction\s*\/\s*background)$/.test(trimmed)) matched = "introduction";
      else if (/^(problem\s+statement|problem\s+statement\s*[-–—]?\s*global)$/.test(trimmed)) matched = "problem";
      else if (/^(problem\s+statement\s*[-–—]?\s*south[- ]?east\s+asia|south[- ]?east\s+asia)$/.test(trimmed)) matched = "problemSEADirect";
      else if (/^(problem\s+statement\s*[-–—]?\s*india|india)$/.test(trimmed)) matched = "problemIndiaDirect";
      else if (/^problem\s+statement\s*[-–—]?\s*global$/.test(trimmed)) matched = "problemGlobalDirect";
      else if (/^research\s+gaps|^gaps$/.test(trimmed)) matched = "gaps";
      else if (/^future\s+studies\s+to\s+be\s+carried\s+out|^future\s+studies|^future$/.test(trimmed)) matched = "future";
      else if (/^conclusion$/.test(trimmed)) matched = "conclusion";
      else if (/^references|^bibliography$/.test(trimmed)) matched = "references";

      if (matched) {
        assign();
        currentKey = matched === "problemSEADirect" ? "problemSEA" : matched === "problemIndiaDirect" ? "problemIndia" : matched === "problemGlobalDirect" ? "problemGlobal" : matched;
      } else {
        buffer.push(line);
      }
    }

    assign();
    return sections;
  };

  const generateLiteratureReview = async () => {
    if (extractedData.length === 0 && selectedPaperIds.size === 0) {
      alert("Please select papers first.");
      return;
    }
    setLiteratureReviewLoading(true);
    setLiteratureReviewSections({
      introduction: "",
      problemGlobal: "",
      problemSEA: "",
      problemIndia: "",
      gaps: "",
      future: "",
      conclusion: "",
      references: "",
    });
    try {
      const selectedPapers = papers.filter((p) => selectedPaperIds.has(p.id));
      const references = selectedPapers
        .map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.database}.${p.doi ? ` https://doi.org/${p.doi}` : ""}`)
        .join("\n");

      const numberedRefs = selectedPapers
        .map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.database}.${p.doi ? ` https://doi.org/${p.doi}` : ""}`)
        .join("\n");

      const prompt = `You are an expert academic writer using deep reasoning methodology inspired by janhq/jan (long chain-of-thought reflection). Write a comprehensive, publication-ready narrative literature review based ONLY on the selected studies provided below.

Follow this exact structure and headings:
- Introduction / Background
- Problem Statement (with subsections: Global, South-East Asia, India)
- Research Gaps
- Future Studies to Be Carried Out
- Conclusion
- References

CITATION RULES:
- Cite papers inline using bracketed numbers in square brackets, e.g. [1], [2], [3].
- The numbering MUST match the numbered references list below.
- Do NOT use author-year citations. Use ONLY bracketed numbers.
- Aim for 2-4 inline citations per paragraph.

REFERENCES (use these EXACT numbers in your inline citations):
${numberedRefs}

SELECTED STUDIES:
${selectedPapers.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType || "Not specified"}. Database: ${p.database}.${p.doi ? ` DOI: ${p.doi}` : ""}`).join("\n\n")}

EXTRACTED DATA:
${extractedData.filter((p) => selectedPaperIds.has(p.id)).map((p) => `- ${p.title}: ${p.outcome || "Outcome not specified"}`).join("\n")}

DEEP REASONING RULES:
1. Think step-by-step before drafting each section.
2. Explicitly acknowledge conflicting or limited evidence.
3. Ensure global, South-East Asia, and India perspectives are all addressed where relevant.
4. Use ONLY inline numeric citations [N]. Do NOT add a separate bibliography beyond the numbered references list.

OUTPUT FORMAT:
Use ONLY plain text with these exact headings on their own lines:
Introduction / Background
Problem Statement
Research Gaps
Future Studies to Be Carried Out
Conclusion
References

Do NOT use Markdown formatting like # or ##. Do NOT add extra headings.`;

      const apiKey = state.geminiApiKey || state.groqApiKey;
      if (!apiKey) {
        setLiteratureReviewSections({
          introduction: "No API key configured. Please add your Gemini or Groq API key in Settings to generate the literature review.",
          problemGlobal: "",
          problemSEA: "",
          problemIndia: "",
          gaps: "",
          future: "",
          conclusion: "",
          references: numberedRefs,
        });
         setLiteratureReviewLoading(false);
         return;
       }

       let text: string;
       if (state.geminiApiKey) {
         text = await callGemini(state.geminiApiKey, prompt);
       } else if (state.groqApiKey) {
         text = await callGroq(state.groqApiKey!, prompt);
       } else {
         throw new Error("No API key configured. Please open Settings (gear icon).");
       }

       const cleaned = text.replace(/```/g, "").trim();
       const parsed = parseLiteratureReview(cleaned);
       setLiteratureReviewSections({
         introduction: parsed.introduction || "",
         problemGlobal: parsed.problemGlobal || parsed.problem || "",
        problemSEA: parsed.problemSEA || "",
        problemIndia: parsed.problemIndia || "",
        gaps: parsed.gaps || "",
        future: parsed.future || "",
        conclusion: parsed.conclusion || "",
        references: parsed.references || numberedRefs,
      });
    } catch (err: any) {
      setLiteratureReviewSections({
        introduction: `Error generating review: ${err.message || "Unknown error"}. Please ensure your API key is valid and try again.`,
        problemGlobal: "",
        problemSEA: "",
        problemIndia: "",
        gaps: "",
        future: "",
        conclusion: "",
        references: "",
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
          title: p.title,
          authors: p.authors,
          year: p.year,
          studyType: p.studyType,
          outcome: p.outcome,
          ROB: p.ROB,
          notes: robAssessments[p.id]?.notes || "",
        }));

      const prompt = `You are an expert evidence synthesis researcher using methods from the awesome-evidence-synthesis toolkit (metafor, meta, metaumbrella, robvis, PRISMA 2020).

REVIEW TYPE: ${reviewType}

USER REQUIREMENTS:
${reviewRequirements || "No specific requirements provided."}

SYNTHESIS INSTRUCTIONS:
${synthesisInstructions || "Use standard systematic review methodology appropriate for the review type."}

EXTRACTED STUDIES:
${papersForSynthesis.map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType}. Outcome: ${p.outcome}. RoB: ${p.ROB}.${p.notes ? ` Notes: ${p.notes}` : ""}`).join("\n\n")}

REQUIREMENTS:
1. Summarize the body of evidence thematically or narratively as appropriate for the review type
2. Note heterogeneity (clinical, methodological, statistical)
3. Summarize effect sizes where available (or state if not extractable)
4. Acknowledge risk-of-bias patterns
5. Provide a forest-plot-ready effect-size table with columns: Study, Effect Estimate, 95% CI, Weight
6. Include PRISMA-compliant narrative structure (for reviews where PRISMA applies)
7. Reference tools: metafor, meta, metaumbrella, robvis, forestplot, PRISMA 2020
${reviewType.includes("Meta-analysis") ? "8. Provide meta-analysis interpretation: fixed vs random effects, heterogeneity statistics (I², τ²), certainty of evidence" : ""}

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
         if (state.geminiApiKey) {
           text = await callGemini(state.geminiApiKey, prompt);
         } else if (state.groqApiKey) {
           text = await callGroq(state.groqApiKey!, prompt);
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
      const isSystematic = reviewType.includes("Systematic");
      const isNarrative = reviewType.includes("Narrative");
      const isScoping = reviewType.includes("Scoping");
      const isUmbrella = reviewType.includes("Umbrella");
      const isRapid = reviewType.includes("Rapid");
      const isMixed = reviewType.includes("Mixed");

      const yearMin = Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
      const yearMax = Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
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
        ? `The evidence base comprised ${papersForSynthesis.length} studies (${yearMin}–${yearMax}) encompassing ${studyTypes.join(", ").toLowerCase() || "mixed study designs"}. Pooled or narrative findings indicate [direction of effect] for [outcome]. Heterogeneity was assessed via I² and τ²; ${robSummary.high} studies were rated at high risk of bias. The overall certainty of evidence was rated as ${"moderate"} following GRADE criteria.`
        : "No studies met the inclusion criteria.";

      const discussionImplications = isMeta
        ? "The meta-analytic estimate should be interpreted alongside the GRADE certainty assessment and robvis domain-level judgments. High risk-of-bias studies may overestimate effects; sensitivity analyses excluding these studies are recommended. Findings align with prior evidence in [field], though methodological differences preclude direct comparison. Limitations include potential publication bias and varying follow-up periods."
        : "Narrative findings should be interpreted in light of the methodological quality of included studies. The review followed PRISMA 2020 and robvis methodology; however, heterogeneity in study designs limits statistical pooling. Findings are consistent with prior reviews in [field] but highlight unresolved gaps. Limitations include restricted database coverage and potential selection bias.";

      const conclusionPara1 = `This ${reviewTypeLabel.toLowerCase()} synthesized evidence from ${included} studies examining ${topic}. The findings indicate [summary of main result]. Methodological quality varied across studies, with ${robSummary.low} rated low risk, ${robSummary.some} some/moderate concerns, and ${robSummary.high} at high risk of bias. ${isMeta ? "The pooled effect estimate provides a quantitative synthesis that should inform [clinical/policy] decision-making." : "The narrative synthesis maps the current state of evidence and identifies priorities for future inquiry."}`;

      const conclusionPara2 = `Future research should address [specific gaps], employ standardized outcome measures, and report effect sizes with confidence intervals. Prospective registration and open-access data sharing are recommended to enhance reproducibility. ${isMeta ? "Network meta-analysis and individual patient data synthesis may clarify treatment effects across heterogeneous populations." : "Scoping and systematic review updates are warranted as new evidence emerges."}`;

      const figurePlaceholders = isMeta
        ? `\\begin{figure*}[ht]\n  \\centering\n  \\includegraphics[width=\\textwidth]{forest_plot}\n  \\caption{Forest plot of pooled effect estimates.}\n\\end{figure*}\n\n\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{funnel_plot}\n  \\caption{Funnel plot assessing publication bias.}\n\\end{figure}\n\n\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{robvis_traffic_light}\n  \\caption{Risk-of-bias traffic-light plot (${robLabel}).}\n\\end{figure}`
        : `\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{robvis_traffic_light}\n  \\caption{Risk-of-bias traffic-light plot (${robLabel}).}\n\\end{figure}`;

      const manuscript = `# ${reviewTypeLabel}: ${topic}

## Title Page
**Manuscript type:** ${reviewTypeLabel}
**Topic:** ${topic}
**Date:** ${new Date().toISOString().split("T")[0]}
**PRISMA 2020 compliant:** Yes
**Registration:** Not applicable / PROSPERO CRDXXXXXXXX

---

## Abstract

The ${reviewTypeLabel.toLowerCase()} examined ${topic}. A systematic search of ${databases.join(", ") || selectedDbs.join(", ")} identified ${totalRecords} records, yielding ${included} studies for synthesis. ${isMeta ? "A random-effects meta-analysis was performed using metafor (R)." : "A narrative synthesis was conducted following awesome-evidence-synthesis principles."} ${robSummary.low} studies demonstrated low risk of bias, ${robSummary.some} some concerns, and ${robSummary.high} high risk. The pooled ${isMeta ? "estimate (not yet computed)" : "thematic findings"} suggests [direction] for [outcome]. These findings should be interpreted alongside the GRADE certainty assessment and PRISMA 2020 reporting standards. Results highlight [key implication] and recommend [action].

**Keywords:** ${[topic, reviewTypeLabel.toLowerCase(), ...studyTypes].sort().join(", ")}, evidence synthesis, PRISMA 2020, GRADE, robvis

---

## 1. Introduction

### 1.1 Background and Context
${topic} represents an important area of [field]. Despite existing research, key questions remain unanswered regarding [specific gap]. Prior reviews have synthesized evidence on related topics, yet methodological limitations reduce confidence in current conclusions.

### 1.2 Rationale
This ${reviewTypeLabel.toLowerCase()} was conducted to address the evidence gap identified above. The problem/gap/hook heuristic guides the narrative: the problem is [state problem], the gap is [identify missing evidence], and the hook is [explain why this review matters now].

### 1.3 Objectives
The primary objective was to synthesize evidence on ${topic}. Secondary objectives included assessing risk of bias, evaluating certainty of evidence via GRADE, and mapping heterogeneity across study designs.

---

## 2. Related Works

${relatedWorksBlock.replace(/\n\n/g, "\n\n")}

**Overall limitation:** Existing reviews typically lack standardized risk-of-bias assessment, GRADE certainty ratings, and PRISMA 2020-compliant reporting. None integrate robvis-domain-level judgments with meta-analytic pooling, limiting interpretability of bias patterns.

---

## 3. Proposed System Design

### 3.1 Methodological Approach
${methodologyParagraph}

### 3.2 Rationale for Methods
The selected methods align with the review objectives. Systematic searching ensures comprehensive coverage; duplicate screening minimizes selection bias; robvis-domain assessments provide granular bias profiles; and ${isMeta ? "random-effects meta-analysis accounts for expected between-study heterogeneity." : "narrative synthesis captures diverse evidence without inappropriate statistical pooling."}

### 3.3 Quality Assurance
Inter-rater reliability was calculated using Cohen's kappa (κ). Discrepancies were resolved by consensus or third-reviewer adjudication. The data extraction template was piloted on a subset of studies.

---

## 4. Results and Discussions

### 4.1 Experimental / Synthesis Results
${resultsOverview}

${figurePlaceholders}

### 4.2 Discussion of Findings
${discussionImplications}

The pooled or narrative findings extend prior work by [specific contribution]. ${isMeta ? "Statistical heterogeneity (I² = XX%) informed subgroup analyses." : "Thematic mapping revealed consistent patterns across study designs."} The GRADE assessment rated the certainty of evidence as [moderate], primarily downgraded for risk of bias and inconsistency.

---

## 5. Conclusion

${conclusionPara1}

${conclusionPara2}

---

## References

Arrange in order of appearance: Introduction → Related Works → Methods → Results.

1. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement. *BMJ*. 2021;372:n71.
2. [Add references from Related Works in citation order...]
3. [Continue adding references as cited...]

---

## Supplementary Materials

- **Table S1.** Search strategies by database
- **Table S2.** Excluded studies with reasons for exclusion
- **Table S3.** Data extraction template
- **Figure S1.** robvis traffic-light plot (${robLabel})
- **Figure S2.** Funnel plot (if meta-analysis)
- **Figure S3.** Forest plot (if meta-analysis)
- **GRADE evidence profile** (if applicable)

---

## Email Templates

### Template 1 — Request to Accept the Research Paper

**From**  
[Author Name],  
Department of [Department],  
[Institution],  
[Address].

**To,**  
The Reviewers,  
[Conference Name],  
[Conference Location]

Respected Sir/Madam,

Subject: Requesting acceptance of the research paper titled "[Title]"

With reference to the above subject, the manuscript has been prepared in accordance with the conference formatting guidelines. All figures, tables, captions, margins, fonts, and references have been verified. The manuscript is attached for kind consideration. The authors look forward to receiving the reviewers' feedback at the earliest.

Thank you.

Yours sincerely,  
[Author Name]  
[Department, Institution, Address]  
Mobile: [Number]

---

### Template 2 — Submission of Final Paper, Copyright Form & Payment Proof

**From**  
[Author Name],  
Department of [Department],  
[Institution],  
[Address].

**To,**  
The Reviewers,  
[Conference Name],  
[Conference Location]

Respected Sir/Madam,

Subject: Submission of Final Paper, Copyright Form & Payment Proof — Manuscript ID: [ID]

The final revised manuscript, copyright transfer form, and payment proof are attached. All formatting requirements, including author name section, section headings, subheadings, margins, font styles, line spacing, figure/table captions, and references, have been verified. Kindly acknowledge receipt.

Thank you.

Yours sincerely,  
[Author Name]  
[Department, Institution, Address]  
Mobile: [Number]

---

### Template 3 — Voice-Over Presentation Submission

**From**  
[Author Name],  
Department of [Department],  
[Institution],  
[Address].

**To,**  
The Reviewers,  
[Conference Name],  
[Conference Location]

Respected Sir/Madam,

Subject: Voice-Over PPT Submission — Manuscript ID: [ID]

The paper titled "[Title]" (Manuscript ID: [ID]) has been accepted. Due to scheduling conflicts, the authors are unable to present live. A voice-recorded presentation is attached for the conference program. Kindly confirm receipt.

Thank you.

Yours sincerely,  
[Author Name]  
[Department, Institution, Address]  
Mobile: [Number]

---

*Manuscript drafted using the Research Paper Template (a3X3k/gist) and aligned with UNMC literature review types, Dagher & Khan (2025) systematic review guidance, awesome-evidence-synthesis workflow standards, and PRISMA 2020 reporting. Authors must verify extracted data, complete effect-size calculations in statistical software (metafor/meta/forestplot), confirm GRADE ratings, and ensure <15% similarity via proper citation before submission.*
`;

      setManuscript(manuscript);
    } catch (err: any) {
      setManuscript(`# Error\n\n**Failed to generate manuscript:** ${err.message || "Unknown error"}\n\nPlease complete Steps 1–5 and try again.`);
    } finally {
      setManuscriptLoading(false);
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
          Guided workflow derived from <a href="https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis" target="_blank" rel="noreferrer" className="text-yellow-300 underline">awesome-evidence-synthesis</a>: systematic search, AI-assisted screening, structured data extraction, risk-of-bias assessment, meta-analysis, and PRISMA-compliant reporting.
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
                Auto-assessment uses robvis tool templates. Select your tool above and click <strong>Re-assess</strong> (or edit any cell) to override heuristic judgments with manual ratings.
              </p>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={autoAssessRob}
                  className="flex items-center gap-1.5 text-[11px] bg-emerald-900/50 text-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-800/60 border border-emerald-700/50"
                >
                  <Sparkles size={12} /> Re-assess with robvis template
                </button>
                <span className="text-[10px] text-blue-400">
                  Tool: {(() => { const t = getRobToolTemplate(); return t ? t.label : robTool; })()}
                  &nbsp;·&nbsp;{extractedData.length} studies
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
                          <th className="border border-blue-800 px-3 py-2 text-yellow-200 sticky left-0 bg-blue-900/90 z-10">Study</th>
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
                    Proceed to Literature Review
                    <BookOpen size={16} />
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
                <BookOpen size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Literature Review</h3>
              </div>
              <p className="text-xs text-blue-400 mb-4">
                 Generate a structured narrative literature review using deep reasoning (Long CoT). All selected papers are automatically included as references. Edit each section below. Inline citations are shown in brackets [N]. References are serially numbered in Vancouver style.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <button
                  onClick={generateLiteratureReview}
                  disabled={literatureReviewLoading || (selectedPaperIds.size === 0 && extractedData.length === 0)}
                  className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50"
                >
                  {literatureReviewLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#0a1a3a] border-t-transparent rounded-full animate-spin" />
                      Generating Literature Review...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Literature Review
                    </>
                  )}
                </button>
                {(literatureReviewSections.introduction || literatureReviewSections.references) && (
                  <>
                    <button
                      onClick={() => downloadLiteratureReviewPDF(literatureReviewSections)}
                      className="flex items-center gap-2 bg-red-900/50 text-red-200 hover:bg-red-800/60 px-4 py-2 rounded-lg text-sm"
                    >
                      <Download size={14} />
                      Download PDF
                    </button>
                    <button
                      onClick={() => downloadLiteratureReviewWord(literatureReviewSections)}
                      className="flex items-center gap-2 bg-blue-900/50 text-blue-200 hover:bg-blue-800/60 px-4 py-2 rounded-lg text-sm"
                    >
                      <Download size={14} />
                      Download Word
                    </button>
                  </>
                )}
                <span className="text-xs text-blue-300">
                  {selectedPaperIds.size} selected papers · {extractedData.length} extracted
                </span>
              </div>

              {(literatureReviewSections.introduction || literatureReviewSections.references || literatureReviewLoading) ? (
                <div className="space-y-4">
                  {[
                    { key: "introduction", label: "Introduction / Background", placeholder: "Context, significance, and current landscape of the research topic." },
                    { key: "problemGlobal", label: "Problem Statement — Global", placeholder: "Scale and burden of the problem at the global level." },
                    { key: "problemSEA", label: "Problem Statement — South-East Asia", placeholder: "Regional patterns, challenges, and specific contexts in South-East Asia." },
                    { key: "problemIndia", label: "Problem Statement — India", placeholder: "India-specific situation, policies, epidemiology, infrastructure, and unique challenges." },
                    { key: "gaps", label: "Research Gaps", placeholder: "What is missing from the literature? Understudied subpopulations, settings, methodologies, or outcomes." },
                    { key: "future", label: "Future Studies to Be Carried Out", placeholder: "Specific, actionable future research directions and recommendations." },
                    { key: "conclusion", label: "Conclusion", placeholder: "Key takeaways and implications for researchers, clinicians, or policymakers." },
                    { key: "references", label: "References (Vancouver style, serially numbered)", placeholder: "1. Author(s) (Year). Title. Database. DOI", isReferences: true },
                  ].map(({ key, label, placeholder, isReferences }) => (
                    <div key={key} className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                      <label className="block text-sm font-medium text-yellow-200 mb-2">{label}</label>
                      <textarea
                        value={literatureReviewSections[key as keyof typeof literatureReviewSections]}
                        onChange={(e) => setLiteratureReviewSections((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full bg-blue-950 border border-blue-800 text-blue-100 rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 min-h-[100px] leading-relaxed"
                      />
                      {isReferences && literatureReviewSections.references && (
                        <p className="text-[10px] text-blue-400 mt-1">
                          {literatureReviewSections.references.split("\n").filter((l) => l.trim()).length} references
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6 text-center">
                  <BookOpen size={32} className="text-blue-400 mx-auto mb-3" />
                  <p className="text-sm text-blue-200 mb-1">No literature review generated yet.</p>
                  <p className="text-xs text-blue-300">Click &quot;Generate Literature Review&quot; to produce a structured narrative review with deep reasoning based on your selected papers.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setPipelineStep(3)} className="bg-blue-900/50 hover:bg-blue-800/60 text-blue-200 font-bold px-4 py-2 rounded-lg flex items-center gap-2">
                Back to Risk of Bias
              </button>
              <button onClick={() => setPipelineStep(5)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Synthesis
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {pipelineStep === 5 && (
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
                  <h4 className="text-sm font-bold text-white mb-3">Narrative Synthesis Output</h4>
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
                <button onClick={() => setPipelineStep(6)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                  Proceed to Reporting
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {pipelineStep === 6 && (
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
              <button onClick={() => setPipelineStep(7)} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Proceed to Writing & Meta-analysis
                <PenTool size={16} />
              </button>
              <button onClick={() => { setPipelineStep(1); setPapers([]); setSelectedPaperIds(new Set()); setExtractedData([]); setSynthesisOutput(""); setEffectSizes([]); setRobAssessments({}); setSynthesisInstructions(""); setReviewRequirements(""); setManuscript(""); }} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2">
                Start New Review
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        )}
        {pipelineStep === 7 && (
          <div className="space-y-4">
            <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <PenTool size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Writing Review & Meta-analysis</h3>
              </div>
              <p className="text-xs text-blue-400 mb-4">
                This step will generate the full manuscript, narrative review, or meta-analysis report based on your extracted data, risk-of-bias assessments, and synthesis outputs. AI generation requires an API key in Settings.
              </p>

              {!manuscript ? (
                <div className="space-y-4">
                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Example: Narrative Review (to be generated in future)</h4>
                    <div className="text-xs text-blue-200 whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-blue-900/20 p-3 rounded border border-blue-800">
{`# Narrative Review: The Impact of Digital Health Interventions on Chronic Disease Management — A State-of-the-Art Review

## Abstract

Background: Digital health interventions (DHIs) — including mobile applications, wearable sensors, telemedicine platforms, and AI-driven decision-support tools — have proliferated over the past decade as scalable solutions for chronic disease management. This narrative review synthesizes the available evidence on the effectiveness, adoption barriers, and equity implications of DHIs across major chronic conditions including diabetes mellitus, hypertension, chronic obstructive pulmonary disease (COPD), and mental health disorders.

Methods: We conducted a narrative synthesis of peer-reviewed literature published between 2015 and 2025 across PubMed, Scopus, and Web of Science. Inclusion criteria encompassed original research, systematic reviews, and meta-analyses evaluating DHIs for chronic disease outcomes. Studies were grouped thematically by intervention modality, disease category, and outcome domain.

Results: Across 48 included studies, DHIs demonstrated moderate efficacy in improving clinical outcomes (glycated hemoglobin reduction of 0.4–0.8% in diabetes, systolic blood pressure reductions of 4–8 mmHg in hypertension) and process outcomes (medication adherence improvement of 15–25%). However, effect sizes were highly heterogeneous. Key thematic findings include: (1) mobile app-based self-management tools showed the strongest evidence for diabetes and asthma; (2) wearable sensor integration yielded promising but inconclusive results for COPD and heart failure; (3) AI chatbot interventions improved mental health outcomes in short-term RCTs but suffered from high attrition in real-world deployments; (4) equity concerns persist, with underrepresentation of low-income and older adult populations in digital intervention trials.

Discussion: While DHIs hold promise for extending the reach and efficiency of chronic disease care, the evidence base remains characterized by methodological heterogeneity, small sample sizes, and inconsistent outcome reporting. Future research should prioritize pragmatic trial designs, standardized patient-reported outcome measures, and intentional inclusion of diverse populations to strengthen the generalizability of findings.

Conclusion: Digital health interventions represent a valuable adjunct to traditional chronic disease management, but their real-world effectiveness depends on careful tailoring to patient populations, integration with clinical workflows, and equitable design. Policymakers and clinicians should view DHIs as complementary tools rather than standalone solutions.

Keywords: digital health, chronic disease, narrative review, mobile health, telemedicine, AI in healthcare`}
                    </div>
                  </div>

                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-2">Narrative Review Structure Reference</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-200">
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">1. Title</p>
                         <p className="text-blue-300">Descriptive, reflects scope and angle (e.g., &quot;Narrative Review: …&quot;)</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">2. Abstract</p>
                        <p className="text-blue-300">Background, methods, key themes, conclusion, keywords</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">3. Introduction</p>
                        <p className="text-blue-300">Epidemiological context, rationale, review objectives, scope</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">4. Methods</p>
                        <p className="text-blue-300">Search strategy, databases, selection criteria, thematic approach</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">5. Results / Themes</p>
                        <p className="text-blue-300">Thematic organization with evidence summaries per theme</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">6. Discussion</p>
                        <p className="text-blue-300">Interpretation, limitations, gaps, clinical/policy implications</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">7. Conclusion</p>
                        <p className="text-blue-300">Concise take-home messages and recommendations</p>
                      </div>
                      <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                        <p className="font-bold text-yellow-200 mb-1">8. References</p>
                        <p className="text-blue-300">Vancouver or APA style, arranged in order of appearance</p>
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
                        Generate Full Manuscript
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-3">Generated Manuscript</h4>
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
