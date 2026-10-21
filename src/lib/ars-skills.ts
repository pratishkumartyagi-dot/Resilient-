// Academic Research Skills (ARS) methodology integration.
//
// Adapted from https://github.com/Imbad0202/academic-research-skills
// (Academic Research Skills by Cheng-I Wu, CC BY-NC 4.0).
//
// ARS is a prompt-driven methodology suite: the value it carries is the
// *protocol* each agent follows, not executable code. This module encodes
// those protocols as prompt builders so the Paper Writer & Reviewer pipeline
// can run them with the API keys the app already has (Gemini / Groq /
// local DeepSeek model) — no new credentials are introduced.
//
// Ported protocols:
//   - Style Calibration (per-journal voice, structure, limits)
//   - Anti-Leakage Protocol (never invent data; declare what is missing)
//   - Writing Quality Check (self-verification pass before sign-off)
//   - Criterion-Bound Review (each judgement bound to a named criterion)
//   - Concession Threshold Protocol (structured response to reviewer points)
//   - Attack Intensity Preservation (critique does not soften on revision)
//   - Devil's Advocate (mandatory adversarial perspective)
//   - Journal-Fit Reviewer (scope/impact/readiness assessment)
//   - Revision Coaching (roadmap + response-letter skeleton)
//   - Socratic Planning (guided question sequence)

export type ArsMode =
  | "full"
  | "plan"
  | "outline-only"
  | "revision"
  | "revision-coach"
  | "abstract-only"
  | "lit-review";

export interface JournalProfile {
  id: string;
  name: string;
  /** Word/structure limits the manuscript must respect. */
  wordLimits: { abstract: number; main: number; total: number };
  /** Reporting guideline the journal enforces. */
  reportingGuideline: string;
  /** Reference style required in the reference list. */
  referenceStyle: string;
  /** House-style notes injected into the drafting prompt. */
  styleNotes: string;
  /** Section order the journal expects. */
  sectionOrder: string[];
  /** Structured abstract headings used by the journal. */
  abstractHeadings: string[];
}

export const JOURNAL_PROFILES: JournalProfile[] = [
  {
    id: "bmc-medicine",
    name: "BMC Medicine",
    wordLimits: { abstract: 350, main: 5000, total: 6500 },
    reportingGuideline: "EQUATOR / CONSORT for trials, STROBE for observational studies",
    referenceStyle: "Vancouver (numbered, in order of appearance)",
    styleNotes:
      "Strong mechanistic narrative expected. Hypothesis-driven framing; results must connect to a stated biological or clinical mechanism. Subheadings permitted but avoid heavy nesting. Conclusions must state clinical implication explicitly.",
    sectionOrder: ["Abstract", "Background", "Methods", "Results", "Discussion", "Declarations", "References"],
    abstractHeadings: ["Background", "Methods", "Results", "Conclusions"],
  },
  {
    id: "ijtld",
    name: "The International Journal of Tuberculosis and Lung Disease",
    wordLimits: { abstract: 300, main: 4000, total: 5500 },
    reportingGuideline: "STROBE for observational, CONSORT for trials, PRISMA for reviews",
    referenceStyle: "Vancouver (numbered)",
    styleNotes:
      "Tuberculosis and lung-disease specific. Emphasise epidemiological burden, programme implementation, and policy relevance. TB-control vocabulary (case detection, treatment success, loss to follow-up) expected. Region-specific burden data required.",
    sectionOrder: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "Acknowledgements", "References"],
    abstractHeadings: ["Objective", "Design", "Methods", "Results", "Conclusion"],
  },
  {
    id: "plos-medicine",
    name: "PLOS Medicine",
    wordLimits: { abstract: 300, main: 6000, total: 7500 },
    reportingGuideline: "EQUATOR network guidelines, CONSORT 2010 for randomised trials",
    referenceStyle: "Vancouver (numbered)",
    styleNotes:
      "Clinical significance and generalisability are the gatekeepers. State what changes in practice because of this work. Absolute risk differences are preferred over relative measures. Subheadings encouraged to aid scanning.",
    sectionOrder: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Supporting Information", "Acknowledgments", "References"],
    abstractHeadings: ["Objective", "Design, Setting, and Participants", "Methods", "Results", "Conclusions"],
  },
  {
    id: "lancet-global-health",
    name: "The Lancet Global Health",
    wordLimits: { abstract: 300, main: 4500, total: 6000 },
    reportingGuideline: "STROBE, CONSORT, PRISMA as applicable; GATHER for global health data",
    referenceStyle: "Vancouver (numbered)",
    styleNotes:
      "Global health framing is mandatory: burden, inequity, and health-system context. Equity and implementation implications are required. National programmes in the Indian context must be referenced. Avoid jargon; state implications for low- and middle-income settings.",
    sectionOrder: ["Summary", "Background", "Methods", "Findings", "Interpretation", "Discussion", "References"],
    abstractHeadings: ["Background", "Methods", "Findings", "Interpretation"],
  },
  {
    id: "bmj-open",
    name: "BMJ Open",
    wordLimits: { abstract: 300, main: 4000, total: 5500 },
    reportingGuideline: "STROBE, CONSORT, PRISMA, or appropriate EQUATOR guideline",
    referenceStyle: "Vancouver (numbered)",
    styleNotes:
      "Transparency-first. Every methodological choice must be justified inline. Open-science framing: data availability, code availability, and protocol registration statements are required. Word discipline is strict — cut descriptive padding before cutting analysis.",
    sectionOrder: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Ethics approval", "Data sharing statement", "References"],
    abstractHeadings: ["Objective", "Design", "Setting", "Participants", "Primary and secondary outcome measures", "Results", "Conclusions"],
  },
];

export const DEFAULT_JOURNAL = JOURNAL_PROFILES[0];

export interface ArsModeOption {
  id: ArsMode;
  label: string;
  hint: string;
}

/** ARS academic-paper modes surfaced in the Paper Writer UI. */
export const ARS_MODES: ArsModeOption[] = [
  { id: "full", label: "Full Paper", hint: "Complete manuscript draft" },
  { id: "plan", label: "Plan", hint: "Socratic planning dialogue" },
  { id: "outline-only", label: "Outline Only", hint: "Evidence-mapped outline" },
  { id: "abstract-only", label: "Abstract Only", hint: "Structured abstract" },
  { id: "lit-review", label: "Literature Review", hint: "Narrative literature review" },
  { id: "revision", label: "Revision", hint: "Revised draft with responses" },
  { id: "revision-coach", label: "Revision Coach", hint: "Roadmap + response skeleton" },
];

export function getJournalProfile(nameOrId: string): JournalProfile {
  return (
    JOURNAL_PROFILES.find((j) => j.id === nameOrId || j.name === nameOrId) ?? DEFAULT_JOURNAL
  );
}

// ---------------------------------------------------------------------------
// Anti-Leakage Protocol
// ---------------------------------------------------------------------------

export const ANTI_LEAKAGE_PROTOCOL = `ANTI-LEAKAGE PROTOCOL (mandatory, do not violate):
- Never invent, estimate, extrapolate, or infer numeric results, p-values, confidence intervals, effect sizes, sample sizes, or counts that are not present in the supplied source material.
- Never fabricate citations, author names, DOIs, or journal names. If a reference list is required and the source material does not contain one, write a placeholder marker (e.g. "[CITATION NEEDED]") rather than a plausible-looking reference.
- Never assert ethics approval numbers, trial registration IDs, funding awards, or conflicts of interest that are not supplied.
- Where required information is absent, state it explicitly in the sentence: "Not reported in the source material — requires author input: <item>."
- Preserve the source material's meaning exactly. Do not upgrade, intensify, or generalise claims beyond what the evidence supports.
- Do not convert association into causation, or a surrogate outcome into a patient-important outcome.`;

// ---------------------------------------------------------------------------
// Style Calibration
// ---------------------------------------------------------------------------

export function buildStyleCalibrationBlock(journal: JournalProfile): string {
  return `STYLE CALIBRATION for ${journal.name}:
- Reporting guideline: ${journal.reportingGuideline}
- Reference style: ${journal.referenceStyle}
- Word limits: abstract ≤ ${journal.wordLimits.abstract} words; main text ≤ ${journal.wordLimits.main} words; total ≤ ${journal.wordLimits.total} words.
- Section order: ${journal.sectionOrder.join(" → ")}
- Structured abstract headings: ${journal.abstractHeadings.join(", ")}
- House style: ${journal.styleNotes}
- Every section must satisfy the reporting guideline above. State explicitly which guideline items are addressed and which are not reported in the source material.`;
}

// ---------------------------------------------------------------------------
// Socratic Planning
// ---------------------------------------------------------------------------

export function buildSocraticPlanningPrompt(topic: string, context: string): string {
  return `You are the ARS Planning Guide. Guide the researcher through their paper structure using Socratic questioning, one focused question at a time.

RESEARCH TOPIC: ${topic || "the research topic"}

AVAILABLE CONTEXT:
${context || "(no additional context supplied)"}

TASK — produce a guided planning dialogue in this exact structure:

## 1. Understanding of the Research Question
State in 2-3 sentences what the study is actually asking, what would count as an answer, and where your current understanding of the study differs from the topic as stated.

## 2. Socratic Question Sequence
Ask 8-12 numbered questions, each on its own line, in this order:
  a. What is the gap? (What does the literature not yet answer?)
  b. What is the specific claim this study will make?
  c. What design answers that claim, and why is this design the right one?
  d. What is the population, and who is excluded?
  e. What is the primary outcome, and why is it the primary one?
  f. What are the plausible alternative explanations?
  g. What would falsify the conclusion?
  h. What could go wrong in execution?
  i. What is the practical, clinical, or policy consequence of the answer?
  j. What is the strongest objection a reviewer would raise?
Each question must be answerable in 1-3 sentences and must reveal a decision the researcher must actually make.

## 3. Decision Map
For each of the questions above, state the decision it forces, the options, and which answer the supplied context already supports (or "UNRESOLVED — requires researcher decision").

## 4. Suggested Chapter Plan
A table of chapters/sections, each with: purpose, what it must contain, estimated word count, and the evidence source for it (from the supplied context).

## 5. Unresolved Items
List everything the researcher must supply or decide before drafting can begin. Be specific and do not invent answers.

${ANTI_LEAKAGE_PROTOCOL}`;
}

// ---------------------------------------------------------------------------
// Writing Quality Check
// ---------------------------------------------------------------------------

export function buildWritingQualityCheckPrompt(manuscript: string, journal: JournalProfile): string {
  return `You are the ARS Writing Quality Auditor. Audit the manuscript below against the target journal's standards. Report findings only — do not rewrite the manuscript.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

MANUSCRIPT:
${manuscript}

AUDIT DIMENSIONS (score each 0-100 and give a one-line justification):
1. Guideline compliance — which required reporting items are present, which are missing, which are unverifiable.
2. Structural integrity — section order, heading hierarchy, logical flow between sections.
3. Argument coherence — does each claim have support, is the reasoning chain visible.
4. Citation integrity — are citations present, consistent with the reference list, and not fabricated.
5. Data fidelity — are all numbers traceable to the source material.
6. Word economy — words per section against the journal's limits; identify padding.
7. Readability and hedging — is uncertainty expressed precisely rather than over- or under-claimed.
8. Figure/table readiness — are figures and tables referenced in text and are their captions self-contained.

Then output:
- **Critical blockers** — issues that would cause desk rejection.
- **Major revisions** — issues requiring substantive work.
- **Minor revisions** — polish items.
- **Verdict** — one of: submit-ready, revise-and-resubmit, major-revision, or not-yet-submittable, with a one-sentence justification.

${ANTI_LEAKAGE_PROTOCOL}`;
}

// ---------------------------------------------------------------------------
// Criterion-Bound Review (multi-perspective peer review)
// ---------------------------------------------------------------------------

export interface ReviewerLens {
  id: string;
  name: string;
  focus: string;
  /** The perspective this reviewer is instructed to adopt. */
  instruction: string;
}

export const REVIEWER_LENSES: ReviewerLens[] = [
  {
    id: "journal-fit",
    name: "Journal-Fit Reviewer",
    focus: "Scope, impact and readiness for this specific journal",
    instruction:
      "Assess only: does this manuscript fit this journal's scope, audience, and stated priorities; is the clinical or public-health impact sufficient; is it ready at this stage. Do not critique internal validity here.",
  },
  {
    id: "methods",
    name: "Methods & Validity Reviewer",
    focus: "Design, bias, confounding, and reproducibility",
    instruction:
      "Assess only: study design adequacy, selection bias, confounding control, measurement validity, and reproducibility. For each concern, name the specific analysis step that would resolve it.",
  },
  {
    id: "statistics",
    name: "Statistical Reviewer",
    focus: "Analysis plan, model specification, and inference",
    instruction:
      "Assess only: sample-size justification, model specification and assumption checks, multiplicity, effect-size reporting with confidence intervals, missing-data handling, and sensitivity analyses. Do not request a statistic that cannot be computed from the design.",
  },
  {
    id: "clinical-translation",
    name: "Clinical Translation Reviewer",
    focus: "Interpretation, generalisability, and downstream utility",
    instruction:
      "Assess only: whether the conclusions follow from the results, whether generalisability claims are warranted, and whether the findings are actionable for the stated audience.",
  },
  {
    id: "ethics-equity",
    name: "Ethics & Equity Reviewer",
    focus: "Ethical conduct, reporting standards, and equity",
    instruction:
      "Assess only: ethics approval, consent, registration, data availability, competing interests, funding disclosure, and whether the equity and implementation implications are addressed for the stated population.",
  },
  {
    id: "presentation",
    name: "Presentation & Reporting Reviewer",
    focus: "Reporting-guideline conformance and readability",
    instruction:
      "Assess only: adherence to the reporting guideline checklist, figure/table adequacy, abstract-to-body consistency, terminology, and readability for a non-specialist reader in the field.",
  },
  {
    id: "devils-advocate",
    name: "Devil's Advocate",
    focus: "Adversarial stress test of the central claim",
    instruction:
      "Adopt a hostile-but-fair stance. Try hard to refute the central claim. Identify the single strongest alternative explanation, the most likely fatal flaw, the finding most likely to be a spurious artefact, and the claim that would most embarrass the authors if wrong. Then state what evidence would be needed to defeat your objections. Do NOT soften this critique.",
  },
];

export function buildReviewerPrompt(
  manuscript: string,
  journal: JournalProfile,
  lenses: ReviewerLens[],
  previousReview?: string
): string {
  const lensBlocks = lenses
    .map(
      (l, i) => `### Perspective ${i + 1}: ${l.name}
Focus: ${l.focus}
Instruction: ${l.instruction}`
    )
    .join("\n\n");

  return `You are the ARS Peer Review Panel. Produce a rigorous, evidence-anchored peer-review report on the manuscript below.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${lensBlocks}

CRITERION-BOUND REVIEW PROTOCOL (mandatory):
- Every judgement MUST be bound to a named criterion from the lens's focus. Write the criterion in italics at the start of each point, e.g. "*Criterion: randomisation concealment* — The manuscript does not describe allocation concealment, so selection bias cannot be excluded."
- Every point MUST be anchored in the actual manuscript text. Quote or name the specific section, table, figure, or sentence.
- Distinguish severity explicitly: CRITICAL (invalidates a conclusion), MAJOR (weakens a conclusion), MINOR (does not affect conclusions).
- Where you are uncertain, say so and state what would resolve the uncertainty. Do not manufacture concerns to appear thorough.
- Do not invent facts about the study. If the source material does not report something, say "not reported".

${previousReview ? `PREVIOUS REVIEW ON THIS MANUSCRIPT (preserve the substance of its criticism; do not soften previously raised issues):\n${previousReview}\n` : ""}
OUTPUT STRUCTURE:

# Peer Review Report — ${journal.name}

## Manuscript Summary
A paragraph describing what the study does, its design, its population, its primary outcome, and its main finding, in neutral terms.

## Overall Assessment
A 3-5 sentence judgement: the contribution, its adequacy, and a clear editorial recommendation (accept / minor revision / major revision / reject) with justification.

## Perspective-by-Perspective Review
For each of the ${lenses.length} perspectives above, a subsection with its criterion-bound, evidence-anchored findings, each tagged CRITICAL / MAJOR / MINOR.

## Critical Issues
A numbered list of the issues that must be resolved for the conclusions to stand.

## Strengths
Specific, evidence-anchored strengths worth preserving through revision.

## Required Revisions
A numbered, itemised, actionable list. Each item states: the change required, where it belongs, and what evidence would close it.

## Author Queries
A numbered list of specific questions the authors must answer.

## Attack Intensity Note
State plainly which objections you consider hardest to answer and why. This section must not be softened.

MANUSCRIPT:
${manuscript}

${ANTI_LEAKAGE_PROTOCOL}`;
}

// ---------------------------------------------------------------------------
// Concession Threshold Protocol + Revision Coaching
// ---------------------------------------------------------------------------

export function buildConcessionThresholdBlock(): string {
  return `CONCESSION THRESHOLD PROTOCOL (mandatory):
For each reviewer point you accept, classify it before writing the response:
- ACCEPT — the point is correct and changes the manuscript. State the specific change made and where.
- PARTIAL CONCESSE — the point is partly correct. State what you accept, what you dispute, and the evidence for the dispute. Conceding partially is not the same as conceding fully; do not accept a point you believe is wrong merely to appear cooperative.
- DISPUTE — the point is incorrect or based on a misreading. State the specific passage that contradicts the point, quote it, and explain why the concern does not apply.
- UNRESOLVED — the point is valid but cannot be addressed with the available data. State exactly what data, analysis, or clarification would be needed and flag it in the manuscript as a limitation.
- CONCEDE WITH RESERVATION — the point is correct but the remedy the reviewer proposes would overreach. Accept the underlying concern and implement a different, adequate remedy, explaining the difference.
Never respond to a valid CRITICAL point with a dispute unless you can quote the manuscript text that refutes it. Never drop a point without a classification.`;
}

export function buildRevisionCoachPrompt(
  manuscript: string,
  reviewReport: string,
  journal: JournalProfile
): string {
  return `You are the ARS Revision Coach. Convert a peer-review report into an actionable revision roadmap and a response-letter skeleton. You do NOT rewrite the manuscript.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${buildConcessionThresholdBlock()}

MANUSCRIPT UNDER REVISION:
${manuscript}

PEER REVIEW REPORT:
${reviewReport}

OUTPUT STRUCTURE:

# Revision Roadmap

## 1. Triage Table
A table with one row per reviewer point: | # | Reviewer point (short) | Severity | Classification (Accept / Partial Concede / Dispute / Unresolved / Concede with Reservation) | Required action | Manuscript location | Effort (S/M/L) | Priority |

## 2. Revision Roadmap by Manuscript Section
For each section of the manuscript that needs work, list the specific edits in execution order. Be concrete: what to add, what to cut, what to reword, what new analysis is needed.

## 3. New Analyses and Data Requests
A separate list of anything that cannot be fixed by rewriting: additional analyses, new data, clarifications from the study team, or supplementary material.

## 4. Response Letter Skeleton
A ready-to-fill point-by-point response letter. For each reviewer point, provide the opening line, a placeholder for the change made, and the location reference:
> **Reviewer 1, Comment 3:** <reviewer comment quoted>
>
> **Response:** We thank the reviewer for this important point. <specific response>
>
> **Change made:** <specific change, with section/page/line reference>

## 5. Pre-Submission Checklist
A checklist of everything that must be true before resubmission, covering reporting-guideline conformance, reference integrity, figure/table completeness, declarations, and journal-specific requirements.

${ANTI_LEAKAGE_PROTOCOL}`;
}

export function buildRevisionPrompt(
  manuscript: string,
  reviewReport: string,
  journal: JournalProfile,
  concessionBlock: string
): string {
  return `You are the ARS Revision Engine. Produce the revised manuscript and the point-by-point response to reviewers.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${concessionBlock}

ATTACK INTENSITY PRESERVATION (mandatory):
- The revised manuscript must NOT quietly delete or soften a CRITICAL or MAJOR concern raised by the reviewer. If a concern was not addressed, the manuscript must say so.
- A revision that reads better but is less rigorous is a failed revision. Preserve the reviewer's objections in the response letter even where the manuscript reads smoothly.

MANUSCRIPT UNDER REVISION:
${manuscript}

PEER REVIEW REPORT:
${reviewReport}

OUTPUT STRUCTURE:

# Revised Manuscript
${journal.sectionOrder.map((s) => `## ${s}`).join("\n\n")}

# Response to Reviewers
For each reviewer point, in order, output:
> **Comment N:** <verbatim reviewer comment>
>
> **Response:** <your response>
>
> **Change made:** <what changed, and where>

${ANTI_LEAKAGE_PROTOCOL}`;
}

// ---------------------------------------------------------------------------
// Academic Paper drafting
// ---------------------------------------------------------------------------

export function buildAcademicPaperPrompt(
  journal: JournalProfile,
  input: string,
  context: string,
  mode: ArsMode
): string {
  if (mode === "outline-only") {
    return `You are the ARS Section Architect. Produce a detailed, evidence-mapped paper outline — not prose.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${ANTI_LEAKAGE_PROTOCOL}

SOURCE MATERIAL:
${input}

PIPELINE CONTEXT:
${context || "(none)"}

OUTPUT:
# Paper Outline — ${journal.name}

## Section Plan
For each section in the journal's required order, a block containing:
- Purpose (one sentence)
- What it must contain (bullet list of required content)
- Evidence source (which part of the source material supports it, or "NOT AVAILABLE — requires author input")
- Target word count (within journal limits)
- Key claims this section must make
- Figures/tables to place here

## Argument Map
The claim → evidence → inference chain for the whole paper, in order.

## Evidence Map
A table: | Section | Claim | Supporting source | Evidence strength | Gaps |

## Missing Inputs
Everything the researcher must supply before the outline can be turned into prose.

ARGUMENT MAP / OUTLINE ONLY — do not write manuscript prose.`;
  }

  if (mode === "abstract-only") {
    return `You are the ARS Abstract Specialist. Write a structured abstract for the target journal.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}
- Abstract headings required: ${journal.abstractHeadings.join(", ")}
- Abstract word limit: ${journal.wordLimits.abstract} words (strict).

${ANTI_LEAKAGE_PROTOCOL}

SOURCE MATERIAL:
${input}

PIPELINE CONTEXT:
${context || "(none)"}

Write the abstract under the exact headings above. Include a "Keywords" line (5-7 keywords) after the abstract. Report only numbers present in the source material.`;
  }

  if (mode === "plan") {
    const topicMatch = context.match(/RESEARCH TOPIC:\s*(.+)/);
    const topic = topicMatch ? topicMatch[1].trim() : "";
    return buildSocraticPlanningPrompt(topic, `${input}\n\n${context}`);
  }

  if (mode === "revision" || mode === "revision-coach") {
    // Revision modes need a review report to act on; handled by the
    // dedicated revise stage in the pipeline.
    return buildAcademicPaperPrompt(journal, input, context, "full");
  }

  if (mode === "lit-review") {
    return `You are the ARS Literature Review Specialist. Write a comprehensive narrative literature review from the supplied evidence.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${ANTI_LEAKAGE_PROTOCOL}

SOURCE MATERIAL:
${input}

PIPELINE CONTEXT:
${context || "(none)"}

Structure the review with these subheadings:
## Scope and Search Method
## Thematic Synthesis
## Methodological Characteristics of the Evidence Base
## Convergent and Divergent Findings
## Evidence Gaps
## Implications for Practice and Research

Write 6-10 paragraphs total. Cite inline using author-year. Do not include a reference list.`;
  }

  return `You are the ARS Academic Paper engine. Draft a complete, submission-ready manuscript for the target journal.

TARGET JOURNAL: ${journal.name}
${buildStyleCalibrationBlock(journal)}

${ANTI_LEAKAGE_PROTOCOL}

SOURCE MATERIAL (this is the only factual basis for the manuscript):
${input}

PIPELINE CONTEXT (synthesis, literature review, aim, methodology, protocol, impact from the research pipeline):
${context || "(none)"}

SECTION ORDER (use exactly):
${journal.sectionOrder.map((s) => `## ${s}`).join("\n\n")}

WRITING REQUIREMENTS:
- Write full, connected prose — not bullet-point summaries, not placeholders.
- Abstract must use the journal's structured headings and stay within ${journal.wordLimits.abstract} words.
- Main text must stay within ${journal.wordLimits.main} words; the full manuscript within ${journal.wordLimits.total}.
- Every factual claim must be traceable to the source material or the pipeline context. Where a result is absent, write a clear "Not reported in the source material — requires author input: <item>" statement rather than inventing content.
- Do not fabricate references. If a reference list is required and the source material contains none, emit the marker "[REFERENCES TO BE SUPPLIED BY AUTHOR]" under the References heading.
- Use the target journal's reference style: ${journal.referenceStyle}.
- In the Discussion, explicitly address limitations, generalisability, and the clinical or policy implication.
- Where a figure or table is required, emit a callout in the form: "[FIGURE 1 ABOUT HERE: <caption describing exactly what the figure must show>]".

OUTPUT THE MANUSCRIPT ONLY — no preamble, no commentary.`;
}

// ---------------------------------------------------------------------------
// Pipeline context assembly
// ---------------------------------------------------------------------------

export interface PipelineContextInput {
  searchQuery?: string;
  synthesisTable?: { reference: string; keyFindings: string; synopsis: string; studyDetails: string; researchGaps: string }[];
  literatureReview?: string;
  researchQuestions?: { question: string }[];
  aimObjectives?: { aim?: string; primaryObjective?: string; secondaryObjectives?: string[] };
  methodology?: Record<string, unknown>;
  protocol?: Record<string, unknown>;
  impactAssessment?: string;
  references?: Array<{
    authors?: string;
    year?: number | string;
    title: string;
    journal?: string;
    doi?: string;
    database?: string;
  }>;
}

export function buildPipelineContext(ctx: PipelineContextInput): string {
  const parts: string[] = [];
  if (ctx.searchQuery) parts.push(`RESEARCH TOPIC: ${ctx.searchQuery}`);
  if (ctx.researchQuestions?.length) {
    parts.push(
      `RESEARCH QUESTIONS:\n${ctx.researchQuestions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}`
    );
  }
  if (ctx.aimObjectives) {
    const a = ctx.aimObjectives;
    const lines: string[] = [];
    if (a.aim) lines.push(`Aim: ${a.aim}`);
    if (a.primaryObjective) lines.push(`Primary objective: ${a.primaryObjective}`);
    if (a.secondaryObjectives?.length) {
      lines.push(`Secondary objectives:\n${a.secondaryObjectives.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
    }
    if (lines.length) parts.push(`AIM & OBJECTIVES:\n${lines.join("\n")}`);
  }
  if (ctx.methodology && Object.keys(ctx.methodology).length) {
    parts.push(
      `METHODOLOGY:\n${Object.entries(ctx.methodology)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n")}`
    );
  }
  if (ctx.protocol && Object.keys(ctx.protocol).length) {
    parts.push(
      `PROTOCOL:\n${Object.entries(ctx.protocol)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n")}`
    );
  }
  if (ctx.synthesisTable?.length) {
    parts.push(
      `EVIDENCE SYNTHESIS TABLE:\n${ctx.synthesisTable
        .map(
          (r, i) =>
            `${i + 1}. ${r.reference}\n   Key findings: ${r.keyFindings}\n   Synopsis: ${r.synopsis}\n   Study: ${r.studyDetails}\n   Research gaps: ${r.researchGaps}`
        )
        .join("\n")}`
    );
  }
  if (ctx.literatureReview) {
    parts.push(`LITERATURE REVIEW:\n${ctx.literatureReview}`);
  }
  if (ctx.references?.length) {
    parts.push(
      `SEARCHED REFERENCES (from ${ctx.searchQuery || "research topic"}, real database results — cite these inline where supported):\n${ctx.references
        .map(
          (r, i) =>
            `${i + 1}. ${r.authors ?? "Unknown authors"} (${r.year ?? "n.d."}). ${r.title}. ${
              r.journal ?? "journal"
            }${r.doi ? ` doi:${r.doi}` : ""} [database: ${r.database ?? "unknown"}]`
        )
        .join("\n")}`
    );
  }
  if (ctx.impactAssessment) {
    parts.push(`IMPACT ASSESSMENT:\n${ctx.impactAssessment}`);
  }
  return parts.join("\n\n");
}
