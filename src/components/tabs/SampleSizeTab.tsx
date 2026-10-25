"use client";

import React, { useState } from "react";
import { ExternalLink, Calculator, Download } from "lucide-react";
import { downloadMarkdownAsWord } from "@/lib/exporters";

const STUDY_TYPES = [
  "Cohort / RCT (2 proportions)",
  "Case-Control (2 proportions)",
  "Prevalence (single proportion)",
  "Diagnostic Test (sensitivity/specificity)",
  "Compare 2 Means",
  "One Sample Mean",
];

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

export default function SampleSizeTab() {
  const [studyType, setStudyType] = useState(STUDY_TYPES[0]);
  const [alpha, setAlpha] = useState("5");
  const [power, setPower] = useState("80");
  const [p1, setP1] = useState("0.20");
  const [p2, setP2] = useState("0.10");
  const [prevalence, setPrevalence] = useState("0.05");
  const [precision, setPrecision] = useState("0.02");
  const [sensitivity, setSensitivity] = useState("0.90");
  const [specificity, setSpecificity] = useState("0.90");
  const [mean1, setMean1] = useState("10");
  const [mean2, setMean2] = useState("8");
  const [sd, setSd] = useState("3");
  const [ratio, setRatio] = useState("1");
  const [result, setResult] = useState<{ n: number; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = () => {
    const a = parseFloat(alpha) / 100;
    const pow = parseFloat(power) / 100;
    if (!Number.isFinite(a) || a <= 0 || a >= 1) { setError("Alpha must be between 0 and 100."); setResult(null); return; }
    if (!Number.isFinite(pow) || pow <= 0 || pow >= 1) { setError("Power must be between 0 and 100."); setResult(null); return; }
    const zA = normInv(1 - a / 2);
    const zB = normInv(pow);
    let n = 0;
    let note = "";

    try {
      if (studyType === "Cohort / RCT (2 proportions)" || studyType === "Case-Control (2 proportions)") {
        const pa = parseFloat(p1); const pb = parseFloat(p2);
        if (!Number.isFinite(pa) || !Number.isFinite(pb)) throw new Error("Invalid proportions");
        const r = parseFloat(ratio) || 1;
        const pooled = (pa + r * pb) / (1 + r);
        const num = (zA * Math.sqrt((1 + 1 / r) * pooled * (1 - pooled)) + zB * Math.sqrt(pa * (1 - pa) + pb * (1 - pb) / r)) ** 2;
        const den = (pa - pb) ** 2;
        n = Math.ceil(num / den);
        note = `${studyType}: p1=${pa}, p2=${pb}, ratio=${r}, α=${alpha}%, power=${power}%`;
      } else if (studyType === "Prevalence (single proportion)") {
        const p = parseFloat(prevalence); const d = parseFloat(precision);
        if (!Number.isFinite(p) || !Number.isFinite(d)) throw new Error("Invalid values");
        n = Math.ceil((zA ** 2 * p * (1 - p)) / (d ** 2));
        note = `Prevalence: p=${p}, precision=±${d}, α=${alpha}%`;
      } else if (studyType === "Diagnostic Test (sensitivity/specificity)") {
        const se = parseFloat(sensitivity); const sp = parseFloat(specificity);
        const p = parseFloat(prevalence);
        if (!Number.isFinite(se) || !Number.isFinite(sp) || !Number.isFinite(p)) throw new Error("Invalid values");
        const nSe = Math.ceil((zA ** 2 * se * (1 - se)) / (0.05 ** 2 * p));
        const nSp = Math.ceil((zA ** 2 * sp * (1 - sp)) / (0.05 ** 2 * (1 - p)));
        n = Math.max(nSe, nSp);
        note = `Diagnostic: sens=${se}, spec=${sp}, prevalence=${p}`;
      } else if (studyType === "Compare 2 Means") {
        const m1 = parseFloat(mean1); const m2 = parseFloat(mean2); const s = parseFloat(sd);
        const r = parseFloat(ratio) || 1;
        if (!Number.isFinite(m1) || !Number.isFinite(m2) || !Number.isFinite(s)) throw new Error("Invalid values");
        const diff = m1 - m2;
        n = Math.ceil(((zA + zB) ** 2 * s ** 2 * (1 + 1 / r)) / (diff ** 2));
        note = `2 means: μ1=${m1}, μ2=${m2}, SD=${s}, ratio=${r}`;
      } else if (studyType === "One Sample Mean") {
        const m1 = parseFloat(mean1); const m0 = parseFloat(mean2); const s = parseFloat(sd);
        if (!Number.isFinite(m1) || !Number.isFinite(m0) || !Number.isFinite(s)) throw new Error("Invalid values");
        n = Math.ceil(((zA + zB) ** 2 * s ** 2) / ((m1 - m0) ** 2));
        note = `One sample mean: μ=${m1}, μ0=${m0}, SD=${s}`;
      }
      if (!Number.isFinite(n) || n <= 0) throw new Error("Calculation produced invalid result");
      setResult({ n, note: `${note} | α=${alpha}% power=${power}%` });
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Calculation failed");
      setResult(null);
    }
  };

  const handleExport = async () => {
    if (!result) return;
    const md = `# Sample Size Calculation\n\n- Study type: ${studyType}\n- ${result.note}\n\n## Result\n- Required sample size (per group where applicable): ${result.n}\n`;
    await downloadMarkdownAsWord(md, "sample-size-calculation.docx");
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Sample Size Calculator</h2>
        <p className="text-sm text-blue-300 mb-6">
          Calculate required sample sizes for all study types (methodology based on epitools.ausvet.com.au).
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-blue-200 mb-2">Study Type</label>
          <select value={studyType} onChange={(e) => setStudyType(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm">
            {STUDY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Alpha (α) %</label>
            <input type="number" value={alpha} onChange={(e) => setAlpha(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Power (1-β) %</label>
            <input type="number" value={power} onChange={(e) => setPower(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
          </div>
          {(studyType.includes("proportions") || studyType === "Prevalence (single proportion)") && (
            <>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Proportion 1 (p1)</label>
                <input type="number" step="0.01" value={p1} onChange={(e) => setP1(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
              {studyType.includes("proportions") && (
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Proportion 2 (p2)</label>
                  <input type="number" step="0.01" value={p2} onChange={(e) => setP2(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
                </div>
              )}
              {studyType === "Prevalence (single proportion)" && (
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Precision (margin of error)</label>
                  <input type="number" step="0.01" value={precision} onChange={(e) => setPrecision(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
                </div>
              )}
            </>
          )}
          {studyType === "Diagnostic Test (sensitivity/specificity)" && (
            <>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Sensitivity</label>
                <input type="number" step="0.01" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Specificity</label>
                <input type="number" step="0.01" value={specificity} onChange={(e) => setSpecificity(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Prevalence</label>
                <input type="number" step="0.01" value={prevalence} onChange={(e) => setPrevalence(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </>
          )}
          {studyType.includes("Means") || studyType === "One Sample Mean" && (
            <>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Mean 1 (μ1)</label>
                <input type="number" step="0.01" value={mean1} onChange={(e) => setMean1(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">{studyType === "One Sample Mean" ? "Null mean (μ0)" : "Mean 2 (μ2)"}</label>
                <input type="number" step="0.01" value={mean2} onChange={(e) => setMean2(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Standard Deviation (SD)</label>
                <input type="number" step="0.01" value={sd} onChange={(e) => setSd(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </>
          )}
          {studyType.includes("proportions") && (
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Allocation ratio (n2/n1)</label>
              <input type="number" step="0.1" value={ratio} onChange={(e) => setRatio(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
            </div>
          )}
          {studyType === "Compare 2 Means" && (
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Allocation ratio (n2/n1)</label>
              <input type="number" step="0.1" value={ratio} onChange={(e) => setRatio(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm" />
            </div>
          )}
        </div>
        <button onClick={calculate} className="mt-6 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg flex items-center gap-2">
          <Calculator size={18} /> Calculate Sample Size
        </button>
        {error && <div className="mt-4 bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}
        {result && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-5 text-center">
              <p className="text-xs text-green-300 mb-1">Required Sample Size</p>
              <p className="text-3xl font-bold text-green-300">{result.n}</p>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-5">
              <p className="text-xs text-blue-300 mb-1">Design Summary</p>
              <p className="text-sm text-white font-mono">{result.note}</p>
            </div>
          </div>
        )}
        {result && (
          <button onClick={handleExport} className="mt-4 text-sm bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1">
            <Download size={14} /> Export Result
          </button>
        )}
        <div className="mt-6 flex flex-wrap gap-4">
          <a href="https://epitools.ausvet.com.au/samplesize" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-300 hover:text-yellow-400 flex items-center gap-1 bg-blue-900/30 px-3 py-2 rounded-lg">
            <ExternalLink size={12} /> epitools.ausvet.com.au — Sample Size Calculators
          </a>
        </div>
      </div>
    </div>
  );
}