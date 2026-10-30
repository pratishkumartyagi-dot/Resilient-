/**
 * JBI Critical Appraisal Tools — Joanna Briggs Institute.
 *
 * Transcribed from the JBI critical appraisal checklists published at
 * https://jbi.global/critical-appraisal-tools (accessed 2026-10-29).
 *
 * Unlike the CASP pipeline (yes / no / can't tell), JBI checklists are scored
 * yes / no / not applicable / not clear, and an overall "include / exclude /
 * seek further info" recommendation is derived from the validity items.
 *
 * This module is deliberately SEPARATE from the CASP appraisal pipeline
 * (src/lib/critical-appraisal.ts / casp-checklists.ts). It is wired into its
 * own screen so JBI and CASP analyses never overlap.
 *
 * JBI content is reproduced under the JBI terms of use for the critical
 * appraisal checklists.
 */

export type JbiJudgment = "yes" | "no" | "not_applicable" | "not_clear";

export interface JbiItem {
  /** Stable id, e.g. "section-a.1" */
  id: string;
  /** The JBI question, verbatim */
  text: string;
  /** Whether this item is a validity (critical) item used in the overall score. */
  validity?: boolean;
}

export interface JbiSection {
  id: string;
  title: string;
  items: JbiItem[];
}

export interface JbiChecklist {
  id: string;
  label: string;
  /** Study design this checklist is designed for */
  design: string;
  sourceUrl: string;
  guidance: string;
  sections: JbiSection[];
}

export interface AppraisalItem {
  id: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  judgment: JbiJudgment;
  evidence?: string;
  rationale: string;
  source: "rules" | "ai";
}

export interface AppraisalSection {
  id: string;
  title: string;
  items: AppraisalItem[];
  yes: number;
  no: number;
  notApplicable: number;
  notClear: number;
}

export interface AppraisalSummary {
  total: number;
  yes: number;
  no: number;
  notApplicable: number;
  notClear: number;
  qualityScore: number;
  qualityScoreLabel: string;
  validity: string;
  results: string;
  applicability: string;
  strengths: string[];
  limitations: string[];
  inclusionRecommendation: string;
  recommendationReason: string;
}

export interface AppraisalResult {
  checklistId: string;
  checklistLabel: string;
  checklistSourceUrl: string;
  guidance: string;
  sections: AppraisalSection[];
  summary: AppraisalSummary;
  reportMarkdown: string;
  metadata: AppraisalMetadata;
  appraisedAt: string;
  usedAi: boolean;
}

export interface AppraisalMetadata {
  title: string;
  authors: string;
  year: string;
  journal: string;
  reviewer: string;
  sourceFile: string;
}

/* -------------------------------------------------------------------------- */
/* JBI checklists                                                             */
/* -------------------------------------------------------------------------- */

export const JBI_CHECKLISTS: JbiChecklist[] = [
  {
    id: "rct",
    label: "Randomized Controlled Trial",
    design: "Randomized Controlled Trial",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI RCT checklist assesses randomization, allocation concealment, blinding, group comparability at baseline, identical treatment apart from the intervention, follow-up completeness, intent-to-treat analysis, precise outcome measurement, appropriate statistical analysis, and appropriate trial design.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Was true randomization used for assignment of participants to treatment groups?", validity: true },
          { id: "a2", text: "Was allocation to treatment groups concealed?", validity: true },
          { id: "a3", text: "Were treatment groups similar at the baseline?", validity: true },
          { id: "a4", text: "Were participants blind to treatment assignment?", validity: true },
          { id: "a5", text: "Were those delivering treatment blind to treatment assignment?", validity: true },
          { id: "a6", text: "Were outcomes assessors blind to treatment assignment?", validity: true },
          { id: "a7", text: "Were treatment groups treated identically other than the intervention of interest?", validity: true },
        ],
      },
      {
        id: "section-b",
        title: "Results / analysis",
        items: [
          { id: "b1", text: "Was follow-up complete and if not, were differences between groups in terms of their follow-up adequately described and analyzed?", validity: true },
          { id: "b2", text: "Were participants analyzed in the groups to which they were randomized (intent-to-treat)?", validity: true },
          { id: "b3", text: "Were outcomes measured in the same way for treatment groups?", validity: true },
          { id: "b4", text: "Were outcomes measured in a reliable way?", validity: true },
          { id: "b5", text: "Was appropriate statistical analysis used?", validity: true },
          { id: "b6", text: "Was the trial design appropriate, and any deviations from the standard RCT design (individual randomization, parallel groups) accounted for in the conduct and analysis of the trial?", validity: true },
        ],
      },
    ],
  },
  {
    id: "quasi_experimental",
    label: "Quasi-Experimental Studies",
    design: "Quasi-Experimental Study",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI quasi-experimental checklist assesses cause-and-effect inference in studies without randomization: comparison groups, baseline comparability, blinding, treatment fidelity, follow-up completeness, outcome measurement reliability, and appropriate statistical analysis.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Is it clear in the study what is the 'cause' and what is the 'effect'?", validity: true },
          { id: "a2", text: "Were participants included in any comparison groups similar?", validity: true },
          { id: "a3", text: "Were participants included in any comparison groups similar in terms of key characteristics?", validity: true },
          { id: "a4", text: "Were participants included in any comparison groups similar in terms of all key confounders?", validity: true },
          { id: "a5", text: "Was a control group used?", validity: true },
          { id: "a6", text: "Were there multiple measurements of the outcome both pre and post the intervention/exposure?", validity: true },
          { id: "a7", text: "Was follow-up complete and if not, were differences between groups in terms of their follow-up adequately described and analyzed?", validity: true },
          { id: "a8", text: "Were outcomes of participants in any comparison groups measured in the same way?", validity: true },
          { id: "a9", text: "Were outcomes measured in a reliable way?", validity: true },
          { id: "a10", text: "Was appropriate statistical analysis used?", validity: true },
        ],
      },
    ],
  },
  {
    id: "cohort",
    label: "Cohort Studies",
    design: "Cohort Study",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI cohort checklist assesses selection of exposure and comparison groups, comparability at baseline, exposure measurement, outcome measurement, blinding, follow-up completeness, follow-up duration, and appropriate statistical analysis.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Were the two groups similar and recruited from the same population?", validity: true },
          { id: "a2", text: "Were the exposures measured similarly to assign people to both exposed and unexposed groups?", validity: true },
          { id: "a3", text: "Was the exposure measured in a valid and reliable way?", validity: true },
          { id: "a4", text: "Was the confounding factors identified?", validity: true },
          { id: "a5", text: "Were strategies to deal with confounding factors stated?", validity: true },
          { id: "a6", text: "Were the groups/participants free of the outcome at the start of the study (or at the moment of exposure)?", validity: true },
          { id: "a7", text: "Were the outcomes measured in a valid and reliable way?", validity: true },
          { id: "a8", text: "Was the follow-up time reported and sufficient to be long enough for outcomes to occur?", validity: true },
          { id: "a9", text: "Was follow-up complete, and if not, were the reasons to loss to follow-up described and explored?", validity: true },
          { id: "a10", text: "Were appropriate statistical analytical methods used?", validity: true },
          { id: "a11", text: "Were the outcome measures and corresponding exposure measures measured in the same way in both groups?", validity: true },
        ],
      },
    ],
  },
  {
    id: "case_control",
    label: "Case-Control Studies",
    design: "Case-Control Study",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI case-control checklist assesses case and control selection comparability, matching, exposure measurement, blinding, identification of confounding, and statistical analysis.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Were the cases and controls taken from comparable populations?", validity: true },
          { id: "a2", text: "Were the cases and controls matched appropriately?", validity: true },
          { id: "a3", text: "Was exposure measured in the same way for cases and controls?", validity: true },
          { id: "a4", text: "Was exposure ascertained in a valid and reliable way?", validity: true },
          { id: "a5", text: "Was exposure ascertained in the same way for cases and controls?", validity: true },
          { id: "a6", text: "Were potential confounders identified and strategies to deal with them stated?", validity: true },
          { id: "a7", text: "Was the statistical analysis appropriate?", validity: true },
          { id: "a8", text: "Was the response rate adequate, and if not, was the low response rate managed appropriately?", validity: true },
        ],
      },
    ],
  },
  {
    id: "cross_sectional",
    label: "Analytical Cross-Sectional Studies",
    design: "Cross-Sectional Study",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI analytical cross-sectional checklist assesses inclusion criteria, subject and setting description, exposure measurement, objective criteria, confounding factors, strategies to deal with confounding, outcome measurement, and statistical analysis.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Were the criteria for inclusion in the sample clearly defined?", validity: true },
          { id: "a2", text: "Were the study subjects and the setting described in detail?", validity: true },
          { id: "a3", text: "Was the exposure measured in a valid and reliable way?", validity: true },
          { id: "a4", text: "Were objective, standard criteria used for measurement of the condition?", validity: true },
          { id: "a5", text: "Were confounding factors identified?", validity: true },
          { id: "a6", text: "Were strategies to deal with confounding factors stated?", validity: true },
          { id: "a7", text: "Were the outcomes measured in a valid and reliable way?", validity: true },
          { id: "a8", text: "Was appropriate statistical analysis used?", validity: true },
        ],
      },
    ],
  },
  {
    id: "qualitative",
    label: "Qualitative Research",
    design: "Qualitative Research",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI qualitative checklist assesses congruence between philosophical perspective, methodology, methods, results, interpretation, and researcher voice; ethical approval; and representation of participant voices.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Is there congruence between the stated philosophical perspective and the research methodology?", validity: true },
          { id: "a2", text: "Is there congruence between the research methodology and the research question or objectives?", validity: true },
          { id: "a3", text: "Is there congruence between the research methodology and the methods used to collect data?", validity: true },
          { id: "a4", text: "Is there congruence between the research methodology and the representation and analysis of data?", validity: true },
          { id: "a5", text: "Is there congruence between the research methodology and the interpretation of results?", validity: true },
          { id: "a6", text: "Is there a statement locating the researcher culturally or theoretically?", validity: true },
          { id: "a7", text: "Is the influence of the researcher on the research, and vice-versa, addressed?", validity: true },
          { id: "a8", text: "Are participants, and their voices, adequately represented?", validity: true },
          { id: "a9", text: "Is the research critical?", validity: true },
          { id: "a10", text: "Is there a statement concerning ethical approval?", validity: true },
        ],
      },
    ],
  },
  {
    id: "systematic_review",
    label: "Systematic Reviews and Research Syntheses",
    design: "Systematic Review / Meta-analysis",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI systematic review checklist assesses review question and inclusion criteria clarity, search strategy rigor, source appraisal, data extraction, study appraisal weighting, synthesis methods, publication bias assessment, and recommendations.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Is the review question clearly and explicitly defined?", validity: true },
          { id: "a2", text: "Were the inclusion criteria for the review appropriately defined?", validity: true },
          { id: "a3", text: "Was the search strategy appropriate?", validity: true },
          { id: "a4", text: "Were the included sources assessed and appraised for methodological quality?", validity: true },
          { id: "a5", text: "Was the method used to minimize errors in data extraction appropriate?", validity: true },
          { id: "a6", text: "Were the methods used to combine studies appropriate?", validity: true },
          { id: "a7", text: "Was the likelihood of publication bias assessed?", validity: true },
          { id: "a8", text: "Were recommendations for policy and/or practice supported by the reported data?", validity: true },
        ],
      },
    ],
  },
  {
    id: "case_report",
    label: "Case Reports",
    design: "Case Report",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI case report checklist assesses patient demographics, medical/family/social history, current condition, diagnostic tests, intervention, findings, adverse events, conclusions, and post-intervention advice.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Were patient's demographic characteristics clearly described?", validity: true },
          { id: "a2", text: "Was the patient's history, including medical and family history, clearly described and presented as a timeline?", validity: true },
          { id: "a3", text: "Was the current clinical condition of the patient on presentation clearly described?", validity: true },
          { id: "a4", text: "Were diagnostic tests or assessment methods and the results clearly described?", validity: true },
          { id: "a5", text: "Was the intervention(s) or procedure(s) clearly described?", validity: true },
          { id: "a6", text: "Was the post-intervention clinical condition clearly described?", validity: true },
          { id: "a7", text: "Were adverse events (harms) or unanticipated events identified and described?", validity: true },
          { id: "a8", text: "Does the case report provide takeaway messages?", validity: true },
        ],
      },
    ],
  },
  {
    id: "case_series",
    label: "Case Series",
    design: "Case Series",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI case series checklist assesses inclusion criteria, demographic description, measurement of conditions/interventions, exposure measurement, outcome measurement, statistical analysis, and conclusions.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Were there clear criteria for inclusion in the case series?", validity: true },
          { id: "a2", text: "Was the condition measured in a standard, reliable way for all participants included in the case series?", validity: true },
          { id: "a3", text: "Were valid methods used for identification of the condition for all participants included in the case series?", validity: true },
          { id: "a4", text: "Did the case series have consecutive inclusion of participants?", validity: true },
          { id: "a5", text: "Did the case series have complete inclusion of participants?", validity: true },
          { id: "a6", text: "Was there clear reporting of the demographics of the participants in the study?", validity: true },
          { id: "a7", text: "Was there clear reporting of clinical information of the participants?", validity: true },
          { id: "a8", text: "Were the outcomes or follow-up outcomes of cases clearly reported?", validity: true },
          { id: "a9", text: "Was there clear reporting of the demographics of participants in the study?", validity: true },
          { id: "a10", text: "Was there clear reporting of clinical information of participants in the study?", validity: true },
        ],
      },
    ],
  },
  {
    id: "prevalence",
    label: "Prevalence and Incidence Studies",
    design: "Prevalence / Incidence Study",
    sourceUrl: "https://jbi.global/critical-appraisal-tools",
    guidance:
      "The JBI prevalence checklist assesses sample frame, participants, sample size, study subjects/setting description, coverage analysis, objective measurement, statistical analysis, and response rate.",
    sections: [
      {
        id: "section-a",
        title: "Methodology / validity",
        items: [
          { id: "a1", text: "Was the sample frame appropriate to address the target population?", validity: true },
          { id: "a2", text: "Were study participants sampled in an appropriate way?", validity: true },
          { id: "a3", text: "Was the sample size adequate?", validity: true },
          { id: "a4", text: "Were the study subjects and the setting described in detail?", validity: true },
          { id: "a5", text: "Was the data analysis conducted with sufficient coverage of the identified sample?", validity: true },
          { id: "a6", text: "Were objective, standard criteria used for measurement of the condition?", validity: true },
          { id: "a7", text: "Was the condition measured reliably?", validity: true },
          { id: "a8", text: "Was there appropriate statistical analysis?", validity: true },
          { id: "a9", text: "Was the response rate adequate, and if not, was the low response rate managed appropriately?", validity: true },
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Selection helpers                                                          */
/* -------------------------------------------------------------------------- */

export function listJbiChecklists(): Array<{ id: string; label: string; design: string; sourceUrl: string; itemCount: number }> {
  return JBI_CHECKLISTS.map((c) => ({
    id: c.id,
    label: c.label,
    design: c.design,
    sourceUrl: c.sourceUrl,
    itemCount: c.sections.reduce((a, s) => a + s.items.length, 0),
  }));
}

export function getJbiChecklist(id: string): JbiChecklist | undefined {
  return JBI_CHECKLISTS.find((c) => c.id === id);
}
