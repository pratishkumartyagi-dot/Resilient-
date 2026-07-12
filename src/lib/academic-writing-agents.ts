export interface AcademicPrinciple {
  code: string;
  category: string;
  title: string;
  description: string;
}

export interface ReviewAgent {
  id: string;
  name: string;
  type: "review" | "audit" | "research" | "survey" | "action";
  focus: string;
  description: string;
}

export interface ReviewFinding {
  agentId: string;
  severity: "Critical" | "Important" | "Minor";
  section: string;
  issue: string;
  suggestion: string;
}

export const ACADEMIC_PRINCIPLES: AcademicPrinciple[] = [
  {
    code: "A1",
    category: "Structure & Narrative",
    title: "Recursive Consistency",
    description: "Every section should echo the core claim. Headings, topic sentences, and conclusions must align recursively."
  },
  {
    code: "A2",
    category: "Structure & Narrative",
    title: "Logical Chaining",
    description: "Each paragraph should end by setting up the next. Build a clear logical chain from problem to solution."
  },
  {
    code: "A3",
    category: "Structure & Narrative",
    title: "Definition Order",
    description: "Define terms before using them. Introduce abbreviations at first use and maintain consistent notation."
  },
  {
    code: "A4",
    category: "Structure & Narrative",
    title: "Paragraph Closers",
    description: "End paragraphs with a transition or summary sentence that connects to the next paragraph's opening."
  },
  {
    code: "A5",
    category: "Structure & Narrative",
    title: "Claim-First",
    description: "State the main point of each paragraph in the first sentence. Supporting evidence follows."
  },
  {
    code: "A6",
    category: "Structure & Narrative",
    title: "GPS Rhythm",
    description: "Every section follows Goal-Problem-Solution: state what you want, what blocks it, and how you fix it."
  },
  {
    code: "A7",
    category: "Structure & Narrative",
    title: "The Nugget",
    description: "Each section has a single takeaway — the nugget. If a section has two nuggets, split it."
  },
  {
    code: "B1",
    category: "Prose & Style",
    title: "Enumerations",
    description: "Use lists sparingly and purposefully. Each item should be parallel in structure and complete in meaning."
  },
  {
    code: "B2",
    category: "Prose & Style",
    title: "Negation-Contrast",
    description: "Frame limitations as contrast, not failure. 'Unlike X, our approach...' is stronger than 'We do not use X'."
  },
  {
    code: "B3",
    category: "Prose & Style",
    title: "Colloquial Terms",
    description: "Avoid informal language. Replace colloquialisms with precise academic terminology."
  },
  {
    code: "B4",
    category: "Prose & Style",
    title: "Thesis Voice",
    description: "Maintain a confident but modest academic voice. Avoid hedging excessively or making unsupported claims."
  },
  {
    code: "B5",
    category: "Prose & Style",
    title: "One Idea/Sentence",
    description: "Each sentence should express one idea. Split compound thoughts into separate sentences."
  },
  {
    code: "B6",
    category: "Prose & Style",
    title: "Calibrated Confidence",
    description: "Match claim strength to evidence strength. Use 'suggests', 'demonstrates', or 'proves' appropriately."
  },
  {
    code: "B7",
    category: "Prose & Style",
    title: "Ruthless Conciseness",
    description: "Eliminate redundant words, unnecessary qualifiers, and repetitive phrasing."
  },
  {
    code: "B8",
    category: "Prose & Style",
    title: "AI-Tell Detection",
    description: "Avoid patterns that reveal AI generation: overly balanced structures, generic transitions, uniform sentence length."
  },
  {
    code: "C1",
    category: "Math & Equations",
    title: "Math for Clarity",
    description: "Equations should clarify, not obscure. Introduce each equation with a clear sentence explaining what it represents."
  },
  {
    code: "C2",
    category: "Math & Equations",
    title: "Triple Explanation",
    description: "Explain every equation three ways: intuitive description, formal notation, and concrete example."
  },
  {
    code: "C3",
    category: "Math & Equations",
    title: "Equation-Code Correspondence",
    description: "When presenting code, ensure it maps directly to the mathematical formulation described in the text."
  },
  {
    code: "D1",
    category: "Figures & Tables",
    title: "Active Figures",
    description: "Every figure should make a specific claim. If it does not advance the argument, remove it."
  },
  {
    code: "D2",
    category: "Figures & Tables",
    title: "Cross-Reference Floats",
    description: "Reference every figure and table in the text before it appears. Use consistent numbering."
  },
  {
    code: "D3",
    category: "Figures & Tables",
    title: "Figure-Text-Caption Consistency",
    description: "The caption, the figure content, and the text describing it must all convey the same message."
  },
  {
    code: "D4",
    category: "Figures & Tables",
    title: "One Message",
    description: "Each figure or table should communicate exactly one key message. Split multi-message figures."
  },
  {
    code: "D5",
    category: "Figures & Tables",
    title: "Interpret Figures",
    description: "Do not just describe figures — interpret them. Explain what the pattern means for the argument."
  },
  {
    code: "D6",
    category: "Figures & Tables",
    title: "Row Alignment",
    description: "Tables should have aligned decimal places, consistent units, and logical grouping of rows."
  },
  {
    code: "D7",
    category: "Figures & Tables",
    title: "Caption Self-Sufficiency",
    description: "A caption should stand alone. A reader should understand the figure without reading the main text."
  },
  {
    code: "E1",
    category: "Citations & Bibliography",
    title: "Cite Named Entities",
    description: "Cite the original source when naming methods, datasets, or tools. Do not cite secondary references."
  },
  {
    code: "E2",
    category: "Citations & Bibliography",
    title: "Citation Completeness",
    description: "Every claim that is not common knowledge requires a citation. Every citation requires a bibliography entry."
  },
  {
    code: "E3",
    category: "Citations & Bibliography",
    title: "Bibliography Hygiene",
    description: "Maintain consistent formatting, correct author names, complete metadata, and verified DOIs."
  },
  {
    code: "F1",
    category: "Process & Meta",
    title: "Strategic Limitations",
    description: "Acknowledge limitations proactively and strategically. Frame them as opportunities for future work."
  },
  {
    code: "F2",
    category: "Process & Meta",
    title: "Negation-Contrast Audit",
    description: "Scan for 'not' statements and convert them to positive contrasts where possible."
  },
];

export const REVIEW_AGENTS: ReviewAgent[] = [
  {
    id: "consistency-checker",
    name: "Consistency Checker",
    type: "review",
    focus: "Terminology, cross-refs, figure-text-caption alignment, structural coherence",
    description: "Ensures terminology is consistent throughout, cross-references are accurate, and figure-text-caption alignment is maintained."
  },
  {
    id: "logic-reviewer",
    name: "Logic Reviewer",
    type: "review",
    focus: "Argument flow, transitions, narrative arc, logical gaps",
    description: "Evaluates the logical flow of arguments, quality of transitions between sections, and identifies logical gaps in the narrative."
  },
  {
    id: "technical-reviewer",
    name: "Technical Reviewer",
    type: "review",
    focus: "Math notation, methodology, results validity, citations",
    description: "Checks mathematical notation, methodology descriptions, validity of results, and correctness of citations."
  },
  {
    id: "writing-reviewer",
    name: "Writing Reviewer",
    type: "review",
    focus: "Prose clarity, conciseness, grammar, academic tone",
    description: "Reviews prose for clarity, conciseness, grammatical correctness, and appropriate academic tone."
  },
  {
    id: "latex-layout-auditor",
    name: "LaTeX Layout Auditor",
    type: "review",
    focus: "PDF layout audit — float placement, alignment, sizing",
    description: "Audits the PDF layout for proper float placement, alignment, and sizing of figures and tables."
  },
  {
    id: "bibliography-auditor",
    name: "Bibliography Auditor",
    type: "audit",
    focus: "Bib entry completeness, arXiv updates, title capitalization, venue consistency",
    description: "Checks bibliography entries for completeness, updates arXiv references, verifies title capitalization, and ensures venue consistency."
  },
  {
    id: "research-analyst",
    name: "Research Analyst",
    type: "research",
    focus: "Related work, novelty assessment, positioning, gap analysis",
    description: "Analyzes related work, assesses novelty, evaluates positioning in the field, and identifies remaining gaps."
  },
  {
    id: "brainstormer",
    name: "Brainstormer",
    type: "research",
    focus: "Alternative framings, cross-disciplinary connections, research directions",
    description: "Suggests alternative framings, identifies cross-disciplinary connections, and proposes future research directions."
  },
  {
    id: "paper-crawler",
    name: "Paper Crawler",
    type: "survey",
    focus: "Collects papers from DBLP + OpenAlex APIs, deduplicates, classifies",
    description: "Collects relevant papers from academic APIs, deduplicates entries, and classifies them by relevance."
  },
  {
    id: "prose-polisher",
    name: "Prose Polisher",
    type: "action",
    focus: "Rewrites text for clarity, conciseness, flow (edits, not just reports)",
    description: "Rewrites text to improve clarity, conciseness, and flow. Implements fixes rather than just reporting issues."
  },
  {
    id: "section-drafter",
    name: "Section Drafter",
    type: "action",
    focus: "Drafts LaTeX sections, paragraphs, transitions, captions, abstracts",
    description: "Drafts complete sections including paragraphs, transitions, captions, and abstracts."
  },
  {
    id: "latex-figure-specialist",
    name: "LaTeX Figure Specialist",
    type: "action",
    focus: "Creates/adjusts TikZ/pgfplots figures, manages placement and layout",
    description: "Creates and adjusts TikZ/pgfplots figures, manages placement and layout for optimal presentation."
  },
];

export function formatPrinciplesForPrompt(): string {
  const grouped = ACADEMIC_PRINCIPLES.reduce<Record<string, AcademicPrinciple[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  let output = "# Academic Writing Principles (30 Principles, 6 Categories)\n\n";
  for (const [category, principles] of Object.entries(grouped)) {
    output += `## ${category}\n`;
    for (const p of principles) {
      output += `- **${p.code} ${p.title}**: ${p.description}\n`;
    }
    output += "\n";
  }
  return output;
}

export function formatAgentsForPrompt(): string {
  const grouped = REVIEW_AGENTS.reduce<Record<string, ReviewAgent[]>>((acc, a) => {
    const typeLabel = a.type.charAt(0).toUpperCase() + a.type.slice(1);
    if (!acc[typeLabel]) acc[typeLabel] = [];
    acc[typeLabel].push(a);
    return acc;
  }, {});

  let output = "# Academic Writing Agents (12 Specialist Agents)\n\n";
  for (const [type, agents] of Object.entries(grouped)) {
    output += `## ${type} Agents\n`;
    for (const a of agents) {
      output += `- **${a.name}** (${a.id}): ${a.description}\n`;
    }
    output += "\n";
  }
  return output;
}

export function buildAcademicWritingManuscriptPrompt(opts: {
  topic: string;
  reviewType: string;
  papersForSynthesis: any[];
  extractedData: any[];
  synthesisOutput: string;
  effectSizes: any[];
  robAssessments: Record<string, any>;
  robTool: string;
  reviewRequirements?: string;
  synthesisInstructions?: string;
  prismaCounts: {
    identification: number;
    deduped: number;
    screened: number;
    excluded: number;
    assessed: number;
    included: number;
  };
  selectedDbs: string[];
  query: string;
}): string {
  const {
    topic,
    reviewType,
    papersForSynthesis,
    extractedData,
    synthesisOutput,
    effectSizes,
    robAssessments,
    robTool,
    reviewRequirements,
    synthesisInstructions,
    prismaCounts,
    selectedDbs,
    query,
  } = opts;

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

  const template = getRobToolTemplate(robTool);
  const robLabel = template ? template.label : robTool;
  const isMeta = reviewType.includes("Meta-analysis") || reviewType.includes("Meta");
  const studyTypes = Array.from(new Set(papersForSynthesis.map((p) => p.studyType))).filter(Boolean);
  const yearMin = Math.min(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));
  const yearMax = Math.max(...papersForSynthesis.map((p) => typeof p.year === "number" ? p.year : parseInt(String(p.year), 10) || 2020));

  return `You are an expert academic writing engine powered by the Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents). Your task is to produce a complete, source-grounded research paper draft for a ${reviewType} on the topic: "${topic}" using ONLY the evidence gathered from previous pipeline stages (Risk of Bias, Synthesis & Meta-analysis, Reporting & PRISMA).

## Academic Writing Agents Methodology

This draft must adhere to the 30 academic writing principles and benefit from the perspective of 12 specialist agents (consistency-checker, logic-reviewer, technical-reviewer, writing-reviewer, bibliography-auditor, research-analyst, prose-polisher, section-drafter, etc.).

${formatPrinciplesForPrompt()}

## Agent Review Perspectives

Before drafting, consider these specialist perspectives:
- **Consistency Checker**: Ensure terminology, cross-refs, figure-text-caption alignment, and structural coherence.
- **Logic Reviewer**: Verify argument flow, transitions, narrative arc, and absence of logical gaps.
- **Technical Reviewer**: Validate methodology, results validity, and citation correctness.
- **Writing Reviewer**: Ensure prose clarity, conciseness, grammar, and academic tone.
- **Bibliography Auditor**: Verify citation completeness, title capitalization, and venue consistency.
- **Research Analyst**: Assess related work coverage, novelty, and positioning.
- **Prose Polisher**: Apply one-idea-per-sentence, calibrated confidence, and ruthless conciseness.
- **Section Drafter**: Structure each section with GPS rhythm (Goal-Problem-Solution) and nugget-first organization.

## Phase 1 — Research & Evidence Inventory
- Use ONLY the provided extracted studies, synthesis output, effect sizes, and risk-of-bias assessments.
- Do NOT invent citations. Every study listed below is a real included study from the pipeline.
- Identify convergent findings, divergent results, and evidence gaps.

## Phase 2 — Structure & Outline
- Build a structured academic outline before drafting prose.
- Standard structure: Title Page, Abstract, Introduction, Methods, Results, Discussion, Conclusion, References.
- Apply GPS Rhythm to each section: Goal (what you want), Problem (what blocks it), Solution (how you fix it).
- Each section must have a single Nugget — the takeaway. If a section has two nuggets, split it.
- For meta-analysis: include pooled estimates, heterogeneity (I², τ²), and forest-plot description.
- For narrative synthesis: organize thematically with evidence tables.

## Phase 3 — Writing
- Draft each section with academic tone and precise terminology.
- Apply Claim-First: state the main point in the first sentence of each paragraph.
- Apply Paragraph Closers: end paragraphs with transitions to the next.
- One idea per sentence. Split compound thoughts.
- Synthesize thematically, not study-by-study.
- Grade claims by evidence strength where applicable.
- Use calibrated confidence: 'suggests', 'demonstrates', or 'proves' appropriately.
- Apply Negation-Contrast: frame limitations as contrast, not failure.

## Phase 4 — Citation & Verification
- Cite studies using Vancouver style: Author(s). Title. Journal. Year;Volume(Issue):Pages. doi:DOI
- List references in order of appearance.
- All cited studies are already verified in the pipeline; do not add external references.
- Cite named entities: when naming methods or tools, cite the original source.
- Bibliography hygiene: consistent formatting, correct author names, complete metadata, verified DOIs.

## Phase 5 — Polish
- Ensure consistent terminology across sections.
- Check that every major claim is supported by the provided evidence.
- Apply ruthless conciseness: eliminate redundant words and unnecessary qualifiers.
- Avoid AI-tell patterns: overly balanced structures, generic transitions, uniform sentence length.
- Add a self-review checklist at the end using the 30 principles.

## Evidence Summary from Previous Pipeline Stages

### Risk of Bias (Step 3)
RISK-OF-BIAS TOOL: ${robLabel}
RoB SUMMARY: Low ${robSummary.low}, Some/Moderate ${robSummary.some}, High ${robSummary.high}, Pending ${robSummary.pending}

${extractedData.length > 0 ? `EXTRACTED STUDIES WITH RoB:\n${extractedData.filter((p) => papersForSynthesis.some((sp) => sp.id === p.id)).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. Type: ${p.studyType}. RoB: ${robAssessments[p.id]?.overall || "Pending"}.${p.notes ? ` Notes: ${p.notes}` : ""}`).join("\n\n")}` : "No extracted data."}

${synthesisOutput ? `\n### Synthesis & Meta-analysis (Step 4)\n${synthesisOutput}\n` : ""}

${effectSizes.length > 0 ? `\nEFFECT SIZE TABLE:\n${effectSizes.map((r, i) => `${i + 1}. ${r.study}: Effect = ${r.effect}, 95% CI = ${r.ci}, Weight = ${r.weight}`).join("\n")}\n` : ""}

${reviewRequirements ? `\nUSER-SPECIFIC REQUIREMENTS:\n${reviewRequirements}\n` : ""}
${synthesisInstructions ? `SYNTHESIS INSTRUCTIONS:\n${synthesisInstructions}\n` : ""}

## OUTPUT FORMAT

Generate a complete, publication-ready manuscript in Markdown. Follow this exact structure:

# ${reviewType}: ${topic}

## Title Page
**Manuscript type:** ${reviewType}
**Topic:** ${topic}
**Date:** ${new Date().toISOString().split("T")[0]}
**PRISMA 2020 compliant:** Yes
**Registration:** Not applicable / PROSPERO CRDXXXXXXXX
**Drafting engine:** Academic Writing Agents (github.com/andrehuang/academic-writing-agents)

---

## Abstract

[Background (2-3 sentences). Methods (3-4 sentences): databases, search strategy, inclusion criteria, quality assessment approach. Results (3-4 sentences): number of studies, key findings, effect direction if meta-analysis. Conclusion (1-2 sentences). Keep within 250-300 words.]

**Keywords:** ${[topic, reviewType.toLowerCase(), ...studyTypes].sort().join(", ")}, evidence synthesis, PRISMA 2020, GRADE

---

## 1. Introduction

### 1.1 Background and Context
[Apply GPS Rhythm: Goal (what this review achieves), Problem (evidence gap), Solution (how this review addresses it). Apply Claim-First: first sentence states the paragraph message. Apply Definition Order: define terms before reusing them.]

### 1.2 Rationale
[State the problem, identify the gap in evidence, and explain why this review matters now. Apply The Nugget: one takeaway per paragraph.]

### 1.3 Objectives
[State primary and secondary objectives clearly.]

---

## 2. Methods

### 2.1 Search Strategy
[Databases searched: ${selectedDbs.join(", ")}. Search strings, date range, Boolean logic. Apply Recursive Consistency: every method mentioned must be described here.]

### 2.2 Inclusion / Exclusion Criteria
[PICO-framed criteria: Population, Intervention/Exposure, Comparator, Outcomes. Apply Definition Order.]

### 2.3 Quality Assessment
[Tool: ${robLabel}. Approach: per-domain robvis methodology. Apply Equation-Code Correspondence if any statistical models are described.]

### 2.4 PRISMA 2020 Flow
[Identification: ${prismaCounts.identification} → Deduplication: ${prismaCounts.deduped} → Screening: ${prismaCounts.screened} → Assessed: ${prismaCounts.assessed} → Included: ${prismaCounts.included}]

### 2.5 Synthesis Methods
${isMeta ? "[Random-effects meta-analysis (DerSimonian-Laird). Heterogeneity: I², τ². Certainty: GRADE.]" : "[Narrative/thematic synthesis following Academic Writing Agents principles: coding, theme development, and mapping.]"}

---

## 3. Results

### 3.1 Study Characteristics
[Describe the evidence base: ${papersForSynthesis.length} studies, ${yearMin}–${yearMax}, ${studyTypes.join(", ").toLowerCase()}. Organize thematically. Apply Active Figures: every table should make a specific claim.]

### 3.2 Thematic Synthesis
[For each theme: summarize convergent findings, highlight divergent results, identify the strongest evidence tier. Apply Interpret Figures: do not just describe — interpret.]

### 3.3 Meta-analysis (if applicable)
[Pooled estimates, heterogeneity statistics, forest plot description. Apply Triple Explanation: intuitive description, formal notation, concrete example.]

### 3.4 Risk of Bias
[Summarize robvis domain-level judgments: Low ${robSummary.low}, Some/Moderate ${robSummary.some}, High ${robSummary.high}. Apply Caption Self-Sufficiency: figure captions must stand alone.]

---

## 4. Discussion

[Interpret findings in context. Acknowledge limitations explicitly using Strategic Limitations (F1) and Negation-Contrast (F2). Identify future directions. Keep terminology stable.]

---

## 5. GRADE Certainty of Evidence

| Outcome | Certainty | Rationale |
|---------|-----------|-----------|
| Primary | Moderate | e.g., downgraded for risk of bias and inconsistency |

---

## 6. Conclusion

[Concise take-home messages. Recommendations for clinicians, researchers, and policymakers. Apply The Nugget: one takeaway per section.]

---

## References

[Arrange in order of appearance. Use Vancouver style: Author(s). Title. Journal. Year;Volume(Issue):Pages. doi:DOI]

1. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement. BMJ. 2021;372:n71.
${papersForSynthesis.slice(0, 8).map((p, i) => `${i + 2}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || p.database}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

---

## Self-Review Checklist (Academic Writing Agents)

Before finalizing, answer these questions:
1. **Recursive Consistency (A1)**: Do all sections echo the core claim?
2. **Logical Chaining (A2)**: Does each paragraph end by setting up the next?
3. **Definition Order (A3)**: Are all terms defined before use?
4. **Paragraph Closers (A4)**: Does every paragraph end with a transition?
5. **Claim-First (A5)**: Does every paragraph state its main point in the first sentence?
6. **GPS Rhythm (A6)**: Does every section follow Goal-Problem-Solution?
7. **The Nugget (A7)**: Does each section have exactly one takeaway?
8. **Ruthless Conciseness (B7)**: Is every word necessary?
9. **Calibrated Confidence (B6)**: Do claim strengths match evidence strengths?
10. **AI-Tell Detection (B8)**: Does the text avoid generic AI patterns?
11. **Bibliography Hygiene (E3)**: Are all citations complete and correctly formatted?
12. **Strategic Limitations (F1)**: Are limitations framed as opportunities?

**Agent Review Summary:**
- Consistency Checker: [pass / issues found]
- Logic Reviewer: [pass / issues found]
- Technical Reviewer: [pass / issues found]
- Writing Reviewer: [pass / issues found]
- Bibliography Auditor: [pass / issues found]
- Research Analyst: [pass / issues found]

---

*Manuscript drafted using Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents), aligned with PRISMA 2020, GRADE, and robvis standards.*`;
}

export function buildAcademicWritingReviewPrompt(opts: {
  manuscript: string;
  principles?: string[];
}): string {
  const { manuscript, principles } = opts;

  const selectedPrinciples = principles
    ? ACADEMIC_PRINCIPLES.filter((p) => principles.includes(p.code))
    : ACADEMIC_PRINCIPLES;

  const principlesText = selectedPrinciples
    .map((p) => `- **${p.code} ${p.title}** (${p.category}): ${p.description}`)
    .join("\n");

  return `You are an expert academic writing reviewer using the Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents).

Your task is to review the following manuscript draft against the 30 academic writing principles.

## Manuscript Draft

${manuscript}

## Review Principles

${principlesText}

## Review Instructions

1. Read the manuscript carefully.
2. For each principle, assess whether the manuscript adheres to it.
3. Identify specific passages that violate each principle.
4. Provide actionable suggestions for improvement.
5. Categorize findings as:
   - **Critical**: Issues that undermine the manuscript's validity or readability.
   - **Important**: Issues that significantly affect quality but do not invalidate the work.
   - **Minor**: Issues that are noticeable but have minimal impact.

## OUTPUT FORMAT

Generate a structured review report in Markdown:

# Academic Writing Agents Review Report

## Summary
- Total issues found: [number]
- Critical: [number]
- Important: [number]
- Minor: [number]

## Findings by Principle

For each violated principle:
### [Code] [Title]
- **Severity**: Critical / Important / Minor
- **Section**: [section name]
- **Issue**: [description of the problem]
- **Suggestion**: [actionable fix]

## Prioritized Action Plan

1. [Critical issue 1]
2. [Important issue 1]
3. [Minor issue 1]

---

*Review conducted using Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents)*`;
}

export function getRobToolTemplate(robTool: string) {
  const templates: Record<string, { label: string; domains: { id: string; label: string }[]; judgments: string[]; overallDefault: string }> = {
    ROB2: {
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
    "ROB2-Cluster": {
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
    ROBINS_I: {
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
    ROBINS_E: {
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
    QUADAS_2: {
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
    QUIPS: {
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
    Generic: {
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
  };

  return templates[robTool] || templates["ROB2"];
}

export function buildIncorporateReviewPrompt(opts: { manuscript: string; reviewReport: string; reviewType: string; topic: string }): string {
  const { manuscript, reviewReport, reviewType, topic } = opts;

  return `You are an expert academic writing reviser using the Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents).

Your task is to rewrite the following manuscript draft by incorporating ALL actionable feedback from the review report. The final output must be a complete, polished, publication-ready manuscript in Markdown.

## Original Manuscript

${manuscript}

## Academic Writing Agents Review Report

${reviewReport}

## Instructions

1. Incorporate every actionable suggestion from the review report into the manuscript.
2. Fix all Critical and Important issues. Address Minor issues where they affect clarity.
3. Preserve the original structure and evidence base. Do not add new studies or remove existing ones.
4. Apply the 30 academic writing principles throughout: Recursive Consistency, Logical Chaining, Definition Order, Paragraph Closers, Claim-First, GPS Rhythm, The Nugget, Ruthless Conciseness, Calibrated Confidence, AI-Tell Detection, Bibliography Hygiene, Strategic Limitations, etc.
5. Ensure all Vancouver-style citations remain correct and complete.
6. The final manuscript should read as a single, cohesive document — not a revision log.

## OUTPUT FORMAT

Output ONLY the complete revised manuscript in Markdown. Do NOT include a revision summary or changelog.

# ${reviewType}: ${topic}

[Complete revised manuscript following the same structure as the original: Title Page, Abstract, Introduction, Methods, Results, Discussion, Conclusion, References, Self-Review Checklist]

---

*Manuscript revised using Academic Writing Agents methodology (github.com/andrehuang/academic-writing-agents)*`;
}
