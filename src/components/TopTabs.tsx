"use client";

import React, { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { FlaskConical as FlaskConicalIcon, Dna, MessageSquare, BarChart3, Sigma, FileText, PenLine, ScrollText, Sparkles, BookOpen } from "lucide-react";

const MAIN_TABS = [
  { id: "main", label: "Research Pipeline", icon: FlaskConicalIcon },
  { id: "omics", label: "Omics & Bioinformatics", icon: Dna },
  { id: "chat", label: "Resilient Chat", icon: MessageSquare },
  { id: "stats", label: "Statistical Analysis", icon: BarChart3 },
  { id: "samplesize", label: "Sample Size Calculator", icon: Sigma },
  { id: "predictive", label: "Predictive Analysis", icon: BarChart3 },
  { id: "autoprognosis", label: "AutoPrognosis", icon: Sparkles },
  { id: "systematic", label: "Evidence Synthesis", icon: FileText },
  { id: "paperwriter", label: "Paper Writer & Reviewer", icon: PenLine },
  { id: "protocol", label: "Protocol Generator", icon: ScrollText },
  { id: "auto_evidence", label: "Automatic Evidence Synthesis", icon: BookOpen },
];

const TopTabs = () => {
  const { state, dispatch } = useApp();

  const tabs = useMemo(() => MAIN_TABS, []);

  return (
    <nav className="bg-[#0d1b3e] border-b border-blue-900/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = state.currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => dispatch({ type: "SET_TAB", payload: tab.id })}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-yellow-400 text-yellow-300"
                    : "border-transparent text-blue-300 hover:text-white"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default TopTabs;
