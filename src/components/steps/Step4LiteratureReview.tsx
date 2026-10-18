"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Sparkles, BookOpen, RotateCcw, Loader2, Copy, Check } from "lucide-react";
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

function buildSectionPrompt(meta: SectionMeta, evidenceBase: string, query: string): string {
  const common = `You are an expert academic writer producing ONE section of a publication-ready narrative literature review.

RESEARCH TOPIC: ${query || "the research topic"}

EVIDENCE SYNTHESIS TABLE (single source of truth — cite ONLY these studies):
${evidenceBase}

CITATION RULES:
- Cite papers inline using author-year, e.g. (Smith 2020), (Jones et al 2022).
- Every inline citation MUST map to a paper in the evidence synthesis table.
- Aim for 2-4 inline citations per paragraph.

SECTION: ${meta.number}. ${meta.title}
SECTION FOCUS: ${meta.blurb}`;

  switch (meta.key) {
    case "introduction":
      return `${common}

TASK: Write the Introduction — a broad, scholarly overview of the research field: background, significance, current understanding, and the rationale for this review. 3-5 paragraphs. Do NOT include a reference list.`;
    case "globalIndian":
      return `${common}

TASK: Write "Global & Indian Situations" — synthesize the global burden/epidemiology and national programmes, then the Indian situation (national programmes, epidemiology, policy). Compare and contrast where evidence allows. 3-5 paragraphs. Do NOT include a reference list.`;
    case "gaps":
      return `${common}

TASK: Write "Research Gaps / Limitations" as a narrative built from DEEP REASONING over each study's limitations, exclusions, and unanswered questions (use the "Research gaps (deep reasoning)" column). Identify populations, settings, and outcomes not adequately studied. 3-5 paragraphs. Do NOT include a reference list.`;
    case "futureAdvice":
      return `${common}

TASK: Write "Authors' Advice for Future Research" — concrete, journal-grounded recommendations for future work, grouped thematically and tied to the identified gaps. 3-5 paragraphs. Do NOT include a reference list.`;
    case "summary":
      return `${common}

TASK: Write "Summary of All Studies" — a thematic synthesis of the findings across all included studies, noting convergence, divergence, and evidence strength (T1-T4). 3-5 paragraphs. Do NOT include a reference list.`;
    default:
      return common;
  }
}

export default function Step4LiteratureReview() {
  const { state, dispatch } = useApp();
  const [sections, setSections] = useState<Record<SectionKey, string>>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<SectionKey | null>(null);
  const [copied, setCopied] = useState(false);

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
      const text = await callAi(buildSectionPrompt(meta, evidenceBase, state.searchQuery));
      return stripQuotesAndFences(text);
    },
    [callAi, referencesText, evidenceBase, state.searchQuery],
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
          next[meta.key] = `> Could not generate this section: ${err?.message || "unknown error"}.`;
          setSections({ ...next });
        }
      }
      setSectionLoading(null);
      persist(next);
    } catch (err: any) {
      console.error("Literature review generation failed:", err);
      const fallback = generateLocalLiteratureReview(
        selectedPapers.map((p) => ({
          authors: p.authors,
          year: p.year,
          title: p.title,
          journal: p.journal,
          abstract: p.abstract,
          doi: p.doi,
          studyType: p.studyType,
          database: p.database,
        })),
        state.searchQuery,
        { enableRobustReview: true },
      );
      next.introduction = fallback;
      setSections({ ...next });
      persist(next);
    } finally {
      setLoading(false);
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
      alert(`Failed to regenerate section: ${err?.message || "unknown error"}`);
    } finally {
      setSectionLoading(null);
    }
  };

  const handleReset = () => {
    if (!confirm("Reset the literature review?")) return;
    setSections(EMPTY_SECTIONS);
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

  const hasContent = REVIEW_STRUCTURE.some((s) => s.key !== "references" && sections[s.key]);

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
