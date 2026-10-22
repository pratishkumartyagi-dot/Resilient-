/**
 * CASP UK checklists (2024) — Critical Appraisal Skills Programme.
 *
 * Transcribed from the official checklist documents published at
 * https://casp-uk.net/casp-tools-checklists/ (downloaded 2026-10-22):
 * the question wording and the "Consider" prompts are reproduced verbatim.
 *
 * The checklists are used by the Critical Appraisal pipeline: the uploaded
 * paper is matched to a study design, every CASP item is then judged
 * YES / NO / CAN'T TELL with the evidence found in the document.
 *
 * CASP UK content is published under CC BY-NC-SA 4.0.
 */

export type CaspJudgment = "yes" | "no" | "cant_tell";

export interface CaspItem {
  /** Stable id, e.g. "section-a.3" */
  id: string;
  /** The CASP question, verbatim */
  text: string;
  /** The "Consider" prompts that accompany the question */
  consider: string[];
}

export interface CaspSection {
  id: string;
  title: string;
  items: CaspItem[];
}

export interface CaspChecklist {
  id: string;
  label: string;
  /** Study design this checklist is designed for */
  design: string;
  sourceUrl: string;
  guidance: string;
  sections: CaspSection[];
}

export const CASP_CHECKLISTS: CaspChecklist[] = [
  {
    id: "rct",
    label: "Randomised Controlled Trial (RCT)",
    design: "Randomised Controlled Trial (RCT)",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-randomised-controlled-trials-RCT-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Is the basic study design valid for a randomised controlled trial?",
        items: [
          { id: "section-a.1", text: "Did the study address a clearly formulated research question?", consider: ["Was the study designed to assess the outcomes of an intervention?","Is the research question ‘formulated’ in terms of:","Population studied","Intervention given","Comparator chosen","Outcomes measured?"] },
          { id: "section-a.2", text: "Was the assignment of participants to interventions randomised?", consider: ["How was randomisation carried out? Was the method appropriate?","Was randomisation sufficient to eliminate systematic bias?","Was the allocation sequence concealed from investigators and participants?"] },
          { id: "section-a.3", text: "Were all participants who entered the study accounted for at its conclusion?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "Was the study methodologically sound?",
        items: [
          { id: "section-b.1", text: "(a) Were the participants ‘blind’ to intervention they were given?", consider: [] },
          { id: "section-b.2", text: "(b) Were the investigators ‘blind’ to the intervention they were giving to participants?", consider: [] },
          { id: "section-b.3", text: "(c) Were the people assessing/analysing outcome/s ‘blinded’?", consider: [] },
          { id: "section-b.4", text: "Were the study groups similar at the start of the randomised controlled trial?", consider: ["Were the baseline characteristics of each study group (e.g. age, sex, socio-economic group) clearly set out?","Were there any differences between the study groups that could affect the outcome/s?"] },
          { id: "section-b.5", text: "Apart from the experimental intervention, did each study group receive the same level of care (that is, were they treated equally)?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "What are the results?",
        items: [
          { id: "section-c.1", text: "Were the effects of intervention reported comprehensively?", consider: ["Was a power calculation undertaken?","What outcomes were measured, and were they clearly specified?","How were the results expressed? For binary outcomes, were relative and absolute effects reported?","Were the results reported for each outcome in each study group at each follow-up interval?","Was there any missing or incomplete data?","Was there differential drop-out between the study groups that could affect the results?","Were potential sources of bias identified?","Which statistical tests were used?","Were p values reported?"] },
          { id: "section-c.2", text: "Was the precision of the estimate of the intervention or treatment effect reported?", consider: ["Were confidence intervals (CIs) reported?"] },
          { id: "section-c.3", text: "Do the benefits of the experimental intervention outweigh the harms and costs?", consider: [] },
        ],
      },
      {
        id: "section-d",
        title: "Will the results help locally?",
        items: [
          { id: "section-d.1", text: "Can the results be applied to your local population/in your context?", consider: ["Are the study participants similar to the people in your care?","Would any differences between your population and the study participants alter the outcomes reported in the study?","Are the outcomes important to your population?","Are there any outcomes you would have wanted information on that have not been studied or reported?","Are there any limitations of the study that would affect your decision?"] },
          { id: "section-d.2", text: "Would the experimental intervention provide greater value to the people in your care than any of the existing interventions?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "systematic_review",
    label: "Systematic Review",
    design: "Systematic Review / Meta-analysis",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-systematic-reviews-checklist-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results of the review valid?",
        items: [
          { id: "section-a.1", text: "Did the review address a clearly focused question?", consider: ["Did the researchers state a research question?","For a systematic review, a research question can be ‘formulated’ in terms of the PECO framework:","Population","Exposure/Risk factor","Comparator/Controls","Outcome/s or Event/s"] },
          { id: "section-a.2", text: "Did the authors look for the right type of papers?", consider: ["The best sort of studies’ would","Address the review’s question","Have an appropriate study design (usually RCTs for papers evaluating interventions)"] },
          { id: "section-a.3", text: "Do you think all the important, relevant studies were included?", consider: ["Which bibliographic databases were used","Follow up from reference lists","Personal contact with experts","Unpublished as well as published studies","Non-English language studies"] },
          { id: "section-a.4", text: "Did the review’s authors do enough to assess quality of the included studies?", consider: ["The authors need to consider the rigour of the studies they have identified. Lack of rigour may affect the studies’ results (“All that glisters is not gold” Merchant of Venice – Act II Scene 7)"] },
          { id: "section-a.5", text: "If the results of the review have been combined, was it reasonable to do so?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "What are the overall results of the review?", consider: ["If you are clear about the review’s ‘bottom line’ results","What these are (numerically if appropriate)","How were the results expressed (NNT, odds ratio etc.)"] },
          { id: "section-b.2", text: "How precise are the results?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "Can the results be applied to the local population?", consider: ["The patients covered by the review could be sufficiently different to your population to cause concern","Your local setting is likely to differ much from that of the review"] },
          { id: "section-c.2", text: "Were all important outcomes considered?", consider: ["There is other information you would like to have seen"] },
          { id: "section-c.3", text: "Are the benefits worth the harms and costs?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "qualitative",
    label: "Qualitative Research",
    design: "Qualitative Research",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-qualitative-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results valid?",
        items: [
          { id: "section-a.1", text: "Was there a clear statement of the aims of the research?", consider: ["what was the goal of the research?","why was it thought important?","its relevance"] },
          { id: "section-a.2", text: "Is a qualitative methodology appropriate?", consider: ["If the research seeks to interpret or illuminate the actions and/or subjective experiences of research participants","Is qualitative research the right methodology for addressing the research goal?"] },
          { id: "section-a.3", text: "Was the research design appropriate to address the aims of the research?", consider: ["if the researcher has justified the research design (e.g., have they discussed how they decided which method to use)"] },
          { id: "section-a.4", text: "Was the recruitment strategy appropriate to the aims of the research?", consider: ["If the researcher has explained how the participants were selected","If they explained why the participants they selected were the most appropriate to provide access to the type of knowledge sought by the study","If there are any discussions around recruitment (e.g. why some people chose not to take part)"] },
          { id: "section-a.5", text: "Was the data collected in a way that addressed the research issue?", consider: ["If the setting for the data collection was justified","If it is clear how data were collected (e.g. focus group, semi-structured interview etc.)","If the researcher has justified the methods chosen","If the researcher has made the methods explicit (e.g. for interview method, is there an indication of how interviews are conducted, or did they use a topic guide)","If methods were modified during the study. If so, has the researcher explained how and why","If the form of data is clear (e.g. tape recordings, video material, notes etc.)","If the researcher has discussed saturation of data"] },
          { id: "section-a.6", text: "Has the relationship between researcher and participants been adequately considered?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "Have ethical issues been taken into consideration?", consider: ["If there are sufficient details of how the research was explained to participants for the reader to assess whether ethical standards were maintained","If the researcher has discussed issues raised by the study (e.g. issues around informed consent or confidentiality or how they have handled the effects of the study on the participants during and after the study)","If approval has been sought from the ethics committee"] },
          { id: "section-b.2", text: "Was the data analysis sufficiently rigorous?", consider: ["If there is an in-depth description of the analysis process","If thematic analysis is used. If so, is it clear how the categories/themes were derived from the data","Whether the researcher explains how the data presented were selected from the original sample to demonstrate the analysis process","If sufficient data are presented to support the findings","To what extent contradictory data are taken into account","Whether the researcher critically examined their own role, potential bias and influence during analysis and selection of data for presentation"] },
          { id: "section-b.3", text: "Is there a clear statement of findings?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "How valuable is the research?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "cohort",
    label: "Cohort Study",
    design: "Cohort Study",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-cohort-study-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results valid?",
        items: [
          { id: "section-a.1", text: "Did the study address a clearly focused issue?", consider: ["A question can be ‘focused’ in terms of","the population studied","the risk factors studied","is it clear whether the study tried to detect a beneficial or harmful effect","the outcomes considered"] },
          { id: "section-a.2", text: "Was the cohort recruited in an acceptable way?", consider: ["Look for selection bias which might compromise the generalisability of the findings:","was the cohort representative of a defined population","was there something special about the cohort","was everybody included who should have been"] },
          { id: "section-a.3", text: "Was the exposure accurately measured to minimise bias?", consider: ["Look for measurement or classification bias:","did they use subjective or objective measurements","do the measurements truly reflect what you want them to (have they been validated)","were all the subjects classified into exposure groups using the same procedure"] },
          { id: "section-a.4", text: "Was the outcome accurately measured to minimise bias?", consider: ["Look for measurement or classification bias:","did they use subjective or objective measurements","do the measurements truly reflect what you want them to (have they been validated)","has a reliable system been established for detecting all the cases (for measuring disease occurrence)","were the measurement methods similar in the different groups","were the subjects and/or the outcome assessor blinded to exposure (does this matter)"] },
          { id: "section-a.5", text: "(a) Have the authors identified all important confounding factors?", consider: ["list the ones you think might be important, and ones the author missed"] },
          { id: "section-a.6", text: "b) Have they taken account of the confounding factors in the design and/or analysis?", consider: ["look for restriction in design, and techniques e.g. modelling, stratified-, regression-, or sensitivity analysis to correct, control or adjust for confounding factors"] },
          { id: "section-a.7", text: "a) Was the follow up of subjects complete enough?", consider: ["the persons that are lost to follow-up may have different outcomes than those available for assessment","in an open or dynamic cohort, was there anything special about the outcome of the people leaving, or the exposure of the people entering the cohort"] },
          { id: "section-a.8", text: "b) Was the follow up of subjects long enough?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "What are the results of this study?", consider: ["what are the bottom line results","have they reported the rate or the proportion between the exposed/unexposed, the ratio/rate difference","how strong is the association between exposure and outcome (RR)","what is the absolute risk reduction (ARR)"] },
          { id: "section-b.2", text: "How precise are the results?", consider: ["look for the range of the confidence intervals, if given"] },
          { id: "section-b.3", text: "Do you believe the results?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "Can the results be applied to the local population?", consider: ["Is a cohort study the appropriate method to answer this question","If the subjects covered in this study could be sufficiently different from your population to cause concern","If your local setting is likely to differ much from that of the study","If you can quantify the local benefits and harms"] },
          { id: "section-c.2", text: "Do the results of this study fit with other available evidence?", consider: [] },
          { id: "section-c.3", text: "What are the implications of this study for practice?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "case_control",
    label: "Case-Control Study",
    design: "Case-Control Study",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-case-control-study-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results of the study valid?",
        items: [
          { id: "section-a.1", text: "Did the study address a clearly focused issue?", consider: ["An issue can be ‘focused’ In terms of","the population studied","whether the study tried to detect a beneficial or harmful effect","the risk factors studied"] },
          { id: "section-a.2", text: "Did the authors use an appropriate method to answer their question?", consider: ["is a case control study an appropriate way of answering the question under the circumstances","did it address the study question"] },
          { id: "section-a.3", text: "Were the cases recruited in an acceptable way?", consider: ["We are looking for selection bias which might compromise validity of the findings","are the cases defined precisely","were the cases representative of a defined population (geographically and/or temporally)","was there an established reliable system for selecting all the cases","are they incident or prevalent","is there something special about the cases","is the time frame of the study relevant to disease/exposure","was there a sufficient number of cases selected","was there a power calculation"] },
          { id: "section-a.4", text: "Were the controls selected in an acceptable way?", consider: ["We are looking for selection bias which might compromise the generalisability of the findings","were the controls representative of the defined population (geographically and/or temporally)","was there something special about the controls","was the non-response high, could non-respondents be different in any way","are they matched, population based or randomly selected","was there a sufficient number of controls selected"] },
          { id: "section-a.5", text: "Was the exposure accurately measured to minimise bias?", consider: ["We are looking for measurement, recall or classification bias","was the exposure clearly defined and accurately measured","did the authors use subjective or objective measurements","do the measures truly reflect what they are supposed to measure (have they been validated)","were the measurement methods similar in the cases and controls","did the study incorporate blinding where feasible","is the temporal relation correct (does the exposure of interest precede the outcome)"] },
          { id: "section-a.6", text: "a) Aside from the experimental intervention, were the groups treated equally?", consider: ["List the ones you think might be important, that the author may have missed","genetic","environmental","socio-economic"] },
          { id: "section-a.7", text: "b) Have the authors taken account of the potential confounding factors in the design and/or in their analysis?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "Was the exposure effect large?", consider: ["what are the bottom-line results","is the analysis appropriate to the design","how strong is the association between exposure and outcome (look at the odds ratio)","are the results adjusted for confounding, and might confounding still explain the association","has adjustment made a big difference to the OR"] },
          { id: "section-b.2", text: "Was the estimate of the exposure effect precise?", consider: ["size of the p-value","size of the confidence intervals","have the authors considered all the important variables","how was the effect of subjects refusing to participate evaluated"] },
          { id: "section-b.3", text: "Do you believe the results?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "Can the results be applied to your patients/the population of interest?", consider: ["the subjects covered in the study could be sufficiently different from your population to cause concern","if your local setting is likely to differ much from that of the study","can you quantify the local benefits and harms"] },
          { id: "section-c.2", text: "Do the results of this study fit with other available evidence?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "cross_sectional",
    label: "Cross-Sectional Study",
    design: "Cross-Sectional Study",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-cross-sectional-study-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results valid?",
        items: [
          { id: "section-a.1", text: "Did the study address a clearly focused issue?", consider: ["A question can be ‘focused’ in terms of","the population studied","the risk factors studied","is it clear whether the study tried to detect a beneficial or harmful effect","the outcomes considered","Did the authors use an appropriate method"] },
          { id: "section-a.2", text: "to answer their question?", consider: ["Is a descriptive/cross-sectional study an appropriate way of answering the question","did it address the study question"] },
          { id: "section-a.3", text: "Were the subjects recruited in an acceptable way?", consider: ["We are looking for selection bias which might compromise the generalisability of the findings:","Was the sample representative of a defined population","Was everybody included who should have been included"] },
          { id: "section-a.4", text: "Were the measures accurately measured to reduce bias?", consider: ["Look for measurement or classification bias:","did they use subjective or objective measurements","do the measurements truly reflect what you want them to (have they been validated)"] },
          { id: "section-a.5", text: "Were the data collected in a way that addressed the research issue?", consider: ["if the setting for data collection was justified","if it is clear how data were collected (e.g., interview, questionnaire, chart review)","if the researcher has justified the methods chosen","if the researcher has made the methods explicit (e.g. for interview method, is there an indication of how interviews were conducted?)"] },
          { id: "section-a.6", text: "Did the study have enough participants to minimise the play of chance?", consider: ["if the result is precise enough to make a decision","if there is a power calculation. This will estimate how many subjects are needed to produce a","reliable estimate of the measure(s) of interest."] },
          { id: "section-a.7", text: "How are the results presented and what is the main result?", consider: ["if, for example, the results are presented as a proportion of people experiencing an outcome, such as risks, or as a measurement, such as mean or median differences, or as survival curves and hazards","how large this size of result is and how meaningful it is","how you would sum up the bottom-line result of the trial in one sentence"] },
          { id: "section-a.8", text: "Was the data analysis sufficiently rigorous?", consider: ["if there is an in-depth description of the analysis process","if sufficient data are presented to support the findings"] },
          { id: "section-a.9", text: "Is there a clear statement of findings?", consider: ["if the findings are explicit","if there is adequate discussion of the evidence both for and against the researchers’ arguments","if the researchers have discussed the credibility of their findings","if the findings are discussed in relation to the original research questions"] },
          { id: "section-a.10", text: "Can the results be applied to the local population?", consider: ["the subjects covered in the study could be sufficiently different from your population to cause concern.","your local setting is likely to differ much from that of the study"] },
          { id: "section-a.11", text: "How valuable is the research?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "diagnostic",
    label: "Diagnostic Study",
    design: "Diagnostic Accuracy Study",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-diagnostic-test-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results of the study valid?",
        items: [
          { id: "section-a.1", text: "Did the study address a clearly formulated research question?", consider: ["A question should include information about","the population","the test","the setting","the outcomes"] },
          { id: "section-a.2", text: "Was there a comparison with an appropriate reference standard?", consider: ["Is this reference test(s) the best available indicator in the circumstances"] },
          { id: "section-a.3", text: "Did all patients get the diagnostic test and reference standard?", consider: ["were both received regardless of the results of the test of interest","Check the 2x2 table (verification bias)"] },
          { id: "section-a.4", text: "Could the results of the test have been influenced by the results of the reference standard?", consider: ["was there blinding","were the tests performed independently","could there have been review bias"] },
          { id: "section-a.5", text: "Is the disease status of the tested population clearly described?", consider: ["presenting symptoms","disease stage of severity","co-morbidity","differential diagnoses (spectrum bias)"] },
          { id: "section-a.6", text: "Were the methods for performing the test described in sufficient detail?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "What are the results?", consider: ["are the sensitivity and specificity and/or likelihood ratios presented","are the results presented in such a way that we can work them out"] },
          { id: "section-b.2", text: "How sure are we about the results? Consequences and cost of alternatives performed?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "Can the results be applied to your patients/the population of interest?", consider: ["Do you think your patients/population are so different from those in the study that the results cannot be applied, such as age, sex, ethnicity and spectrum bias."] },
          { id: "section-c.2", text: "Can the test be applied to your patient or population of interest?", consider: ["resources and opportunity costs","level and availability of expertise required to interpret the tests","current practice and availability of services"] },
          { id: "section-c.3", text: "Were all outcomes important to the individual or population considered?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "economic_evaluation",
    label: "Economic Evaluation",
    design: "Economic Evaluation",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-economic-evaluation-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Is the economic evaluation valid?",
        items: [
          { id: "section-a.1", text: "Was a well-defined question posed?", consider: ["Is it clear what the authors are trying to achieve","what is the perspective","how many options are compared","are both costs and consequences considered","what is the time horizon"] },
          { id: "section-a.2", text: "Was a comprehensive description of the competing alternatives given?", consider: ["Is there a clear decision tree (or similar given):","can you tell who did what, to whom, where and how often","Does the paper provide evidence that the programme would be effective?"] },
          { id: "section-a.3", text: "(i.e. would the programme do more good than harm?)", consider: ["if an RCT or systematic review was used; if not, consider how strong the evidence was (economic evaluations frequently have to integrate different types of knowledge stemming from different study designs)"] },
          { id: "section-a.4", text: "Were the effects of the intervention identified, measured and valued appropriately?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "How were consequences and costs assessed and compared?",
        items: [
          { id: "section-b.1", text: "Were all important and relevant resources required, and health outcome costs for each alternative identified, measured in appropriate units and valued credibly?", consider: ["Identified?","remember the perspective being taken","HINT: measured accurately?","appropriate units may be hours of nursing time, number of physician visits, years-of-life gained etc.","HINT: valued credibly?","are the values realistic","how have they been derived","have opportunity costs been considered"] },
          { id: "section-b.2", text: "Were costs and consequences adjusted for different times at which they occurred (discounting)?", consider: [] },
          { id: "section-b.3", text: "What were the results of the evaluation?", consider: ["what is the bottom line","what units were used (e.g. cost/life year gained, cost/QALY, net benefit)"] },
          { id: "section-b.4", text: "Was an incremental analysis of the consequences and cost of alternatives performed?", consider: [] },
          { id: "section-b.5", text: "Was an adequate sensitivity analysis performed?", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help in purchasing for local people?",
        items: [
          { id: "section-c.1", text: "Is the programme likely to be equally effective in your context or setting?", consider: ["if the patients covered could be sufficiently different to your population to cause concern","If your local setting is likely to differ much"] },
          { id: "section-c.2", text: "Are the costs translatable to your setting?", consider: [] },
          { id: "section-c.3", text: "Is it worth doing in your setting?", consider: [] },
        ],
      },
    ],
  },
  {
    id: "clinical_prediction_rule",
    label: "Clinical Prediction Rule",
    design: "Clinical Prediction Rule",
    sourceUrl: "https://casp-uk.net/casp-checklists/CASP-checklist-clinical-prediction-rule-2024.pdf",
    guidance: "During critical appraisal, never make assumptions about what the researchers have done. If it is not possible to tell, use the “Can’t tell” response box. If you can’t tell, at best it means the researchers have not been explicit or transparent, but at worst it could mean the researchers have not undertaken a particular task or process. Once you’ve finished the critical appraisal, if there are a large number of “Can’t tell” responses, consider whether the findings of the study are trustworthy and interpret the results with caution.",
    sections: [
      {
        id: "section-a",
        title: "Are the results of the study valid?",
        items: [
          { id: "section-a.1", text: "Is the Clinical Prediction Rule (CPR) clearly defined?", consider: ["is the type of patients to whom the CPR will be applied clearly defined","are the variables included in the rule clearly defined","is the outcome relevant and is it clinically reasonable (the outcome can be expressed as a probability or as a course of action)"] },
          { id: "section-a.2", text: "Did the population from which the rule was derived include an appropriate spectrum of patients?", consider: ["Is it adequate the way the patients were selected","The spectrum of patient, to whom the rule will apply, is represented well"] },
          { id: "section-a.3", text: "Was the rule validated in a different group of patients?", consider: ["it’s not good enough that the rule had a good performance on the patient group used to derive it. The rule should be validated in a different set of patients","the validation was done in a group of patients similar to the one used to derive it"] },
          { id: "section-a.4", text: "Were the predictor variables and the outcome evaluated in a blinded fashion?", consider: ["did people evaluating the outcome know the predictor variables","did people evaluating the predictor variables know the outcome"] },
          { id: "section-a.5", text: "Were the predictor variables and the outcome evaluates in the whole sample selected initially?", consider: ["are exclusions and dropouts well described and do the authors discuss the reasons for them","sometimes the outcome cannot be measured in the same way in all patients"] },
          { id: "section-a.6", text: "Are the statistical methods used to construct and validate the rule clearly described?", consider: [] },
        ],
      },
      {
        id: "section-b",
        title: "What are the results?",
        items: [
          { id: "section-b.1", text: "Can the performance of the rule be calculated?", consider: ["performance results can be presented as: Sens, Sp, +LR, -LR, ROC curve, calibration curves etc.","sensitivity = a/(a+c)","specificity = d/(b+d)","LR+ = sens/(1-sp)","LR- = (1-sens)/sp","How precise was the estimate of the treatment effect?"] },
          { id: "section-b.2", text: "(did they try to refine the rule with other variables to see whether the precision could be improved or the rule simplified?)", consider: [] },
        ],
      },
      {
        id: "section-c",
        title: "Will the results help locally?",
        items: [
          { id: "section-c.1", text: "Would the prediction rule be reliable and the results interpretable if used for your patient?", consider: ["is your setting too different from that of the study"] },
          { id: "section-c.2", text: "Is the rule acceptable in your case?", consider: ["the ease of use and the availability of the rule and the costs","if the rule is reasonable from a clinical point of view"] },
          { id: "section-c.3", text: "Would the results of the rule modify your decision about the management of the patient, or the information you can give to him/her?", consider: [] },
        ],
      },
    ],
  },
];

export function getCaspChecklist(id: string): CaspChecklist | undefined {
  return CASP_CHECKLISTS.find((c) => c.id === id);
}

export function getAllCaspItems(checklist: CaspChecklist): CaspItem[] {
  return checklist.sections.flatMap((s) => s.items);
}

