"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Trash2, Lightbulb } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { SynthesisRow, Theme } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import { buildStep5Prompt } from "@/lib/research-skills";

const generateMockThemes = (synthesisTable: SynthesisRow[]): Theme[] => {
  // Derive themes from the actual research gaps recorded in the Step 3 synthesis
  // table rather than shipping hard-coded demo content. Each synthesis row's
  // researchGaps field carries "Limitations / Contradictions / Exclusions / Gaps"
  // plus "Future Work / Recommendations", which are the raw theme material.
  const gapPhrases = synthesisTable.flatMap((row) => {
    const text = row.researchGaps || "";
    return text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  });

  if (gapPhrases.length === 0) {
    return [
      {
        id: `theme-${Date.now()}-1`,
        title: "Evidence gaps in the included literature",
        description: "No structured research gaps were extracted in Step 3. Generate a synthesis table first so themes can be grounded in the included papers.",
        reasoning: "Fallback theme created because the synthesis table contained no research-gap data.",
        selected: false,
      },
    ];
  }

  return gapPhrases.slice(0, 10).map((gap, i) => {
    const title = gap
      .replace(/^(Limitations|Contradictions|Exclusion criteria|Gaps|Future Work\s*\/\s*Recommendations):\s*/i, "")
      .replace(/[|;].*$/, "")
      .trim()
      .slice(0, 80) || `Research theme ${i + 1}`;
    return {
      id: `theme-${Date.now()}-${i}`,
      title,
      description: gap.slice(0, 200),
      reasoning: "Derived from the research-gaps column of the Step 3 evidence synthesis table.",
      selected: false,
    };
  });
};

export default function Step5Themes() {
  const { state, dispatch } = useApp();
  const [themes, setThemes] = useState<typeof state.themes>(state.themes);
  const [customTheme, setCustomTheme] = useState(state.userThemeInput);

  const handleGenerateThemes = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select papers in Step 2 first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setThemes([]);

    try {
      const prompt = buildStep5Prompt(state.papers, state.synthesisTable);
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: state.searchQuery };

      let responseText: string = "";
      try {
        responseText = await callGemini(state.geminiApiKey || "", prompt, searchOptions);
      } catch {
        try {
          responseText = await callGroq(state.groqApiKey || "", prompt, searchOptions);
        } catch {
          try {
            responseText = await callDeepSeek(prompt, searchOptions);
          } catch {
            responseText = "";
          }
        }
      }

      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").replace(/```markdown/g, "").trim();

      let parsedThemes: any[] = [];
      try {
        const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedThemes = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found");
        }
      } catch {
        const lines = cleaned.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("•"));
        parsedThemes = lines.slice(0, 10).map((line, i) => ({
          id: `theme-${Date.now()}-${i}`,
          title: line.replace(/^[-\•]\s*/, "").substring(0, 60),
          description: `Theme extracted from literature analysis: ${line.replace(/^[-\•]\s*/, "").substring(0, 120)}`,
          reasoning: "Generated from AI analysis of selected papers following AIPOCH saturation and whitespace methodology.",
          selected: false,
        }));
      }

      const normalizedThemes = parsedThemes.map((t: any, i: number) => ({
        id: t.id || `theme-${Date.now()}-${i}`,
        title: t.title || t.theme || t.name || `Theme ${i + 1}`,
        description: t.description || t.details || "",
        reasoning: t.reasoning || t.rationale || "Generated from AI analysis of selected papers.",
        selected: false,
      }));

      if (normalizedThemes.length === 0) {
        throw new Error("No themes could be parsed from AI response");
      }

      setThemes(normalizedThemes);
      dispatch({ type: "SET_THEMES", payload: normalizedThemes });
    } catch (err: any) {
      console.error("Theme generation failed:", err);
      const fallback = generateMockThemes(state.synthesisTable);
      setThemes(fallback);
      dispatch({ type: "SET_THEMES", payload: fallback });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
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
