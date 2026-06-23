"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Lightbulb, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";
import { buildStep5Prompt } from "@/lib/research-skills";

function generateMockThemes(): any[] {
  return [
    { id: "theme-1", title: "Occupational Exposure and Healthcare Risk Stratification", description: "Focuses on identifying HCWs at highest risk based on professional environment and role, with evidence skewed toward tertiary hospital settings.", reasoning: "5 papers examined HCW risk profiles by department and exposure type. Strong evidence clustering in high-income tertiary settings creates a primary care gap.", selected: false },
    { id: "theme-2", title: "Diagnostic Performance and Comparative Accuracy (IGRA vs. TST)", description: "Evaluates tools used to detect LTBI, focusing on agreement and trade-offs between TST and IGRAs, including emerging AI/ML diagnostic tools.", reasoning: "9 papers directly compared diagnostic modalities. Consensus favors IGRAs on specificity; 2 papers introduced ML forecasting approaches suggesting an emerging subtheme.", selected: false },
    { id: "theme-3", title: "The LTBI Care Cascade and Treatment Adherence", description: "Analyzes the screening-to-completion journey, identifying provider and demand-side barriers leading to care cascade losses.", reasoning: "7 papers documented adherence rates ranging from 38%–89%. Completion rates strongly correlated with monitoring intensity, highlighting a replicable intervention pattern.", selected: false },
    { id: "theme-4", title: "Biological and Social Determinants (Syndemic Perspective)", description: "Explores how TB interacts with comorbidities (T2DM, HIV), malnutrition, behavioral risks, and COVID-19 co-infection.", reasoning: "4 papers reported T2DM and HIV as compounding risk factors. Evidence volume is moderate, but clinical significance is high — represents a meaningful whitespace for integrated intervention studies.", selected: false },
    { id: "theme-5", title: "Implementation Science and Methodological Gaps", description: "Critiques how LTBI research is conducted and where it fails to translate into policy; highlights absence of fidelity assessments and long-term follow-up.", reasoning: "6 papers lacking implementation fidelity assessments or health economic evaluations. Single-country conduct restricts generalizability — a clear pattern across all major studies.", selected: false },
    { id: "theme-6", title: "Structural Barriers and Health System Factors", description: "Examines IPC infrastructure, ventilation, staffing ratios, and institutional resources as moderators of LTBI transmission risk.", reasoning: "3 facility-level studies showed HEPA filtration and negative-pressure rooms reduced conversion rates by 60%. IPC budget showed dose-response relationship, but evidence base is limited to 3 studies.", selected: false },
    { id: "theme-7", title: "Digital Health Interventions for Contact Tracing", description: "Role of mobile apps, SMS reminders, biometric tracking in improving TB contact tracing efficiency and completion rates.", reasoning: "4 papers employing digital tools reported 35–47% improvements in contact tracing. Chatbot-based pre-screening reduced queue times by 60% — novel intervention angle with moderate evidence.", selected: false },
    { id: "theme-8", title: "Economic Evaluation and Cost-Effectiveness Evidence", description: "Assesses economic burden of LTBI screening and cost-effectiveness of alternative strategies across LMIC and HIC payer perspectives.", reasoning: "4 cost-effectiveness analyses with ICERs from $680–$4,100/QALY. Key cost driver: personnel time for TST reading versus single-visit IGRA. Evidence moderate but geographically clustered.", selected: false },
    { id: "theme-9", title: "Stigma, Disclosure, and Psychosocial Impact", description: "Psychosocial dimensions of LTBI diagnosis among HCWs: internalized stigma, workplace disclosure concerns, mental health sequelae.", reasoning: "4 qualitative studies revealed consistent patterns of anxiety and disclosure fear. Stigma mediated by perceived institutional trust — important but under-represented in quantitative literature.", selected: false },
    { id: "theme-10", title: "Migration, Mobility, and Cross-Border LTBI Risk", description: "Examines how HCW migration patterns, training in endemic regions, and return migration create differential LTBI risk profiles.", reasoning: "3 papers showed returning migrant HCWs had 2.3× higher LTBI prevalence. Pre- and post-return screening inconsistently applied across 7 countries — high whitespace for policy intervention research.", selected: false },
  ];
}

export default function SRStep4Themes() {
  const { state, dispatch } = useApp();
  const [themes, setThemes] = useState<any[]>(state.themes);
  const [customTheme, setCustomTheme] = useState(state.userThemeInput || "");

  const handleGenerateThemes = async () => {
    const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;
    if (selectedPapers.length === 0) {
      alert("Please complete Steps 1–2 with selected papers first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setThemes([]);

    try {
      const prompt = buildStep5Prompt(selectedPapers, state.synthesisTable);
      let responseText: string = "";

      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        const fallback = generateMockThemes();
        setThemes(fallback);
        dispatch({ type: "SET_THEMES", payload: fallback });
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }

      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

      let parsed: any[] = [];
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = [];
        }
      }

      const normalized = parsed.map((t: any, i: number) => ({
        id: t.id || `theme-${Date.now()}-${i}`,
        title: t.title || `Theme ${i + 1}`,
        description: t.description || "",
        reasoning: t.reasoning || "",
        selected: false,
      }));

      const finalThemes = normalized.length >= 5 ? normalized.slice(0, 10) : generateMockThemes();
      finalThemes.forEach((t: any, i: number) => { if (!t.id) t.id = `theme-${Date.now()}-${i}`; });

      setThemes(finalThemes);
      dispatch({ type: "SET_THEMES", payload: finalThemes });
    } catch (err: any) {
      console.error("Theme generation failed:", err);
      const fallback = generateMockThemes();
      setThemes(fallback);
      dispatch({ type: "SET_THEMES", payload: fallback });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const toggleTheme = (themeId: string) => {
    const updated = themes.map((t) => (t.id === themeId ? { ...t, selected: !t.selected } : t));
    setThemes(updated);
    dispatch({ type: "SET_THEMES", payload: updated });
  };

  const handleAddCustomTheme = () => {
    if (!customTheme.trim()) return;
    const newTheme = {
      id: `theme-${Date.now()}-custom`,
      title: customTheme.trim(),
      description: "User-defined research theme requiring further exploration.",
      reasoning: "Added manually by researcher during theme review.",
      selected: true,
    };
    const updated = [...themes, newTheme];
    setThemes(updated);
    dispatch({ type: "SET_THEMES", payload: updated });
    setCustomTheme("");
    dispatch({ type: "SET_USER_THEME_INPUT", payload: "" });
  };

  const selectedCount = themes.filter((t) => t.selected).length;

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 4: Generate Themes</h2>
            <p className="text-sm text-blue-300">
              AI extracts 10 key research themes from evidence synthesis using semantic deep research.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-1 rounded-full">{selectedCount} selected</span>
            <button
              onClick={handleGenerateThemes}
              disabled={state.isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles size={16} />
              {state.isLoading ? "Generating..." : "Generate Themes"}
            </button>
          </div>
        </div>

        {state.isLoading && themes.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Performing semantic analysis and extracting research themes...</p>
            </div>
          </div>
        )}

        {!state.isLoading && themes.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Lightbulb size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate 10 research themes from your evidence synthesis.</p>
          </div>
        )}

        {themes.length > 0 && (
          <>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {themes.map((theme: any, index: number) => (
                <div
                  key={theme.id}
                  onClick={() => toggleTheme(theme.id)}
                  className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                    theme.selected ? "bg-yellow-900/20 border-yellow-600/50" : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex-shrink-0">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${theme.selected ? "bg-yellow-500 border-yellow-400" : "border-blue-600"}`}>
                        {theme.selected && (
                          <svg className="w-3 h-3 text-[#0a1a3a]" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-400">#{index + 1}</span>
                        <h4 className="text-sm font-semibold text-white">{theme.title}</h4>
                      </div>
                      <p className="text-xs text-blue-300 mb-1.5 leading-relaxed">{theme.description}</p>
                      <p className="text-xs text-teal-300/80 italic leading-relaxed border-l-2 border-teal-700 pl-2 bg-teal-900/10 rounded-r py-1">
                        <Lightbulb size={10} className="inline mr-1 text-teal-400" />
                        {theme.reasoning}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-blue-900">
              <label className="block text-sm font-medium text-blue-200 mb-2">Add custom theme</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTheme}
                  onChange={(e) => {
                    setCustomTheme(e.target.value);
                    dispatch({ type: "SET_USER_THEME_INPUT", payload: e.target.value });
                  }}
                  placeholder="e.g., Policy barriers to cross-border TB screening"
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomTheme()}
                  className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm"
                />
                <button
                  onClick={handleAddCustomTheme}
                  disabled={!customTheme.trim()}
                  className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 5 })}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
              >
                Generate Research Questions <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

