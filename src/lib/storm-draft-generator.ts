export interface StormPerspective {
  perspective: string;
  description: string;
  keyQuestions: string[];
}

export interface StormOutline {
  perspectives: StormPerspective[];
  sections: {
    title: string;
    subsections: string[];
    perspective: string;
  }[];
  sources: {
    title: string;
    authors: string;
    year: number;
    keyFindings: string;
  }[];
}

export function buildSTORMOutlinePrompt({
  topic,
  reviewType,
  papers,
  extractedData,
  synthesisOutput,
  effectSizes,
  robAssessments,
  prismaCounts,
  query,
}: {
  topic: string;
  reviewType: string;
  papers: { id: string; title: string; authors: string; year: number; studyType?: string; outcome?: string; abstract?: string }[];
  extractedData: any[];
  synthesisOutput: string;
  effectSizes: { study: string; effect: string; ci: string; weight: string }[];
  robAssessments: Record<string, any>;
  prismaCounts: { identification: number; deduped: number; screened: number; excluded: number; assessed: number; included: number };
  query: string;
}): string {
  const paperSummaries = papers.map((p) => "- " + p.title + " (" + p.authors + ", " + p.year + ")").join("\n");
  const extractedSummaries = extractedData.map((d) => "- " + d.title + ": " + (d.population || "N/A") + " | " + (d.intervention || "N/A") + " | " + (d.outcome || "N/A") + " | " + (d.studyType || "N/A")).join("\n");
  const robSummary = Object.entries(robAssessments).map(([id, a]) => "- " + id + ": " + (a.overall || "Pending")).join("\n");

  let prompt = "You are STORM (Synthesis of Topic Outlines through Research and Multi-perspective Questioning), an advanced research paper drafting engine inspired by https://github.com/stanford-oval/storm.\n\n";
  prompt += "## Task\n";
  prompt += "Generate a complete, publication-ready research-paper draft for a " + reviewType.toLowerCase() + " on: \"" + (topic || query || "the research topic") + "\".\n\n";
  prompt += "Follow the STORM methodology:\n";
  prompt += "1. **Perspective-Seeking**: Identify 3-5 distinct expert perspectives on this topic\n";
  prompt += "2. **Information-Gathering**: Use the provided study data as your evidence base\n";
  prompt += "3. **Outline-Generation**: Create a structured academic outline\n";
  prompt += "4. **Drafting**: Write each section with academic tone and rigor\n";
  prompt += "5. **Self-Review**: Ensure internal consistency, proper citations, and completeness\n\n";
  prompt += "## Source Data (from prior pipeline steps)\n\n";
  prompt += "### Studies Included (" + papers.length + " papers)\n";
  prompt += paperSummaries + "\n\n";
  prompt += "### Extracted Data (" + extractedData.length + " studies)\n";
  prompt += extractedSummaries + "\n\n";
  prompt += "### Evidence Synthesis\n";
  prompt += (synthesisOutput || "No synthesis generated yet. Use the study data above to build synthesis.") + "\n\n";
  prompt += "### Effect Sizes (" + effectSizes.length + " entries)\n";
  prompt += effectSizes.map((e) => "- " + e.study + ": " + e.effect + " (" + e.ci + ")").join("\n") + "\n\n";
  prompt += "### Risk of Bias Summary\n";
  prompt += (robSummary || "Pending assessment") + "\n\n";
  prompt += "### PRISMA 2020 Flow\n";
  prompt += "- Identification: " + prismaCounts.identification + " records\n";
  prompt += "- Deduplication: " + prismaCounts.deduped + " records\n";
  prompt += "- Screening: " + prismaCounts.screened + " records\n";
  prompt += "- Excluded after screening: " + prismaCounts.excluded + "\n";
  prompt += "- Assessed for eligibility: " + prismaCounts.assessed + "\n";
  prompt += "- Included in review: " + prismaCounts.included + "\n\n";
  prompt += "## Output Requirements\n\n";
  prompt += "Generate a FULL research-paper draft in Markdown with these sections:\n\n";
  prompt += "1. **Title Page** - Title (descriptive), authors (anonymous), affiliations, corresponding author, date\n";
  prompt += "2. **Abstract** - Structured abstract (Background, Objectives, Methods, Results, Conclusions) <= 250 words\n";
  prompt += "3. **Introduction** - Context, rationale, objectives, PRISMA 2020 compliance note\n";
  prompt += "4. **Methods** - Eligibility criteria, information sources, search strategy, screening, data extraction, risk-of-bias assessment, synthesis methods, PRISMA 2020 adherence\n";
  prompt += "5. **Results** - Study selection (PRISMA flow), study characteristics, risk-of-bias results, synthesis of results, meta-analysis (if applicable)\n";
  prompt += "6. **Discussion** - Summary of evidence, limitations, implications\n";
  prompt += "7. **Conclusion** - Key findings and recommendations\n";
  prompt += "8. **References** - Vancouver style (cite only the included studies from above)\n";
  prompt += "9. **Self-Review Checklist** - PRISMA 2020 item coverage summary\n\n";
  prompt += "## STORM Methodology Notes\n";
  prompt += "- Use multi-perspective reasoning: consider methodological, clinical, epidemiological, statistical, and policy perspectives\n";
  prompt += "- Ground every claim in the provided study data\n";
  prompt += "- Apply STORM's iterative outline refinement: start broad, then drill into specifics\n";
  prompt += "- Maintain academic tone, precision, and transparency\n";
  prompt += "- Do NOT fabricate data; use only what is provided above\n";
  prompt += "- Ensure all citations reference the actual studies listed\n";
  prompt += "- Include proper uncertainty quantification where effect sizes are provided\n";
  return prompt;
}

export function buildSTORMOutlineDraftPrompt({
  outline,
  topic,
  reviewType,
  papers,
  extractedData,
  synthesisOutput,
  effectSizes,
  robAssessments,
}: {
  outline: string;
  topic: string;
  reviewType: string;
  papers: { id: string; title: string; authors: string; year: number; studyType?: string; outcome?: string }[];
  extractedData: any[];
  synthesisOutput: string;
  effectSizes: { study: string; effect: string; ci: string; weight: string }[];
  robAssessments: Record<string, any>;
}): string {
  const paperSummaries = papers.map((p) => "- " + p.title + " (" + p.authors + ", " + p.year + ")").join("\n");

  let prompt = "You are STORM (Synthesis of Topic Outlines through Research and Multi-perspective Questioning).\n\n";
  prompt += "## Research Outline\n" + outline + "\n\n";
  prompt += "## Source Data\n";
  prompt += "### Included Studies\n" + paperSummaries + "\n\n";
  prompt += "### Extracted Data\n" + extractedData.map((d) => "- " + d.title + ": " + (d.population || "N/A") + " | " + (d.intervention || "N/A") + " | " + (d.outcome || "N/A") + " | " + (d.studyType || "N/A")).join("\n") + "\n\n";
  prompt += "### Synthesis\n" + (synthesisOutput || "Use study data to build narrative.") + "\n\n";
  prompt += "### Effect Sizes\n" + effectSizes.map((e) => "- " + e.study + ": " + e.effect + " (" + e.ci + ")").join("\n") + "\n\n";
  prompt += "## Task\n";
  prompt += "Write a complete, publication-ready research-paper draft for a " + reviewType.toLowerCase() + " on: \"" + topic + "\".\n\n";
  prompt += "Follow the outline above exactly. Write in formal academic style. Use Vancouver citations for all included studies. Ground every claim in the provided data.\n\n";
  prompt += "Output the FULL draft in Markdown with these sections:\n";
  prompt += "1. **Title Page** - Title, authors (anonymous), affiliations, date\n";
  prompt += "2. **Abstract** - Structured (Background, Objectives, Methods, Results, Conclusions) <= 250 words\n";
  prompt += "3. **Introduction** - Context, rationale, objectives\n";
  prompt += "4. **Methods** - Eligibility criteria, information sources, search strategy, screening, data extraction, risk-of-bias assessment, synthesis methods\n";
  prompt += "5. **Results** - Study selection, characteristics, risk of bias, synthesis, meta-analysis (if applicable)\n";
  prompt += "6. **Discussion** - Summary, limitations, implications\n";
  prompt += "7. **Conclusion** - Key findings and recommendations\n";
  prompt += "8. **References** - Vancouver style (cite only included studies)\n";
  prompt += "9. **Self-Review Checklist** - PRISMA 2020 item coverage\n";
  return prompt;
}

export function buildSTORMReviewPrompt({
  draft,
  topic,
}: {
  draft: string;
  topic: string;
}): string {
  let prompt = "You are a senior academic reviewer using the STORM (Synthesis of Topic Outlines through Research and Multi-perspective Questioning) self-review methodology.\n\n";
  prompt += "## Manuscript to Review\n";
  prompt += "Topic: " + topic + "\n\n";
  prompt += draft + "\n\n";
  prompt += "## STORM Self-Review Checklist\n";
  prompt += "Review this draft against the following criteria:\n\n";
  prompt += "### Structure & Completeness\n";
  prompt += "- [ ] Title page complete with all required fields\n";
  prompt += "- [ ] Structured abstract <= 250 words\n";
  prompt += "- [ ] Introduction provides adequate context and clearly states objectives\n";
  prompt += "- [ ] Methods section is reproducible (eligibility, sources, search, screening, extraction, RoB, synthesis)\n";
  prompt += "- [ ] Results section reports PRISMA flow, characteristics, RoB, synthesis\n";
  prompt += "- [ ] Discussion addresses limitations and implications\n";
  prompt += "- [ ] Conclusion summarizes key findings\n";
  prompt += "- [ ] References formatted in Vancouver style\n";
  prompt += "- [ ] PRISMA 2020 checklist coverage noted\n\n";
  prompt += "### Academic Quality\n";
  prompt += "- [ ] Formal academic tone throughout\n";
  prompt += "- [ ] No unsupported claims (all claims grounded in data)\n";
  prompt += "- [ ] Appropriate use of hedging language\n";
  prompt += "- [ ] Logical flow between sections\n";
  prompt += "- [ ] No redundancy or repetition\n\n";
  prompt += "### Data Integrity\n";
  prompt += "- [ ] Effect sizes correctly reported\n";
  prompt += "- [ ] Risk-of-bias judgments accurately reflected\n";
  prompt += "- [ ] PRISMA counts consistent\n";
  prompt += "- [ ] All included studies cited in references\n\n";
  prompt += "### STORM Methodology\n";
  prompt += "- [ ] Multi-perspective reasoning evident\n";
  prompt += "- [ ] Evidence synthesis integrated smoothly\n";
  prompt += "- [ ] Knowledge gaps identified\n\n";
  prompt += "Output your review as a structured Markdown document:\n";
  prompt += "1. Summary assessment\n";
  prompt += "2. Critical issues (must fix)\n";
  prompt += "3. Important issues (should fix)\n";
  prompt += "4. Minor issues (nice to fix)\n";
  prompt += "5. Overall score: 1-10\n";
  return prompt;
}
