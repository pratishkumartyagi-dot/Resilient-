"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronRight, Plus, Trash2, Calculator, FlaskConical, ExternalLink, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import { buildStep9Prompt } from "@/lib/research-skills";

const DEFAULT_OUTCOMES = ["LTBI conversion rate (IGRA pos/neg)", "Completion rate of IPT regimen", "Cost per QALY gained", "HCW satisfaction score (0–100 Likert scale)"];

// Acklam inverse-normal (quantile) approximation.
function normInv(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function computeSampleSize(alpha: string, power: string, effect: string, alloc: string): { perArm: number; total: number; note: string; error?: string } {
  const a = parseFloat(alpha);
  const p = parseFloat(power);
  const es = parseFloat(effect);
  const parts = alloc.split(":").map((n) => parseFloat(n));
  const ratio = parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[1] / parts[0] : NaN;
  if (!(a > 0 && a < 1) || !(p > 0 && p < 1) || !(es > 0) || !(ratio > 0)) {
    return { perArm: 0, total: 0, note: "", error: "Enter valid α (0–1), power (0–1), positive effect size, and a ratio like 1:1." };
  }
  const zAlpha = normInv(1 - a / 2);
  const zBeta = normInv(p);
  const ratioFactor = (1 + 1 / ratio) / 2;
  const perArm = Math.max(2, Math.ceil((((zAlpha + zBeta) ** 2) * ratioFactor) / (es ** 2)));
  const total = Math.round(perArm * (1 + ratio));
  return { perArm, total, note: `α=${a} | power=${p} | ES=${es} | allocation ${alloc}` };
}

export default function Step9Methodology() {
  const { state, dispatch } = useApp();
  const [outcomeText, setOutcomeText] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>(state.methodology.outcomes.length ? [...state.methodology.outcomes] : [...DEFAULT_OUTCOMES]);
  const seededDefaults = useRef(false);
  const [localMethod, setLocalMethod] = useState({
    studySite: state.methodology.studySite || "",
    setting: state.methodology.setting || "",
    population: state.methodology.population || "",
    inclusionCriteria: state.methodology.inclusionCriteria || "",
    exclusionCriteria: state.methodology.exclusionCriteria || "",
    hypothesis: state.methodology.hypothesis || "",
  });
  const [generatedMethods, setGeneratedMethods] = useState<string>("");
  const [questionnaire, setQuestionnaire] = useState<typeof state.questionnaire>(state.questionnaire);
  const [showSampleCalc, setShowSampleCalc] = useState(false);
  const [sampleAlpha, setSampleAlpha] = useState("0.05");
  const [samplePower, setSamplePower] = useState("0.80");
  const [sampleEffect, setSampleEffect] = useState("0.30");
  const [sampleAlloc, setSampleAlloc] = useState("1:1");

  useEffect(() => {
    if (seededDefaults.current) return;
    seededDefaults.current = true;
    if (state.methodology.outcomes.length === 0) {
      DEFAULT_OUTCOMES.forEach((o) => dispatch({ type: "ADD_OUTCOME", payload: o }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleResult = useMemo(
    () => computeSampleSize(sampleAlpha, samplePower, sampleEffect, sampleAlloc),
    [sampleAlpha, samplePower, sampleEffect, sampleAlloc]
  );

  const updateField = (field: string, val: string) => {
    const updated = { ...localMethod, [field]: val };
    setLocalMethod(updated);
    dispatch({ type: "SET_METHODOLOGY", payload: { [field]: val } });
  };

  const addOutcome = () => {
    if (!outcomeText.trim()) return;
    const updated = [...outcomes, outcomeText.trim()];
    setOutcomes(updated);
    dispatch({ type: "ADD_OUTCOME", payload: outcomeText.trim() });
    setOutcomeText("");
  };

  const removeOutcome = (idx: number) => {
    const updated = outcomes.filter((_, i) => i !== idx);
    setOutcomes(updated);
    dispatch({ type: "REMOVE_OUTCOME", payload: outcomes[idx] });
  };

  const handleGenerateMethods = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select papers in Step 2 first.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setGeneratedMethods("");

    try {
      const prompt = buildStep9Prompt(state.aimObjectives, state.papers, state.studyType);
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: state.searchQuery };

      let responseText: string = "";
      if (state.geminiApiKey) {
        responseText = await callGemini(state.geminiApiKey, prompt, searchOptions);
      } else if (state.groqApiKey) {
        responseText = await callGroq(state.groqApiKey, prompt, searchOptions);
      } else {
        responseText = await callDeepSeek(prompt, searchOptions);
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedMethods(cleaned);
    } catch (err: any) {
      console.error("Methods generation failed:", err);
      alert(err.message || "Failed to generate methods. Please try again.");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const generateQuestionnaire = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const population = localMethod.population.trim();
      const items: typeof state.questionnaire = [];
      const now = Date.now();
      let n = 0;
      const push = (question: string, type: string, options: string[] = []) => {
        n += 1;
        items.push({ id: `q-${now}-${n}`, question, type, options });
      };

      push("How many years have you worked in your current role?", "Demographic (continuous)");
      push("What is your primary work setting / department?", "Categorical", ["Emergency", "ICU", "Pediatrics", "Surgery", "Outpatient", "Laboratory", "Administration", "Other"]);
      if (population) {
        push(`Do you meet the following study population criterion: ${population}?`, "Dichotomous", ["Yes", "No", "Unsure"]);
      }
      outcomes.slice(0, 6).forEach((o) => {
        push(`How would you rate your current experience related to "${o}"?`, "Likert 5-point", ["Very Low", "Low", "Neutral", "High", "Very High"]);
      });
      push("How feasible is it to participate in the proposed study procedures?", "Likert 5-point", ["Very Difficult", "Difficult", "Neutral", "Easy", "Very Easy"]);
      if (localMethod.hypothesis.trim()) {
        push(`Do you agree with the study hypothesis: "${localMethod.hypothesis.trim()}"?`, "Likert 5-point", ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"]);
      }

      setQuestionnaire(items);
      dispatch({ type: "SET_QUESTIONNAIRE", payload: items });
      dispatch({ type: "SET_LOADING", payload: false });
    }, 1200);
  };

  const handleProceed = () => {
    dispatch({ type: "SET_STEP", payload: 10 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 9: Methodology</h2>
            <p className="text-sm text-blue-300">
              Define study methodology using AIPOCH Methods Section Writer — compliant with CONSORT/STROBE/PRISMA guidelines.
            </p>
          </div>
          <button
            onClick={handleGenerateMethods}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating..." : "Generate Methods"}
          </button>
        </div>

        {state.isLoading && !generatedMethods && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Generating publication-ready Methods section...</p>
              <p className="text-blue-400 text-xs mt-1">Following CONSORT/STROBE/PRISMA reporting guidelines</p>
            </div>
          </div>
        )}

        {generatedMethods && !state.isLoading && (
          <div className="mb-6 bg-blue-950/30 border border-blue-900/50 rounded-lg p-5">
            <p className="text-xs text-blue-400 mb-3 font-medium">AI-generated Methods section (edit fields below to refine):</p>
            <pre className="text-sm text-blue-100 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto font-serif">{generatedMethods}</pre>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Study Site(s)</label>
            <textarea
              value={localMethod.studySite}
              onChange={(e) => updateField("studySite", e.target.value)}
              placeholder="e.g., Lagos University Teaching Hospital, National Hospital Abuja"
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Setting</label>
            <textarea
              value={localMethod.setting}
              onChange={(e) => updateField("setting", e.target.value)}
              placeholder="e.g., Tertiary-level public hospitals, 4 sites, urban and peri-urban"
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Population</label>
            <textarea
              value={localMethod.population}
              onChange={(e) => updateField("population", e.target.value)}
              placeholder="e.g., All currently employed HCWs with direct patient contact for ≥6 months"
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Hypothesis</label>
            <textarea
              value={localMethod.hypothesis}
              onChange={(e) => updateField("hypothesis", e.target.value)}
              placeholder="e.g., Annual IGRA screening will result in a 25% reduction in LTBI conversion incidence vs. standard TST over 3 years."
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Inclusion Criteria</label>
            <textarea
              value={localMethod.inclusionCriteria}
              onChange={(e) => updateField("inclusionCriteria", e.target.value)}
              placeholder="e.g., Age ≥18, employed ≥6 months, direct patient contact, informed consent"
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Exclusion Criteria</label>
            <textarea
              value={localMethod.exclusionCriteria}
              onChange={(e) => updateField("exclusionCriteria", e.target.value)}
              placeholder="e.g., Active TB, immunosuppression, IGRA contraindication, pregnancy"
              rows={2}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-semibold text-blue-200 mb-2">Outcome Measures</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={outcomeText}
              onChange={(e) => setOutcomeText(e.target.value)}
              placeholder="Add an outcome measure..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOutcome())}
              className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              onClick={addOutcome}
              disabled={!outcomeText.trim()}
              className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {outcomes.map((outcome, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-blue-950/50 border border-blue-900 rounded-lg px-3 py-2.5">
                <span className="text-sm text-white flex-1">{idx + 1}. {outcome}</span>
                <button onClick={() => removeOutcome(idx)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => setShowSampleCalc(!showSampleCalc)}
            className="flex items-center gap-2 text-sm text-blue-300 bg-blue-900/50 px-4 py-2 rounded-lg hover:bg-blue-900/70"
          >
            <Calculator size={16} />
            {showSampleCalc ? "Hide Sample Size Calculator" : "Show Sample Size Calculator"}
          </button>
          {showSampleCalc && (
            <div className="mt-4 bg-blue-950/50 border border-blue-900 rounded-lg p-5">
              <h4 className="text-sm font-semibold text-white mb-4">Sample Size Calculator</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-blue-300 mb-1">Alpha (α)</label>
                  <input type="text" value={sampleAlpha} onChange={(e) => setSampleAlpha(e.target.value)} className="w-full bg-blue-900/50 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-blue-300 mb-1">Power (1-β)</label>
                  <input type="text" value={samplePower} onChange={(e) => setSamplePower(e.target.value)} className="w-full bg-blue-900/50 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-blue-300 mb-1">Effect Size</label>
                  <input type="text" value={sampleEffect} onChange={(e) => setSampleEffect(e.target.value)} className="w-full bg-blue-900/50 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-blue-300 mb-1">Allocation Ratio</label>
                  <input type="text" value={sampleAlloc} onChange={(e) => setSampleAlloc(e.target.value)} className="w-full bg-blue-900/50 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-blue-900/40 border border-blue-800 rounded-lg px-4 py-3 text-center">
                  <p className="text-xs text-blue-300 mb-1">Estimated Sample Size</p>
                  {sampleResult.error ? (
                    <p className="text-sm font-bold text-red-300">{sampleResult.error}</p>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-yellow-300">n = {sampleResult.perArm} per arm</p>
                      <p className="text-xs text-blue-400">Total: {sampleResult.total} (±5% loss to follow-up)</p>
                      <p className="text-[10px] text-blue-400 mt-1">{sampleResult.note}</p>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <a href="https://riskcalc.org" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:text-yellow-400 flex items-center gap-1">
                    <ExternalLink size={12} /> riskcalc.org
                  </a>
                  <a href="https://epitools.ausvet.com.au" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:text-yellow-400 flex items-center gap-1">
                    <ExternalLink size={12} /> epitools.ausvet.com.au
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={generateQuestionnaire}
            disabled={state.isLoading}
            className="bg-blue-800 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <FlaskConical size={16} />
            {state.isLoading ? "Generating..." : "Generate Questionnaire"}
          </button>
          {questionnaire.length > 0 && (
            <div className="mt-4 border border-blue-900 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-900/50 text-left">
                    <th className="px-4 py-2 text-blue-200 font-medium">Question</th>
                    <th className="px-4 py-2 text-blue-200 font-medium w-40">Type</th>
                    <th className="px-4 py-2 text-blue-200 font-medium w-52">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {questionnaire.map((item) => (
                    <tr key={item.id} className="border-t border-blue-900">
                      <td className="px-4 py-2 text-white">{item.question}</td>
                      <td className="px-4 py-2 text-blue-300">{item.type}</td>
                      <td className="px-4 py-2 text-blue-400">{item.options?.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleProceed}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
          >
            Proceed to Protocol
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
