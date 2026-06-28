"use client";

import React, { useState } from "react";
import { Sparkles, BookOpen, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek } from "@/lib/ai";
import { buildStep4Prompt } from "@/lib/research-skills";
import { generateLocalLiteratureReview } from "@/lib/local-synthesis";

const generateMockLiteratureReview = (): string => {
  return `# Literature Review\n\n> **Note:** This review was generated using local NLP analysis because no API key is configured. Add a Gemini or Groq API key in Settings for a richer AI-generated review.\n\n---\n\nNo papers selected or available. Please select papers in Step 2 and generate a synthesis table in Step 3 before proceeding to Step 4.`;
};

export default function Step4LiteratureReview() {
  const { state, dispatch } = useApp();
  const [reviewText, setReviewText] = useState(state.literatureReview || "");

  const handleGenerateReview = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select papers in Step 2 first, or generate a synthesis table in Step 3.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setReviewText("");

    try {
      const synthesisContext = state.synthesisTable.length > 0
        ? "\n\nPRE-COMPUTED SYNTHESIS TABLE (use this as the core evidence base):\n" +
          state.synthesisTable.map((r, i) => `${i + 1}. ${r.reference}\n   Key findings: ${r.keyFindings}\n   Study: ${r.studyDetails}\n   Gaps: ${r.researchGaps}`).join("\n\n")
        : "";

      let review: string = "";

      if (state.deepseekApiKey) {
        const prompt = buildStep4Prompt(selected, "") + synthesisContext;
        review = await callDeepSeek(state.deepseekApiKey, prompt);
      } else if (state.geminiApiKey) {
        const prompt = buildStep4Prompt(selected, "") + synthesisContext;
        review = await callGemini(state.geminiApiKey, prompt);
      } else if (state.groqApiKey) {
        const prompt = buildStep4Prompt(selected, "") + synthesisContext;
        review = await callGroq(state.groqApiKey, prompt);
      } else {
        review = generateLocalLiteratureReview(
          selected.map((p) => ({
            authors: p.authors,
            year: p.year,
            title: p.title,
            journal: p.journal,
            abstract: p.abstract,
            doi: p.doi,
            studyType: p.studyType,
            database: p.database,
          })),
          state.searchQuery
        );
      }

      review = review.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setReviewText(review);
      dispatch({ type: "SET_LITERATURE_REVIEW", payload: review });
    } catch (err: any) {
      console.error("Literature review generation failed:", err);
      const selectedForLocal = state.papers.filter((p) => p.selected);
      if (selectedForLocal.length > 0) {
        const fallback = generateLocalLiteratureReview(
          selectedForLocal.map((p) => ({
            authors: p.authors,
            year: p.year,
            title: p.title,
            journal: p.journal,
            abstract: p.abstract,
            doi: p.doi,
            studyType: p.studyType,
            database: p.database,
          })),
          state.searchQuery
        );
        setReviewText(fallback);
        dispatch({ type: "SET_LITERATURE_REVIEW", payload: fallback });
      } else {
        setReviewText(generateMockLiteratureReview());
        dispatch({ type: "SET_LITERATURE_REVIEW", payload: generateMockLiteratureReview() });
      }
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setReviewText(newValue);
    dispatch({ type: "SET_LITERATURE_REVIEW", payload: newValue });
  };

  const handleReset = () => {
    if (confirm("Reset literature review to original AI-generated version?")) {
      handleGenerateReview();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 4: Review of Literature</h2>
            <p className="text-sm text-blue-300">
              Generate a comprehensive thematic literature review synthesized from your selected papers using AIPOCH methodology.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={!reviewText || state.isLoading}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleGenerateReview}
              disabled={state.isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles size={16} />
              {state.isLoading ? "Generating..." : "Generate Review of Literature"}
            </button>
          </div>
        </div>

        {state.isLoading && !reviewText && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Synthesizing evidence across selected papers thematically...</p>
              <p className="text-blue-400 text-xs mt-1">This may take 30-60 seconds</p>
            </div>
          </div>
        )}

        {!state.isLoading && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-blue-400 flex items-center gap-1">
                <BookOpen size={12} />
                Editable — modify the generated text below
              </span>
              <span className="text-xs text-blue-500">{reviewText.length} characters | {reviewText.split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <textarea
              value={reviewText}
              onChange={handleTextChange}
              placeholder="AI-generated literature review will appear here. You can also paste your own text..."
              className="w-full h-[500px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-serif leading-relaxed placeholder:text-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
            />
          </div>
        )}
      </div>
    </div>
  );
}
