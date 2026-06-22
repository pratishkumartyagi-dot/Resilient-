"use client";

import React, { useState } from "react";
import { Sparkles, ChevronRight, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";

const generateMockTitles = () => [
  {
    id: `title-${Date.now()}-1`,
    title: "Implementation and Cost-Effectiveness of Annual IGRA-Based LTBI Screening Among Healthcare Workers in Tertiary Care Hospitals: A Mixed-Methods Study",
    explanation: "This title is grounded in the synthesis evidence indicating IGRA superiority in specificity and cost-effectiveness (Okonkwo et al., 2023). The mixed-methods framing permits both prevalence estimation and HCW perception data. Suitable for a doctoral dissertation or WHO-style operational research grant.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-2`,
    title: "Digital Health-Enhanced Contact Tracing for Latent TB in Urban Slum Communities: A Cluster Randomized Controlled Trial",
    explanation: "Optimized for a peer-reviewed RCT manuscript. Leads with the intervention (digital health tools) and employs the PICO population (urban slum communities, close contacts). Directly replicates the design demonstrated by Kumar et al. (2024) and invites a superiority hypothesis.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-3`,
    title: "Structural Determinants of LTBI Screening Uptake Among Migrant Healthcare Workers: A Systematic Review and Meta-Analysis of Observational Studies",
    explanation: "Appeals to the migration and mobility theme identified in the synthesis (Theme #9). Systematic review + meta-analysis design is appropriate given the moderate heterogeneity across the 9 relevant studies. Fits publication targets such as <em>International Journal of Tuberculosis and Lung Disease</em>.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-4`,
    title: "Integrating Mobile Radiology Van Screening with Fixed-Site IGRA Workflows: A Stepped-Wedge Cluster Trial in Rural Chinese Counties",
    explanation: "Innovative combination of two evidence-backed delivery modalities: mobile van infrastructure (Chen et al., 2021) and IGRA protocols. The stepped-wedge design justifies itself on ethical and implementation grounds. Aligned with the hybrid effectiveness-implementation research paradigm.",
    selected: false,
  },
  {
    id: `title-${Date.now()}-5`,
    title: "Stigma, Disclosure, and Mental Health Outcomes After Positive LTBI Diagnosis in Healthcare Workers: A Qualitative Evidence Synthesis",
    explanation: "Designed as a Cochrane-style qualitative evidence synthesis (QES), this title targets the under-explored stigma theme (Theme #8). Suitable for publication in social science medical journals. Employs aggregated and disaggregated thematic synthesis per GRADE-CERQual methodology.",
    selected: false,
  },
];

export default function Step7ResearchTitles() {
  const { state, dispatch } = useApp();
  const [titles, setTitles] = useState<typeof state.researchTitles>(state.researchTitles);
  const [selectedTitleText, setSelectedTitleText] = useState(state.userTitleInput || "");

  const handleGenerateTitles = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const mockTitles = generateMockTitles();
      setTitles(mockTitles);
      dispatch({ type: "SET_RESEARCH_TITLES", payload: mockTitles });
      dispatch({ type: "SET_LOADING", payload: false });
    }, 2000);
  };

  const selectTitle = (title: any) => {
    const updated = titles.map((t) => ({
      ...t,
      selected: t.id === title.id,
    }));
    setTitles(updated);
    dispatch({ type: "SET_RESEARCH_TITLES", payload: updated });
    setSelectedTitleText(title.title);
    dispatch({ type: "SET_USER_TITLE_INPUT", payload: title.title });
  };

  const handleTitleEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSelectedTitleText(newValue);
    dispatch({ type: "SET_USER_TITLE_INPUT", payload: newValue });
  };

  const handleProceed = () => {
    if (!selectedTitleText.trim()) {
      alert("Please select or enter a research title to proceed.");
      return;
    }
    dispatch({ type: "SET_STEP", payload: 8 });
  };

  const selectedTitle = titles.find((t) => t.selected);

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 7: Research Titles</h2>
            <p className="text-sm text-blue-300">
              Generate AI-refined research titles aligned with your study design and themes.
            </p>
          </div>
          <button
            onClick={handleGenerateTitles}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating..." : "Generate Research Titles"}
          </button>
        </div>

        {state.isLoading && titles.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Crafting research titles from your themes and questions...</p>
            </div>
          </div>
        )}

        {!state.isLoading && titles.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Sparkles size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate refined research titles or enter your own below.</p>
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
              className="w-full bg-[#0a1a3a] border border-yellow-600/50 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        )}

        {titles.length > 0 && (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {titles.map((t) => (
              <div
                key={t.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  t.selected
                    ? "bg-yellow-900/20 border-yellow-600/50"
                    : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                }`}
                onClick={() => selectTitle(t)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      t.selected
                        ? "bg-yellow-500 border-yellow-400"
                        : "border-blue-500"
                    }`}
                  >
                    {t.selected && (
                      <svg className="w-2.5 h-2.5 text-[#0a1a3a]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white leading-snug mb-1.5">{t.title}</h4>
                    <p className="text-xs text-teal-300/80 leading-relaxed bg-teal-900/10 border-l-2 border-teal-700 pl-2 py-1 rounded-r">
                      {t.explanation}
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
            Proceed to Aim & Objectives
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
