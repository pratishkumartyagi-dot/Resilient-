export type GapCategory = "methodological" | "theoretical" | "application" | "interdisciplinary";
export type GapSeverity = "high" | "medium" | "low";
export type HypothesisPriority = "high" | "medium" | "low";
export type AnalysisDepth = "quick" | "standard" | "comprehensive";
export type InputType = "single_paper" | "multiple_papers" | "abstract" | "synthesis_table";

export interface ResearchGap {
  id: string;
  category: GapCategory;
  description: string;
  severity: GapSeverity;
  evidenceBase: string[];
  sourcePapers: string[];
}

export interface HypothesisQualityAssessment {
  innovationScore: number;
  feasibilityScore: number;
  impactScore: number;
  overallPriority: HypothesisPriority;
}

export interface Hypothesis {
  id: string;
  statement: string;
  rationale: string;
  basedOn: string[];
  qualityAssessment: HypothesisQualityAssessment;
  suggestedMethodology: string;
  testability: {
    variables: string[];
    measurableOutcomes: string[];
    achievable: boolean;
  };
}

export interface GapAnalysisMetadata {
  inputType: InputType;
  analysisDepth: AnalysisDepth;
  date: string;
  papersAnalyzed: string[];
}

export interface GapAnalysisResult {
  analysisMetadata: GapAnalysisMetadata;
  executiveSummary: string;
  researchGaps: ResearchGap[];
  hypotheses: Hypothesis[];
  priorityRankings: string[];
  nextSteps: string[];
}

const GAP_CATEGORIES: Record<GapCategory, { label: string; probes: string[] }> = {
  methodological: {
    label: "Methodological Gaps",
    probes: [
      "Measurement limitations (accuracy, precision, validity)",
      "Sample constraints (size, diversity, representativeness)",
      "Design limitations (correlation vs causation, short-term vs long-term)",
      "Technical constraints (equipment, computational power, analytical methods)",
    ],
  },
  theoretical: {
    label: "Theoretical Gaps",
    probes: [
      "Incomplete theoretical frameworks",
      "Unexplained phenomena",
      "Contradictory theoretical predictions",
      "Missing mediators or moderators",
      "Over-simplified models",
    ],
  },
  application: {
    label: "Application Gaps",
    probes: [
      "Laboratory findings not translated to real-world settings",
      "Missing population subgroups",
      "Geographic or cultural limitations",
      "Scale-up challenges",
      "Integration with existing systems",
    ],
  },
  interdisciplinary: {
    label: "Interdisciplinary Opportunities",
    probes: [
      "Opportunities to apply methods from other fields",
      "Untapped theoretical frameworks from adjacent disciplines",
      "Cross-domain research opportunities",
      "Technology transfer possibilities",
    ],
  },
};

export function getGapCategory(category: GapCategory) {
  return GAP_CATEGORIES[category];
}

export function categorizeGap(description: string): GapCategory {
  const text = description.toLowerCase();
  const signals: Record<GapCategory, string[]> = {
    methodological: ["sample", "measurement", "design", "method", "technical", "equipment", "validity", "precision", "accuracy", "correlation", "causation"],
    theoretical: ["theoretical", "framework", "phenomenon", "contradict", "mediator", "moderator", "model"],
    application: ["real-world", "translation", "population", "geographic", "cultural", "scale-up", "integration", "clinical", "practice"],
    interdisciplinary: ["interdisciplinary", "other field", "adjacent", "cross-domain", "technology transfer", "borrow"],
  };
  let best: GapCategory = "methodological";
  let bestCount = 0;
  for (const [cat, kws] of Object.entries(signals)) {
    const count = kws.filter((kw) => text.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      best = cat as GapCategory;
    }
  }
  return best;
}

export function assessSeverity(description: string): GapSeverity {
  const text = description.toLowerCase();
  const highSignals = ["critical", "major", "significant", "widespread", "fundamental", "severe", "limiting", "barrier", "bottleneck"];
  const lowSignals = ["minor", "slight", "marginal", "niche", "incremental", "optional"];
  if (highSignals.some((kw) => text.includes(kw))) return "high";
  if (lowSignals.some((kw) => text.includes(kw))) return "low";
  return "medium";
}

export function scoreHypothesis(innovation: number, feasibility: number, impact: number): HypothesisQualityAssessment {
  const innovationScore = Math.min(5, Math.max(1, Math.round(innovation)));
  const feasibilityScore = Math.min(5, Math.max(1, Math.round(feasibility)));
  const impactScore = Math.min(5, Math.max(1, Math.round(impact)));
  const average = (innovationScore + feasibilityScore + impactScore) / 3;
  let overallPriority: HypothesisPriority = "medium";
  if (average >= 4) overallPriority = "high";
  else if (average <= 2.5) overallPriority = "low";
  return { innovationScore, feasibilityScore, impactScore, overallPriority };
}

export function rankHypotheses(hypotheses: Hypothesis[]): string[] {
  return [...hypotheses]
    .sort((a, b) => {
      const avgA = (a.qualityAssessment.innovationScore + a.qualityAssessment.feasibilityScore + a.qualityAssessment.impactScore) / 3;
      const avgB = (b.qualityAssessment.innovationScore + b.qualityAssessment.feasibilityScore + b.qualityAssessment.impactScore) / 3;
      return avgB - avgA;
    })
    .map((h) => h.id);
}

export interface GapAnalysisPromptOptions {
  papers: {
    id: string;
    title: string;
    abstract: string;
    authors: string;
    journal: string;
    year: number;
    doi?: string;
    studyType: string;
  }[];
  synthesisTable?: {
    id: string;
    reference: string;
    keyFindings: string;
    researchGaps: string;
  }[];
  themes?: {
    id: string;
    title: string;
    description: string;
  }[];
  researchTopic?: string;
  depth?: AnalysisDepth;
}

export function buildGapAnalysisPrompt(options: GapAnalysisPromptOptions): string {
  const depth = options.depth ?? "standard";
  const papers = options.papers;
  const depthGuidance: Record<AnalysisDepth, string> = {
    quick: "Quick Scan (5-10 min): Focus on explicit limitations and obvious gaps. Output 3-5 major gaps and 2-3 top hypotheses.",
    standard: "Standard Analysis (15-20 min): Methodological and theoretical gap analysis. Output 5-10 research gaps and 3-5 prioritized hypotheses.",
    comprehensive: "Comprehensive Analysis (30+ min): Include interdisciplinary gaps and extensive literature synthesis. Output 10-20 research gaps and 5-10 prioritized hypotheses.",
  };
  return `You are a research analyst using the Research Gap Finder methodology (github.com/LengFeng00/research-gap-finder) for systematic literature analysis, research gap identification, and hypothesis generation.

## Research Gap Finder Protocol

TASK: Analyze the provided literature to identify research gaps and generate scientifically rigorous, testable hypotheses with multi-dimensional quality assessments.

### Analysis Depth: ${depth}
${depthGuidance[depth]}

### Phase 1 — Input Analysis
Extract from each paper:
- Research questions and objectives
- Methodology and experimental design
- Main findings and conclusions
- Acknowledged limitations
- Future work suggestions

### Phase 2 — Gap Identification
Apply these systematic frameworks:

**Methodological Gaps** - Measurement limitations, sample constraints, design limitations (correlation vs causation, short-term vs long-term), technical constraints.
**Theoretical Gaps** - Incomplete theoretical frameworks, unexplained phenomena, contradictory predictions, missing mediators/moderators, over-simplified models.
**Application Gaps** - Lab findings not translated to real-world, missing population subgroups, geographic/cultural limitations, scale-up challenges, integration barriers.
**Interdisciplinary Gaps** - Methods from other fields, untapped frameworks from adjacent disciplines, cross-domain opportunities, technology transfer.

For each gap record: category, description, severity (high/medium/low), evidence base (supporting citations), source papers.

### Phase 3 — Hypothesis Generation
For each identified gap, generate a hypothesis:

**Hypothesis structure:**
- Statement: clear, testable claim
- Rationale: existing evidence + identified gap, novelty, testability
- Quality Assessment:
  - Innovation Score (1-5): 1=incremental, 2=new application, 3=novel combination, 4=significant advance, 5=paradigm-shifting
  - Feasibility Score (1-5): technical, resource, ethical, practical viability
  - Impact Score (1-5): scientific, practical, societal, field impact
  - Overall Priority: High/Medium/Low
- Suggested Methodology: experimental approach

### Output Format — strict JSON only:
{
  "analysisMetadata": {
    "inputType": "multiple_papers",
    "analysisDepth": "${depth}",
    "date": "${new Date().toISOString().split("T")[0]}",
    "papersAnalyzed": [${papers.map((p) => `"${p.id}"`).join(", ")}]
  },
  "executiveSummary": "Brief overview of main gaps and opportunities",
  "researchGaps": [
    {
      "id": "gap-1",
      "category": "methodological|theoretical|application|interdisciplinary",
      "description": "...",
      "severity": "high|medium|low",
      "evidenceBase": ["citation"],
      "sourcePapers": ["paper-id"]
    }
  ],
  "hypotheses": [
    {
      "id": "hyp-1",
      "statement": "testable hypothesis",
      "rationale": "scientific justification",
      "basedOn": ["gap-1"],
      "qualityAssessment": {
        "innovationScore": 1-5,
        "feasibilityScore": 1-5,
        "impactScore": 1-5,
        "overallPriority": "high|medium|low"
      },
      "suggestedMethodology": "experimental approach",
      "testability": {
        "variables": ["var1"],
        "measurableOutcomes": ["outcome1"],
        "achievable": true
      }
    }
  ],
  "priorityRankings": ["hyp-1", "hyp-2"],
  "nextSteps": ["literature validation", "experimental design", ...]
}

${options.researchTopic ? `RESEARCH TOPIC: ${options.researchTopic}\n` : ""}
PAPERS TO ANALYZE:
${papers.map((p, i) => `${i + 1}. TITLE: ${p.title}\n   AUTHORS: ${p.authors}\n   JOURNAL: ${p.journal}\n   YEAR: ${p.year}\n   DOI: ${p.doi || "N/A"}\n   STUDY TYPE: ${p.studyType}\n   ABSTRACT: ${p.abstract}`).join("\n\n")}

${options.synthesisTable && options.synthesisTable.length > 0 ? `SYNTHESIS TABLE (research gaps column):\n${options.synthesisTable.map((r, i) => `${i + 1}. [${r.reference}] Gaps: ${r.researchGaps}`).join("\n\n")}` : ""}

${options.themes && options.themes.length > 0 ? `IDENTIFIED THEMES:\n${options.themes.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join("\n")}` : ""}`;
}

export function formatGapReport(result: GapAnalysisResult): string {
  const lines: string[] = [];
  lines.push("# Research Gap Analysis & Hypothesis Generation");
  lines.push("");
  lines.push(`**Analysis Depth**: ${result.analysisMetadata.analysisDepth}`);
  lines.push(`**Input Type**: ${result.analysisMetadata.inputType}`);
  lines.push(`**Date**: ${result.analysisMetadata.date}`);
  lines.push(`**Papers Analyzed**: ${result.analysisMetadata.papersAnalyzed.length}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(result.executiveSummary);
  lines.push("");
  lines.push("## Research Gaps Identified");
  for (const gap of result.researchGaps) {
    lines.push(`### ${GAP_CATEGORIES[gap.category].label}`);
    lines.push(`- **Severity**: ${gap.severity}`);
    lines.push(`- **Description**: ${gap.description}`);
    lines.push(`- **Evidence Base**: ${gap.evidenceBase.join(", ") || "none"}`);
    lines.push(`- **Source Papers**: ${gap.sourcePapers.join(", ") || "none"}`);
    lines.push("");
  }
  lines.push("## Generated Hypotheses (Priority Order)");
  for (const hypId of result.priorityRankings) {
    const hyp = result.hypotheses.find((h) => h.id === hypId);
    if (!hyp) continue;
    const q = hyp.qualityAssessment;
    lines.push(`### Hypothesis: ${hyp.statement}`);
    lines.push(`- **Rationale**: ${hyp.rationale}`);
    lines.push(`- **Quality**: Innovation ${q.innovationScore}/5 | Feasibility ${q.feasibilityScore}/5 | Impact ${q.impactScore}/5 | Priority: ${q.overallPriority}`);
    lines.push(`- **Suggested Methodology**: ${hyp.suggestedMethodology}`);
    lines.push(`- **Testable Variables**: ${hyp.testability.variables.join(", ")}`);
    lines.push(`- **Measurable Outcomes**: ${hyp.testability.measurableOutcomes.join(", ")}`);
    lines.push("");
  }
  lines.push("## Next Steps");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }
  return lines.join("\n");
}
