"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronLeft, FileText, Save, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";
import { buildStep10Prompt } from "@/lib/research-skills";

export default function Step10Protocol() {
  const { state, dispatch } = useApp();
  const [localProtocol, setLocalProtocol] = useState({
    background: state.protocol.background || "",
    objectives: state.protocol.objectives || "",
    methods: state.protocol.methods || "",
    expectedOutcomes: state.protocol.expectedOutcomes || "",
  });
  const [generatedProtocol, setGeneratedProtocol] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const updateSection = (section: string, val: string) => {
    const updated = { ...localProtocol, [section]: val };
    setLocalProtocol(updated);
    dispatch({ type: "SET_PROTOCOL", payload: { [section]: val } });
  };

  const handleGenerateProtocol = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select papers in Step 2 first.");
      return;
    }

    setIsGenerating(true);
    setGeneratedProtocol("");

    try {
      const prompt = buildStep10Prompt(state.aimObjectives, state.papers, state.studyType, state.synthesisTable);

      let responseText: string = "";
      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedProtocol(cleaned);

      const sectionPatterns: Record<string, RegExp> = {
        background: /## A\.\s*Study Intent Summary[\s\S]*?(?=## B\.|$)/,
        objectives: /## B\.\s*Why Cohort Design Fits[\s\S]*?(?=## C\.|$)/,
        methods: /## C\.\s*Recommended Cohort Type[\s\S]*?(?=## D\.|$)/,
        expectedOutcomes: /## D\.\s*Source Population[\s\S]*?(?=## E\.|$)/,
      };

      for (const [key, pattern] of Object.entries(sectionPatterns)) {
        const match = cleaned.match(pattern);
        if (match) {
          updateSection(key, match[0].replace(/^##\s*[A-Z]\.\s*[^\n]+\n*/i, "").trim());
        }
      }
    } catch (err: any) {
      console.error("Protocol generation failed:", err);
      alert(err.message || "Failed to generate protocol. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const sections: { key: string; label: string; placeholder: string; defaultContent: string }[] = [
    {
      key: "background",
      label: "Background & Rationale",
      placeholder: "Provide background context, problem statement, and justification...",
      defaultContent: `Background: Latent tuberculosis infection (LTBI) represents a major global health burden, with healthcare workers (HCWs) facing significantly elevated occupational risk. Despite established guidelines, implementation of systematic screening programs remains inconsistent, particularly in low- and middle-income countries (LMICs) where institutional resources are limited.

Rationale: This study addresses the implementation gap by evaluating an integrated IGRA-based annual screening program combined with digital health-enhanced contact tracing in tertiary hospital settings. Evidence from Nigeria (Okonkwo et al., 2023), China (Chen et al., 2021), and India (Kumar et al., 2024) collectively supports both the clinical effectiveness and cost-effectiveness of such an approach.`,
    },
    {
      key: "objectives",
      label: "Objectives",
      placeholder: "List primary and secondary objectives...",
      defaultContent: `Primary Objective:
To evaluate the implementation effectiveness and cost-effectiveness of an annual IGRA-based LTBI screening program among healthcare workers in tertiary care hospitals in Nigeria compared with standard TST-based triennial screening.

Secondary Objectives:
1. To assess HCW acceptability and perceived feasibility of the IGRA screening program through qualitative interviews.
2. To measure the impact of digital SMS reminders on IPT regimen completion rates.
3. To model the budgetary impact of scaled IGRA implementation at national hospital network level.
4. To assess operational barriers (scheduling, staffing, logistics) associated with annual screening rollout.`,
    },
    {
      key: "methods",
      label: "Methods & Study Design",
      placeholder: "Describe study design, sampling, data collection, and analysis...",
      defaultContent: `Study Design: Mixed-methods sequential explanatory design comprising a non-blinded cluster randomized controlled trial (cRCT) nested within a qualitative process evaluation.

Setting: 8 tertiary hospitals across Lagos and Abuja, Nigeria (4 intervention, 4 control).

Participants: All currently employed HCWs with direct patient contact for ≥6 months (estimated N=3,200).

Intervention: Annual workplace IGRA (QuantiFERON-TB Gold Plus) with same-day counseling, plus digital SMS reminders for IPT appointments.

Comparator: Standard annual TST with physician reading at 48–72 hours (control arm).

Outcomes: Primary—LTBI conversion rate at 12 months (IGRA/TST conversion criteria). Secondary—IPT completion rate, cost per QALY, process evaluation themes.

Analysis: Mixed-effects logistic regression adjusting for site-level clustering; thematic analysis of qualitative interviews using NVivo.`,
    },
    {
      key: "expectedOutcomes",
      label: "Expected Outcomes & Significance",
      placeholder: "Describe expected findings, potential impact, and dissemination plan...",
      defaultContent: `Expected Outcomes:
1. Annual IGRA screening will demonstrate superior sensitivity (≥90% vs. 75% TST) and lower signal loss (≤5% vs. 18% defaulting).
2. IPT completion rates will improve from 38% (historical) to ≥75% with digital reminders.
3. ICER will remain below $1,500/QALY, supporting national adoption under Nigeria's health benefits package.
4. Qualitative analysis will identify 4–6 implementation themes related to scheduling, trust, stigma, and institutional support.

Significance: The study will provide Nigeria's Ministry of Health and WHO AFRO with evidence to update occupational TB screening guidelines. Productive dissemination will include peer-reviewed publication, national policy brief, and open-access data repository deposition.`,
    },
  ];

  const ensureSectionLoaded = (key: string, val: string) => {
    if (!val.trim()) {
      const defaultContent = sections.find((s) => s.key === key)?.defaultContent || "";
      updateSection(key, defaultContent);
    }
  };

  const loadAllDefaults = () => {
    sections.forEach((s) => ensureSectionLoaded(s.key, localProtocol[s.key as keyof typeof localProtocol] || ""));
  };

  const handleProceed = () => {
    dispatch({ type: "SET_STEP", payload: 11 });
  };

  const handleExport = () => {
    const protocolText = sections
      .map((s) => `## ${s.label}\n\n${localProtocol[s.key as keyof typeof localProtocol]}`)
      .join("\n\n---\n\n");
    const blob = new Blob([protocolText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "protocol-draft.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 10: Research Protocol</h2>
            <p className="text-sm text-blue-300">
              Design a structured clinical cohort study protocol using AIPOCH Clinical Cohort Protocol Designer methodology.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadAllDefaults}
              className="text-sm bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-900/70 flex items-center gap-1"
            >
              <FileText size={14} />
              Load Defaults
            </button>
            <button
              onClick={handleGenerateProtocol}
              disabled={isGenerating || state.isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles size={16} />
              {isGenerating ? "Generating..." : "Generate Protocol"}
            </button>
            <button
              onClick={handleExport}
              className="text-sm bg-green-900/50 text-green-300 px-3 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1"
            >
              <Save size={14} />
              Export Draft
            </button>
          </div>
        </div>

        {(isGenerating || state.isLoading) && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Designing cohort protocol framework...</p>
              <p className="text-blue-400 text-xs mt-1">Following AIPOCH cohort design methodology (A–L sections)</p>
            </div>
          </div>
        )}

        {generatedProtocol && !isGenerating && (
          <div className="mb-6 bg-blue-950/30 border border-blue-900/50 rounded-lg p-5">
            <p className="text-xs text-blue-400 mb-3 font-medium">AI-generated protocol framework (sections auto-filled below):</p>
            <pre className="text-sm text-blue-100 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono">{generatedProtocol}</pre>
          </div>
        )}

        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.key}>
              <label className="block text-sm font-semibold text-yellow-200 mb-2">{section.label}</label>
              <textarea
                value={localProtocol[section.key as keyof typeof localProtocol] || ""}
                onChange={(e) => updateSection(section.key, e.target.value)}
                placeholder={section.placeholder}
                rows={8}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-serif leading-relaxed placeholder:text-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => dispatch({ type: "SET_STEP", payload: 9 })}
            className="bg-blue-900/50 text-blue-200 hover:bg-blue-900/70 px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <ChevronLeft size={16} />
            Back to Methodology
          </button>
          <button
            onClick={handleProceed}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
          >
            Proceed to Impact Assessment
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
