"use client";

import React, { useState } from "react";
import { Sparkles, ChevronRight, ChevronLeft, FileText, Save } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";

function buildProtocolPrompt(
  aimObjectives: any,
  selectedPapers: any[],
  studyTypeCategory: string | null,
  synthesisTable: any[]
): string {
  return `You are an expert clinical research protocol strategist using AIPOCH Clinical Cohort Protocol Designer methodology — adapted for Systematic Review / Meta-Analysis protocol design.

TASK: Generate a structured systematic review or meta-analysis protocol (PROSPERO-style) based on the selected papers and study aims.

${studyTypeCategory === "systematic"
  ? "PROTOCOL TYPE: Systematic Review (Qualitative & Quantitative studies)\nInclude: review question, eligibility criteria, search strategy, screening process, data extraction, quality assessment, synthesis plan, PRISMA flow."
  : studyTypeCategory === "meta"
  ? "PROTOCOL TYPE: Meta-Analysis (Quantitative studies only)\nInclude: review question, eligibility criteria, search strategy, effect measures, heterogeneity assessment, subgroup analysis, publication bias assessment, sensitivity analysis."
  : "PROTOCOL TYPE: Systematic Review & Meta-Analysis\nInclude both systematic review and meta-analysis components."}

OUTPUT STRUCTURE — markdown only (no JSON):

## A. Review Question
[PICO/PECO formatted question]

## B. Eligibility Criteria
| Criterion | Description |
|-----------|-------------|
| Population | ... |
| Intervention/Exposure | ... |
| Comparator | ... |
| Outcomes | ... |
| Study designs | ... |
| Time period | ... |
| Language | ... |

## C. Search Strategy
| Database | Search Terms | Date Range | Expected N |
|-----------|-------------|-----------|------------|
| PubMed | Boolean string | YYYY–YYYY | N |
| OpenAlex | ... | ... | ... |

## D. Screening Process
- Title/abstract screening: [number of reviewers, tools]
- Full-text screening: [process, disagreements resolution]
- PRISMA flow diagram

## E. Data Extraction
| Variable | Source | Format |
|----------|--------|--------|
| Study characteristics | ... | ... |
| Population data | ... | ... |
| Outcome data | ... | ... |

## F. Quality Assessment
- Tool: [Cochrane RoB / NOS / AMSTAR 2 / QUADAS-2]
- Assessment process: [independent, paired, etc.]

## G. Synthesis Plan
- Qualitative synthesis: [thematic analysis approach]
- Quantitative synthesis: [meta-analysis model, effect measures, software]

## H. Heterogeneity & Publication Bias
- I² interpretation thresholds
- Subgroup / sensitivity analysis plan
- Funnel plot / Egger's test

## I. Ethics & Registration
- PROSPERO registration planned: Yes/No
- PRISMA 2020 compliance

## J. Timeline & Resources
- Search, screening, extraction, analysis, write-up

STUDY CONTEXT:
Aims: ${aimObjectives.aim || "Systematic review of selected literature"}
Primary Objective: ${aimObjectives.primaryObjective || "To synthesize evidence"}
Secondary Objectives: ${aimObjectives.secondaryObjectives?.join("; ") || "N/A"}

SELECTED PAPERS (${selectedPapers.length}):
${selectedPapers.slice(0, 10).map((p: any, i: number) => `${i + 1}. ${p.authors?.substring(0, 40)}(${p.year}). ${p.title?.substring(0, 60)}. ${p.journal}.`).join("\n")}

KEY SYNTHESIS FINDINGS:
${synthesisTable?.slice(0, 5).map((r: any, i: number) => `${i + 1}. ${r.reference?.replace(/<[^>]+>/g, "").substring(0, 80)}... Key: ${r.keyFindings?.substring(0, 60)}`).join("\n") || "N/A"}`;
}

export default function SRStep7Protocol() {
  const { state, dispatch } = useApp();
  const [localProtocol, setLocalProtocol] = useState({
    background: state.protocol.background || "",
    objectives: state.protocol.objectives || "",
    methods: state.protocol.methods || "",
    expectedOutcomes: state.protocol.expectedOutcomes || "",
  });
  const [generatedProtocol, setGeneratedProtocol] = useState("");
  const [studyTypeCategory, setStudyTypeCategory] = useState<"systematic" | "meta">("systematic");
  const [isGenerating, setIsGenerating] = useState(false);

  const updateSection = (section: string, val: string) => {
    const updated = { ...localProtocol, [section]: val };
    setLocalProtocol(updated);
    dispatch({ type: "SET_PROTOCOL", payload: { [section]: val } });
  };

  const handleGenerateProtocol = async () => {
    const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;
    if (selectedPapers.length === 0) {
      alert("Complete Steps 1–2 with selected papers first.");
      return;
    }

    setIsGenerating(true);
    setGeneratedProtocol("");

    try {
      const prompt = buildProtocolPrompt(
        state.aimObjectives,
        selectedPapers,
        state.srStudyTypeCategory || studyTypeCategory,
        state.synthesisTable
      );

      let responseText: string = "";
      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        throw new Error("No API key configured. Please add Gemini or OpenRouter API key in Settings.");
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedProtocol(cleaned);

      const bgMatch = cleaned.match(/## A\.\s*Review Question[\s\S]*?(?=## B\.|$)/i);
      const objMatch = cleaned.match(/## B\.\s*Eligibility Criteria[\s\S]*?(?=## C\.|$)/i);
      const methMatch = cleaned.match(/## C\.\s*Search Strategy[\s\S]*?(?=## D\.|$)/i);
      const outMatch = cleaned.match(/## D\.\s*Screening[\s\S]*?(?=## E\.|$)/i);

      if (bgMatch) updateSection("background", bgMatch[0].replace(/^##\s*A\..*/i, "").trim());
      if (objMatch) updateSection("objectives", objMatch[0].replace(/^##\s*B\..*/i, "").trim());
      if (methMatch) updateSection("methods", methMatch[0].replace(/^##\s*C\..*/i, "").trim());
      if (outMatch) updateSection("expectedOutcomes", outMatch[0].replace(/^##\s*D\..*/i, "").trim());

      dispatch({ type: "SET_SR_CATEGORY", payload: studyTypeCategory });
    } catch (err: any) {
      console.error("Protocol generation failed:", err);
      alert(err.message || "Failed to generate protocol.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = () => {
    const protocol = Object.entries(localProtocol)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `## ${k.charAt(0).toUpperCase() + k.slice(1)}\n\n${v}`)
      .join("\n\n---\n\n");
    const blob = new Blob([protocol], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "systematic-review-protocol.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 7: Research Protocol</h2>
            <p className="text-sm text-blue-300">
              Structured systematic review or meta-analysis protocol (PROSPERA-ready) with PRISMA 2020 compliance.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="text-sm bg-green-900/50 text-green-300 px-3 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1"
            >
              <FileText size={14} /> Export Draft
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <span className="text-sm text-blue-200 font-medium">Review Type:</span>
          <button
            onClick={() => setStudyTypeCategory("systematic")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${studyTypeCategory === "systematic" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300"}`}
          >
            Systematic Review (Qual. + Quant.)
          </button>
          <button
            onClick={() => setStudyTypeCategory("meta")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${studyTypeCategory === "meta" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300"}`}
          >
            Meta-Analysis (Quant. only)
          </button>
          <button
            onClick={handleGenerateProtocol}
            disabled={isGenerating || state.isLoading}
            className="ml-auto bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {isGenerating ? "Generating Protocol..." : "Generate Protocol"}
          </button>
        </div>

        {(isGenerating || state.isLoading) && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Designing systematic review protocol...</p>
              <p className="text-blue-400 text-xs mt-1">PICO framework · PRISMA 2020 · PROSPERO-ready</p>
            </div>
          </div>
        )}

        {generatedProtocol && !isGenerating && (
          <div className="mb-6 bg-blue-950/30 border border-blue-900/50 rounded-lg p-5">
            <p className="text-xs text-blue-400 mb-3 font-medium">AI-generated protocol (sections pre-filled below — edit as needed):</p>
            <pre className="text-sm text-blue-100 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono">{generatedProtocol}</pre>
          </div>
        )}

        <div className="space-y-5">
          {[
            { key: "background", label: "Background & Rationale", placeholder: "Background context, problem statement, and justification for this review..." },
            { key: "objectives", label: "Eligibility Criteria & Objectives", placeholder: "PICO framework, eligibility criteria, objectives..." },
            { key: "methods", label: "Methods & Search Strategy", placeholder: "Databases, search terms, screening process, quality assessment tools..." },
            { key: "expectedOutcomes", label: "Synthesis Plan & Expected Outcomes", placeholder: "Data extraction plan, synthesis approach, heterogeneity, publication bias, PRISMA flow..." },
          ].map((section) => (
            <div key={section.key}>
              <label className="block text-sm font-semibold text-yellow-200 mb-2">{section.label}</label>
              <textarea
                value={localProtocol[section.key as keyof typeof localProtocol] || ""}
                onChange={(e) => updateSection(section.key, e.target.value)}
                placeholder={section.placeholder}
                rows={7}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-serif leading-relaxed placeholder:text-blue-600 resize-y whitespace-pre-wrap"
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 6 })}
            className="bg-blue-900/50 text-blue-200 hover:bg-blue-900/70 px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <ChevronLeft size={16} /> Back to Titles
          </button>
          <button
            onClick={handleExport}
            className="bg-green-900/50 text-green-300 hover:bg-green-900/70 px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <Save size={16} /> Export Draft
          </button>
        </div>
      </div>
    </div>
  );
}
