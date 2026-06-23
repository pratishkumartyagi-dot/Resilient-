"use client";

import React, { useState } from "react";
import { Sparkles, ChevronRight, Download, FileText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";

function buildAcademicWritingPrompt(
  papers: any[],
  synthesisTable: any[],
  themes: any[],
  researchQuestions: any[],
  researchTitles: any[],
  studyTypeCategory: string | null,
  writingType: "systematic-review" | "narrative-review" | "meta-analysis"
): string {
  return `You are a biomedical academic writing specialist using AIPOCH Academic Writing Skills — Manuscript Writing methodology.

TASK: Generate a full academic manuscript draft based on the systematic review protocol, selected papers, synthesis table, themes, and research questions.

WRITING TYPE: ${writingType === "systematic-review" ? "Systematic Review (PRISMA 2020 compliant)" : writingType === "meta-analysis" ? "Meta-Analysis (with forest plot descriptions, heterogeneity, and GRADE assessment)" : "Narrative Review (thematic synthesis, no PRISMA required)"}

MANUSCRIPT STRUCTURE (IMRAD):
1. Title Page (title, authors, affiliations, corresponding author, ORCID, date)
2. Abstract (Background, Objectives, Methods, Results, Conclusions — 250–300 words)
3. Introduction (context, rationale, objectives using PICO framework)
4. Methods
   - Search strategy (databases, date, Boolean string)
   - Eligibility criteria (PICO)
   - Study selection (screening process, PRISMA flow)
   - Data extraction
   - Quality assessment (Cochrane RoB / NOS / AMSTAR 2)
   - Synthesis methods (qualitative thematic / quantitative meta-analysis)
5. Results
   - Study selection (PRISMA flow numbers)
   - Study characteristics (table)
   - Quality assessment findings
   - Synthesis results (organized thematically or by outcome)
   ${writingType === "meta-analysis" ? "- Meta-analysis results (forest plot descriptions, pooled estimates, I², subgroup)" : ""}
6. Discussion (main findings, comparison with existing evidence, limitations, implications)
7. Conclusion
8. References (Vancouver style with DOIs)

HARD RULES:
- Never fabricate results, p-values, effect sizes, or sample sizes.
- Never invent ethics approval IDs or trial registrations.
- If data detail is missing from input, write "[AUTHOR TO SPECIFY: ...]".
- Preserve evidence boundaries — do not overstate findings.
- Use Vancouver citation style throughout.
- Follow PRISMA 2020 checklist for systematic reviews.

${studyTypeCategory === "systematic" ? "Include both qualitative and quantitative studies in synthesis." : "Meta-analysis: include only quantitative studies with extractable effect estimates."}

SELECTED PAPERS (${papers.length}):
${papers.slice(0, 15).map((p: any, i: number) => `${i + 1}. ${p.authors?.substring(0, 50)}(${p.year}). "${p.title?.substring(0, 80)}". ${p.journal}. doi:${p.doi}`).join("\n")}

SYNTHESIS TABLE:
${synthesisTable?.slice(0, 8).map((r: any, i: number) => `${i + 1}. ${r.reference?.replace(/<[^>]+>/g, "").substring(0, 100)}\n   Key: ${r.keyFindings?.substring(0, 100)} | Gaps: ${r.researchGaps?.substring(0, 80) || "N/A"}`).join("\n\n") || "N/A"}

IDENTIFIED THEMES (${themes?.length || 0}):
${themes?.slice(0, 5).map((t: any, i: number) => `${i + 1}. ${t.title}: ${t.description?.substring(0, 100)}`).join("\n") || "N/A"}

RESEARCH QUESTIONS (${researchQuestions?.length || 0}):
${researchQuestions?.slice(0, 3).map((q: any, i: number) => `${i + 1}. ${q.question || q}`).join("\n") || "N/A"}

${researchTitles?.length > 0 ? `SELECTED TITLE: ${researchTitles.find((t: any) => t.selected)?.title || researchTitles[0]?.title || "N/A"}` : ""}`;
}

export default function SRStep8AcademicWriting() {
  const { state, dispatch } = useApp();
  const [writingType, setWritingType] = useState<"systematic-review" | "narrative-review" | "meta-analysis">("systematic-review");
  const [generatedManuscript, setGeneratedManuscript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;

  const handleGenerateManuscript = async () => {
    if (selectedPapers.length === 0) {
      alert("Please complete Steps 1–2 with selected papers first.");
      return;
    }
    if (state.themes.length === 0) {
      alert("Please complete Step 4 (Generate Themes) first.");
      return;
    }

    setIsGenerating(true);
    setGeneratedManuscript("");

    try {
      const prompt = buildAcademicWritingPrompt(
        selectedPapers,
        state.synthesisTable,
        state.themes,
        state.researchQuestions,
        state.researchTitles,
        state.srStudyTypeCategory,
        writingType
      );

      let responseText: string = "";
      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedManuscript(cleaned);
    } catch (err: any) {
      console.error("Academic writing generation failed:", err);
      alert(err.message || "Failed to generate manuscript.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    if (!generatedManuscript) {
      alert("Generate a manuscript first.");
      return;
    }
    const blob = new Blob([generatedManuscript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${writingType}-manuscript.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 8: Academic Writing</h2>
            <p className="text-sm text-blue-300">
              Generate publication-ready manuscripts following PRISMA 2020, CONSORT, and ICMR guidelines using AIPOCH Academic Writing Skills.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={!generatedManuscript}
              className="text-sm bg-green-900/50 text-green-300 px-3 py-2 rounded-lg hover:bg-green-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <FileText size={14} /> Export
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <span className="text-sm text-blue-200 font-medium">Manuscript Type:</span>
          <button
            onClick={() => setWritingType("systematic-review")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${writingType === "systematic-review" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300"}`}
          >
            Systematic Review (PRISMA 2020)
          </button>
          <button
            onClick={() => setWritingType("meta-analysis")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${writingType === "meta-analysis" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300"}`}
          >
            Meta-Analysis (Quant. only)
          </button>
          <button
            onClick={() => setWritingType("narrative-review")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${writingType === "narrative-review" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300"}`}
          >
            Narrative Review
          </button>
          <button
            onClick={handleGenerateManuscript}
            disabled={isGenerating || state.isLoading}
            className="ml-auto bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {isGenerating ? "Writing Manuscript..." : "Generate Manuscript"}
          </button>
        </div>

        {(isGenerating || state.isLoading) && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Writing academic manuscript following AIPOCH methodology...</p>
              <p className="text-blue-400 text-xs mt-1">PRISMA 2020 · CONSORT · ICMR guidelines</p>
            </div>
          </div>
        )}

        {!state.isLoading && !generatedManuscript && (
          <div className="text-center py-12 text-blue-400">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate a full academic manuscript based on your systematic review pipeline outputs.</p>
          </div>
        )}

        {generatedManuscript && !isGenerating && (
          <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-5">
            <p className="text-xs text-blue-400 mb-3 font-medium">
              AI-generated {writingType.replace(/-/g, " ")} manuscript (editable — refine before submission):
            </p>
            <textarea
              value={generatedManuscript}
              onChange={(e) => setGeneratedManuscript(e.target.value)}
              className="w-full h-[700px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-serif leading-relaxed resize-y whitespace-pre-wrap"
            />
          </div>
        )}

        {generatedManuscript && !isGenerating && (
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={handleExport} className="bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 text-sm flex items-center gap-2">
              <Download size={14} /> Export as Markdown
            </button>
            <button
              onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 1 })}
              className="bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-900/70 text-sm"
            >
              Start New Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
