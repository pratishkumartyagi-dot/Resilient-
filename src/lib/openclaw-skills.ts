export const OPENCLAW_SKILLS = {
  "literature-review": {
    name: "literature-review",
    description: "Conduct comprehensive, systematic literature reviews using multiple academic databases. Produces professionally formatted documents with verified citations.",
    workflow: [
      "Phase 1 — Planning/Scoping: Define research question using PICO framework. Establish scope, objectives, and inclusion/exclusion criteria. Develop search strategy with 2-4 main concepts, synonyms, Boolean operators. Select minimum 3 complementary databases.",
      "Phase 2 — Systematic Literature Search: Search multiple databases (PubMed, arXiv, bioRxiv, Semantic Scholar, etc.). Document search parameters (date searched, date range, search string, results). Export and aggregate results.",
      "Phase 3 — Screening and Selection: Deduplicate by DOI/title. Title screening → Abstract screening → Full-text screening. Create PRISMA flow diagram.",
      "Phase 4 — Data Extraction and Quality Assessment: Extract key data (metadata, methods, sample size, findings, limitations). Assess study quality using Cochrane RoB for RCTs, Newcastle-Ottawa for observational, AMSTAR 2 for reviews.",
      "Phase 5 — Synthesis and Analysis: Group findings thematically (NOT study-by-study). Compare and contrast approaches. Identify consensus and controversies. Highlight strongest evidence.",
      "Phase 6 — Citation Verification: Verify all DOIs with verify_citations.py. Format citations consistently (APA, Nature, Vancouver).",
      "Phase 7 — Document Generation: Generate PDF with proper formatting. Include PRISMA flow diagram, search methodology, quality assessment.",
    ],
    rules: [
      "Always search multiple databases (minimum 3)",
      "Document search strings, dates, and result counts for reproducibility",
      "Organize results thematically, not study-by-study",
      "Verify all citations before finalizing",
      "Include PRISMA flow diagram for systematic reviews",
      "Assess study quality and report limitations honestly",
    ],
  },
  "scientific-writing": {
    name: "scientific-writing",
    description: "Write scientific manuscripts using IMRAD structure with citations and reporting guidelines (CONSORT/STROBE/PRISMA).",
    workflow: [
      "Stage 1: Create section outlines with key points using research-lookup",
      "Stage 2: Convert outlines into complete paragraphs with flowing prose",
      "Abstract: Concise standalone summary (100-250 words) capturing purpose, methods, results, conclusions",
      "Introduction: Establish research context, identify gaps, state objectives",
      "Methods: Detail study design, populations, procedures, analysis approaches — ensure reproducibility",
      "Results: Present findings objectively with logical flow from primary to secondary outcomes",
      "Discussion: Synthesize findings, compare with existing literature, acknowledge limitations, propose future directions",
      "Conclusion: Concise take-home messages and recommendations",
      "References: Vancouver-style numbered citations [1], [2], arranged in order of appearance",
    ],
    rules: [
      "CRITICAL: Never use bullet points in the final manuscript — write full paragraphs only",
      "Use active voice when appropriate for clarity",
      "Report exact values with appropriate precision",
      "Present results without bias — acknowledge conflicting evidence",
      "Ensure every section flows as connected prose",
      "Lists are only acceptable in Methods (inclusion/exclusion criteria, materials lists)",
      "Use reporting guidelines: CONSORT for RCTs, STROBE for observational, PRISMA for reviews",
      "Define abbreviations at first use",
      "Verify all citations against original sources",
    ],
  },
  "clinical-decision-support": {
    name: "clinical-decision-support",
    description: "Generate professional clinical decision support documents including patient cohort analyses and treatment recommendation reports with GRADE evidence grading.",
    workflow: [
      "Patient Cohort Analysis: Biomarker-stratified group analyses with statistical outcome comparisons",
      "Treatment Recommendation Reports: Evidence-based clinical guidelines with GRADE grading and decision algorithms",
      "Apply GRADE system: 1A (strong recommendation, high-quality evidence), 1B (strong, moderate), 2A (weak, high), 2B (weak, moderate), 2C (weak, low)",
      "Generate forest plots for subgroup analyses",
      "Create Kaplan-Meier survival curves with log-rank tests",
      "Document hazard ratios, p-values, confidence intervals",
    ],
    rules: [
      "Always include executive summary on page 1 with 3-5 colored key-finding boxes",
      "Grade every recommendation using GRADE system (1A/1B/2A/2B/2C)",
      "Include forest plots for subgroup analyses",
      "State quality of evidence (high/moderate/low/very low) for each finding",
      "Use Cochrane RoB for risk of bias assessment",
      "Link specific biomarkers to therapy recommendations",
      "Include decision algorithm flowcharts for treatment sequencing",
      "Follow PRISMA 2020 for systematic reviews",
    ],
  },
};

export type OpenClawSkillId = keyof typeof OPENCLAW_SKILLS;

export function getOpenClawSkillBrief(skillId: OpenClawSkillId): string {
  const skill = OPENCLAW_SKILLS[skillId];
  if (!skill) return "";
  return `## OpenClaw Medical Skill: ${skill.name}\n\n${skill.description}\n\n### Workflow\n${skill.workflow.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n### Key Rules\n${skill.rules.map((rule) => `- ${rule}`).join("\n")}`;
}

export function getOpenClawSkillsBrief(skillIds: OpenClawSkillId[]): string {
  return skillIds.map((id) => getOpenClawSkillBrief(id)).filter(Boolean).join("\n\n");
}
