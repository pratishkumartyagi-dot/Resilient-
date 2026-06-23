"use client";

import React, { useState } from "react";
import { Sparkles, Plus, FlaskConical, Beaker, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";
import { buildStep6Prompt } from "@/lib/research-skills";

function buildRqPrompt(papers: any[], themes: any[], researchTopic: string, questionType: "qualitative" | "quantitative"): string {
  return `You are an expert clinical and biomedical research question-framing planner using AIPOCH Clinical Question Clarifier methodology.

TASK: Clarify and generate 10 distinct, testable research questions based on selected papers and identified themes.

QUESTION TYPE: ${questionType.toUpperCase()}

${questionType === "qualitative"
  ? "QUALITATIVE FOCUS: Generate questions about HCW experiences, perceptions, barriers, enablers, implementation challenges, stigma, and institutional factors. Use exploratory, phenomenological, or grounded theory framing."
  : "QUANTITATIVE FOCUS: Generate questions about prevalence, incidence, association, effectiveness, cost-effectiveness, diagnostic accuracy, and comparative effectiveness. Use PICO/PECO framing."}

REQUIREMENTS:
1. Each question must be clear, bounded, and researchable.
2. Ground questions in actual gaps found in the research gaps column of the synthesis table.
3. Use PICOTS framework where applicable.
4. Distinguish between primary and secondary questions.
5. Flag each question as: novel (gap-filling) / confirmatory (replication) / extension (generalizability).

OUTPUT FORMAT — return ONLY a numbered list of 10 questions (no preamble, no JSON):
1. [RQ-1] Research question text here...
   Type: Qualitative/Quantitative | Framing: PICO/PICOTS/Phenomenological | Gap: [which gap this addresses]

${papers.length > 0 ? `\nSELECTED PAPERS (sample):\n${papers.slice(0, 10).map((p: any, i: number) => `${i + 1}. ${p.authors}(${p.year}). "${p.title}". ${p.journal}.\n   Type: ${p.studyType}\n   Gaps: ${p.researchGaps || p.abstract?.substring(0, 150) || "N/A"}`).join("\n\n")}` : ""}

${themes && themes.length > 0 ? `\nIDENTIFIED THEMES:\n${themes.map((t: any, i: number) => `${i + 1}. ${t.title}: ${t.description}`).join("\n")}` : ""}

RESEARCH TOPIC: ${researchTopic}`;
}

const MOCK_QUAL_QUESTIONS = [
  "How do HCWs perceive the acceptability and feasibility of annual IGRA-based LTBI screening in their workplace?",
  "What institutional barriers and enablers shape implementation of LTBI screening programs across diverse healthcare settings?",
  "How do HCWs experience and navigate stigma following a positive LTBI diagnosis in occupational settings?",
  "In what ways do digital health tools influence contact tracing completion and participant satisfaction?",
  "How do frontline staff describe trade-offs between mobile van screening and fixed-site clinic access?",
  "What insights do IPC managers offer about integrating annual LTBI screening into existing workflows?",
  "How does perceived institutional trust moderate disclosure decisions of HCWs with positive LTBI?",
  "What role does community engagement play in the effectiveness of mobile radiology van programs?",
  "How do returning migrant HCWs describe exposure risk experiences in endemic vs non-endemic settings?",
  "What are the experiences of HCWs in primary healthcare centers regarding LTBI screening access?",
];

const MOCK_QUANT_QUESTIONS = [
  "Does annual IGRA-based screening reduce LTBI conversion by ≥30% vs triennial TST over 5-year follow-up among HCWs?",
  "What is the cost per QALY gained from digital-app-supported LTBI contact tracing vs. standard paper-based tracing?",
  "Is there a statistically significant association between IPC infrastructure investment (USD/bed) and HCW LTBI conversion rates?",
  "What is the sensitivity, specificity, and PPV of combined IGRA + radiography vs. IGRA alone in rural settings?",
  "Does SMS-based appointment reminder delivery increase IPT completion by ≥25% vs. standard care?",
  "What is the attributable fraction of LTBI risk explained by occupational exposure duration (>10 years)?",
  "Among HCWs with positive IGRA, does weekly phone coaching during 6-month IPT improve adherence vs. standard care?",
  "What is the inter-rater reliability of TST reading by trained nurses vs. physicians in cluster-randomized design?",
  "Does mandatory annual LTBI screening policy lead to measurable change in HCW prevalence over 3 years?",
  "What is the comparative diagnostic yield of mobile van-based vs. fixed-site IGRA screening in LMIC hospital networks?",
];

export default function SRStep5Questions() {
  const { state, dispatch } = useApp();
  const [questions, setQuestions] = useState<any[]>(state.researchQuestions);
  const [questionType, setQuestionType] = useState<"qualitative" | "quantitative">("qualitative");
  const [customQuestion, setCustomQuestion] = useState(state.userQuestionInput || "");

  const handleGenerateQuestions = async () => {
    const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;
    if (selectedPapers.length === 0) {
      alert("Complete Steps 1–2 with selected papers first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setQuestions([]);

    try {
      const prompt = buildRqPrompt(selectedPapers, state.themes, state.searchQuery || "LTBI in Healthcare Workers", questionType);
      let responseText: string = "";

      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt);
      } else if (state.openRouterApiKey) {
        responseText = await callOpenRouter(state.openRouterApiKey, prompt);
      } else {
        const mock = questionType === "qualitative" ? MOCK_QUAL_QUESTIONS : MOCK_QUANT_QUESTIONS;
        const fallback = mock.map((q, i) => ({
          id: `rq-${Date.now()}-${i}`,
          question: q,
          type: questionType,
          selected: false,
        }));
        setQuestions(fallback);
        dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: fallback });
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }

      const cleaned = responseText.replace(/```(?:markdown)?/g, "").trim();
      const parsedQuestions: any[] = [];
      const lines = cleaned.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.match(/^#{1,3}\s/i)) continue;
        const qMatch = trimmed.match(/^(?:\d+\.|[-*]|•)\s+(.+)/i);
        if (qMatch && qMatch[1].length > 25) {
          const cleanQ = qMatch[1].replace(/\*\*/g, "").replace(/\*\(([^)]+)\)\*/, "($1)").trim();
          parsedQuestions.push({
            id: `rq-${Date.now()}-${parsedQuestions.length}`,
            question: cleanQ,
            type: questionType,
            selected: false,
          });
        }
      }

      const finalQuestions = parsedQuestions.length >= 5 ? parsedQuestions.slice(0, 10) : [
        ...(questionType === "qualitative" ? MOCK_QUAL_QUESTIONS : MOCK_QUANT_QUESTIONS).slice(0, 10 - parsedQuestions.length),
        ...parsedQuestions,
      ].map((q, i) => ({
        id: q.id || `rq-${Date.now()}-${i}`,
        question: typeof q === "string" ? q : q.question || q,
        type: questionType,
        selected: false,
      }));

      setQuestions(finalQuestions);
      dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: finalQuestions });
    } catch (err: any) {
      console.error("Question generation failed:", err);
      const mock = questionType === "qualitative" ? MOCK_QUAL_QUESTIONS : MOCK_QUANT_QUESTIONS;
      const fallback = mock.map((q, i) => ({
        id: `rq-${Date.now()}-${i}`,
        question: q,
        type: questionType,
        selected: false,
      }));
      setQuestions(fallback);
      dispatch({ type: "SET_RESEARCH_QUESTIONS", payload: fallback });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const toggleQuestion = (qId: string) => {
    const updated = questions.map((q) => (q.id === qId ? { ...q, selected: !q.selected } : q));
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
        <h2 className="text-xl font-bold text-white mb-1">Step 5: Generate Research Questions</h2>
        <p className="text-sm text-blue-300 mb-6">
          Generate 10 research questions based on your selected themes and evidence gaps. Choose qualitative or quantitative methodology.
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-3 bg-blue-950/60 border border-blue-900 rounded-lg px-4 py-2.5">
            <span className="text-sm text-blue-200 font-medium">Methodology:</span>
            <button
              onClick={() => setQuestionType("qualitative")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${questionType === "qualitative" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"}`}
            >
              <Beaker size={14} /> Qualitative
            </button>
            <button
              onClick={() => setQuestionType("quantitative")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${questionType === "quantitative" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"}`}
            >
              <FlaskConical size={14} /> Quantitative
            </button>
          </div>

          <button
            onClick={handleGenerateQuestions}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating..." : "Generate 10 Research Questions"}
          </button>

          <span className="text-xs bg-blue-800 text-blue-200 px-2 py-1 rounded-full ml-auto">
            {selectedCount} selected
          </span>
        </div>

        {state.isLoading && questions.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Formulating research questions based on themes and evidence gaps...</p>
            </div>
          </div>
        )}

        {!state.isLoading && questions.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Beaker size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate 10 research questions aligned to your evidence gaps.</p>
          </div>
        )}

        {questions.length > 0 && (
          <>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {questions.map((q: any, idx: number) => (
                <div
                  key={q.id}
                  onClick={() => toggleQuestion(q.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    q.selected ? "bg-yellow-900/20 border-yellow-600/50" : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${q.selected ? "bg-yellow-500 border-yellow-400" : "border-blue-600"}`}>
                      {q.selected && (
                        <svg className="w-3 h-3 text-[#0a1a3a]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-400 mr-2">#{idx + 1}</span>
                  <span className="text-sm text-white flex-1">{q.question || q}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${q.type === "qualitative" ? "bg-purple-900/50 text-purple-300" : "bg-emerald-900/50 text-emerald-300"}`}>
                    {q.type || questionType}
                  </span>
                </div>
              ))}
            </div>

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
                  placeholder="e.g., What are HCW experiences of stigma after positive LTBI diagnosis?"
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomQuestion()}
                  className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm"
                />
                <button
                  onClick={handleAddCustomQuestion}
                  disabled={!customQuestion.trim()}
                  className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 6 })}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
              >
                Generate Research Titles <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
