"use client";

import React, { useState } from "react";
import { FlaskConical, ChevronRight, ExternalLink, Calculator } from "lucide-react";

const TRIAL_TYPES = ["RCT", "Non-Inferiority", "Equivalence", "Superiority", "Equality"];
const OUTCOME_TYPES = ["Continuous", "Dichotomous", "Time to Event"];

export default function SampleSizeTab() {
  const [trialType, setTrialType] = useState("RCT");
  const [outcomeType, setOutcomeType] = useState("Continuous");
  const [alpha, setAlpha] = useState("5");
  const [power, setPower] = useState("80");
  const [effectSize, setEffectSize] = useState("0.5");
  const [allocationRatio, setAllocationRatio] = useState("1:1");
  const [result, setResult] = useState<{ perArm: number; total: number; note: string } | null>(null);

  const calculateSampleSize = () => {
    const zAlpha = 1.96;
    const zBeta = 0.84;
    const a = parseFloat(alpha) / 100;
    const p = parseFloat(power) / 100;
    const es = parseFloat(effectSize);
    const ratio = allocationRatio === "1:1" ? 1 : parseFloat(allocationRatio.split(":")[1]) / parseFloat(allocationRatio.split(":")[0]);

    let perArm: number;

    if (outcomeType === "Dichotomous") {
      const p0 = 0.25;
      const p1 = p0 - es;
      const numerator = zAlpha * Math.sqrt((p0 + p1) * (2 - p0 - p1)) + zBeta * Math.sqrt(p0 * (1 - p0) / ratio + p1 * (1 - p1));
      perArm = Math.max(34, Math.ceil((numerator ** 2) / ((p1 - p0) ** 2)));
    } else if (outcomeType === "Time to Event") {
      perArm = Math.max(60, Math.ceil((4 * (zAlpha + zBeta) ** 2) / (Math.log(es) ** 2)));
    } else {
      perArm = Math.max(64, Math.ceil((16 * (zAlpha + zBeta) ** 2) / (es ** 2)));
    }

    const total = Math.round(perArm * (1 + ratio));

    const note = `${trialType} design | α=${alpha}% power=${power}% ES=${effectSize} | ${outcomeType} outcome`;
    setResult({ perArm, total, note });
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
