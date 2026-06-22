"use client";

import React from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";

const STEPS = [
  { num: 1, label: "Search Databases" },
  { num: 2, label: "Results & Dedup" },
  { num: 3, label: "Synthesis Table" },
  { num: 4, label: "Review of Lit" },
  { num: 5, label: "Generate Themes" },
  { num: 6, label: "Research Questions" },
  { num: 7, label: "Research Titles" },
  { num: 8, label: "Aim & Objectives" },
  { num: 9, label: "Methodology" },
  { num: 10, label: "Protocol" },
  { num: 11, label: "Impact Assessment" },
];

export default function StepNavigator({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();

  const goNext = () => {
    if (state.currentStep < 11) {
      dispatch({ type: "SET_STEP", payload: state.currentStep + 1 });
    }
  };

  const goPrev = () => {
    if (state.currentStep > 1) {
      dispatch({ type: "SET_STEP", payload: state.currentStep - 1 });
    }
  };

  const resetAll = () => {
    if (confirm("Clear all data and restart the pipeline?")) {
      dispatch({ type: "RESET_STATE" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-2 shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex items-center"
              >
                <button
                  onClick={() => dispatch({ type: "SET_STEP", payload: step.num })}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-[72px] ${
                    state.currentStep === step.num
                      ? "bg-blue-600 text-white shadow"
                      : state.currentStep > step.num
                      ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                      : "bg-transparent text-blue-500 hover:text-blue-300"
                  }`}
                >
                  <span className="text-base font-bold">{step.num}</span>
                  <span className="leading-tight">{step.label}</span>
                </button>
                {step.num < 11 && (
                  <div className="h-8 w-4 flex items-center justify-center text-blue-600">
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={goPrev}
              disabled={state.currentStep === 1}
              className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Step"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goNext}
              disabled={state.currentStep === 11}
              className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Step"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={resetAll}
              className="p-2 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60"
              title="Reset All"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="min-h-[500px]">
        {children}
      </div>
    </div>
  );
}
