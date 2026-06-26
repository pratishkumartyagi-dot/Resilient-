"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Trash2, FlaskConical, Beaker } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter, callDeepSeek } from "@/lib/ai";
import { buildStep6Prompt } from "@/lib/research-skills";

const generateMockQuestions = (type: "qualitative" | "quantitative") => {
  const qualQuestions = [
    { id: `rq-${Date.now()}-1`, question: "How do healthcare workers perceive the acceptability and feasibility of annual IGRA-based LTBI screening in their workplace?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-2`, question: "What institutional barriers and enablers shape the implementation of LTBI screening programs across diverse healthcare settings?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-3`, question: "How do HCWs experience and navigate stigma following a positive LTBI diagnosis in occupational settings?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-4`, question: "In what ways do digital health tools influence contact tracing completion rates and participant satisfaction among high-risk communities?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-5`, question: "How do frontline nursing staff describe the trade-offs between mobile van screening and fixed-site clinic access?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-6`, question: "What insights do facility IPC managers offer regarding the operational integration of annual LTBI screening within existing occupational health workflows?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-7`, question: "How does perceived institutional trust moderate the disclosure decisions of HCWs who test positive for LTBI?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-8`, question: "What role does community engagement play in the effectiveness of mobile radiology van screening programs?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-9`, question: "How do returning migrant HCWs describe their exposure risk experiences in endemic versus non-endemic settings?", type: "qualitative" as const, selected: false },
    { id: `rq-${Date.now()}-10`, question: "What are the perceived strengths and limitations of current LTBI screening guidelines from the perspective of occupational health physicians?", type: "qualitative" as const, selected: false },
  ];

  const quantQuestions = [
    { id: `rq-${Date.now()}-1`, question: "What is the comparative prevalence of LTBI among HCWs in tertiary versus primary healthcare settings across a nationally representative sample?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-2`, question: "Does a mobile van-based annual IGRA screening program reduce LTBI incidence by ≥30% compared with standard triennial TST over a 5-year follow-up?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-3`, question: "What is the cost per QALY gained from a digital-app-supported LTBI contact tracing intervention vs. standard paper-based tracing in urban Indian settings?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-4`, question: "Is there a statistically significant association between IPC infrastructure investment (USD per bed) and HCW LTBI conversion rates within hospital networks?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-5`, question: "What is the sensitivity, specificity, and positive predictive value of combined IGRA + radiography screening compared to IGRA alone in a high-prevalence rural Chinese cohort?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-6`, question: "Does SMS-based appointment reminder delivery increase IPT completion rates by ≥25% compared with no reminder condition among healthcare workers?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-7`, question: "What is the attributable fraction of LTBI risk explained by occupational exposure duration (>10 years) in a case-control study of HCWs?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-8`, question: "Among HCWs with positive IGRA, does weekly phone coaching during the 6-month IPT regimen improve medication adherence compared to standard care?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-9`, question: "What is the inter-rater reliability of TST reading performed by trained nurses vs. physicians in a cluster-randomized design?", type: "quantitative" as const, selected: false },
    { id: `rq-${Date.now()}-10`, question: "Does implementation of a mandatory annual LTBI screening policy lead to measurable change in HCW LTBI prevalence over a 3-year period?", type: "quantitative" as const, selected: false },
  ];

  return type === "qualitative" ? qualQuestions : quantQuestions;
};

export default function Step6ResearchQuestions() {
  const { state, dispatch } = useApp();
  const [questions, setQuestions] = useState<typeof state.researchQuestions>(state.researchQuestions);
  const [questionType, setQuestionType] = useState<"qualitative" | "quantitative">("qualitative");
  const [customQuestion, setCustomQuestion] = useState(state.userQuestionInput);

  const handleGenerateQuestions = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select papers in Step 2 first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setQuestions([]);

    try {
      const prompt = buildStep6Prompt(state.papers, state.themes, state.searchQuery);

      let responseText: string = "";
      if (state.deepseekApiKey) {
        responseText = await callDeepSeek(state.deepseekApiKey, prompt);
      } else if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        throw new Error("No API key configured. Please open Settings (gear icon).");
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();

      const questions: any[] = [];
      const lines = cleaned.split("\n");
      let currentType: "qualitative" | "quantitative" = questionType;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.match(/^#{1,3}\s/i)) continue;

        const questionMatch = trimmed.match(/^(?:\d+\.|[-*]|•)\s+(.+)/);
        if (questionMatch && questionMatch[1].length > 20) {
          const qText = questionMatch[1]
            .replace(/\*\*/g, "")
            .replace(/\*\(([^)]+)\)\*/, "($1)")
            .trim();

          const isQual = /qualitative|experience|perception|perspective|narrative|how do|what are the/i.test(qText);
          const isQuant = /quantitative|prevalence|incidence|association|correlation|what is the|does a|is there a/i.test(qText);

          questions.push({
            id: `rq-${Date.now()}-${questions.length}`,
            question: qText,
            type: isQual ? "qualitative" : isQuant ? "quantitative" : questionType,
            selected: false,
          });
        }
      }

      if (questions.length === 0) {
        const fallback = generateMockQuestions(questionType);
        setQuestions(fallback);
        dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: fallback });
      } else {
        setQuestions(questions);
        dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: questions });
      }
    } catch (err: any) {
      console.error("Question generation failed:", err);
      const fallback = generateMockQuestions(questionType);
      setQuestions(fallback);
      dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: fallback });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const toggleQuestion = (qId: string) => {
    const updated = questions.map((q) =>
      q.id === qId ? { ...q, selected: !q.selected } : q
    );
    setQuestions(updated);
    dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: updated });
  };

  const handleAddCustomQuestion = () => {
    if (!customQuestion.trim()) return;
    const newQ = {
      id: `rq-${Date.now()}-custom`,
      question: customQuestion.trim(),
      type: questionType,
      selected: true,
    };
    const updated = [...questions, newQ];
    setQuestions(updated);
    dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: updated });
    setCustomQuestion("");
    dispatch({ type: "SET_USER_QUESTION_INPUT", payload: "" });
  };

  const selectedCount = questions.filter((q) => q.selected).length;

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 6: Research Questions</h2>
        <p className="text-sm text-blue-300 mb-6">
          Generate focused research questions based on your selected themes.
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-3 bg-blue-950/60 border border-blue-900 rounded-lg px-4 py-2.5">
            <span className="text-sm text-blue-200 font-medium">Methodology:</span>
            <button
              onClick={() => setQuestionType("qualitative")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                questionType === "qualitative"
                  ? "bg-yellow-500 text-[#0a1a3a]"
                  : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
              }`}
            >
              <Beaker size={14} />
              Qualitative
            </button>
            <button
              onClick={() => setQuestionType("quantitative")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                questionType === "quantitative"
                  ? "bg-yellow-500 text-[#0a1a3a]"
                  : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
              }`}
            >
              <FlaskConical size={14} />
              Quantitative
            </button>
          </div>

          <button
            onClick={handleGenerateQuestions}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating..." : "Generate Research Questions"}
          </button>

          <span className="text-xs bg-blue-800 text-blue-200 px-2 py-1 rounded-full ml-auto">
            {selectedCount} selected
          </span>
        </div>

        {state.isLoading && questions.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Formulating research questions...</p>
            </div>
          </div>
        )}

        {!state.isLoading && questions.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Beaker size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate research questions aligned to your study methodology.</p>
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  q.selected
                    ? "bg-yellow-900/20 border-yellow-600/50"
                    : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                }`}
                onClick={() => toggleQuestion(q.id)}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      q.selected ? "bg-yellow-500 border-yellow-400" : "border-blue-600"
                    }`}
                  >
                    {q.selected && (
                      <svg className="w-3 h-3 text-[#0a1a3a]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-blue-400 mr-2">#{idx + 1}</span>
                  <span className="text-sm text-white">{q.question}</span>
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${q.type === "qualitative" ? "bg-purple-900/50 text-purple-300" : "bg-emerald-900/50 text-emerald-300"}`}>
                    {q.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-blue-900">
          <label className="block text-sm font-medium text-blue-200 mb-2">Add custom research question</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => {
                setCustomQuestion(e.target.value);
                dispatch({ type: "SET_USER_QUESTION_INPUT", payload: e.target.value });
              }}
              placeholder="e.g., How does IPT completion vary by age group among HCWs?"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomQuestion()}
              className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              onClick={handleAddCustomQuestion}
              disabled={!customQuestion.trim()}
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
