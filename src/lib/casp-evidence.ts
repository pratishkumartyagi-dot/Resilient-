/**
 * Evidence engine for CASP critical appraisal.
 *
 * Every CASP item is judged from the text of the uploaded paper:
 *   YES       — the document explicitly reports the criterion (evidence quoted)
 *   NO        — the document explicitly contradicts it (evidence quoted)
 *   CAN'T TELL — the document does not report it (never an assumption)
 *
 * The concepts below map a CASP question to the phrases that demonstrate it in
 * a research paper. They are deliberately conservative: a concept only fires
 * when the paper actually states the thing being asked about.
 */

import type { CaspItem, CaspJudgment } from "./casp-checklists";

export interface CaspConcept {
  id: string;
  label: string;
  /** Matches the CASP question text this concept can answer. */
  itemPatterns: RegExp[];
  /** Phrases that demonstrate the criterion was met. */
  positive: RegExp[];
  /** Phrases that demonstrate the criterion was not met. */
  negative: RegExp[];
}

export const CASP_CONCEPTS: CaspConcept[] = [
  {
    id: "focused_question",
    label: "Clearly focused / formulated research question",
    itemPatterns: [/focused question/i, /clearly formulated research question/i, /clear statement of the aims/i, /statement of the aims/i],
    positive: [/research question/i, /\baims?\b[^.]{0,80}\b(to|was|were)\b/i, /\bobjective\b/i, /\bpurpose of (this|the) study/i, /hypothesis/i],
    negative: [/no (?:clear |explicit )?(?:research question|aim|objective)/i],
  },
  {
    id: "pico",
    label: "Population, intervention, comparator and outcomes specified",
    itemPatterns: [/population/i, /intervention given/i, /comparator/i, /outcomes measured/i, /formulated.*(?:intervention|comparator)/i],
    positive: [/population (?:studied|included|was)/i, /participants? (?:were|was) (?:recruited|enrolled|included)/i, /primary (?:outcome|endpoint)/i, /control group/i, /intervention (?:group|arm)/i],
    negative: [],
  },
  {
    id: "randomisation",
    label: "Random allocation to intervention",
    itemPatterns: [/assignment of participants to interventions randomi[sz]ed/i, /randomi[sz]ed assignment/i, /randomi[sz]ed\)?\s*$/i, /allocation (?:of|sequence|conceal)/i, /randomi[sz]ation of/i],
    positive: [/randomi[sz]ed (?:allocation|assignment|trial|to|group)/i, /random allocation/i, /computer-?generated (?:random|sequence)/i, /permuted block/i, /randomly (?:assigned|allocated)/i],
    negative: [/not randomi[sz]ed/i, /non-?randomi[sz]ed/i, /quasi-?experimental/i, /not a randomi[sz]ed/i, /allocated by (?:convenience|judgement)/i],
  },
  {
    id: "allocation_concealment",
    label: "Allocation sequence concealed",
    itemPatterns: [/allocation sequence concealed/i, /conceal/i],
    positive: [/allocation concealment/i, /concealed allocation/i, /central randomi[sz]ation/i, /sequentially numbered/i],
    negative: [/not concealed/i, /allocation (?:was )?not concealed/i],
  },
  {
    id: "attrition",
    label: "All participants accounted for at conclusion",
    itemPatterns: [/accounted for/i, /loss(?:es)? to follow-?up/i, /drop-?out/i, /attrition/i, /exclusions after randomisation/i],
    positive: [/all (?:participants|patients|subjects) (?:were )?accounted/i, /participant flow/i, /flow diagram/i, /loss(?:es)? to follow-?up/i, /attrition/i, /withdrawals? and (?:drop-?outs?|exclusions)/i],
    negative: [],
  },
  {
    id: "blinding_participants",
    label: "Participants blind to intervention",
    itemPatterns: [/participants[^.]{0,40}blind/i, /blind to intervention they were given/i],
    positive: [/participants? (?:were )?blind/i, /participant blinding/i, /double-?blind/i, /single-?blind/i, /participants? were masked/i],
    negative: [/participants? (?:were )?not blind/i, /unblinded participants/i, /open-?label/i],
  },
  {
    id: "blinding_investigators",
    label: "Investigators blind to intervention",
    itemPatterns: [/investigators?[^.]{0,40}blind/i, /blind to the intervention they were giving/i],
    positive: [/investigators? (?:were )?blind/i, /double-?blind/i, /clinicians? (?:were )?blind/i, /blind(?:ed)? to (?:the )?intervention/i, /masked (?:the|treatment)/i],
    negative: [/investigators? (?:were )?not blind/i, /unblinded (?:to|clinician)/i],
  },
  {
    id: "blinding_assessors",
    label: "Outcome assessors blind",
    itemPatterns: [/people assessing/i, /analysing outcome/i, /assessor/i, /outcome.*blind/i],
    positive: [/outcome assessors? (?:were )?blind/i, /assessors? (?:were )?blind/i, /blind(?:ed)?[^.]{0,30}outcome/i, /without knowledge of the (?:index|reference) test/i],
    negative: [/assessors? (?:were )?not blind/i, /unblinded assessment/i],
  },
  {
    id: "baseline_equivalence",
    label: "Study groups similar at the start",
    itemPatterns: [/similar at the start/i, /baseline/i],
    positive: [/baseline characteristics/i, /groups were similar/i, /no significant differences? (?:at|between) baseline/i, /baseline table/i, /balanced at baseline/i],
    negative: [/significant differences? (?:at|between) baseline/i, /groups differed significantly at baseline/i],
  },
  {
    id: "equal_care",
    label: "Equal care apart from the intervention",
    itemPatterns: [/same level of care/i, /treated equally/i, /additional interventions/i],
    positive: [/same (?:level of )?care/i, /identical (?:support|interventions)/i, /co-?interventions? (?:were|were not)/i, /equally (?:treated|care)/i],
    negative: [],
  },
  {
    id: "protocol",
    label: "Clearly defined study protocol",
    itemPatterns: [/protocol/i, /registered/i],
    positive: [/protocol (?:was )?(?:registered|pre-?specified|published|defined)/i, /registered (?:on|with|at)[^.]{0,60}(?:ClinicalTrials|ISRCTN|protocol)/i, /\bNCT\d{6,}/i, /pre-?registered/i],
    negative: [],
  },
  {
    id: "power_calculation",
    label: "Power / sample size calculation",
    itemPatterns: [/power calculation/i, /sample size/i],
    positive: [/power calculation/i, /sample size (?:was )?calculat/i, /calculated to (?:detect|provide)/i, /a priori sample size/i],
    negative: [/no power calculation/i, /underpowered/i, /post hoc power/i],
  },
  {
    id: "outcome_specification",
    label: "Outcomes clearly specified and measured",
    itemPatterns: [/outcomes? (?:were )?(?:measured|clearly specified)/i, /what outcomes/i, /outcomes measured/i, /effect[s]? of intervention reported/i],
    positive: [/primary (?:outcome|endpoint)/i, /secondary outcomes?/i, /outcomes? (?:were|are) (?:measured|prespecified|defined)/i, /outcome measures?/i],
    negative: [],
  },
  {
    id: "effect_reporting",
    label: "Effects reported comprehensively (relative and absolute)",
    itemPatterns: [/effects? of intervention reported comprehensively/i, /relative and absolute/i, /size of the intervention/i, /treatment effect/i],
    positive: [/relative risk/i, /odds ratio/i, /risk ratio/i, /absolute risk/i, /number needed to treat/i, /\bNNT\b/, /mean difference/i, /hazard ratio/i, /risk difference/i],
    negative: [],
  },
  {
    id: "missing_data",
    label: "Missing or incomplete data addressed",
    itemPatterns: [/missing or incomplete data/i, /complete (?:case|dataset)/i],
    positive: [/missing data/i, /incomplete data/i, /missingness/i, /complete-?case analysis/i, /multiple imputation/i, /last observation carried forward/i],
    negative: [],
  },
  {
    id: "differential_dropout",
    label: "Differential drop-out between groups",
    itemPatterns: [/differential drop-?out/i, /drop-?out between/i],
    positive: [/differential (?:drop-?out|attrition)/i, /loss to follow-?up (?:was|were) (?:higher|lower|different)/i, /attrition (?:was|were) (?:higher|lower|different)/i],
    negative: [],
  },
  {
    id: "bias_identified",
    label: "Potential sources of bias identified",
    itemPatterns: [/sources? of bias/i, /bias identified/i, /potential sources/i],
    positive: [/sources? of bias/i, /risk of bias/i, /limitations of (?:this|the) study/i, /bias (?:were|was) (?:discussed|considered|addressed)/i],
    negative: [],
  },
  {
    id: "statistical_tests",
    label: "Statistical tests reported",
    itemPatterns: [/statistical tests?/i, /how were the results expressed/i],
    positive: [/t-?test/i, /chi-?square/i, /\bANOVA\b/i, /Mann-?Whitney/i, /(logistic|linear) regression/i, /Cox (?:proportional hazards )?regression/i, /Fisher'?s exact/i, /mixed-?effects? model/i],
    negative: [],
  },
  {
    id: "p_values",
    label: "p values reported",
    itemPatterns: [/p values?/i],
    positive: [/p-?values?\b/i, /\bp\s*[<=]\s*0?\.?\d+/i, /statistical(?:ly)? significant/i],
    negative: [],
  },
  {
    id: "precision_ci",
    label: "Precision of the estimate reported (confidence intervals)",
    itemPatterns: [/precision/i, /confidence interval/i, /how precise/i],
    positive: [/95%\s*CI/i, /confidence intervals?/i, /\bCIs?\b/i, /standard error/i, /interquartile range/i],
    negative: [/no confidence intervals?/i],
  },
  {
    id: "harms",
    label: "Harms and unintended effects reported",
    itemPatterns: [/harms?/i, /unintended effects?/i, /costs?/i],
    positive: [/adverse (?:events?|effects?|outcomes?|reactions)/i, /harms? (?:were|was) (?:reported|assessed)/i, /unintended effects?/i, /side-?effects?/i, /safety (?:data|outcomes|profile)/i],
    negative: [],
  },
  {
    id: "cost_effectiveness",
    label: "Cost-effectiveness considered",
    itemPatterns: [/cost-?effectiveness/i, /costs?/i, /value/i],
    positive: [/cost-?effectiveness/i, /\bICER\b/i, /\bQALY/i, /incremental cost/i, /cost-?utility/i, /costs? (?:were|are) (?:reported|considered|measured)/i],
    negative: [],
  },
  {
    id: "applicability",
    label: "Applicable to the local population / context",
    itemPatterns: [/applied to your local population/i, /applied to the local population/i, /similar to the people in your care/i, /applied to/i, /generalisab/i],
    positive: [/generalisab/i, /applicab/i, /relevant to (?:our|the|your) (?:population|setting|context|patients)/i, /local population/i, /transferab/i],
    negative: [/limited generalisab/i, /generalisab\w* (?:is|was|may be) (?:limited|restricted|questionable)/i, /restricted generalisab/i, /not (?:generalisable|applicable)/i],
  },
  {
    id: "clinically_important_outcomes",
    label: "Clinically important outcomes considered",
    itemPatterns: [/outcomes important/i, /clinically important/i, /all important outcomes/i, /all clinically important/i],
    positive: [/patient-?important outcomes?/i, /clinically important outcomes?/i, /meaningful (?:outcome|endpoint)/i, /important outcomes? (?:were|are) (?:considered|reported|measured)/i],
    negative: [],
  },
  {
    id: "limitations",
    label: "Limitations of the study acknowledged",
    itemPatterns: [/limitations? of the study/i, /limitations?/i],
    positive: [/limitations? (?:of|are|include|were)/i, /this study has (?:several )?limitations/i, /strengths and limitations/i],
    negative: [],
  },
  {
    id: "resource_requirements",
    label: "Resources needed to introduce the intervention",
    itemPatterns: [/resources? needed/i, /time, finances/i, /disinvest/i, /greater value/i],
    positive: [/cost of (?:implementing|delivering|introducing)/i, /resources? (?:needed|required)/i, /training needs?/i, /cost-?effectiveness/i],
    negative: [],
  },
  {
    id: "review_search_strategy",
    label: "Appropriate and comprehensive search strategy",
    itemPatterns: [/right type of papers/i, /important, relevant studies/i, /bibliographic databases/i, /search/i],
    positive: [/MEDLINE/i, /PubMed/i, /Embase/i, /CINAHL/i, /PSYCINFO/i, /Scopus/i, /Web of Science/i, /databases searched/i, /search strateg(?:y|ies)/i, /reference lists? (?:were )?(?:searched|followed)/i, /hand ?search/i],
    negative: [],
  },
  {
    id: "review_quality_appraisal",
    label: "Quality of included studies assessed",
    itemPatterns: [/assess quality/i, /rigour of the studies/i, /quality of the included/i],
    positive: [/quality assessment/i, /risk of bias/i, /\bCASP\b/i, /\bGRADE\b/i, /critical appraisal/i, /quality of (?:the )?included studies/i],
    negative: [/quality of (?:the )?included studies was not/i, /did not assess the quality/i],
  },
  {
    id: "pooling_justified",
    label: "Combining results was reasonable",
    itemPatterns: [/combined, was it reasonable/i, /pooled/i, /meta-?analys/i],
    positive: [/meta-?analysis/i, /pooled (?:results|estimates)/i, /random-?effects model/i, /fixed-?effect/i, /heterogeneity/i, /\bI2\b/],
    negative: [],
  },
  {
    id: "overall_results",
    label: "Overall results of the review stated",
    itemPatterns: [/overall results of the review/i, /bottom line/i, /what are the overall results/i],
    positive: [/the review (?:found|showed|concluded|identified|reported)/i, /overall (?:results|effect|evidence)/i, /our (?:review|synthesis) (?:found|showed)/i, /n\s?=\s?\d+ studies/i],
    negative: [],
  },
  {
    id: "ethics",
    label: "Ethical approval and consent addressed",
    itemPatterns: [/ethical/i, /ethics committee/i, /informed consent/i, /ethics/i],
    positive: [/ethics? (?:committee|approval|reference|review)/i, /ethical approval/i, /institutional review board/i, /\bIRB\b/i, /informed consent/i, /research ethics/i, /\bREC\b/],
    negative: [/no ethical approval/i, /ethics? committee approval was not/i],
  },
  {
    id: "methodology_appropriate",
    label: "Methodology appropriate for the aims",
    itemPatterns: [/methodology appropriate/i, /research design appropriate/i, /right methodology/i, /design appropriate/i],
    positive: [/qualitative (?:approach|methodology|design|research)/i, /thematic analysis/i, /phenomenolog/i, /grounded theory/i, /ethnograph/i, /mixed-?methods?/i, /case study/i, /action research/i],
    negative: [],
  },
  {
    id: "recruitment_strategy",
    label: "Recruitment strategy appropriate",
    itemPatterns: [/recruitment strategy/i, /participants (?:were )?selected/i, /how the participants/i, /recruited/i],
    positive: [/purposive(?:ly)? (?:sampl|recruit)/i, /snowball/i, /consecutive (?:sampling|patients|participants)/i, /convenience sampl/i, /theoretical sampl/i, /participants were (?:recruited|approached|invited)/i, /eligibility criteria/i, /inclusion criteria/i],
    negative: [],
  },
  {
    id: "data_collection",
    label: "Data collection appropriate to the research issue",
    itemPatterns: [/data collected/i, /how data were collected/i, /form of data/i],
    positive: [/semi-?structured interview/i, /focus group/i, /tape-?record/i, /field notes/i, /participant observation/i, /questionnaire/i, /survey/i, /audio-?record/i, /focused interview/i, /written narrative/i],
    negative: [],
  },
  {
    id: "reflexivity",
    label: "Researcher's role and influence considered",
    itemPatterns: [/relationship between researcher and participants/i, /reflexiv/i, /own role/i],
    positive: [/reflexiv/i, /researcher'?s (?:role|position|influence|bias|relationship)/i, /bracketing/i, /potential (?:bias|influence) of the researcher/i, /memos?/i],
    negative: [],
  },
  {
    id: "saturation",
    label: "Data saturation addressed",
    itemPatterns: [/saturation/i],
    positive: [/saturation/i, /data (?:was|were) saturated/i, /thematic saturation/i],
    negative: [],
  },
  {
    id: "analysis_rigour",
    label: "Data analysis sufficiently rigorous",
    itemPatterns: [/analysis sufficiently rigorous/i, /analysis process/i, /themes? (?:were )?derived/i, /data analysis/i],
    positive: [/thematic analysis/i, /\bcoding\b/i, /inductive/i, /deductive/i, /framework analysis/i, /content analysis/i, /categories (?:were|are) (?:developed|derived|identified)/i, /constant comparison/i, /member checking/i, /triangulation/i],
    negative: [],
  },
  {
    id: "contradictory_data",
    label: "Contradictory data taken into account",
    itemPatterns: [/contradictory data/i, /negative case/i],
    positive: [/negative cases?/i, /disconfirming/i, /contradict(?:ory|ing) (?:data|evidence)/i, /data (?:that )?d[id] not fit/i, /outliers? (?:were )?(?:reported|explained)/i],
    negative: [],
  },
  {
    id: "clear_findings",
    label: "Clear statement of findings",
    itemPatterns: [/clear statement of findings/i, /findings/i, /value of the research/i, /valuable/i],
    positive: [/themes? (?:were|are) (?:identified|presented|emerged)/i, /findings were presented/i, /table of themes/i, /quotations? (?:are|were) (?:included|presented)/i, /participants'? (?:quotes|accounts)/i],
    negative: [],
  },
  {
    id: "cohort_recruitment",
    label: "Cohort recruited acceptably",
    itemPatterns: [/cohort recruited/i, /recruited in an acceptable way/i, /cohort/i],
    positive: [/cohort (?:was )?(?:recruited|assembled|identified)/i, /consecutive (?:patients|participants|members)/i, /eligibility criteria/i, /membership records/i, /source population/i, /single (?:centre|center|hospital)/i, /multi-?centre/i],
    negative: [],
  },
  {
    id: "exposure_measurement",
    label: "Exposure measured accurately",
    itemPatterns: [/exposure accurately measured/i, /exposure/i],
    positive: [/exposure (?:was |were )?(?:measured|assessed|recorded)/i, /validated (?:instrument|questionnaire|measure|tool)/i, /self-?reported exposure/i, /objective (?:exposure )?measure/i],
    negative: [],
  },
  {
    id: "outcome_measurement",
    label: "Outcome measured accurately",
    itemPatterns: [/outcome accurately measured/i, /outcome/i],
    positive: [/outcome (?:was |were )?(?:measured|assessed|determined)/i, /objective (?:outcome )?measure/i, /gold standard/i, /validated (?:instrument|measure|questionnaire)/i, /blinded (?:to|assessment of) outcome/i],
    negative: [],
  },
  {
    id: "confounding_identified",
    label: "Important confounding factors identified",
    itemPatterns: [/confounding/i, /confounders?/i],
    positive: [/confound/i, /potential confounders?/i, /confounding factors?/i],
    negative: [],
  },
  {
    id: "confounding_adjusted",
    label: "Confounding taken into account in design/analysis",
    itemPatterns: [/taken account of the confounding/i, /adjusted/i, /design and\/or analysis/i],
    positive: [/adjusted for/i, /multivariable/i, /multivariate/i, /stratified/i, /\bmatching\b/i, /propensity score/i, /regression adjustment/i, /restricted to/i],
    negative: [],
  },
  {
    id: "followup_complete",
    label: "Follow-up complete enough",
    itemPatterns: [/follow-?up of subjects complete enough/i, /complete enough/i],
    positive: [/follow-?up (?:was|were|is) (?:complete|completed)/i, /complete follow-?up/i, /loss(?:es)? to follow-?up (?:was|were) (?:low|minimal|\d+%)/i, /\d+(\.\d+)?% (?:had |were )?(?:complete )?follow-?up/i],
    negative: [],
  },
  {
    id: "followup_long_enough",
    label: "Follow-up long enough",
    itemPatterns: [/follow-?up of subjects long enough/i, /long enough/i, /follow-?up interval/i, /follow-?up period/i],
    positive: [/follow-?up (?:was|for|of) [\w-]+ (?:months?|years?|weeks?|days?)/i, /median follow-?up/i, /\d+ (?:months?|years?) of follow-?up/i],
    negative: [/short follow-?up/i, /limited follow-?up/i],
  },
  {
    id: "reference_standard",
    label: "Reference standard used for diagnosis",
    itemPatterns: [/reference standard/i, /gold standard/i, /target condition/i],
    positive: [/reference standard/i, /gold standard/i, /biopsy/i, /histolog/i, /confirmed by/i, /composite reference standard/i],
    negative: [],
  },
  {
    id: "sample_spectrum",
    label: "Study sample representative (spectrum)",
    itemPatterns: [/spectrum/i, /representative sample/i, /consecutive/i],
    positive: [/consecutive (?:patients|participants|subjects|samples)/i, /spectrum of/i, /randomly selected/i, /study population/i, /prospectively/i, /recruited from/i],
    negative: [/case-?control (?:sampling|design)/i],
  },
  {
    id: "pre_specified_threshold",
    label: "Pre-specified threshold / cut-off",
    itemPatterns: [/threshold/i, /cut-?off/i, /criteria? for a positive/i],
    positive: [/pre-?specified threshold/i, /cut-?off (?:of|was|point)/i, /threshold (?:of|was) /i, /criteria? (?:for|of) a positive (?:test|result)/i, /reference standard criteria/i],
    negative: [/post hoc (?:threshold|cut-?off|data-?derived)/i, /optimal cut-?off (?:was )?(?:chosen|determined) (?:after|post hoc)/i],
  },
  {
    id: "economic_perspective",
    label: "Economic perspective stated",
    itemPatterns: [/perspective/i, /economic evaluation/i, /economic/i],
    positive: [/cost-?effectiveness/i, /(?:payer|provider|societal|healthcare system|hospital) perspective/i, /perspective of/i, /cost-?utility/i, /cost-?benefit/i],
    negative: [],
  },
  {
    id: "economic_model",
    label: "Economic model appropriate",
    itemPatterns: [/model/i, /decision tree/i, /markov/i],
    positive: [/decision tree/i, /markov/i, /model-?based/i, /microsimulation/i, /state-?transition model/i],
    negative: [],
  },
  {
    id: "sensitivity_analysis",
    label: "Sensitivity analysis undertaken",
    itemPatterns: [/sensitivity analysis/i, /sensitivity/i],
    positive: [/sensitivity analysis/i, /one-?way sensitivity/i, /two-?way sensitivity/i, /probabilistic sensitivity/i, /scenario analysis/i, /robustness/i],
    negative: [],
  },
  {
    id: "incremental_effects",
    label: "Incremental costs and effects reported",
    itemPatterns: [/incremental/i, /costs? and effects?/i, /results? (?:of|in) the (?:economic )?evaluation/i],
    positive: [/incremental cost/i, /incremental effect/i, /\bICER\b/i, /\bQALY/i, /cost per (?:QALY|life)/i, /\bLYG\b/i, /net monetary benefit/i],
    negative: [],
  },
  {
    id: "prediction_derivation",
    label: "Prediction rule derivation / validation",
    itemPatterns: [/prediction rule/i, /derived/i, /validated/i, /calibrat/i, /discriminat/i],
    positive: [/derived (?:and|the rule)/i, /(?:external|internal) validat/i, /calibrat/i, /discriminat/i, /c-?statistic/i, /\bAUC\b/i, /area under the curve/i, /sensitivity and specificity/i],
    negative: [],
  },
  {
    id: "sample_size_justified",
    label: "Sample size justified",
    itemPatterns: [/sample size/i, /participants? (?:were )?recruited/i, /sufficient/i],
    positive: [/sample size/i, /\d+ participants (?:were )?(?:recruited|enrolled|included)/i, /a total of \d+ (?:patients|participants|subjects)/i, /participants? were recruited/i],
    negative: [],
  },
  {
    id: "case_control_sampling",
    label: "Cases and controls selected appropriately",
    itemPatterns: [/case and control/i, /cases? and controls?/i, /how the (?:cases|controls)/i],
    positive: [/cases? (?:were|and controls? were) (?:selected|recruited|identified)/i, /incident cases?/i, /matched (?:on|by)/i, /control group (?:was|were) (?:selected|recruited)/i, /source population/i],
    negative: [],
  },
  {
    id: "cross_sectional_sampling",
    label: "Sample representative (cross-sectional)",
    itemPatterns: [/representative/i, /sample/i],
    positive: [/random(?:ly)? (?:selected|sampled)/i, /consecutive/i, /purposive/i, /eligibility criteria/i, /response rate/i, /\d+ participants? (?:were )?(?:recruited|completed|responded)/i],
    negative: [],
  },
];

export interface Sentence {
  text: string;
  index: number;
}

const STOP_WORDS = new Set([
  "were", "does", "this", "that", "with", "from", "have", "been", "were", "which", "their", "there", "when",
  "what", "where", "these", "those", "about", "would", "could", "should", "into", "such", "them", "they",
  "the", "and", "for", "was", "are", "you", "your", "our", "its", "his", "her", "not", "but", "all", "any",
  "can", "did", "does", "each", "more", "most", "other", "than", "then", "them", "they", "will", "yes",
]);

/**
 * A sentence only counts as evidence when it is about *this* study. Without
 * this guard a sentence describing somebody else's trial ("the XYZ study was
 * not randomised") would be misread as a criticism of the uploaded paper.
 */
const TOPIC_MARKER =
  /\b(participants?|patients?|subjects?|respondents?|enrolled|recruited|randomi[sz]ed|randomi[sz]ation|intervention|eligib\w+|inclusion criteria|exclusion criteria|authors? (?:randomi[sz]ed|assigned)|study|trial|review|analys\w+|group|arm|outcome|baseline|result\w*|report\w*|sample|cohort|data|follow-?up|search|databases?|studies|included articles)\b/i;

/** A statement the authors make about their own study. */
const SELF_MARKER =
  /\b(we|our|ours|us|this (?:study|trial|analysis|paper|research|report|work|review|systematic review|scoping review|meta-?analysis|cohort|project)|the (?:study|trial|review) (?:was|is|had|design|protocol|period|population|aims?)|authors? (?:searched|included|identified))\b/i;

/** Sentences that talk about somebody else's research. */
const OTHER_STUDY =
  /\b(?:the|another|previous|prior|other|earlier|a recent)\s+[A-Z][A-Za-z0-9‐-]{1,}\s+(?:study|trial)\b|\b(?:previous|prior|earlier|other|another|related)\s+(?:studies|trials|research|work|trials?)\b|\bin contrast (?:to|with)\b/i;

export function splitSentences(text: string): Sentence[] {
  const cleaned = text
    .replace(/\r/g, "\n")
    .replace(/([a-z0-9])\.\s*\n\.\s*/gi, "$1. ")
    .replace(/[ \t]{2,}/g, " ");
  const parts = cleaned.split(/(?<=[.!?])\s+|\n+/g);
  const out: Sentence[] = [];
  parts.forEach((part) => {
    const t = part.trim();
    if (t.length < 25) return;
    if (t.length > 420) {
      // Long blocks (tables, references) are chunked so evidence stays quotable.
      for (let i = 0; i < t.length; i += 350) {
        const chunk = t.slice(i, i + 350).trim();
        if (chunk.length > 40) out.push({ text: chunk, index: out.length });
      }
      return;
    }
    out.push({ text: t, index: out.length });
  });
  return out;
}

export interface EvidenceMatch {
  /** Quoted window of the document around the match. */
  window: string;
  /** The phrase that triggered the match. */
  matched: string;
  /** Confidence of the match (higher is better). */
  score: number;
}

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w));
}

function windowAround(sentence: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 130);
  const end = Math.min(sentence.length, matchIndex + matchLength + 160);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < sentence.length ? "…" : "";
  return `${prefix}${sentence.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

/**
 * Finds the best evidence for a concept inside the document.
 * A match is only accepted when the sentence is about this study, and matches
 * that overlap with the CASP question itself rank higher.
 *
 * `excludeOtherStudies` is used for negative evidence: a criticism must not be
 * about somebody else's research.
 */
export function findBestMatch(
  sentences: Sentence[],
  patterns: RegExp[],
  itemText: string,
  excludeOtherStudies = false
): EvidenceMatch | null {
  const words = contentWords(itemText);
  let best: EvidenceMatch | null = null;

  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.text.match(pattern);
      if (!match || match.index === undefined) continue;

      const window = windowAround(sentence.text, match.index, match[0].length);
      const self = SELF_MARKER.test(window);
      const topic = TOPIC_MARKER.test(window);
      if (!self && !topic) continue; // nothing to do with this study
      // The whole sentence is checked too: the study name may sit outside the
      // quoted window ("... in 382 participants, but was not a randomised trial").
      const aboutOtherStudy = OTHER_STUDY.test(window) || OTHER_STUDY.test(sentence.text);
      if (aboutOtherStudy && !self) continue; // about someone else's research
      if (excludeOtherStudies && aboutOtherStudy) continue;

      const overlap = words.filter((w) => window.toLowerCase().includes(w)).length;
      const score = (self ? 2 : 0) + (topic ? 1 : 0) + Math.min(overlap, 3);
      if (!best || score > best.score) {
        best = { window, matched: match[0], score };
      }
      break; // one match per sentence is enough
    }
  }

  return best;
}

export interface ItemEvidence {
  judgment: CaspJudgment;
  /** Short quote from the document that supports the judgement. */
  evidence?: string;
  /** The phrase that triggered the match. */
  trigger?: string;
  /** Concepts used to evaluate this item. */
  concepts: string[];
  /** Explanation shown to the reviewer. */
  rationale: string;
}

export function evaluateCaspItem(item: CaspItem, sentences: Sentence[]): ItemEvidence {
  const concepts = CASP_CONCEPTS.filter((c) => c.itemPatterns.some((p) => p.test(item.text)));

  if (concepts.length === 0) {
    return {
      judgment: "cant_tell",
      concepts: [],
      rationale:
        "This criterion cannot be judged automatically — read the question against the paper and record YES / NO / CAN'T TELL manually.",
    };
  }

  const negativeHits: Array<{ concept: CaspConcept; match: EvidenceMatch }> = [];
  const positiveHits: Array<{ concept: CaspConcept; match: EvidenceMatch }> = [];

  for (const concept of concepts) {
    const negative = findBestMatch(sentences, concept.negative, item.text, true);
    if (negative) negativeHits.push({ concept, match: negative });
    const positive = findBestMatch(sentences, concept.positive, item.text);
    if (positive) positiveHits.push({ concept, match: positive });
  }

  if (negativeHits.length > 0) {
    const first = negativeHits.sort((a, b) => b.match.score - a.match.score)[0]!;
    return {
      judgment: "no",
      evidence: first.match.window,
      trigger: first.match.matched,
      concepts: concepts.map((c) => c.id),
      rationale: `The paper explicitly reports that this criterion was not met ("${first.match.matched}").`,
    };
  }

  if (positiveHits.length > 0) {
    const first = positiveHits.sort((a, b) => b.match.score - a.match.score)[0]!;
    return {
      judgment: "yes",
      evidence: first.match.window,
      trigger: first.match.matched,
      concepts: concepts.map((c) => c.id),
      rationale: `The paper reports the information needed to meet this criterion ("${first.match.matched}").`,
    };
  }

  return {
    judgment: "cant_tell",
    concepts: concepts.map((c) => c.id),
    rationale:
      "The uploaded document does not report this explicitly — using “Can’t tell” rather than assuming it was done.",
  };
}
