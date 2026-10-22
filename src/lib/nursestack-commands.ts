/**
 * NurseStack command layer.
 *
 * A TypeScript port of the parts of the NurseStack CLI/skills platform that
 * apply to this app:
 *   https://github.com/Clinical-Quality-Artifical-Intelligence/nursestack
 *   (MIT © 2025 Clinical Quality Artificial Intelligence)
 *
 * Ported commands:
 *   /plan-pico             → buildPicoPrompt()
 *   /plan-literature-review→ buildLiteratureReviewPlan()
 *   /plan-dissertation     → buildDissertationPlan()
 *   /review-casp           → (see src/lib/critical-appraisal.ts)
 *   /review-evidence       → buildEvidenceReviewPrompt()
 */

export interface NursestackCommand {
  id: string;
  slash: string;
  title: string;
  role: string;
  description: string;
  source: string;
}

export const NURSESTACK_COMMANDS: NursestackCommand[] = [
  {
    id: "plan_pico",
    slash: "/plan-pico",
    title: "Plan PICO",
    role: "Clinical Research Methodologist",
    description:
      "Turn a clinical question into a PICO(S) framework: population, intervention, comparison, outcome and study design.",
    source: "nursestack/commands/plan-pico.md",
  },
  {
    id: "plan_literature_review",
    slash: "/plan-literature-review",
    title: "Plan Literature Review",
    role: "Evidence Synthesis Specialist",
    description: "Build a reproducible search strategy and review protocol from a PICO question.",
    source: "nursestack/commands/plan-literature-review.md",
  },
  {
    id: "plan_dissertation",
    slash: "/plan-dissertation",
    title: "Plan Dissertation",
    role: "Dissertation Supervisor",
    description:
      "Structure a nursing dissertation from proposal to submission, with chapter word targets, methodology fit and ethical requirements.",
    source: "nursestack/commands/plan-dissertation.md",
  },
  {
    id: "review_casp",
    slash: "/review-casp",
    title: "Review with CASP",
    role: "Research Methods Specialist & EBP Expert",
    description:
      "Identify the study design, apply the matching CASP checklist and produce a full appraisal report.",
    source: "nursestack/commands/review-casp.md",
  },
  {
    id: "review_evidence",
    slash: "/review-evidence",
    title: "Review Evidence",
    role: "Evidence-Based Practice Expert",
    description: "Critically review a body of retrieved literature and judge its fitness for a recommendation.",
    source: "nursestack/commands/review-evidence.md",
  },
];

/** How a clinical question type maps onto an appropriate methodology. */
export const NURSESTACK_METHODOLOGY_FIT: Array<{
  questionType: string;
  pattern: RegExp;
  methodology: string;
  caspChecklistId: string;
  reportingGuideline: string;
  ethicsNote: string;
}> = [
  {
    questionType: "Does an intervention improve an outcome?",
    pattern: /(effect|impact|improve|reduce|increase|prevent|does .{0,40}(work|help|reduce|increase))/i,
    methodology: "Systematic review (of RCTs) or randomised controlled trial",
    caspChecklistId: "systematic_review",
    reportingGuideline: "PRISMA 2020",
    ethicsNote: "Ethics approval is required if the review collects new participant data.",
  },
  {
    questionType: "What are the experiences of patients, families or staff?",
    pattern: /(experience|perception|meaning|feelings|lived|how .{0,30}(feel|perceive)|qualitative)/i,
    methodology: "Qualitative (thematic analysis, phenomenology or grounded theory)",
    caspChecklistId: "qualitative",
    reportingGuideline: "COREQ / SRQR",
    ethicsNote: "NHS REC approval is required for interviews or focus groups with NHS participants.",
  },
  {
    questionType: "How common is something, and what predicts it?",
    pattern: /(prevalen\w+|incidence|how common|predict\w*|risk factor|association)/i,
    methodology: "Quantitative cross-sectional survey or cohort study",
    caspChecklistId: "cohort",
    reportingGuideline: "STROBE",
    ethicsNote: "Research ethics approval is required unless the data are fully anonymised secondary data.",
  },
  {
    questionType: "Does a service achieve its aim?",
    pattern: /(service evaluation|does (?:the|this) service|service achiev|implementation|audit)/i,
    methodology: "Service evaluation (not research — usually no REC approval, but local governance is required)",
    caspChecklistId: "cross_sectional",
    reportingGuideline: "SQUIRE / GEE",
    ethicsNote: "Service evaluation is not research: confirm with the local R&D office and trust governance.",
  },
  {
    questionType: "What is known about a topic?",
    pattern: /(what is known|overview|scoping|explor|mapping|state of the art|evidence map)/i,
    methodology: "Scoping review",
    caspChecklistId: "systematic_review",
    reportingGuideline: "PRISMA-ScR",
    ethicsNote: "Usually no ethics approval is required when only published literature is used.",
  },
];

export interface MethodologyRecommendation {
  questionType: string;
  methodology: string;
  caspChecklistId: string;
  reportingGuideline: string;
  ethicsNote: string;
}

/** Suggests the methodology that fits the research question. */
export function recommendMethodology(topic: string): MethodologyRecommendation {
  for (const fit of NURSESTACK_METHODOLOGY_FIT) {
    if (fit.pattern.test(topic)) {
      return {
        questionType: fit.questionType,
        methodology: fit.methodology,
        caspChecklistId: fit.caspChecklistId,
        reportingGuideline: fit.reportingGuideline,
        ethicsNote: fit.ethicsNote,
      };
    }
  }
  return {
    questionType: "Not classified — confirm the question type with your supervisor",
    methodology: "Systematic review of the quantitative and qualitative literature (mixed-methods review)",
    caspChecklistId: "systematic_review",
    reportingGuideline: "PRISMA 2020",
    ethicsNote: "Confirm the ethics requirements of your institution before recruitment or data collection.",
  };
}

export interface PicoFramework {
  population: string;
  intervention: string;
  comparison: string;
  outcome: string;
  studyDesign: string;
}

/** Builds a PICO(S) skeleton from the research topic. */
export function buildPicoSkeleton(topic: string, design?: string): PicoFramework {
  const trimmed = topic.trim();
  return {
    population: `Population: [who or what is affected — derive from "${trimmed || "your topic"}"]`,
    intervention: `Intervention / exposure: [the intervention, therapy or factor of interest]`,
    comparison: `Comparison: [usual care, alternative intervention or control group]`,
    outcome: `Outcome(s): [measurable primary outcome plus secondary outcomes]`,
    studyDesign: design ? `Study design: ${design}` : "Study design: [randomised trial / cohort / qualitative / review]",
  };
}

export function buildPicoPrompt(topic: string, level: string): string {
  return `You are acting as a Clinical Research Methodologist helping a ${level} nursing student develop a PICO(S) question.

TOPIC: ${topic}

Return:
1. A single, answerable clinical question in PICO(S) format.
2. The four elements spelled out: Population, Intervention, Comparison, Outcome, Study design.
3. Two alternative formulations (a narrower and a broader version).
4. A note on whether the question is answerable by a systematic review, a primary study or both.
5. The reporting guideline that will apply (PRISMA, CONSORT, STROBE, COREQ).

Keep it specific to nursing practice and answer with plain text.`;
}

export function buildLiteratureReviewPlan(topic: string, databases: string[], yearFrom?: number, yearTo?: number): string {
  const years = yearFrom || yearTo ? ` (${yearFrom ?? ""}${yearFrom && yearTo ? "-" : ""}${yearTo ?? ""})` : "";
  return `# Literature Review Plan

Topic: ${topic}
Databases: ${databases.join(", ")}
Date range: ${years || "not restricted"}

## Search strategy (reproducible)
- For each database write the exact search string, the search date and the number of records returned.
- Use a validated filter syntax for each database (PubMed/Europe PMC: MeSH + free text; Crossref/Scopus: field tags).
- Record the PRISMA flow (identification → screening → eligibility → included) with numbers at every stage.

## Screening
- Two reviewers independently screen titles/abstracts, then full texts; resolve conflicts by discussion.
- Record the reason for exclusion at full-text stage.

## Appraisal
- Appraise every included study with the CASP checklist that matches its design (see the Critical Appraisal tab).
- Record the CASP judgement for each item, the evidence quoted from the paper and the overall validity judgement.
- Only synthesise studies that are appraised as methodologically sound, or state the caveat explicitly.

## Synthesis
- Thematic synthesis for qualitative studies, meta-analysis for homogeneous quantitative studies, narrative synthesis otherwise.
- Report the effect sizes with confidence intervals, and rate the certainty of the body of evidence (GRADE).`;
}

export interface DissertationChapterPlan {
  number: number;
  title: string;
  percentage: number;
  wordTarget: number;
  sections: string[];
}

/** The NurseStack dissertation chapter structure, with word targets. */
export function buildDissertationPlan(
  topic: string,
  level: "bachelor" | "master" | "phd" | string,
  targetWordCount: number,
  methodology: string
): DissertationChapterPlan[] {
  const plan: Array<{ title: string; percentage: number; sections: string[] }> = [
    {
      title: "Introduction",
      percentage: 10,
      sections: [
        "Background and clinical context",
        "Rationale — why this topic matters now",
        "Research question / aim",
        "Objectives",
        "Structure of the dissertation",
      ],
    },
    {
      title: "Literature Review",
      percentage: 30,
      sections: [
        "Search strategy and appraisal method (CASP)",
        "Overview of the included literature",
        "Theme 1: clinical / empirical evidence",
        "Theme 2: methodological / contextual evidence",
        "Theme 3: gaps or contradictions",
        "Synthesis and rationale for the current study",
      ],
    },
    {
      title: "Methodology",
      percentage: 20,
      sections: [
        `Research design and justification (${methodology})`,
        "Setting and sampling strategy",
        "Data collection method and tool",
        "Data analysis approach",
        "Ethical considerations and governance",
        "Rigour / trustworthiness and reflexivity",
      ],
    },
    {
      title: "Findings",
      percentage: 20,
      sections: ["Overview of results", "Finding / theme 1", "Finding / theme 2", "Finding / theme 3", "Summary of findings"],
    },
    {
      title: "Discussion",
      percentage: 15,
      sections: [
        "How the findings answer the research question",
        "Comparison with the appraised literature",
        "Implications for nursing practice",
        "Implications for policy (NMC, NICE, NHS England)",
        "Limitations",
        "Recommendations for practice and future research",
      ],
    },
    {
      title: "Conclusion",
      percentage: 5,
      sections: ["Summary of key findings", "Contribution to nursing knowledge", "Final clinical / practice statement"],
    },
  ];

  if (level === "phd") {
    plan.splice(1, 0, {
      title: "Systematic Review",
      percentage: 15,
      sections: ["Review question (PICO)", "Search strategy (PRISMA-S)", "Critical appraisal (CASP)", "Synthesis and meta-analysis", "Review findings"],
    });
    plan.splice(5, 0, {
      title: "Dissemination and Impact",
      percentage: 8,
      sections: ["Dissemination plan", "Impact on practice and policy", "PhD contribution to the field"],
    });
  }

  const total = plan.reduce((a, c) => a + c.percentage, 0);
  return plan.map((chapter, index) => ({
    number: index + 1,
    title: chapter.title,
    percentage: chapter.percentage,
    wordTarget: Math.round((chapter.percentage / total) * targetWordCount),
    sections: chapter.sections,
  }));
}

export function buildDissertationPrompt(
  topic: string,
  level: string,
  methodology: string,
  chapters: DissertationChapterPlan[]
): string {
  const outline = chapters
    .map((c) => `CHAPTER ${c.number}: ${c.title} (~${c.wordTarget} words)\n  ${c.sections.map((s) => `- ${s}`).join("\n  ")}`)
    .join("\n\n");

  return `You are acting as a Dissertation Supervisor and Academic Nursing Research Expert guiding a ${level} dissertation.

TOPIC: ${topic}
METHODOLOGY: ${methodology}

Required structure:
${outline}

Write the dissertation so that every claim in the literature review and discussion is tied to a cited source, the appraisal of the included studies is reported explicitly (CASP judgements and evidence), and the limitations are stated honestly.`;
}

export function buildEvidenceReviewPrompt(topic: string, paperSummaries: string[]): string {
  return `You are acting as an Evidence-Based Practice Expert reviewing a body of retrieved literature for "${topic}".

RETRIEVED LITERATURE:
${paperSummaries.map((p, i) => `${i + 1}. ${p}`).join("\n")}

For each study report:
- The design and its CASP checklist
- The key finding with effect size and confidence interval where reported
- The main methodological limitation
- Whether it is fit to support a practice recommendation (YES / WITH CAVEATS / NO)

Then produce a synthesis: where the evidence agrees, where it conflicts, and what is still unknown.`;
}
