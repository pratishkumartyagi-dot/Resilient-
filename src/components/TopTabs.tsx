"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { FlaskConical as FlaskConicalIcon, Dna, MessageSquare, BarChart3, Sigma, FileText, PenLine, ScrollText } from "lucide-react";

const MAIN_TABS = [
  { id: "main", label: "Research Pipeline", icon: FlaskConicalIcon },
  { id: "omics", label: "Omics & Bioinformatics", icon: Dna },
  { id: "chat", label: "Resilient Chat", icon: MessageSquare },
  { id: "stats", label: "Statistical Analysis", icon: BarChart3 },
  { id: "samplesize", label: "Sample Size Calculator", icon: Sigma },
  { id: "systematic", label: "Evidence Synthesis & Meta-analysis", icon: FileText },
  { id: "paperwriter", label: "Paper Writer & Reviewer", icon: PenLine },
  { id: "protocol", label: "Protocol Generator", icon: ScrollText },
];

export default function TopTabs() {
  const { state, dispatch } = useApp();

  return (
    <nav className="bg-[#0d1b3e] border-b border-blue-900/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = state.currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => dispatch({ type: "SET_TAB", payload: tab.id })}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-yellow-400 text-yellow-300"
                    : "border-transparent text-blue-300 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
