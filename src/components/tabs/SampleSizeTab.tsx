"use client";

import React, { useState } from "react";
import { ExternalLink, Calculator, Download } from "lucide-react";
import { downloadMarkdownAsWord } from "@/lib/exporters";

const TRIAL_TYPES = ["RCT", "Non-Inferiority", "Equivalence", "Superiority", "Equality"];
const OUTCOME_TYPES = ["Continuous", "Dichotomous", "Time to Event"];

function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function parseRatio(value: string): number {
  const parts = value.split(":");
  if (parts.length === 2) {
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) return b / a;
  }
  return parseFloat(value);
}

export default function SampleSizeTab() {
  const [trialType, setTrialType] = useState("RCT");
  const [outcomeType, setOutcomeType] = useState("Continuous");
  const [alpha, setAlpha] = useState("5");
  const [power, setPower] = useState("80");
  const [effectSize, setEffectSize] = useState("0.5");
  const [allocationRatio, setAllocationRatio] = useState("1:1");
  const [result, setResult] = useState<{ perArm: number; total: number; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculateSampleSize = () => {
    const a = parseFloat(alpha) / 100;
    const p = parseFloat(power) / 100;
    const es = parseFloat(effectSize);
    const ratio = parseRatio(allocationRatio);

    if (!Number.isFinite(a) || a <= 0 || a >= 1) {
      setError("Alpha must be between 0 and 100 (exclusive).");
      setResult(null);
      return;
    }
    if (!Number.isFinite(p) || p <= 0 || p >= 1) {
      setError("Power must be between 0 and 100 (exclusive).");
      setResult(null);
      return;
    }
    if (!Number.isFinite(es) || es <= 0) {
      setError("Effect size must be greater than 0.");
      setResult(null);
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      setError("Allocation ratio must be positive, e.g. 1:1.");
      setResult(null);
      return;
    }

    const zAlpha = normInv(1 - a / 2);
    const zBeta = normInv(p);
    const ratioFactor = (1 + 1 / ratio) / 2;

    let perArm: number;

    if (outcomeType === "Dichotomous") {
      const p0 = 0.25;
      const p1 = p0 - es;
      if (p1 <= 0 || p1 >= 1) {
        setError("Dichotomous effect size produces an invalid event proportion (p1 must be between 0 and 1).");
        setResult(null);
        return;
      }
      const numerator =
        zAlpha * Math.sqrt(ratioFactor * (p0 + p1) * (2 - p0 - p1)) +
        zBeta * Math.sqrt(p1 * (1 - p1) + (p0 * (1 - p0)) / ratio);
      perArm = Math.max(34, Math.ceil((numerator ** 2) / ((p1 - p0) ** 2)));
    } else if (outcomeType === "Time to Event") {
      const logEs = Math.log(es);
      if (logEs <= 0) {
        setError("Time-to-Event effect size (hazard ratio) must be greater than 1.");
        setResult(null);
        return;
      }
      perArm = Math.max(60, Math.ceil((4 * ratioFactor * (zAlpha + zBeta) ** 2) / (logEs ** 2)));
    } else {
      perArm = Math.max(64, Math.ceil((16 * ratioFactor * (zAlpha + zBeta) ** 2) / (es ** 2)));
    }

    const total = Math.round(perArm * (1 + ratio));
    const note = `${trialType} design | α=${alpha}% power=${power}% ES=${effectSize} | ratio ${allocationRatio} | ${outcomeType} outcome`;

    setResult({ perArm, total, note });
    setError(null);
  };

  const handleExport = async () => {
    if (!result) return;
    const md = [
      "# Sample Size Calculation",
      "",
      `- Trial type: ${trialType}`,
      `- Outcome type: ${outcomeType}`,
      `- Alpha: ${alpha}%`,
      `- Power: ${power}%`,
      `- Effect size: ${effectSize}`,
      `- Allocation ratio: ${allocationRatio}`,
      "",
      "## Results",
      "",
      `- Per arm: ${result.perArm}`,
      `- Total: ${result.total}`,
      "",
      `Note: ${result.note}`,
    ].join("\n");
    await downloadMarkdownAsWord(md, "sample-size-calculation.docx");
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Sample Size Calculator</h2>
        <p className="text-sm text-blue-300 mb-6">
          Calculate required sample sizes for different trial designs and outcome types.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Trial Type</label>
            <select
              value={trialType}
              onChange={(e) => setTrialType(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            >
              {TRIAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Outcome Type</label>
            <select
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            >
              {OUTCOME_TYPES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div></div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Alpha (α) %</label>
            <input
              type="number"
              value={alpha}
              onChange={(e) => setAlpha(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Power (1-β) %</label>
            <input
              type="number"
              value={power}
              onChange={(e) => setPower(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Effect Size</label>
            <input
              type="number"
              step="0.01"
              value={effectSize}
              onChange={(e) => setEffectSize(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Allocation Ratio</label>
            <input
              type="text"
              value={allocationRatio}
              onChange={(e) => setAllocationRatio(e.target.value)}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <button
          onClick={calculateSampleSize}
          className="mt-6 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg flex items-center gap-2"
        >
          <Calculator size={18} />
          Calculate Sample Size
        </button>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-5 text-center">
              <p className="text-xs text-green-300 mb-1">Per Arm</p>
              <p className="text-3xl font-bold text-green-300">{result.perArm}</p>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-5 text-center">
              <p className="text-xs text-yellow-300 mb-1">Total Sample</p>
              <p className="text-3xl font-bold text-yellow-300">{result.total}</p>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-5">
              <p className="text-xs text-blue-300 mb-1">Design Summary</p>
              <p className="text-sm text-white font-mono">{result.note}</p>
            </div>
          </div>
        )}

        {result && (
          <button
            onClick={handleExport}
            className="mt-4 text-sm bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1"
          >
            <Download size={14} />
            Export Result
          </button>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          <a
            href="https://riskcalc.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-300 hover:text-yellow-400 flex items-center gap-1 bg-blue-900/30 px-3 py-2 rounded-lg"
          >
            <ExternalLink size={12} />
            riskcalc.org — Advanced Sample Size Calculator
          </a>
          <a
            href="https://epitools.ausvet.com.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-300 hover:text-yellow-400 flex items-center gap-1 bg-blue-900/30 px-3 py-2 rounded-lg"
          >
            <ExternalLink size={12} />
            epitools.ausvet.com.au — Epidemiological Calculators
          </a>
        </div>
      </div>
    </div>
  );
}
