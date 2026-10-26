"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { Dna, MessageSquare, BarChart3, Sigma, FileText, PenLine, ScrollText, DollarSign, BookOpen, Microscope, ClipboardCheck } from "lucide-react";

const MAIN_TABS = [
  { id: "chat", label: "Resilient Chat", icon: MessageSquare },
  { id: "stats", label: "Statistical Analysis", icon: BarChart3 },
  { id: "samplesize", label: "Sample Size Calculator", icon: Sigma },
  { id: "predictive", label: "Predictive Analysis", icon: BarChart3 },
  { id: "paperwriter", label: "Paper Writer & Reviewer", icon: PenLine },
  { id: "protocol", label: "Protocol Generator", icon: ScrollText },
  { id: "grant", label: "Grant Writing", icon: DollarSign },
  { id: "omics", label: "Omics & Bioinformatics", icon: Dna },
  { id: "thesis", label: "Thesis Generator", icon: BookOpen },
  { id: "evidence-synthesis", label: "Evidence Synthesis", icon: FileText },
  { id: "appraisal", label: "Critical Appraisal", icon: ClipboardCheck },
];

export default function TopTabs() {
  const { state, dispatch } = useApp();

  return (
    <nav className="bg-[#0d1b3e] border-b border-blue-900/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap items-center gap-1">
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
