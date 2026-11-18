const runExtraction = async () => {
    const selected = papers.filter((p) => selectedPaperIds.has(p.id));
    if (selected.length === 0) {
      alert("Please select at least one paper in Step 1.");
      return;
    }
    setExtractionLoading(true);
    const assessments: Record<string, RobAssessment> = {};
    selected.forEach((p) => {
      assessments[p.id] = initRobAssessment(p.id, { studyType: p.studyType, year: p.year, title: p.title });
    });
    setRobAssessments(assessments);

    const apiKey = state.geminiApiKey || state.groqApiKey;

    // Phase 1 — local deep extraction (always runs, mirrors
    // mtwn105/decipher-research-agent multi-agent pipeline:
    //   Background → Objective → Methods → Results → Conclusions,
    // plus t0mst0ne research-gaps framework: Limitations + Exclusions + Gaps).
    // This guarantees every field is populated with detail extracted
    // from the abstract, even before any AI call.
    const localPico: ExtractedPICO[] = extractPICOForPapers(
      selected.map((p) => ({
        id: p.id,
        title: p.title,
        abstract: p.abstract || "",
        studyType: p.studyType || "",
      })),
    );

    if (!apiKey) {
      // No API key — return the deeply extracted local result.
      const fallback = selected.map((p) => {
        const pico = localPico.find((x) => x.id === p.id) || ({} as ExtractedPICO);
        const doiLink = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${p.doi}</a>` : "";
        const urlLink = p.url && !p.doi ? `<a href="${p.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
        const searchLink = p.doi ? `<a href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}" target="_blank" rel="noreferrer" class="text-blue-300 underline">[Search]</a>` : "";
        const vancouverRef = `${p.authors}. ${p.title}. ${p.journal || "Unknown journal"}. ${p.year}. ${doiLink} ${urlLink} ${searchLink}`.trim();
        return {
          id: p.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          doi: p.doi,
          studyType: p.studyType,
          population: pico.population || "Not specified",
          intervention: pico.intervention || "Not specified",
          comparison: pico.comparison || "Not specified",
          outcome: pico.outcome || "Not specified",
          sampleSize: pico.sampleSize || "Not specified",
          predictors: "Not specified — extract from full text",
          effectEstimate: pico.effectEstimate || "Not reported",
          ciLower: "Not reported",
          ciUpper: "Not reported",
          ROB: "Pending — assess in Step 3",
          vancouverReference: vancouverRef,
          researchGaps: pico.researchGaps || "Limitations: Not specified; Exclusions: Not specified; Gaps: Not specified",
          evidenceLevel: pico.evidenceLevel || "T4 mention",
        };
      });
      setExtractedData(fallback);
      setPipelineStep(3);
      setExtractionLoading(false);
      return;
    }

    // Batch-wise extraction: process papers in chunks of 5 to avoid
    // token limits and improve reliability for large paper sets.
    const BATCH_SIZE = 5;
    const allMapped: any[] = [];

    for (let batchStart = 0; batchStart < selected.length; batchStart += BATCH_SIZE) {
      const batch = selected.slice(batchStart, batchStart + BATCH_SIZE);
      const batchPico = localPico.filter((p) => batch.some((bp) => bp.id === p.id));

      const papersContext = batch
        .map(
          (p, i) =>
            `${batchStart + i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal || "Unknown journal"}. DOI: ${p.doi || "N/A"}. Type: ${p.studyType || "N/A"}. Abstract: ${p.abstract || "No abstract"}`
        )
        .join("\n\n");

      const seedContext = batchPico
        .map((pico) => {
          const paper = batch.find((p) => p.id === pico.id);
          return `${paper ? paper.title : pico.id}:
- Population (seed): ${pico.population}
- Intervention (seed): ${pico.intervention}
- Comparison (seed): ${pico.comparison}
- Outcome (seed): ${pico.outcome}
- Sample Size (seed): ${pico.sampleSize}
- Effect Estimate (seed): ${pico.effectEstimate}
- 95% CI (seed): ${pico.ci}
- Research Gaps (seed): ${pico.researchGaps}
- Evidence Level (seed): ${pico.evidenceLevel}`;
        })
        .join("\n\n");

      const prompt = `You are an expert systematic-review data-extraction researcher applying three open-source methodologies:

1. **meta-pipe** end-to-end pipeline (https://github.com/htlin222/meta-pipe) — 
   automated data extraction for meta-analysis following stages:
   ma-data-extraction → ma-meta-analysis → ma-publication-quality.
   Extract predictors, effect estimates, and confidence intervals
   using structured extraction aligned with meta-pipe schema.

2. **decipher-research-agent** deep-reasoning pipeline
   (https://github.com/mtwn105/decipher-research-agent) — multi-agent
   reasoning across five abstract sections: Background → Objective →
   Methods → Results → Conclusions. For each paper, read every
   sentence of the abstract and reason about which section it belongs
   to before extracting structured fields.

3. **Research-gaps extraction framework** by t0mst0ne
   (https://gist.github.com/t0mst0ne/f3dd82637861384e6b2ffe3c9370f4d8)
   — every research-gaps field MUST follow the format
   "Limitations: [author-acknowledged limits]; Exclusions: [reported
   exclusion criteria]; Gaps: [unanswered questions]".

## Task
For each of the ${batch.length} papers below, deeply reason over the
abstract and metadata, then refine and enrich the seed values into a
fully populated extraction. You may correct any seed that is wrong,
and you MUST add more detail where the abstract supports it. If the
abstract does not contain a value, keep the seed value or use the
literal string "Not specified — full text required."

## Papers
${papersContext}

## Seed extractions (from local deep PICO extractor)
${seedContext}

## Deep-reasoning protocol (apply per paper)
1. Read the entire abstract, sentence by sentence.
2. Classify each sentence: Background, Objective, Method, Result, Conclusion.
3. For each PICO field, ground the value in the most explicit sentence
   available. If no explicit value is present, look for synonyms
   (e.g. "subjects" = "participants"; "treatment arm" = intervention;
   "primary endpoint" = outcome).
4. For Sample Size, look for N=..., n=..., "total of X patients",
   "X participants were enrolled", subgroup sizes (intervention n=…,
   control n=…).
5. For Predictors (meta-pipe aligned), extract all predictor variables,
   risk factors, or independent variables used in the study. Include:
   - Demographic predictors (age, sex, ethnicity, socioeconomic status)
   - Clinical predictors (comorbidities, disease severity, biomarkers)
   - Behavioral predictors (smoking, diet, physical activity)
   - Environmental predictors (exposure, location, occupation)
   - Statistical predictors (covariates, confounders, effect modifiers)
   Format as comma-separated list with brief descriptions.
6. For Effect Estimate, recognise all common effect-size types:
   RR (risk ratio), OR (odds ratio), HR (hazard ratio), MD (mean
   difference), SMD, AOR, ARR, NNT, IRR, prevalence %, sensitivity %,
   specificity %, AUC. If only a percentage is reported, capture it.
7. For 95% CI, extract BOTH lower and upper bounds separately:
   - Look for "95% CI 1.2-3.4", "(95% CI: 1.2-3.4)", "95% confidence interval 1.2 to 3.4"
   - Extract ciLower as the lower bound (e.g., "1.2")
   - Extract ciUpper as the upper bound (e.g., "3.4")
   - If no CI is reported, fall back to the p-value if available.
8. For Research Gaps, scan the abstract for sentences containing
   "limitation", "exclude", "exclusion", "future", "gap", "warrant",
   "recommend", "further", "longitudinal", "replication". If absent,
   infer plausible study-design-aware gaps.
9. For Evidence Level, assign:
   T1 mechanistic (★★★) for RCTs / randomised trials;
   T2 functional (★★☆) for systematic reviews and meta-analyses;
   T3 associational (★☆☆) for cohort, case-control, cross-sectional,
   observational, qualitative;
   T4 mention (☆☆☆) for narrative review, case report/series,
   editorial, commentary, guideline.

## Required output
Return ONLY a JSON array (no markdown fences, no extra text) with one
object per paper. Each object MUST have exactly these keys:

{
  "id": "<paper id from input>",
  "title": "<paper title>",
  "authors": "<paper authors>",
  "year": <year as number>,
  "doi": "<doi or empty string>",
  "studyType": "<study type>",
  "population": "<detailed description of who was studied, demographics, setting, sample characteristics>",
  "intervention": "<detailed description of what was tested/exposed, including dose, duration, delivery if reported>",
  "comparison": "<detailed description of what it was compared against (control, placebo, standard care, etc.)>",
  "outcome": "<detailed description of the primary outcome and any key secondary outcomes, including measurement instruments>",
  "sampleSize": "<e.g. 'N=240 (intervention n=120, control n=120)' or 'N=1,247 participants' or 'Not specified — full text required.'>",
  "predictors": "<comma-separated list of all predictor variables/risk factors/independent variables used in the study, e.g. 'Age (years), Sex (male/female), BMI (kg/m²), Smoking status (current/former/never), Hypertension (yes/no), Diabetes (yes/no)'>",
  "effectEstimate": "<main effect size, e.g. 'RR = 0.72, OR = 1.45, MD = -3.2, AOR = 2.1, Prevalence = 18%' or 'Not reported in abstract — full text required.'>",
  "ciLower": "<lower bound of 95% CI as a number or range, e.g. '0.55' or '1.2' or 'Not reported in abstract — full text required.'>",
  "ciUpper": "<upper bound of 95% CI as a number or range, e.g. '0.94' or '3.4' or 'Not reported in abstract — full text required.'>",
  "ROB": "<initial risk-of-bias judgment: 'Low risk' / 'Some concerns' / 'High risk' / 'Pending — assess in Step 3'>",
  "vancouverReference": "<format: 'Authors. Title. Journal. Year. doi:DOI' — keep DOI as plain text inside the string>",
  "researchGaps": "<MUST follow t0mst0ne format: 'Limitations: [author-acknowledged limits]; Exclusions: [reported exclusion criteria]; Gaps: [unanswered questions]'>",
  "evidenceLevel": "<one of: 'T1 — Mechanistic (★★★)' / 'T2 — Functional (★★☆)' / 'T3 — Associational (★☆☆)' / 'T4 — Mention (☆☆☆)'>"
}
`;

      try {
        let text: string;
        const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: query };
        if (state.geminiApiKey) {
          text = await callGemini(state.geminiApiKey, prompt, searchOptions);
        } else if (state.groqApiKey) {
          text = await callGroq(state.groqApiKey!, prompt, searchOptions);
        } else {
          throw new Error("No API key configured. Please open Settings (gear icon).");
        }

        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsed: any[];
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
          if (!jsonMatch) throw new Error("AI returned invalid JSON. Please try again.");
          parsed = JSON.parse(jsonMatch[0]);
        }

        const mapped = parsed.map((item: any) => {
          const paper = batch.find((p) => p.id === item.id) || batch[0];
          const pico = batchPico.find((x) => x.id === paper.id) || ({} as ExtractedPICO);
          const doiLink = paper.doi ? `<a href="https://doi.org/${paper.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${paper.doi}</a>` : "";
          const urlLink = paper.url && !paper.doi ? `<a href="${paper.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
          const searchLink = paper.doi ? `<a href="https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}" target="_blank" rel="noreferrer" class="text-blue-300 underline">[Search]</a>` : "";
          const vancouverRef = `${item.authors || paper.authors}. ${item.title || paper.title}. ${paper.journal || "Unknown journal"}. ${item.year || paper.year}. ${doiLink} ${urlLink} ${searchLink}`.trim();

          const pickRich = (aiVal: string | undefined, seedVal: string | undefined, notSpecified: string) => {
            const ai = (aiVal || "").trim();
            const seed = (seedVal || "").trim();
            if (ai && ai.toLowerCase() !== "not specified" && ai.length >= seed.length * 0.5) return ai;
            if (seed) return seed;
            return notSpecified;
          };

          let ciLower = item.ciLower || "Not reported in abstract — full text required.";
          let ciUpper = item.ciUpper || "Not reported in abstract — full text required.";
          if (item.ci && !item.ciLower && !item.ciUpper) {
            const ciMatch = item.ci.match(/([\d.]+)\s*[-–to]+\s*([\d.]+)/);
            if (ciMatch) {
              ciLower = ciMatch[1];
              ciUpper = ciMatch[2];
            }
          }

          return {
            id: item.id || paper.id,
            title: item.title || paper.title,
            authors: item.authors || paper.authors,
            year: item.year || paper.year,
            doi: item.doi || paper.doi,
            studyType: item.studyType || paper.studyType,
            population: pickRich(item.population, pico.population, "Not specified — full text required."),
            intervention: pickRich(item.intervention, pico.intervention, "Not specified — full text required."),
            comparison: pickRich(item.comparison, pico.comparison, "Not specified — full text required."),
            outcome: pickRich(item.outcome, pico.outcome, "Not specified — full text required."),
            sampleSize: pickRich(item.sampleSize, pico.sampleSize, "Not specified — full text required."),
            predictors: item.predictors || "Not specified — extract from full text",
            effectEstimate: pickRich(item.effectEstimate, pico.effectEstimate, "Not reported in abstract — full text required."),
            ciLower: ciLower,
            ciUpper: ciUpper,
            ROB: item.ROB || "Pending — assess in Step 3",
            vancouverReference: vancouverRef,
            researchGaps: pickRich(item.researchGaps, pico.researchGaps, "Limitations: Not specified; Exclusions: Not specified; Gaps: Not specified"),
            evidenceLevel: item.evidenceLevel || pico.evidenceLevel || "T4 — Mention (☆☆☆)",
          };
        });

        allMapped.push(...mapped);
      } catch (err: any) {
        // Fallback for this batch
        const fallback = batch.map((p) => {
          const pico = batchPico.find((x) => x.id === p.id) || ({} as ExtractedPICO);
          const doiLink = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">doi:${p.doi}</a>` : "";
          const urlLink = p.url && !p.doi ? `<a href="${p.url}" target="_blank" rel="noreferrer" class="text-yellow-300 underline">Link</a>` : "";
          const searchLink = p.doi ? `<a href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}" target="_blank" rel="noreferrer" class="text-blue-300 underline">[Search]</a>` : "";
          const vancouverRef = `${p.authors}. ${p.title}. ${p.journal || "Unknown journal"}. ${p.year}. ${doiLink} ${urlLink} ${searchLink}`.trim();
          return {
            id: p.id,
            title: p.title,
            authors: p.authors,
            year: p.year,
            doi: p.doi,
            studyType: p.studyType,
            population: pico.population || "Not specified",
            intervention: pico.intervention || "Not specified",
            comparison: pico.comparison || "Not specified",
            outcome: pico.outcome || "Not specified",
            sampleSize: pico.sampleSize || "Not specified",
            predictors: "Not specified — extract from full text",
            effectEstimate: pico.effectEstimate || "Not reported",
            ciLower: "Not reported",
            ciUpper: "Not reported",
            ROB: "Pending — assess in Step 3",
            vancouverReference: vancouverRef,
            researchGaps: pico.researchGaps || "Limitations: Not specified; Exclusions: Not specified; Gaps: Not specified",
            evidenceLevel: pico.evidenceLevel || "T4 mention",
          };
        });
        allMapped.push(...fallback);
      }

      // Small delay between batches to respect rate limits
      if (batchStart + BATCH_SIZE < selected.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setExtractedData(allMapped);
    setPipelineStep(3);
    setExtractionLoading(false);
  };