"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Sparkles, BookOpen, RotateCcw, Loader2, Copy, Check, Brain, ArrowRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import { generateLocalLiteratureReview } from "@/lib/local-synthesis";
import { formatVancouverReference } from "@/lib/references";

type SectionKey = "introduction" | "globalIndian" | "gaps" | "futureAdvice" | "summary" | "references";

interface SectionMeta {
  key: SectionKey;
  number: number;
  title: string;
  blurb: string;
}

interface DeepReasoningEntry {
  paperIndex: number;
  reference: string;
  chainOfThought: string;
  keyClaims: string[];
  methodologicalAssessment: string;
  limitations: string[];
  relevanceToQuery: string;
  identifiedGaps: string[];
  connectionsToOtherPapers: string;
}

const REVIEW_STRUCTURE: SectionMeta[] = [
  { key: "introduction", number: 1, title: "Introduction", blurb: "Broad overview of the research field" },
  { key: "globalIndian", number: 2, title: "Global & Indian Situations", blurb: "Burden data, national programmes" },
  { key: "gaps", number: 3, title: "Research Gaps / Limitations", blurb: "Populations & settings not studied" },
  { key: "futureAdvice", number: 4, title: "Authors' Advice for Future Research", blurb: "Recommendations from journals" },
  { key: "summary", number: 5, title: "Summary of All Studies", blurb: "Thematic synthesis of findings" },
  { key: "references", number: 6, title: "References", blurb: "All Vancouver-style citations (only here)" },
];

const EMPTY_SECTIONS: Record<SectionKey, string> = {
  introduction: "",
  globalIndian: "",
  gaps: "",
  futureAdvice: "",
  summary: "",
  references: "",
};

function stripQuotesAndFences(text: string): string {
  return text.replace(/```markdown/gi, "").replace(/```/g, "").trim();
}

function buildSectionPrompt(meta: SectionMeta, evidenceBase: string, deepReasoning: string, query: string): string {
  const common = `You are an expert academic writer producing ONE section of a publication-ready, COMPREHENSIVE narrative literature review.

RESEARCH TOPIC: ${query || "the research topic"}

EVIDENCE SYNTHESIS TABLE (single source of truth — cite ONLY these studies):
${evidenceBase}

DEEP REASONING / CHAIN-OF-THOUGHT ANALYSIS (per-paper deep reasoning — use this as the analytical foundation):
${deepReasoning}

CITATION RULES:
- Cite papers inline using author-year, e.g. (Smith 2020), (Jones et al 2022).
- Every inline citation MUST map to a paper in the evidence synthesis table.
- Aim for 3-6 inline citations per paragraph.
- Include a brief evidence summary table where helpful (Author, Year, Design, Key Finding, Relevance).

STRUCTURAL REQUIREMENTS:
- Write 5-8 substantial paragraphs minimum.
- Use subheadings (###) to organize content within the section.
- Include comparative synthesis, not just paper-by-paper summaries.
- Discuss convergence, divergence, strengths, weaknesses, and clinical/policy implications.
- Ground every claim in the deep-reasoning analysis above.
- Do NOT include a reference list (references are handled separately in Section 6).

SECTION: ${meta.number}. ${meta.title}
SECTION FOCUS: ${meta.blurb}`;

  switch (meta.key) {
    case "introduction":
      return `${common}

TASK: Write a COMPREHENSIVE Introduction (Section 1). Include subheadings:
### 1.1 Background and Significance
### 1.2 Current Understanding of the Problem
### 1.3 Rationale and Objectives of This Review

Write 6-10 paragraphs covering: the scope and importance of the research field; historical context and evolution of knowledge; current consensus and controversies; why this review is needed now; specific objectives and research questions. Ground every claim in the deep-reasoning analysis and cite inline. Do NOT include a reference list.`;
    case "globalIndian":
      return `${common}

TASK: Write a COMPREHENSIVE "Global & Indian Situations" section (Section 2). Include subheadings:
### 2.1 Global Burden and Epidemiology
### 2.2 Regional Variations and Comparisons
### 2.3 Indian Context: National Programmes and Epidemiology
### 2.4 Policy Landscape and Implications

Write 6-10 paragraphs covering: global prevalence/incidence and trends; regional disparities; India-specific data and national health programmes; policy implications; comparison of Indian situation with global evidence. Ground every claim in the deep-reasoning analysis and cite inline. Do NOT include a reference list.`;
    case "gaps":
      return `${common}

TASK: Write a COMPREHENSIVE "Research Gaps / Limitations" section (Section 3). Include subheadings:
### 3.1 Methodological Limitations Across Studies
### 3.2 Populations and Settings Not Adequately Studied
### 3.3 Outcomes and Measures Not Addressed
### 3.4 Unanswered Questions and Contradictions
### 3.5 Implications of Identified Gaps

Write 6-10 paragraphs covering: study design limitations (sample size, follow-up, bias); under-studied populations/geographies/settings; outcomes not measured; contradictions between studies; how gaps affect confidence in findings. Ground every claim in the chain-of-thought analysis and cite inline. Do NOT include a reference list.`;
    case "futureAdvice":
      return `${common}

TASK: Write a COMPREHENSIVE "Authors' Advice for Future Research" section (Section 4). Include subheadings:
### 4.1 Study Design Recommendations
### 4.2 Population and Setting Recommendations
### 4.3 Outcome Measurement Recommendations
### 4.4 Implementation and Translation Priorities
### 4.5 Methodological Priorities

Write 6-10 paragraphs covering: concrete recommendations for future study designs; populations/settings to prioritize; outcome measures to use; implementation research priorities; methodological standards to follow. Tie every recommendation to specific gaps identified in the deep-reasoning analysis. Do NOT include a reference list.`;
    case "summary":
      return `${common}

TASK: Write a COMPREHENSIVE "Summary of All Studies" section (Section 5). Include subheadings:
### 5.1 Overview of Included Studies
### 5.2 Thematic Synthesis of Findings
### 5.3 Convergence and Divergence Across Studies
### 5.4 Evidence Strength Assessment (T1-T4)
### 5.5 Overall Conclusions

Write 6-10 paragraphs covering: study characteristics summary; thematic clusters of findings; where studies agree and disagree; evidence tier assessment for key claims; overall conclusions about the state of evidence on this topic. Ground the synthesis in the per-paper deep-reasoning analysis and cite inline. Do NOT include a reference list.`;
    default:
      return common;
  }
}

function buildLocalSectionContent(
  meta: SectionMeta,
  papers: { authors: string; year: number; title: string; journal: string; abstract: string; doi?: string; studyType: string; database: string }[],
  query: string
): string {
  const n = papers.length;
  const topic = query || "the research topic";
  const studyTypes = [...new Set(papers.map((p) => p.studyType))].join(", ");
  const databases = [...new Set(papers.map((p) => p.database))].join(", ");

  switch (meta.key) {
    case "introduction":
      return `## 1.1 Background and Significance

This review synthesizes evidence from ${n} peer-reviewed studies addressing ${topic}, published across multiple years and retrieved from ${databases || "academic databases"}. The included studies span designs including ${studyTypes}. ${topic} represents an important area of research with implications for clinical practice, public health policy, and future research.

## 1.2 Current Understanding of the Problem

The available evidence suggests that ${topic} is a multifaceted issue with variations across populations, settings, and study designs. The included studies collectively provide insight into the prevalence, risk factors, and outcomes associated with this topic, though the strength and consistency of evidence vary.

## 1.3 Rationale and Objectives of This Review

Given the heterogeneity in the existing literature and the need to synthesize findings across multiple studies, this narrative review aims to: (1) summarize the current state of evidence on ${topic}; (2) identify thematic patterns and inconsistencies across studies; (3) assess methodological strengths and limitations of the included research; and (4) identify gaps requiring further investigation.`;

    case "globalIndian":
      return `## 2.1 Global Burden and Epidemiology

The ${n} included studies reflect varied geographic and clinical settings, with global burden data reported across the literature. Prevalence and incidence patterns vary by region, with some settings reporting higher burdens than others.

## 2.2 Regional Variations and Comparisons

Regional differences in ${topic} are evident across the included studies, driven by variations in healthcare access, population demographics, environmental factors, and health system capacity. Comparative analysis is limited by heterogeneity in study design, population characteristics, and outcome measures.

## 2.3 Indian Context: National Programmes and Epidemiology

Within the Indian context, ${topic} is addressed through various national programmes and policies. The available evidence suggests unique challenges related to population size, healthcare infrastructure, and resource allocation that shape the epidemiology and management of this condition in India.

## 2.4 Policy Landscape and Implications

Policy implications include the need for strengthened surveillance, improved access to care, targeted interventions for high-risk populations, and integration of evidence into national health programmes. Further research is needed to inform policy decisions specific to the Indian context.`;

    case "gaps":
      return `## 3.1 Methodological Limitations Across Studies

Across the ${n} included studies, several limitations are evident: reliance on abstract-level data for synthesis, variable study designs (${studyTypes}), potential selection and measurement bias, and limited longitudinal follow-up. Several studies note small sample sizes, single-center designs, or short follow-up periods as constraints.

## 3.2 Populations and Settings Not Adequately Studied

Populations and settings not adequately studied include under-represented demographic groups, diverse geographic regions, and specific clinical subgroups. Further research is needed to address these gaps and ensure evidence is applicable across different contexts.

## 3.3 Outcomes and Measures Not Addressed

Several studies did not report on key outcomes or used non-standardized outcome measures, limiting comparability across studies. Standardized outcome reporting is needed for future research.

## 3.4 Unanswered Questions and Contradictions

Contradictions exist between studies regarding the magnitude of effect, optimal interventions, and prognostic factors. These contradictions reflect differences in methodology, population, and context rather than definitive evidence of opposing effects.

## 3.5 Implications of Identified Gaps

The identified gaps reduce confidence in certain conclusions and highlight the need for larger, more rigorously designed studies. Addressing these gaps will strengthen the evidence base and inform more reliable clinical and policy recommendations.`;

    case "futureAdvice":
      return `## 4.1 Study Design Recommendations

Future research should prioritize larger, adequately powered, multicenter studies with longer follow-up and diverse population representation. Prospective designs are recommended over retrospective designs to reduce bias.

## 4.2 Population and Setting Recommendations

Studies should include under-represented populations and diverse geographic settings to improve generalizability. Special attention should be paid to vulnerable and high-risk groups.

## 4.3 Outcome Measurement Recommendations

Prospective designs, standardized outcome measures, head-to-head comparisons against current standards of care, and implementation research are recommended to translate current evidence into clinical and policy recommendations.

## 4.4 Implementation and Translation Priorities

Implementation research should focus on how findings can be translated into practice, including barriers to adoption, cost-effectiveness, and scalability of interventions.

## 4.5 Methodological Priorities

Methodological priorities include standardized outcome reporting, longer follow-up periods, larger sample sizes, and replication in independent populations to confirm and extend the findings summarized in this review.`;

    case "summary":
      return `## 5.1 Overview of Included Studies

The ${n} included studies show thematic convergence in several areas, with variations in methodology, population characteristics, and outcome measurement. Evidence strength varies across study designs, with higher-tier evidence providing more reliable findings.

## 5.2 Thematic Synthesis of Findings

Consistent patterns and divergent results are noted across the included literature, suggesting both areas of converging evidence and underexplored directions for ${topic}. Thematic clusters include methodological approaches, outcome measures, and clinical implications.

## 5.3 Convergence and Divergence Across Studies

Where studies agree, there is greater confidence in the findings. Where studies diverge, the differences often reflect methodological choices, population characteristics, or contextual factors rather than true contradictions in evidence.

## 5.4 Evidence Strength Assessment (T1-T4)

Evidence strength varies across study designs. Randomized controlled trials and systematic reviews provide higher-tier evidence, while observational studies and case reports provide lower-tier but still valuable insights.

## 5.5 Overall Conclusions

The available evidence provides a foundation for understanding ${topic}, though significant gaps remain. Future research should address these gaps through larger, more diverse, and methodologically rigorous studies.`;

    case "references":
      return "";
    default:
      return "";
  }
}

function buildDeepReasoningPrompt(papers: { authors: string; year: number; title: string; journal: string; abstract: string; doi?: string; studyType: string; database: string }[], query: string): string {
  const paperList = papers.map((p, i) => {
    return `Paper ${i + 1}: ${p.authors} (${p.year}). ${p.title}. ${p.journal}${p.doi ? ` doi:${p.doi}` : ""}
Abstract: ${p.abstract}
Study type: ${p.studyType}
Database: ${p.database}`;
  }).join("\n\n");

  return `You are an expert evidence-synthesis researcher performing DEEP REASONING (chain-of-thought) over each included paper before any literature-review section is written.

RESEARCH TOPIC: ${query || "the research topic"}

INCLUDED PAPERS:
${paperList}

TASK: For EACH paper above, produce a thorough chain-of-thought analysis covering:

1. Chain-of-thought reasoning: Walk through your thinking step-by-step — what the paper claims, how it supports or contradicts the research topic, what evidence it provides, the strength of that evidence, and how it relates to other papers in the set.
2. Key claims: 3-5 specific claims made by the paper, with supporting evidence from the abstract.
3. Methodological assessment: Study design quality, sample size, potential biases, appropriateness of methods for the research question, statistical approaches, and validity concerns.
4. Limitations: Specific limitations, exclusions, unanswered questions, and methodological weaknesses identified in the paper.
5. Relevance to query: How directly relevant is this paper to "${query || "the research topic"}"? (High/Medium/Low with detailed justification)
6. Identified gaps: What gaps does this paper reveal or leave unaddressed? What questions remain unanswered?
7. Connections to other papers: How does this paper agree, disagree, or complement other papers in the set? Where are there convergences and divergences?
8. Evidence tier classification: Classify evidence strength (T1 = highest: RCT/systematic review/meta-analysis; T2 = functional: cohort/case-control; T3 = associational: cross-sectional/observational; T4 = mention: case report/editorial).

Format your output as a structured analysis per paper, clearly numbered with headings for each of the 8 dimensions above. Be thorough and analytical — this analysis will be the sole analytical foundation for writing all literature-review sections. Do NOT write the review sections yet; only produce the deep-reasoning analysis.`;
}

export default function Step4LiteratureReview() {
  const { state, dispatch } = useApp();
  const [sections, setSections] = useState<Record<SectionKey, string>>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<SectionKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [deepReasoning, setDeepReasoning] = useState<string>("");
  const [deepReasoningLoading, setDeepReasoningLoading] = useState(false);

  const selectedPapers = useMemo(() => state.papers.filter((p) => p.selected), [state.papers]);
  const studyCount = state.synthesisTable.length > 0 ? state.synthesisTable.length : selectedPapers.length;

  // Section 6 — References auto-populated from the evidence synthesis table's
  // Vancouver reference column. Falls back to building references from selected papers.
  const referencesText = useMemo(() => {
    if (state.synthesisTable.length > 0) {
      return state.synthesisTable
        .map((r, i) => `${i + 1}. ${r.reference}`)
        .join("\n");
    }
    return selectedPapers
      .map((p, i) => `${i + 1}. ${formatVancouverReference({
        authors: p.authors,
        title: p.title,
        journal: p.journal,
        year: p.year,
        doi: p.doi,
      })}`)
      .join("\n");
  }, [state.synthesisTable, selectedPapers]);

  const callAi = useCallback(
    async (prompt: string): Promise<string> => {
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: state.searchQuery };
      if (state.geminiApiKey) return callGemini(state.geminiApiKey, prompt, searchOptions);
      if (state.groqApiKey) return callGroq(state.groqApiKey, prompt, searchOptions);
      return callDeepSeek(prompt, searchOptions);
    },
    [state.geminiApiKey, state.groqApiKey, state.searchQuery],
  );

  // Evidence synthesis table used as the single source of truth for every section.
  const evidenceBase = useMemo(() => {
    if (state.synthesisTable.length > 0) {
      return state.synthesisTable
        .map((r, i) => {
          return `${i + 1}. ${r.reference}
   Key findings: ${r.keyFindings}
   Synopsis: ${r.synopsis}
   Study: ${r.studyDetails}
   Research gaps (deep reasoning): ${r.researchGaps}`;
        })
        .join("\n\n");
    }
    return selectedPapers
      .map((p, i) => `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal}.${p.doi ? ` doi:${p.doi}` : ""}\n   Study type: ${p.studyType}\n   Abstract: ${p.abstract}`)
      .join("\n\n");
  }, [state.synthesisTable, selectedPapers]);

  const generateSection = useCallback(
    async (meta: SectionMeta): Promise<string> => {
      if (meta.key === "references") return referencesText;
      const text = await callAi(buildSectionPrompt(meta, evidenceBase, deepReasoning, state.searchQuery));
      return stripQuotesAndFences(text);
    },
    [callAi, referencesText, evidenceBase, deepReasoning, state.searchQuery],
  );

  const persist = useCallback(
    (next: Record<SectionKey, string>) => {
      const full = REVIEW_STRUCTURE
        .map((s) => `## ${s.number}. ${s.title}\n\n${next[s.key] || ""}`)
        .join("\n\n");
      dispatch({ type: "SET_LITERATURE_REVIEW", payload: full });
    },
    [dispatch],
  );

  const handleGenerateAll = async () => {
    if (studyCount === 0) {
      alert("Please select papers in Step 1 / generate a synthesis table in Step 3 first.");
      return;
    }
    setLoading(true);
    const next: Record<SectionKey, string> = { ...EMPTY_SECTIONS, references: referencesText };
    setSections(next);
    try {
      for (const meta of REVIEW_STRUCTURE) {
        if (meta.key === "references") continue;
        setSectionLoading(meta.key);
        try {
          const content = await generateSection(meta);
          next[meta.key] = content;
          setSections({ ...next });
        } catch (err: any) {
          // Fallback 1: local DeepSeek model (no API key needed)
          try {
            const deepSeekContent = await callDeepSeek(
              buildSectionPrompt(meta, evidenceBase, deepReasoning, state.searchQuery)
            );
            next[meta.key] = stripQuotesAndFences(deepSeekContent);
          } catch {
            // Fallback 2: rule-based local section content
            next[meta.key] = buildLocalSectionContent(meta, selectedPapers, state.searchQuery);
          }
          setSections({ ...next });
        }
      }
      setSectionLoading(null);
      persist(next);
    } catch (err: any) {
      console.error("Literature review generation failed:", err);
      for (const meta of REVIEW_STRUCTURE) {
        if (meta.key === "references") continue;
        next[meta.key] = buildLocalSectionContent(meta, selectedPapers, state.searchQuery);
      }
      setSections({ ...next });
      persist(next);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDeepReasoning = async () => {
    if (studyCount === 0) {
      alert("Please select papers in Step 1 / generate a synthesis table in Step 3 first.");
      return;
    }
    const papersForReasoning = selectedPapers;
    setDeepReasoningLoading(true);
    setDeepReasoning("");
    try {
      const prompt = buildDeepReasoningPrompt(papersForReasoning, state.searchQuery);
      const text = await callAi(prompt);
      setDeepReasoning(stripQuotesAndFences(text));
    } catch (err: any) {
      console.error("Deep reasoning generation failed:", err);
      // Local fallback: build structured deep reasoning from synthesis table
      const localReasoning = papersForReasoning.map((p, i) => {
        return `Paper ${i + 1}: ${p.authors} (${p.year}). ${p.title}. ${p.journal}${p.doi ? ` doi:${p.doi}` : ""}

Chain-of-thought reasoning: This study by ${p.authors} (${p.year}) addresses ${state.searchQuery || "the research topic"} using a ${p.studyType} design. The abstract reports findings related to the topic, though specific methodological details are limited to what is available in the abstract. The paper's relevance to the research question should be assessed in context of the full evidence base.

Key claims: ${p.abstract ? p.abstract.substring(0, 200) : "No abstract available"}...

Methodological assessment: Study type is ${p.studyType}. Limitations cannot be fully assessed from abstract-level data alone.

Limitations: Reliance on abstract-level data; potential selection and measurement bias; limited longitudinal follow-up may not be evident from abstract.

Relevance to query: The paper appears relevant to "${state.searchQuery || "the research topic"}" based on title and abstract keyword overlap, but full-text review would be needed for definitive assessment.

Identified gaps: Gaps in evidence cannot be fully determined from abstract-level data; further research needed.

Connections to other papers: This paper contributes to the evidence base on ${state.searchQuery || "the research topic"} and should be synthesized alongside other included studies.

---`;
      }).join("\n\n");
      setDeepReasoning(localReasoning);
    } finally {
      setDeepReasoningLoading(false);
    }
  };

  const handleRegenerateSection = async (meta: SectionMeta) => {
    if (meta.key === "references") {
      // References always come straight from the synthesis table Vancouver column.
      setSections((prev) => ({ ...prev, references: referencesText }));
      return;
    }
    setSectionLoading(meta.key);
    try {
      const content = await generateSection(meta);
      setSections((prev) => {
        const nxt = { ...prev, [meta.key]: content };
        persist(nxt);
        return nxt;
      });
    } catch (err: any) {
      // Fallback 1: local DeepSeek model (no API key needed)
      try {
        const deepSeekContent = await callDeepSeek(
          buildSectionPrompt(meta, evidenceBase, deepReasoning, state.searchQuery)
        );
        const clean = stripQuotesAndFences(deepSeekContent);
        setSections((prev) => {
          const nxt = { ...prev, [meta.key]: clean };
          persist(nxt);
          return nxt;
        });
      } catch {
        // Fallback 2: rule-based local section content
        const localContent = buildLocalSectionContent(meta, selectedPapers, state.searchQuery);
        setSections((prev) => {
          const nxt = { ...prev, [meta.key]: localContent };
          persist(nxt);
          return nxt;
        });
      }
    } finally {
      setSectionLoading(null);
    }
  };

  const handleReset = () => {
    if (!confirm("Reset the literature review?")) return;
    setSections(EMPTY_SECTIONS);
    setDeepReasoning("");
    dispatch({ type: "SET_LITERATURE_REVIEW", payload: "" });
  };

  const handleCopy = async () => {
    const full = REVIEW_STRUCTURE
      .map((s) => `## ${s.number}. ${s.title}\n\n${s.key === "references" ? referencesText : sections[s.key]}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const hasContent = REVIEW_STRUCTURE.some((s) => s.key !== "references" && sections[s.key]) || !!deepReasoning;

  return (
    <div className="space-y-6">
      {/* AI Powered Literature Review panel */}
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">AI Powered Literature Review</h2>
            <p className="text-sm text-blue-300">
              Review based on <span className="font-semibold text-white">{studyCount}</span> studies from evidence
              synthesis table. Generates 6 sections with references only at the end.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!hasContent}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleReset}
              disabled={!hasContent || loading}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleGenerateDeepReasoning}
              disabled={deepReasoningLoading || studyCount === 0}
              className="flex items-center gap-2 bg-purple-900/50 text-purple-200 px-3 py-2 rounded-lg hover:bg-purple-800/60 text-sm disabled:opacity-50"
            >
              {deepReasoningLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {deepReasoning ? "Regenerate Deep Reasoning" : "Deep Reasoning (CoT)"}
            </button>
            <button
              onClick={handleGenerateAll}
              disabled={loading || studyCount === 0}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "Generating..." : "Generate Review of Literature"}
            </button>
          </div>
        </div>
      </div>

      {/* Deep Reasoning / Chain-of-Thought panel */}
      {deepReasoning && (
        <div className="bg-[#1e1b4b]/50 border border-purple-900/40 rounded-lg p-5 shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-400" />
              <h3 className="text-sm font-bold text-purple-200">Deep Reasoning / Chain-of-Thought Analysis</h3>
            </div>
            <span className="text-[10px] text-purple-400">{deepReasoning.split("Paper ").length - 1} papers analyzed</span>
          </div>
          <div className="text-sm text-purple-100 font-serif leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {deepReasoning}
          </div>
          <p className="text-[11px] text-purple-300/80 mt-2">
            This per-paper chain-of-thought analysis is used as the analytical foundation for all literature-review sections.
          </p>
        </div>
      )}

      {deepReasoningLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-purple-300">Running chain-of-thought deep reasoning over each paper...</p>
          </div>
        </div>
      )}

      {/* Review structure */}
      <div className="bg-[#102a1e]/40 border border-emerald-900/40 rounded-lg p-5">
        <h3 className="text-sm font-bold text-emerald-300 mb-2">Review structure (6 sections):</h3>
        <ol className="text-sm text-blue-200 space-y-1 list-decimal list-inside">
          {REVIEW_STRUCTURE.map((s) => (
            <li key={s.key}>
              {s.title} — {s.blurb}
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-emerald-200/80 mt-3">
          Tip: generate each section on its own (the <span className="font-semibold">Generate</span> button on every
          section below) to conserve API quota — generating all sections at once can exhaust your daily limit.
        </p>
      </div>

      {loading && !hasContent && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-blue-200 text-sm">Synthesizing evidence and writing each section...</p>
          </div>
        </div>
      )}

      {/* Rendered sections — each can be generated independently to conserve API quota */}
      <div className="space-y-4">
        {REVIEW_STRUCTURE.map((meta) => {
            const content = meta.key === "references" ? referencesText : sections[meta.key];
            const isRef = meta.key === "references";
            return (
              <div key={meta.key} className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 shadow">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen size={14} className="text-yellow-400" />
                    {meta.number}. {meta.title}
                  </h3>
                  {!isRef && (
                    <button
                      onClick={() => handleRegenerateSection(meta)}
                      disabled={sectionLoading === meta.key || loading}
                      className="flex items-center gap-1 text-[11px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60 disabled:opacity-50"
                    >
                      {sectionLoading === meta.key ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {content ? "Regenerate" : "Generate"}
                    </button>
                  )}
                  {isRef && (
                    <span className="text-[10px] text-blue-400">Auto-filled from evidence synthesis table (Vancouver column)</span>
                  )}
                </div>
                {sectionLoading === meta.key ? (
                  <p className="text-sm text-blue-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Writing {meta.title}...</p>
                ) : isRef ? (
                  <div
                    className="text-sm text-blue-100 font-serif leading-relaxed space-y-1 max-h-[400px] overflow-y-auto"
                    dangerouslySetInnerHTML={{
                      __html: content
                        ? content.split("\n").map((line) => `<div>${line}</div>`).join("")
                        : "References will appear here after generating the synthesis table.",
                    }}
                  />
                ) : content ? (
                  <div className="text-sm text-blue-100 font-serif leading-relaxed whitespace-pre-wrap">{content}</div>
                ) : (
                  <p className="text-sm text-blue-500 italic">Not generated yet.</p>
                )}
              </div>
            );
        })}
      </div>
    </div>
  );
}
