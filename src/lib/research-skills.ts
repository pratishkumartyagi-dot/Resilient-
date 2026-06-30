export interface Paper {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  abstract: string;
  database: string;
  studyType: string;
  selected: boolean;
}

export interface SynthesisRow {
  id: string;
  reference: string;
  keyFindings: string;
  synopsis: string;
  studyDetails: string;
  researchGaps: string;
}

export interface Theme {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  selected: boolean;
}

export interface ResearchQuestion {
  id: string;
  question: string;
  type: "qualitative" | "quantitative";
  selected: boolean;
}

export interface ResearchTitle {
  id: string;
  title: string;
  explanation: string;
  selected: boolean;
}

export interface AimObjective {
  aim: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  userEdited: boolean;
}

export interface MethodologyInputs {
  studySite: string;
  setting: string;
  population: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  hypothesis: string;
  outcomes: string[];
}

export interface ProtocolSection {
  background: string;
  objectives: string;
  methods: string;
  expectedOutcomes: string;
}

export function buildStep3Prompt(papers: Paper[], uploadedContext: string): string {
  return `You are an expert systematic review research analyst performing deep evidence synthesis on selected academic papers, using Long Chain-of-Thought (Long CoT) reasoning methodology.

## Research Program Context
Supplementary evidence and web/academic search results may be provided below. Synthesize from both the selected papers and supplementary evidence. Grade all findings by strength: T1 Mechanistic, T2 Functional, T3 Associational, T4 Mention. If evidence is insufficient, explicitly state what is missing rather than speculate.

## Long CoT Reasoning Protocol

Before producing the final JSON, you MUST follow this structured deep reasoning chain:

### Deep Reasoning Phase 1 — Evidence Inventory
For each paper, extract:
- Primary claim / main finding
- Evidence strength indicator (mechanistic, functional, associational, mention)
- Population studied, setting, time period
- Key quantitative results or qualitative conclusions

### Deep Reasoning Phase 2 — Claim Extraction & Cross-Study Comparison
Identify overlapping and conflicting claims across papers:
- Which findings are consistent across multiple studies?
- Which findings contradict each other?
- Which papers address the same question with different methods?

### Deep Reasoning Phase 3 — Evidence Grading
Assign each finding an evidence grade:
- T1 (★★★) Mechanistic: in-target study with direct experimental evidence
- T2 (★★☆) Functional: functional study showing role in pathway context
- T3 (★☆☆) Association: screen hit, GWAS association, correlation
- T4 (☆☆☆) Mention: review mention, text-mined interaction, peripheral reference

### Deep Reasoning Phase 4 — Feasible Reflection
Before finalizing each row, ask:
- Is this claim directly supported by the abstract? If not, mark as inferred.
- Have I acknowledged contradictions or limitations mentioned by the authors?
- Is the research gap plausible given the study design?

TASK: Produce a structured evidence synthesis table by deeply analyzing each paper's content, methodology, findings, and research limitations using the above Long CoT evidence-graded reasoning.

SYNTHESIS RULES:
- Base ALL outputs strictly on the provided paper metadata (title, authors, journal, year, DOI, abstract, study type).
- For Vancouver reference: format as "Authors. Title. Journal. Year;Volume(Issue):Pages. doi:DOI" and include the DOI link as https://doi.org/DOI.
- Key findings: extract the most important quantitative and qualitative findings from the abstract, graded by evidence tier.
- Synopsis/Takeaway: 1-2 sentences explaining the core contribution to the evidence base.
- Study Conducted: explicitly state Population, Setting, Time period of study, and any Intervention or diagnostic method tested.
- Research Gaps: identify (1) author-acknowledged limitations, (2) contradictions or conflicting evidence, (3) exclusion criteria if stated, (4) underexplored areas the authors highlight. If the abstract does not specify, infer plausible gaps based on study design and scope.
- Grade every claim by evidence strength.

OUTPUT FORMAT — strict JSON array only:
[
  {
    "id": "unique-id",
    "reference": "Vancouver style with <em>journal</em> and DOI searchable link",
    "keyFindings": "string with evidence grade (T1/T2/T3/T4)",
    "synopsis": "string",
    "studyDetails": "Population: ... Setting: ... Time: ... Intervention: ...",
    "researchGaps": "Limitations: ... Contradictions: ... Exclusion criteria: ... Future work: ..."
  }
]

${uploadedContext ? `UPLOADED DOCUMENT CONTEXT:\n${uploadedContext}\n` : ""}
PAPERS TO SYNTHESIZE:
${papers
  .map(
    (p, i) =>
      `${i + 1}. TITLE: ${p.title}\n   AUTHORS: ${p.authors}\n   JOURNAL: ${p.journal}\n   YEAR: ${p.year}\n   DOI: ${p.doi}\n   STUDY TYPE: ${p.studyType}\n   ABSTRACT: ${p.abstract}`
  )
  .join("\n\n")}`;
}

export function buildStep4Prompt(papers: Paper[], uploadedContext: string): string {
  const selectedPapers = papers.filter((p) => p.selected);
  return `You are an expert biomedical researcher writing a systematic literature review, using Long Chain-of-Thought (Long CoT) reasoning methodology for deep structured analysis.

## Long CoT Reasoning Protocol

Before writing the final review, you MUST follow this structured reasoning chain:

### Deep Reasoning Phase 1 — Planning/Scoping
- Define PICO framework: Population, Intervention/Exposure, Comparator, Outcomes
- Clarify the exact research boundary and scope

### Deep Reasoning Phase 2 — Evidence Mapping
- Map each selected paper to evidence themes
- Identify study designs and their relative weight in the evidence hierarchy
- Note publication dates and any temporal trends

### Deep Reasoning Phase 3 — Thematic Synthesis
- Group findings into coherent themes (not study-by-study)
- For each theme: (a) summarize convergent findings, (b) highlight divergent results, (c) identify the strongest evidence tier

### Deep Reasoning Phase 4 — Feasible Reflection (Self-Critique)
Before finalizing the document:
- Have I truly synthesized findings, or merely summarized studies?
- Are there contradictions I need to acknowledge explicitly?
- Which claims are evidence-limited vs. well-supported?
- What are the most important knowledge gaps I've identified?

TASK: Write a comprehensive, thematic literature review based on the ${selectedPapers.length} selected papers.

REQUIREMENTS:
- Write a professional narrative literature review in markdown format
- Organize Results section by THEMES or research questions, NOT individual studies
- Include a PRISMA-style flow note at the start showing: Initial search → Deduplication → Screening → Included (${selectedPapers.length} papers)
- Be objective, systematic, and specific; acknowledge limitations
- Use Vancouver-style in-text citations and a complete reference list
- Include Introduction, Methods, Results (thematic), Discussion, Conclusion sections
- Synthesize findings across studies within each theme — compare and contrast approaches and results
- Highlight the strongest evidence and identify knowledge gaps

FORMAT — markdown only (no JSON):
# Literature Review: [Topic]

## Abstract
[Brief summary of the review]

## Introduction
[Research context and objectives using PICO framework]

## Methods
[Search strategy, databases used, inclusion/exclusion criteria, quality assessment approach, PRISMA flow]

## Results
[Organize into 3-5 thematic subsections based on the selected papers]

### Theme 1: [Theme Name]
[Synthesis of papers addressing this theme — compare and contrast]

### Theme 2: [Theme Name]
[Synthesis of papers addressing this theme]

## Discussion
[Interpret findings, acknowledge limitations, identify future directions]

## References
[Complete Vancouver-style reference list with DOIs]

${uploadedContext ? `\nUPLOADED DOCUMENT CONTEXT:\n${uploadedContext}\n` : ""}
SELECTED PAPERS:
${selectedPapers
  .map(
    (p, i) =>
      `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>. doi:${p.doi}\n   Abstract: ${p.abstract}`
  )
  .join("\n\n")}`;
}

export function buildStep5Prompt(papers: Paper[], synthesisTable: SynthesisRow[]): string {
  const selectedPapers = papers.filter((p) => p.selected);
  return `You are an expert biomedical research landscape analyst performing topic saturation and whitespace analysis following the AIPOCH Medical Topic Saturation and Whitespace Checker methodology.

TASK: Analyze whether the research topic represented by the ${selectedPapers.length} selected papers is saturated, crowded, or contains meaningful whitespace for new entry. Extract key research themes from the evidence.

ANALYSIS FRAMEWORK:
1. Define the exact topic unit under review (disease + modality/population/endpoint context)
2. Retrieve and organize field-occupancy signals from the provided papers
3. Distinguish true saturation from superficial crowding
4. Detect meaningful whitespace (understudied populations, cleaner endpoints, stronger validation designs, orthogonal datasets, clinically meaningful framing, comparator gaps)
5. Provide a table-first output with saturation dimensions and confidence notes

OUTPUT STRUCTURE:

### A. Topic Framing
State the exact topic unit, scan objective, scope boundaries, and assumptions.

### B. Evidence Audit
Summarize the evidence composition from the ${selectedPapers.length} papers retrieved.

### C. Structured Saturation Signal Map (TABLE)
| Saturation Dimension | Observed Pattern | Crowding vs Non-crowding | Evidence Depth | Confidence |
|---------------------|-----------------|------------------------|----------------|------------|
| Publication density | ... | ... | ... | ... |
| Repeated study-template density | ... | ... | ... | ... |
| Validation depth | ... | ... | ... | ... |
| Major-group occupancy | ... | ... | ... | ... |
| Comparator congestion | ... | ... | ... | ... |

### D. True Saturation vs Superficial Crowding Summary
Which parts are truly saturated vs noisy but shallow vs strategically occupied.

### E. Whitespace and Differentiation Map (TABLE)
| Remaining Angle | Why Still Open | Not Cosmetic | Feasibility | Validation Burden | Main Risk |
|-----------------|---------------|--------------|-------------|-------------------|-----------|

### F. Timing Window Summary
Open, narrowing, late-but-possible, or nearly closed — with evidence.

### G. Primary Recommended Entry Direction
One primary next-step direction with rationale.

### H. Self-Critical Risk Review
Strongest part, most assumption-dependent part, most likely overcalled signal, easiest-to-overstate whitespace.

### I. Retrieved References
List papers used for the scan.

HARD RULES:
- Never treat publication volume alone as proof of saturation.
- Always distinguish popularity from true field closure.
- Always distinguish meaningful whitespace from cosmetic novelty.
- When evidence is indirect, label as evidence-limited.

PAPERS ANALYZED:
${selectedPapers
  .map(
    (p, i) =>
      `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>.\n   Study Type: ${p.studyType}\n   Abstract: ${p.abstract}`
  )
  .join("\n\n")}

SYNTHESIS TABLE CONTEXT:
${synthesisTable.length > 0 ? synthesisTable.map((r, i) => `${i + 1}. [${r.reference}] Key findings: ${r.keyFindings}`).join("\n") : "No synthesis data available."}`;
}

export function buildStep6Prompt(papers: Paper[], themes: Theme[] | null, researchTopic: string): string {
  const selectedPapers = papers.filter((p) => p.selected);
  return `You are an expert clinical and biomedical research question-framing planner following the AIPOCH Clinical Question Clarifier methodology.

TASK: Clarify the research idea into a structured, bounded, searchable, researchable, and testable question definition based on the selected papers and themes.

WORKFLOW:
1. Interpret the user's actual intent from the research topic and selected papers
2. Classify the dominant question type (treatment, diagnosis, prognosis, prediction, exposure/causality, mechanism, implementation, epidemiology, translational, exploratory)
3. Identify ambiguity and missing elements (population, disease stage, exposure/intervention, comparator, outcome, timeframe, setting, subgroup, evidence goal)
4. Select the best-fit framing structure (PICO, PECO, PICOTS, diagnostic, prognostic, mechanistic, implementation, translational)
5. Generate at least three clarified versions: plain-language, research-ready, and searchable for literature retrieval
6. Assess whether the question is searchable, researchable, and testable
7. Recommend the best downstream next step

OUTPUT STRUCTURE:

### A. Original Idea Interpretation
How the input is being interpreted and what the central intent is.

### B. Question Type Classification
Dominant question type and secondary types.

### C. Ambiguity and Missing Elements
Major ambiguities, underspecified variables, scope problems.

### D. Best-Fit Framing Structure
Selected framework and why it fits.

### E. Structured Question Breakdown (TABLE)
| Element | Current Interpretation | Needs Narrowing? | Proposed Definition |
|---------|----------------------|-------------------|---------------------|
| Population | ... | Yes/No | ... |
| Intervention/Exposure | ... | Yes/No | ... |
| Comparator | ... | Yes/No | ... |
| Outcome | ... | Yes/No | ... |
| Timeframe | ... | Yes/No | ... |
| Setting | ... | Yes/No | ... |

### F. Clarified Question Versions
1. Plain-language version: ...
2. Research-ready version: ...
3. Searchable version (for literature retrieval): ...

### G. Scope and Boundary Statement
What is covered and what is not covered.

### H. Researchability Assessment
Searchable: Yes/No | Researchable: Yes/No | Testable: Yes/No | Evidence mode needed: ...

### I. Recommended Downstream Path
Evidence review, gap analysis, study design, or protocol development.

### J. Risk of Misframing
Most likely ways this question could be framed incorrectly.

RESEARCH TOPIC: ${researchTopic}

SELECTED PAPERS CONTEXT (${selectedPapers.length} papers):
${selectedPapers.slice(0, 10).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>. ${p.abstract.substring(0, 200)}...`).join("\n")}

${themes && themes.length > 0 ? `IDENTIFIED THEMES:\n${themes.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join("\n")}` : ""}`;
}

export function buildStep7Prompt(
  researchQuestions: ResearchQuestion[],
  synthesisTable: SynthesisRow[],
  themes: Theme[] | null
): string {
  return `You are a biomedical academic writing specialist focused on title optimization following the AIPOCH Title and Abstract Optimizer methodology.

TASK: Generate optimized, publication-ready research title candidates based on the research questions, synthesis findings, and themes identified in the pipeline.

FRAMEWORK:
First clarify the manuscript core:
- Research topic and study design
- Main data/evidence type
- Primary finding or central contribution
- Claim boundary (what the study can and cannot claim)

Then optimize titles for:
- Specificity
- Information density
- Design visibility when appropriate
- Concise disease/population/modality anchoring
- Disciplined claim language
- Submission fit

OUTPUT STRUCTURE:

### A. Input Match Check
Sufficient information for high-confidence optimization.

### B. Core Study Understanding
- Topic: ...
- Study design: ...
- Main data/evidence type: ...
- Central finding: ...
- Claim boundary: ...

### C. Title Optimization Guidelines
Guidelines for what makes a strong title in this context.

### D. Generated Title Candidates (5 titles)
For each title:
1. **[Title text]**
   - Style: [ declarative / descriptive / question / compound ]
   - Design visibility: [RCT / cohort / systematic review / meta-analysis / experimental]
   - Claim discipline: [conservative / moderate / strong]
   - Word count: [N]
   - Suitability: [journal fit assessment]

### E. Title Selection Recommendation
Recommended title with rationale.

### F. Claim Boundary Check
What the title must NOT imply.

RESEARCH QUESTIONS:
${researchQuestions.map((q, i) => `${i + 1}. ${q.question} [${q.type}]`).join("\n")}

KEY SYNTHESIS FINDINGS:
${synthesisTable.slice(0, 5).map((r, i) => `${i + 1}. ${r.reference}\n   Key finding: ${r.keyFindings}\n   Synopsis: ${r.synopsis}`).join("\n\n")}

${themes && themes.length > 0 ? `IDENTIFIED THEMES:\n${themes.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join("\n")}` : ""}`;
}

export function buildStep8Prompt(
  researchQuestions: ResearchQuestion[],
  themes: Theme[] | null,
  selectedPapers: Paper[]
): string {
  return `You are an expert biomedical protocol-framing analyst following the AIPOCH Aim and Hypothesis Designer methodology.

TASK: Design structured primary aims, secondary aims, and testable hypotheses from the research questions, themes, and selected papers identified in the pipeline.

WORKFLOW:
1. Define the exact study question precisely (disease, population, intervention/exposure, outcome, intended evidence role, scope)
2. Identify the smallest coherent study story
3. Build the aim hierarchy: one primary aim, limited secondary aims, optional supporting objectives
4. Write testable hypotheses only where justified (answerable, falsifiable, tied to defined relationships)
5. Explicitly classify each aim/analysis component as confirmatory, exploratory, supportive, or hypothesis-generating
6. Align each aim with required evidence type and minimum analysis standard
7. Audit for scope inflation, aim sprawl, overlapping aims, hidden dependencies, weak hypotheses

OUTPUT STRUCTURE:

### A. Topic Framing
- Exact study topic: ...
- Target study question: ...
- Intended evidence role: ...
- Working scope: ...

### B. Central Study Story
The smallest coherent study story in concise form.

### C. Aim Hierarchy

**Primary Aim:**
[Aim statement]

**Secondary Aims:**
1. [Aim 1]
2. [Aim 2]

**Supporting Objectives (optional):**
- [Objective if needed]

### D. Hypothesis Structure
For each aim:
- Aim: ...
- Hypothesis: [testable form] or "Not applicable — descriptive/exploratory"
- Rationale: ...

### E. Confirmatory vs Exploratory Separation
| Component | Classification | Rationale |
|-----------|---------------|-----------|
| ... | Confirmatory / Exploratory / Supportive | ... |

### F. Study Logic Alignment
For each aim:
- Required evidence type: ...
- Minimum study logic: ...
- Key dependency: ...
- Minimum analysis standard: ...

### G. Scope and Failure-Mode Audit
- Scope inflation risks: ...
- Overlap between aims: ...
- Hidden dependencies: ...
- Weak hypotheses: ...

### H. Recommended Final Aim Package
One best final aim structure with rationale.

### I. Self-Critical Review
- Strongest part: ...
- Weakest assumption: ...
- Most likely overreach: ...
- Easiest way to become incoherent: ...

RESEARCH QUESTIONS:
${researchQuestions.map((q, i) => `${i + 1}. ${q.question} [${q.type}]`).join("\n")}

${themes && themes.length > 0 ? `IDENTIFIED THEMES:\n${themes.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join("\n")}` : ""}

SELECTED PAPERS (${selectedPapers.length} total, showing first 5):
${selectedPapers.slice(0, 5).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>.`).join("\n")}`;
}

export function buildStep9Prompt(
  aimObjectives: AimObjective,
  selectedPapers: Paper[],
  studyType: string
): string {
  return `You are a biomedical writing specialist for Methods sections following the AIPOCH Methods Section Writer methodology.

TASK: Generate a publication-ready Methods section draft based on the study aim, objectives, and selected papers.

WORKFLOW:
1. Identify study type and applicable reporting guideline (CONSORT for RCT, STROBE for observational, PRISMA for systematic review, TRIPOD for prediction model, etc.)
2. Collect required inputs from the study aims and objectives
3. Write full paragraphs in IMRAD Methods subsections:
   - Study design and oversight
   - Participants/samples
   - Randomization and blinding (RCT only)
   - Intervention or exposure
   - Outcomes (primary and secondary with measurement instruments)
   - Sample size
   - Statistical analysis (model, assumption checks, effect sizes with CIs, missing-data strategy, software version)
   - Data management and availability
4. After drafting, check coverage against the applicable guideline
5. Deliver: complete Methods draft + coverage note + explicit assumptions

HARD RULES:
- Never fabricate statistical results, effect sizes, sample sizes, p-values, or software outputs
- Never invent ethics approval IDs, consent forms, or regulatory references
- If a detail is missing, write a placeholder [AUTHOR TO SPECIFY: ...] rather than inventing a default
- Do not introduce new outcomes in the Methods not mentioned in the aims

OUTPUT STRUCTURE — markdown only (no JSON):

## Methods

### Study Design and Setting
[Full paragraph]

### Participants
[Eligibility criteria, recruitment setting, sample handling]

### [Intervention / Exposure — as applicable]
[What was done, timing, dosage]

### Outcomes
[Primary outcome with measurement instrument and timing; secondary outcomes]

### Sample Size
[Power, alpha, expected effect size, attrition allowance]

### Statistical Analysis
[Primary model, assumption checks, effect sizes with CIs, missing-data strategy, software/version]

### Data Management and Availability
[Recording, storage, anonymization, access]

### Reporting Guideline Coverage
[CONSORT/STROBE/PRISMA items covered: list. Items needing author input: list]

STUDY TYPE: ${studyType}

STUDY AIMS AND OBJECTIVES:
- Aim: ${aimObjectives.aim}
- Primary Objective: ${aimObjectives.primaryObjective}  
- Secondary Objectives: ${aimObjectives.secondaryObjectives.join("; ")}

SELECTED PAPERS CONTEXT (${selectedPapers.length} papers):
${selectedPapers.slice(0, 5).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>. ${p.abstract.substring(0, 200)}...`).join("\n")}`;
}

export function buildStep10Prompt(
  aimObjectives: AimObjective,
  selectedPapers: Paper[],
  studyType: string,
  synthesisTable: SynthesisRow[]
): string {
  return `You are an expert clinical research protocol strategist following the AIPOCH Clinical Cohort Protocol Designer methodology.

TASK: Design a structured retrospective or prospective clinical cohort study protocol framework based on the study aims, objectives, and evidence synthesized from selected papers.

WORKFLOW (11 steps):
1. Determine whether cohort design is appropriate for the question
2. Select cohort type (retrospective EHR/registry, prospective observational, biomarker-enriched, prognostic, etc.)
3. Define source population, eligibility/exclusion logic, index date/time-zero, baseline window, cohort entry rule
4. Define follow-up structure: start, duration, visit schedule, censoring rules, loss-to-follow-up handling, competing events
5. Define primary and secondary endpoints with operational definitions and ascertainment mechanisms
6. Structure variable collection: exposure/predictor, demographics, disease severity, treatments, labs, confounders, effect modifiers, follow-up variables
7. Build primary statistical analysis line: estimand, model family, covariate adjustment, subgroup logic, sensitivity analyses, missing-data concept
8. Audit bias and validity threats (immortal time bias, confounding by indication, misclassification, informative censoring)
9. Check feasibility: what data are likely available vs assumption-dependent
10. Recommend the lead protocol version

OUTPUT STRUCTURE — markdown only (no JSON):

## A. Study Intent Summary
[Concise restatement of cohort question, dominant objective, intended evidence type]

## B. Why Cohort Design Fits
[Whether cohort design is appropriate, what interpretation level it supports, competing designs considered]

## C. Recommended Cohort Type
[Retrospective / Prospective / Specific subtype and why]

## D. Source Population, Enrollment Logic, and Time-Zero
| Element | Definition |
|---------|------------|
| Source population | ... |
| Inclusion criteria | ... |
| Exclusion criteria | ... |
| Index date / Time-zero | ... |
| Baseline window | ... |
| Cohort entry rule | ... |

## E. Follow-up Architecture
| Element | Definition |
|---------|------------|
| Follow-up start | ... |
| Follow-up duration | ... |
| Visit/observation structure | ... |
| Censoring rules | ... |
| Loss-to-follow-up handling | ... |
| Competing events | ... |

## F. Endpoint Framework
| Element | Definition |
|---------|------------|
| Primary endpoint | ... |
| Secondary endpoints | ... |
| Endpoint structure | [binary / time-to-event / longitudinal / competing-risk] |
| Ascertainment mechanism | ... |

## G. Variable Collection Framework
**Necessary:**
- Exposure/predictor: ...
- Demographics: ...
- Disease severity: ...
- Confounders: ...

**Recommended:**
- Treatments: ...
- Laboratory/imaging: ...
- Effect modifiers: ...

**Optional:**
- Exploratory variables: ...

## H. Primary Statistical Analysis Line
| Element | Definition |
|---------|------------|
| Primary estimand | ... |
| Model family | ... |
| Covariate adjustment | ... |
| Subgroup logic | ... |
| Sensitivity analyses | ... |
| Missing-data strategy | ... |
| Software | ... |

## I. Bias and Validity Review
| Bias Source | Why It Matters | Design Mitigation |
|-------------|---------------|-------------------|
| ... | ... | ... |

## J. Feasibility and Data-Quality Check
| Data Element | Likely Available | Assumption-Dependent |
|-------------|-----------------|---------------------|
| ... | Yes/No/Uncertain | ... |

## K. Recommended Protocol Version
[Lead protocol recommendation with rationale]

## L. Critical Assumptions and Next Clarifications
[List assumptions requiring confirmation and minimum follow-up questions]

STUDY TYPE: ${studyType}

AIMS AND OBJECTIVES:
- Aim: ${aimObjectives.aim}
- Primary Objective: ${aimObjectives.primaryObjective}
- Secondary Objectives: ${aimObjectives.secondaryObjectives.join("; ")}

KEY SYNTHESIS FINDINGS:
${synthesisTable.slice(0, 5).map((r, i) => `${i + 1}. ${r.reference}\n   Key finding: ${r.keyFindings}`).join("\n\n")}

SELECTED PAPERS (${selectedPapers.length} total, showing first 5):
${selectedPapers.slice(0, 5).map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. <em>${p.journal}</em>.`).join("\n")}`;
}
