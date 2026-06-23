"use client";

import React, { useState } from "react";
import { Sparkles, ChevronRight, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";
import { buildStep7Prompt } from "@/lib/research-skills";

function buildTitlesPrompt(researchQuestions: any[], synthesisTable: any[], themes: any[]): string {
  return `You are a biomedical academic writing specialist using AIPOCH Title and Abstract Optimizer methodology.

TASK: Generate 5 publication-ready research title candidates based on the selected research questions, themes, and synthesis findings. Follow guidelines from Beginner's Guide for Clinical Research Writing (ICMR).

TITLE RULES:
- Be specific: include study design, population, and primary finding.
- Be concise: 15–25 words max.
- Avoid vague terms: "study of X" without context.
- Include design visibility where appropriate (RCT, Systematic Review, Meta-Analysis, Cohort, Qualitative).
- Use disciplined claim language.
- Separate CSS (Cause-seeking), DS (Description-seeking), and ES (Exploration-seeking) titles per ICMR guidelines.

For each title, provide:
1. Title text
2. Style: [CSS / DS / ES]
3. Design visibility: [study design]
4. Claim discipline: [conservative / moderate / strong]
5. Word count
6. Rationale (2–3 sentences)

OUTPUT FORMAT — return ONLY a numbered list of 5 titles with sub-points:

1. [Full title text]
   Style: CSS/DS/ES
   Design: Systematic Review / Meta-Analysis / etc.
   Fit: Journal recommendation
   Rationale: Why this title works

RESEARCH QUESTIONS:
${researchQuestions.map((q: any, i: number) => `${i + 1}. ${q.question || q}`).join("\n")}

KEY SYNTHESIS FINDINGS:
${synthesisTable?.slice(0, 5).map((r: any, i: number) => `${i + 1}. ${r.reference?.replace(/<[^>]+>/g, "").substring(0, 100)}\n   Key: ${r.keyFindings?.substring(0, 80)}`).join("\n\n") || "N/A"}

${themes?.length > 0 ? `\nIDENTIFIED THEMES:\n${themes.slice(0, 5).map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n")}` : ""}`;
}

const MOCK_TITLES = [
  {
    id: `title-${Date.now()}-1`,
    title: "Occupational Latent Tuberculosis Infection Among Healthcare Workers: A Systematic Review and Meta-Analysis of Prevalence, Diagnostic Accuracy, and Treatment Outcomes",
    explanation: "CSS title. Includes study type, population (HCWs), condition (LTBI), and scope (prevalence, diagnostic accuracy, treatment). Suitable for IJTLD or PLOS Global Public Health. ICMR-compliant — specific cause-seeking framing.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-2`,
    title: "Diagnostic Performance of IGRA Versus TST for LTBI Screening in Healthcare Workers: A Systematic Review and Meta-Analysis of Diagnostic Test Accuracy",
    explanation: "CSS title focused on comparative diagnostic accuracy. Appropriate for diagnostic accuracy systematic review with QUADAS-2 compliance. Suitable for BMC Infectious Diseases or Trop Med Int Health.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-3`,
    title: "Barriers and Facilitators to LTBI Treatment Completion Among Healthcare Workers: A Qualitative Evidence Synthesis Using GRADE-CERQual",
    explanation: "Qualitative evidence synthesis (ES) title. Targets the care cascade and adherence theme. Suitable for systematic review of qualitative evidence. Fits Implementation Science or Global Health journals.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-4`,
    title: "Implementation and Cost-Effectiveness of Digital-Enhanced LTBI Contact Tracing in Urban LMIC Settings: A Mixed-Methods Systematic Review",
    explanation: "CSS/ES hybrid title integrating implementation science and economic evaluation. Novel framing combining digital health and contact tracing. Suitable for BMJ Global Health or Global Health Action.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-5`,
    title: "Stigma, Disclosure, and Mental Health Outcomes Following LTBI Diagnosis in Healthcare Workers: A Systematic Review of Qualitative Evidence",
    explanation: "ES title targeting an under-represented thematic area. Qualitatively focused. Suitable for social science medical journals. Addresses the Theme 9 gap identified in synthesis.",
    selected: false,
  },
];

export default function SRStep6Titles() {
  const { state, dispatch } = useApp();
  const [titles, setTitles] = useState<any[]>(state.researchTitles);
  const [selectedTitleText, setSelectedTitleText] = useState(state.userTitleInput || "");

  const handleGenerateTitles = async () => {
    const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;
    if (selectedPapers.length === 0) {
      alert("Complete Steps 1–4 with selected papers and themes first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setTitles([]);

    try {
      const prompt = buildTitlesPrompt(
        state.researchQuestions.length > 0 ? state.researchQuestions : [],
        state.synthesisTable,
        state.themes
      );

      let responseText: string = "";
      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        setTitles(MOCK_TITLES);
        dispatch({ type: "SET_RESEARCH_TITLES", payload: MOCK_TITLES });
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }

      const cleaned = responseText.replace(/```(?:markdown)?/g, "").trim();
      const generatedTitles: any[] = [];
      let currentTitle = "";
      let currentExpl = "";
      const lines = cleaned.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (numMatch && trimmed.length < 220 && !trimmed.includes(":") && !trimmed.startsWith("-")) {
          if (currentTitle) {
            generatedTitles.push({
              id: `title-${Date.now()}-${generatedTitles.length}`,
              title: currentTitle.replace(/\*\*/g, "").trim(),
              explanation: currentExpl.trim() || "AI-generated title following AIPOCH optimization and ICMR guidelines.",
              selected: false,
            });
          }
          currentTitle = numMatch[2].replace(/\*\*/g, "").trim();
          currentExpl = "";
        } else {
          currentExpl += trimmed + " ";
        }
      }
      if (currentTitle) {
        generatedTitles.push({
          id: `title-${Date.now()}-${generatedTitles.length}`,
          title: currentTitle.replace(/\*\*/g, "").trim(),
          explanation: currentExpl.trim() || "AI-generated title.",
          selected: false,
        });
      }

      const finalTitles = generatedTitles.length >= 3 ? generatedTitles.slice(0, 5) : MOCK_TITLES;
      finalTitles.forEach((t, i) => { if (!t.id) t.id = `title-${Date.now()}-${i}`; });

      setTitles(finalTitles);
      dispatch({ type: "SET_RESEARCH_TITLES", payload: finalTitles });
    } catch (err: any) {
      console.error("Title generation failed:", err);
      setTitles(MOCK_TITLES);
      dispatch({ type: "SET_RESEARCH_TITLES", payload: MOCK_TITLES });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const selectTitle = (t: any) => {
    const updated = titles.map((x) => ({ ...x, selected: x.id === t.id }));
    setTitles(updated);
    dispatch({ type: "SET_RESEARCH_TITLES", payload: updated });
    setSelectedTitleText(t.title);
    dispatch({ type: "SET_USER_TITLE_INPUT", payload: t.title });
  };

  const handleTitleEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedTitleText(e.target.value);
    dispatch({ type: "SET_USER_TITLE_INPUT", payload: e.target.value });
  };

  const handleProceed = () => {
    if (!selectedTitleText.trim()) {
      alert("Please select or enter a research title.");
      return;
    }
    dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 7 });
  };

  const selectedTitle = titles.find((t) => t.selected);

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 6: Generate Research Title</h2>
            <p className="text-sm text-blue-300">
              AI generates publication-ready titles using AIPOCH Title Optimizer + ICMR guidelines (CSS/DS/ES framing).
            </p>
          </div>
          <button
            onClick={handleGenerateTitles}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating..." : "Generate Titles"}
          </button>
        </div>

        {state.isLoading && titles.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Generating publication-ready research titles...</p>
            </div>
          </div>
        )}

        {!state.isLoading && titles.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Sparkles size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate 5 research titles aligned to your questions and themes.</p>
          </div>
        )}

        {selectedTitle && (
          <div className="mb-6 bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4">
            <label className="block text-sm font-medium text-yellow-200 mb-2">Selected / Edit Title</label>
            <input
              type="text"
              value={selectedTitleText}
              onChange={handleTitleEdit}
              placeholder="Select a title or type your own..."
              className="w-full bg-[#0a1a3a] border border-yellow-600/50 text-white rounded-lg px-4 py-2.5 text-sm"
            />
          </div>
        )}

        {titles.length > 0 && (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {titles.map((t: any) => (
              <div
                key={t.id}
                onClick={() => selectTitle(t)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${t.selected ? "bg-yellow-900/20 border-yellow-600/50" : "bg-blue-950/50 border-blue-900 hover:border-blue-700"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${t.selected ? "bg-yellow-500 border-yellow-400" : "border-blue-500"}`}>
                    {t.selected && (
                      <svg className="w-2.5 h-2.5 text-[#0a1a3a]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white leading-snug mb-1.5">{t.title || t}</h4>
                    <p className="text-xs text-teal-300/80 leading-relaxed bg-teal-900/10 border-l-2 border-teal-700 pl-2 py-1 rounded-r">
                      {t.explanation || (typeof t === "string" ? "AI-generated title" : "")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleProceed}
            disabled={!selectedTitleText.trim()}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            Proceed to Protocol <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
