"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Trash2, Lightbulb } from "lucide-react";
import { useApp } from "@/context/AppContext";

const generateMockThemes = () => {
  return [
    {
      id: `theme-${Date.now()}-1`,
      title: "Occupational Exposure and Screening Protocol Gaps",
      description: "Systematic identification of inconsistencies in institutional LTBI screening protocols across healthcare settings, revealing gaps in coverage timing and target population specification.",
      reasoning: "This theme emerged from 8 of 23 included studies. Three studies reported annual TST-based protocols while 5 used biennial IGRA schedules. The heterogeneity of screening frequency and modality strongly suggests the absence of standardized institutional frameworks in many contexts.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-2`,
      title: "Structural Barriers to Screening Uptake",
      description: "Examination of institutional, geographical, and socioeconomic barriers that impede HCW access to structured LTBI screening programs in both LMIC and HIC settings.",
      reasoning: "Extracted synthesis identified 'scheduling inflexibility', 'geographic distance', and 'cost concerns' as recurrent friction points. Notably, mobile van initiatives and digital scheduling tools were repeatedly cited as effective mitigants, pointing to a broader category of access-related determinants.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-3`,
      title: "Diagnostic Modality Selection: IGRA vs. TST Trade-offs",
      description: "Analysis of the clinical, operational, and economic factors influencing the selection of IGRA versus TST as the preferred screening modality in different institutional contexts.",
      reasoning: "Of the 12 studies reporting diagnostic accuracy comparisons, 9 favored IGRA on specificity grounds. Cost-effectiveness data from Nigeria, Brazil, and India independently confirmed IGRA dominance at national income-level thresholds—suggesting translatability of the finding across socio-economic contexts.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-4`,
      title: "Preventive Therapy Completion and Adherence",
      description: "Synthesis of evidence on factors influencing completion rates of isoniazid preventive therapy (IPT) and rifapentine-based regimens among HCWs.",
      reasoning: "Completion rates varied from 38% (unmonitored self-administered IPT) to 89% (directly observed therapy with digital reminders). The variation is largely attributable to monitoring intensity and patient–provider relationship quality, underscoring the design priority of adherence support systems.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-5`,
      title: "Health System Factors and IPC Infrastructure",
      description: "The influence of infection prevention and control (IPC) infrastructure—including ventilation standards, N95 availability, and institutional IPC budget—moderates LTBI transmission risk within healthcare facilities.",
      reasoning: "Three facility-level studies found that HCWs in wards with HEPA filtration and monitored negative-pressure rooms had 60% lower conversion rates than those in standard airflow settings. IPC budget per bed demonstrated a dose-response relationship with LTBI incidence.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-6`,
      title: "Digital Health Interventions for Contact Tracing",
      description: "Role of mobile applications, SMS reminders, and biometric ID-linked patient tracking in improving the efficiency and completeness of TB contact tracing programs.",
      reasoning: "Studies employing digital tools reported 35–47% improvements in contact tracing completion, with chatbot-based pre-screening reducing in-person queue times by 60%. These innovations were particularly impactful in high-density urban settings.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-7`,
      title: "Economic Evaluation and Cost-Effectiveness Evidence",
      description: "Systematic assessment of the economic burden of LTBI screening programs and the cost-effectiveness of different strategies from LMIC and HIC payer perspectives.",
      reasoning: "Meta-regression of 4 cost-effectiveness analyses indicated ICERs ranging from $680/QALY (Ethiopia) to $4,100/QALY (UK private payer perspective). Key cost drivers were personnel time for TST reading (vs. single-visit IGRA) and equipment depreciation for mobile van services.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-8`,
      title: "Stigma, Disclosure, and Psychological Impact",
      description: "Psychosocial dimensions of LTBI diagnosis among HCWs, including internalized stigma, workplace disclosure concerns, and mental health sequelae.",
      reasoning: "Qualitative syntheses from 4 studies revealed a consistent pattern of anxiety, fear of assignment restrictions, and partial disclosure to colleagues and family members. Stigma was mediated by perceived institutional trust and privacy assurances during screening counseling.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-9`,
      title: "Intersection of Migration, Mobility, and LTBI Risk",
      description: "Examination of how HCW migration patterns, training in endemic regions, and return migration pathways contribute to differential LTBI risk profiles.",
      reasoning: "Three studies highlighted that domestically trained HCWs returning from endemic rotations presented with LTBI prevalence 2.3× higher than non-mobile peers. Pre-departure and post-return screening protocols were inconsistently applied across 7 countries studied.",
      selected: false,
    },
    {
      id: `theme-${Date.now()}-10`,
      title: "Methodological Heterogeneity and Evidence Quality",
      description: "Assessment of the quality, risk of bias, and methodological variation across primary studies included in the synthesis—highlighting where stronger evidence is needed.",
      reasoning: "Using the Newcastle-Ottawa Scale, only 5 of 23 included studies scored ≥7. Common limitations included convenience sampling, non-blinded outcome assessment, lack of power calculation, and inadequate handling of attrition in longitudinal designs.",
      selected: false,
    },
  ];
};

export default function Step5Themes() {
  const { state, dispatch } = useApp();
  const [themes, setThemes] = useState<typeof state.themes>(state.themes);
  const [customTheme, setCustomTheme] = useState(state.userThemeInput);

  const handleGenerateThemes = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const mockThemes = generateMockThemes();
      setThemes(mockThemes);
      dispatch({ type: "SET_THEMES", payload: mockThemes });
      dispatch({ type: "SET_LOADING", payload: false });
    }, 2000);
  };

  const toggleTheme = (themeId: string) => {
    const updated = themes.map((t) =>
      t.id === themeId ? { ...t, selected: !t.selected } : t
    );
    setThemes(updated);
    dispatch({ type: "SET_THEMES", payload: updated });
  };

  const handleAddCustomTheme = () => {
    if (!customTheme.trim()) return;
    const newTheme = {
      id: `theme-${Date.now()}-custom`,
      title: customTheme.trim(),
      description: "User-defined theme requiring further exploration.",
      reasoning: "Added manually by researcher during theme review stage.",
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
            <h2 className="text-xl font-bold text-white">Step 5: Generate Themes</h2>
            <p className="text-sm text-blue-300">
              AI extracts key research themes from your evidence table. Select themes relevant to your focus.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-1 rounded-full">
              {selectedCount} selected
            </span>
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
              <p className="text-blue-200 text-sm">Extracting themes from synthesis table...</p>
            </div>
          </div>
        )}

        {!state.isLoading && themes.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Lightbulb size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate themes from the synthesis table or add your own manually.</p>
          </div>
        )}

        {themes.length > 0 && (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {themes.map((theme, index) => (
              <div
                key={theme.id}
                className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                  theme.selected
                    ? "bg-yellow-900/20 border-yellow-600/50"
                    : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                }`}
                onClick={() => toggleTheme(theme.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        theme.selected
                          ? "bg-yellow-500 border-yellow-400"
                          : "border-blue-600"
                      }`}
                    >
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
                      AI reasoning: {theme.reasoning}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
              placeholder="e.g., Policy and regulatory barriers to LTBI screening implementation"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomTheme()}
              className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              onClick={handleAddCustomTheme}
              disabled={!customTheme.trim()}
              className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
