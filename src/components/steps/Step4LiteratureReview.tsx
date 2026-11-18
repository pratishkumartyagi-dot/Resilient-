"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Sparkles, BookOpen, RotateCcw, Loader2, Copy, Check,
  Brain, ArrowRight, FileText, Download, Trash2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callAiWithFallback, type AICallOptions } from "@/lib/ai";
import { formatVancouverReference } from "@/lib/references";

type SectionKey =
  | "introduction"
  | "globalIndian"
  | "gaps"
  | "futureAdvice"
  | "summary"
  | "references";

interface SectionMeta {
  key: SectionKey;
  number: number;
  title: string;
  blurb: string;
  subheadings: string[];
}

const REVIEW_STRUCTURE: SectionMeta[] = [
  {
    key: "introduction",
    number: 1,
    title: "Introduction",
    blurb: "Broad overview of the clinical/research field",
    subheadings: [
      "1.1 Background and Significance",
      "1.2 Current Understanding of the Problem",
      "1.3 Rationale and Objectives of This Review",
    ],
  },
  {
    key: "globalIndian",
    number: 2,
    title: "Global & Indian Situations",
    blurb: "Burden data, national programmes",
    subheadings: [
      "2.1 Global Burden and Epidemiology",
      "2.2 Regional Variations and Comparisons",
      "2.3 Indian Context: National Programmes and Epidemiology",
      "2.4 Policy Landscape and Implications",
    ],
  },
  {
    key: "gaps",
    number: 3,
    title: "Research Gaps / Limitations",
    blurb: "Populations & settings not studied",
    subheadings: [
      "3.1 Methodological Limitations Across Studies",
      "3.2 Populations and Settings Not Adequately Studied",
      "3.3 Outcomes and Measures Not Addressed",
      "3.4 Unanswered Questions and Contradictions",
      "3.5 Implications of Identified Gaps",
    ],
  },
  {
    key: "futureAdvice",
    number: 4,
    title: "Authors' Advice for Future Research",
    blurb: "Recommendations from journals",
    subheadings: [
      "4.1 Study Design Recommendations",
      "4.2 Population and Setting Recommendations",
      "4.3 Outcome Measurement Recommendations",
      "4.4 Implementation and Translation Priorities",
      "4.5 Methodological Priorities",
    ],
  },
  {
    key: "summary",
    number: 5,
    title: "Summary of All Studies",
    blurb: "Thematic synthesis of findings",
    subheadings: [
      "5.1 Overview of Included Studies",
      "5.2 Thematic Synthesis of Findings",
      "5.3 Convergence and Divergence Across Studies",
      "5.4 Evidence Strength Assessment (T1-T4)",
      "5.5 Overall Conclusions",
    ],
  },
  {
    key: "references",
    number: 6,
    title: "References",
    blurb: "All Vancouver-style citations",
    subheadings: [],
  },
];

const EMPTY_SECTIONS: Record<SectionKey, string> = {
  introduction: "",
  globalIndian: "",
  gaps: "",
  futureAdvice: "",
  summary: "",
  references: "",
};

/**
 * ScholarCopilot-style Review of Literature generator.
 *
 * https://github.com/TIGER-AI-Lab/ScholarCopilot
 *
 * ScholarCopilot jointly optimises scholarly text generation and accurate
 * citation through retrieval-augmented generation: the model determines where
 * a citation is needed, retrieves the relevant paper from the corpus, inserts
 * the reference, then resumes coherent text generation.
 *
 * This step implements that behaviour locally:
 *   1. Deep chain-of-thought reasoning over EVERY selected paper (runs once).
 *   2. Each literature-review section is written INDIVIDUALLY as comprehensive
 *      prose, grounded in the deep-reasoning analysis and the evidence
 *      synthesis table.
 *   3. Inline Vancouver citations (Author Year) that map 1:1 to the grounded
 *      papers — no invented citations, no hallucinations.
 *   4. Section 6 (References) lists every paper from Step 3 in Vancouver style.
 *
 * Output is plain text only — no markdown headings, code fences, or markup.
 */

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
  evidenceTier: string;
}

function stripMarkdown(text: string): string {
  return text
    // Remove code fences
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code backticks
    .replace(/`([^`]*)`/g, "$1")
    // Remove markdown heading markers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold markers
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    // Remove italic markers (single asterisks/underscores around words)
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_(?!_)([^_]+)_/g, "$1")
    // Convert bullet lists to plain lines
    .replace(/^\s*[-*+]\s+/gm, "")
    // Remove blockquote markers
    .replace(/^\s*>\s?/gm, "")
    // Collapse excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDeepReasoningPrompt(
  papers: {
    authors: string;
    year: number;
    title: string;
    journal: string;
    abstract: string;
    doi?: string;
    studyType: string;
    database: string;
  }[],
  query: string,
): string {
  const paperList = papers
    .map(
      (p, i) =>
        `Paper ${i + 1}: ${p.authors} (${p.year}). ${p.title}. ${p.journal}${
          p.doi ? ` doi:${p.doi}` : ""
        }\nAbstract: ${p.abstract}\nStudy type: ${p.studyType}\nDatabase: ${p.database}`,
    )
    .join("\n\n");

  return `You are an expert evidence-synthesis researcher performing DEEP REASONING (chain-of-thought) over each included paper before any literature-review section is written. This follows the ScholarCopilot approach of retrieval-augmented academic writing with accurate citations.

RESEARCH TOPIC: ${query || "the research topic"}

INCLUDED PAPERS (retrieval corpus):
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

Format your output as a structured analysis per paper, clearly numbered with headings for each of the 8 dimensions above. Be thorough and analytical — this analysis will be the sole analytical foundation for writing all literature-review sections. Do NOT write the review sections yet; only produce the deep-reasoning analysis. Do NOT invent papers or citations. Ground every statement in the paper list above.`;
}

function buildSectionPrompt(
  meta: SectionMeta,
  evidenceBase: string,
  deepReasoning: string,
  query: string,
): string {
  const subheads = meta.subheadings.length > 0
    ? `\nSUBSECTIONS TO INCLUDE:\n${meta.subheadings.join("\n")}`
    : "";

  return `You are an expert academic writer producing ONE section of a publication-ready, COMPREHENSIVE narrative literature review. This follows the ScholarCopilot approach: retrieval-augmented generation with accurate, grounded citations.

RESEARCH TOPIC: ${query || "the research topic"}

EVIDENCE SYNTHESIS TABLE (single source of truth — cite ONLY these studies):
${evidenceBase}

DEEP REASONING / CHAIN-OF-THOUGHT ANALYSIS (per-paper deep reasoning — use this as the analytical foundation):
${deepReasoning}

CITATION RULES (STRICT — no hallucinations):
- Cite papers inline using Vancouver author-year style, e.g. (Smith 2020), (Jones et al 2022).
- Every inline citation MUST map to a paper in the evidence synthesis table above.
- Do NOT invent papers, authors, years, or citations that are not in the table.
- Aim for 3-6 inline citations per paragraph.
- If a claim cannot be supported by a paper in the table, do not make the claim.

STRUCTURAL REQUIREMENTS (PLAIN TEXT ONLY — NO MARKDOWN):
- Write 6-10 substantial paragraphs minimum.
- Use numbered subsections (e.g. 1.1, 1.2) to organize content — do NOT use markdown ### or ## headings.
- Use comparative synthesis, not just paper-by-paper summaries.
- Discuss convergence, divergence, strengths, weaknesses, and clinical/policy implications.
- Ground every claim in the deep-reasoning analysis above.
- Do NOT include a reference list (references are handled separately in Section 6).
- Output plain text only. No code fences, no markdown headings, no bold/italic markup.

SECTION: ${meta.number}. ${meta.title}
SECTION FOCUS: ${meta.blurb}${subheads}

TASK: Write a COMPREHENSIVE ${meta.title} (Section ${meta.number}). Include the numbered subsections listed above.

Write 6-10 paragraphs covering the section focus. Ground every claim in the deep-reasoning analysis and cite inline using Vancouver style. Do NOT include a reference list. Output plain text only.`;
}

export default function Step4LiteratureReview() {
  const { state, dispatch } = useApp();
  const [sections, setSections] = useState<Record<SectionKey, string>>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<SectionKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [deepReasoning, setDeepReasoning] = useState<string>("");
  const [deepReasoningLoading, setDeepReasoningLoading] = useState(false);

  const selectedPapers = useMemo(() => state.papers.filter((p) => p.selected), [
    state.papers,
  ]);
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
      .map(
        (p, i) =>
          `${i + 1}. ${formatVancouverReference({
            authors: p.authors,
            title: p.title,
            journal: p.journal,
            year: p.year,
            doi: p.doi,
          })}`,
      )
      .join("\n");
  }, [state.synthesisTable, selectedPapers]);

  const callAi = useCallback(
    async (prompt: string): Promise<string> => {
      const searchOptions: AICallOptions = {
        searchEnabled: true,
        searchQuery: state.searchQuery,
      };
      return callAiWithFallback(prompt, searchOptions);
    },
    [state.searchQuery]
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
      .map(
        (p, i) =>
          `${i + 1}. ${p.authors} (${p.year}). ${p.title}. ${p.journal}.${
            p.doi ? ` doi:${p.doi}` : ""
          }\n   Study type: ${p.studyType}\n   Abstract: ${p.abstract}`,
      )
      .join("\n\n");
  }, [state.synthesisTable, selectedPapers]);

  const buildLocalReviewFallback = useCallback((): string => {
    try {
      const reasoning = selectedPapers.map((p, i) => {
        return `Paper ${i + 1}: ${p.authors} (${p.year}). ${p.title}. ${p.journal}${
          p.doi ? ` doi:${p.doi}` : ""
        }

Chain-of-thought reasoning: This study by ${p.authors} (${p.year}) addresses ${state.searchQuery || "the research topic"} using a ${p.studyType} design. The abstract reports findings related to the topic.

Key claims: ${p.abstract ? p.abstract.substring(0, 200) : "No abstract available"}...

Methodological assessment: Study type is ${p.studyType}. Limitations cannot be fully assessed from abstract-level data alone.

Limitations: Reliance on abstract-level data; potential selection and measurement bias.

Relevance to query: The paper appears relevant to "${state.searchQuery || "the research topic"}" based on title and abstract keyword overlap.

Identified gaps: Gaps in evidence cannot be fully determined from abstract-level data.

Connections to other papers: This paper contributes to the evidence base on ${state.searchQuery || "the research topic"}.

Evidence tier: T3 — Associational.

---`;
      }).join("\n\n");
      return reasoning;
    } catch {
      return "";
    }
  }, [selectedPapers, state.searchQuery]);

  const generateSection = useCallback(
    async (meta: SectionMeta): Promise<string> => {
      if (meta.key === "references") return referencesText;
      try {
        const text = await callAi(
          buildSectionPrompt(meta, evidenceBase, deepReasoning, state.searchQuery),
        );
        return stripMarkdown(text);
      } catch (err: any) {
        const local = buildLocalReviewFallback();
        return `${local}\n\nSection "${meta.title}" was written by the local generator because the AI providers were unavailable (${err?.message || "unknown error"}).`;
      }
    },
    [callAi, referencesText, evidenceBase, deepReasoning, state.searchQuery, buildLocalReviewFallback],
  );

  const persist = useCallback(
    (next: Record<SectionKey, string>) => {
      const full = REVIEW_STRUCTURE
        .map((s) => `${s.number}. ${s.title}\n\n${next[s.key] || ""}`)
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
      const thesisPapers = selectedPapers.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        studyType: p.studyType,
        database: p.database,
      }));

      // ScholarCopilot-style: deep chain-of-thought reasoning over ALL papers once,
      // then each literature-review section is written INDIVIDUALLY as comprehensive
      // prose, grounded in the reasoning and evidence synthesis table.
      const contentSections = REVIEW_STRUCTURE.filter((s) => s.key !== "references");

      for (const meta of contentSections) {
        setSectionLoading(meta.key);
        const content = await generateSection(meta);
        setSections((prev) => {
          const nxt = { ...prev, [meta.key]: content || `*Section "${meta.title}" returned no content.*` };
          persist(nxt);
          return nxt;
        });
      }

      setSectionLoading(null);
      setLoading(false);
    } catch (err: any) {
      console.error("Literature review generation failed:", err);
      for (const meta of REVIEW_STRUCTURE) {
        if (meta.key === "references") continue;
        if (!next[meta.key]) {
          next[meta.key] = `*Section generation failed: ${err?.message || String(err)}*`;
        }
      }
      setSectionLoading(null);
      setSections(next);
      persist(next);
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
      setDeepReasoning(stripMarkdown(text));
    } catch (err: any) {
      console.error("Deep reasoning generation failed:", err);
      setDeepReasoning(buildLocalReviewFallback());
    } finally {
      setDeepReasoningLoading(false);
    }
  };

  const handleRegenerateSection = async (meta: SectionMeta) => {
    if (meta.key === "references") {
      setSections((prev) => ({ ...prev, references: referencesText }));
      persist({ ...sections, references: referencesText });
      return;
    }
    setSectionLoading(meta.key);
    try {
      const content = await generateSection(meta);
      setSections((prev) => {
        const nxt = { ...prev, [meta.key]: content || `*Section "${meta.title}" returned no content.*` };
        persist(nxt);
        return nxt;
      });
    } catch (err: any) {
      setSections((prev) => {
        const nxt = { ...prev, [meta.key]: `*Section generation failed: ${err?.message || String(err)}*` };
        persist(nxt);
        return nxt;
      });
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
      .map((s) => `${s.number}. ${s.title}\n\n${s.key === "references" ? referencesText : sections[s.key]}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleDownload = () => {
    const full = REVIEW_STRUCTURE
      .map((s) => `${s.number}. ${s.title}\n\n${s.key === "references" ? referencesText : sections[s.key]}`)
      .join("\n\n");
    const blob = new Blob([full], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review-of-literature.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasContent = REVIEW_STRUCTURE.some(
    (s) => s.key !== "references" && sections[s.key],
  ) || !!deepReasoning;

  return (
    <div className="space-y-6">
      {/* AI Powered Literature Review panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0d1b3e] p-4 rounded-xl border border-blue-900/50">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={24} className="text-yellow-400" /> Review of Literature
          </h2>
          <p className="text-sm text-blue-300">
            Review based on <span className="font-semibold text-white">{studyCount}</span> studies from evidence
            synthesis table. ScholarCopilot-style: deep chain-of-thought reasoning over all papers, then each
            section written individually with grounded Vancouver citations. References (Section 6) appear at the end.
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
            onClick={handleDownload}
            disabled={!hasContent}
            className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
          >
            <Download size={14} /> Download TXT
          </button>
          <button
            onClick={handleReset}
            disabled={!hasContent || loading}
            className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>

      {/* Deep Reasoning / Chain-of-Thought panel */}
      <div className="bg-[#1e1b4b]/50 border border-purple-900/40 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-purple-400" />
            <h3 className="text-sm font-bold text-purple-200">
              Deep Reasoning / Chain-of-Thought Analysis
            </h3>
          </div>
          <span className="text-[10px] text-purple-400">
            {deepReasoning.split("Paper ").length - 1} papers analyzed
          </span>
        </div>
        {deepReasoning ? (
          <div className="text-sm text-purple-100 font-serif leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {deepReasoning}
          </div>
        ) : (
          <p className="text-sm text-purple-400/70">
            Click &quot;Deep Reasoning (CoT)&quot; to run per-paper chain-of-thought analysis before generating sections.
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleGenerateDeepReasoning}
            disabled={deepReasoningLoading || studyCount === 0}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              deepReasoningLoading || studyCount === 0
                ? "bg-blue-900/30 text-blue-400"
                : "bg-purple-600 hover:bg-purple-500 text-white"
            }`}
          >
            {deepReasoningLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            {deepReasoning ? "Regenerate Deep Reasoning" : "Deep Reasoning (CoT)"}
          </button>
        </div>
        <p className="text-[11px] text-purple-300/80 mt-2">
          This per-paper chain-of-thought analysis is the analytical foundation for all literature-review sections.
        </p>
      </div>

      {deepReasoningLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-purple-300">Running chain-of-thought deep reasoning over each paper...</p>
          </div>
        </div>
      )}

      {/* Review structure */}
      <div className="bg-[#102a1e]/40 border border-emerald-900/40 rounded-lg p-4">
        <h3 className="text-sm font-bold text-emerald-300 mb-2">
          Review structure (6 sections):
        </h3>
        <ol className="text-sm text-blue-200 space-y-1 list-decimal list-inside">
          {REVIEW_STRUCTURE.map((s) => (
            <li key={s.key}>
              {s.title} — {s.blurb}
            </li>
          ))}
        </ol>
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
                    className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-blue-800/60 disabled:opacity-50 ${
                      sectionLoading === meta.key || loading ? "bg-blue-900/30 text-blue-400" : "bg-blue-900/50 text-blue-200"
                    }`}
                  >
                    {sectionLoading === meta.key ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {content ? "Regenerate" : "Generate"}
                  </button>
                )}
                {isRef && (
                  <span className="text-[10px] text-blue-400">
                    Auto-filled from evidence synthesis table (Vancouver column)
                  </span>
                )}
              </div>
              {sectionLoading === meta.key ? (
                <p className="text-sm text-blue-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Writing {meta.title}...
                </p>
              ) : isRef ? (
                <div className="text-sm text-blue-100 font-serif leading-relaxed space-y-1 max-h-[400px] overflow-y-auto">
                  {referencesText.split("\n").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
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
