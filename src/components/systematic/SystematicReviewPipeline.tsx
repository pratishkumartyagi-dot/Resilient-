"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import SRStep1Search from "@/components/systematic/SRStep1Search";
import SRStep2Screening from "@/components/systematic/SRStep2Screening";
import SRStep3Synthesis from "@/components/systematic/SRStep3Synthesis";
import SRStep4Themes from "@/components/systematic/SRStep4Themes";
import SRStep5Questions from "@/components/systematic/SRStep5Questions";
import SRStep6Titles from "@/components/systematic/SRStep6Titles";
import SRStep7Protocol from "@/components/systematic/SRStep7Protocol";
import SRStep8AcademicWriting from "@/components/systematic/SRStep8AcademicWriting";

const SR_STEPS = [
  { num: 1, label: "Broad Area of Research" },
  { num: 2, label: "Screening & Dedup" },
  { num: 3, label: "Synthesis Table" },
  { num: 4, label: "Generate Themes" },
  { num: 5, label: "Research Questions" },
  { num: 6, label: "Research Titles" },
  { num: 7, label: "Protocol" },
  { num: 8, label: "Academic Writing" },
];

export default function SystematicReviewPipeline() {
  const { state, dispatch } = useApp();
  const step = state.systematicStep || 1;

  const goNext = () => {
    if (step < 8) dispatch({ type: "SET_SYSTEMATIC_STEP", payload: step + 1 });
  };

  const goPrev = () => {
    if (step > 1) dispatch({ type: "SET_SYSTEMATIC_STEP", payload: step - 1 });
  };

  const resetAll = () => {
    if (confirm("Clear all systematic review data and restart?")) {
      dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 1 });
      dispatch({ type: "SET_PAPERS", payload: [] });
      dispatch({ type: "SET_SELECTED_PAPERS", payload: [] });
      dispatch({ type: "SET_SYNTHESIS", payload: [] });
      dispatch({ type: "SET_THEMES", payload: [] });
      dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: [] });
      dispatch({ type: "SET_RESEARCH_TITLES", payload: [] });
      dispatch({ type: "SET_PROTOCOL", payload: { background: "", objectives: "", methods: "", expectedOutcomes: "" } });
      dispatch({ type: "SET_DEDUP_PAPERS", payload: [] });
      dispatch({ type: "SET_FILTERED_PAPERS", payload: [] });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1: return <SRStep1Search />;
      case 2: return <SRStep2Screening />;
      case 3: return <SRStep3Synthesis />;
      case 4: return <SRStep4Themes />;
      case 5: return <SRStep5Questions />;
      case 6: return <SRStep6Titles />;
      case 7: return <SRStep7Protocol />;
      case 8: return <SRStep8AcademicWriting />;
      default: return <SRStep1Search />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-2 shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {SR_STEPS.map((s) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: s.num })}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-[72px] ${
                    step === s.num
                      ? "bg-blue-600 text-white shadow"
                      : step > s.num
                      ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                      : "bg-transparent text-blue-500 hover:text-blue-300"
                  }`}
                >
                  <span className="text-base font-bold">{s.num}</span>
                  <span className="leading-tight">{s.label}</span>
                </button>
                {s.num < 8 && (
                  <div className="h-8 w-4 flex items-center justify-center text-blue-600">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <button
              onClick={goPrev}
              disabled={step === 1}
              className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Step"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={goNext}
              disabled={step === 8}
              className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Step"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <button
              onClick={resetAll}
              className="p-2 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60"
              title="Reset All"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-12.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-[500px]">
        {renderStep()}
      </div>
    </div>
  );
}
