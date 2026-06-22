"use client";

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function Step8AimObjectives() {
  const { state, dispatch } = useApp();
  const [localObj, setLocalObj] = useState<{
    aim: string;
    primaryObjective: string;
    secondaryObjectives: string[];
  }>({
    aim: state.aimObjectives.aim || "",
    primaryObjective: state.aimObjectives.primaryObjective || "",
    secondaryObjectives: state.aimObjectives.secondaryObjectives.length
      ? [...state.aimObjectives.secondaryObjectives]
      : ["", "", ""],
  });

  const updateAim = (val: string) => {
    setLocalObj((prev) => ({ ...prev, aim: val }));
    dispatch({ type: "SET_AIM_OBJECTIVES", payload: { aim: val } });
  };

  const updatePrimary = (val: string) => {
    setLocalObj((prev) => ({ ...prev, primaryObjective: val }));
    dispatch({ type: "SET_AIM_OBJECTIVES", payload: { primaryObjective: val } });
  };

  const updateSecondary = (idx: number, val: string) => {
    const updated = [...localObj.secondaryObjectives];
    updated[idx] = val;
    setLocalObj((prev) => ({ ...prev, secondaryObjectives: updated }));
    dispatch({
      type: "SET_AIM_OBJECTIVES",
      payload: { secondaryObjectives: updated },
    });
  };

  const addSecondary = () => {
    const updated = [...localObj.secondaryObjectives, ""];
    setLocalObj((prev) => ({ ...prev, secondaryObjectives: updated }));
    dispatch({ type: "SET_AIM_OBJECTIVES", payload: { secondaryObjectives: updated } });
  };

  const removeSecondary = (idx: number) => {
    const updated = localObj.secondaryObjectives.filter((_, i) => i !== idx);
    setLocalObj((prev) => ({ ...prev, secondaryObjectives: updated }));
    dispatch({ type: "SET_AIM_OBJECTIVES", payload: { secondaryObjectives: updated } });
  };

  const handleProceed = () => {
    if (!localObj.aim.trim() || !localObj.primaryObjective.trim()) {
      alert("Please provide at least an Aim and a Primary Objective.");
      return;
    }
    dispatch({ type: "SET_STEP", payload: 9 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 8: Aim & Objectives</h2>
        <p className="text-sm text-blue-300 mb-6">
          Refine your study aim and primary and secondary objectives based on your research title.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-yellow-300 mb-2">Aim</label>
            <textarea
              value={localObj.aim}
              onChange={(e) => updateAim(e.target.value)}
              placeholder="To evaluate the implementation and cost-effectiveness of annual IGRA-based LTBI screening among HCWs in tertiary care hospitals..."
              rows={3}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
            />
          </div>

          <div className="bg-blue-950/40 border border-blue-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-yellow-500 text-[#0a1a3a] flex items-center justify-center text-xs font-bold">1</div>
              <label className="text-sm font-semibold text-yellow-300">Primary Objective</label>
            </div>
            <textarea
              value={localObj.primaryObjective}
              onChange={(e) => updatePrimary(e.target.value)}
              placeholder="To determine the prevalence of LTBI among HCWs using annual IGRA screening compared with standard TST in tertiary hospitals."
              rows={3}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2+</div>
              <label className="text-sm font-semibold text-blue-200">Secondary Objectives</label>
              <span className="text-xs text-blue-500">(at least 3 recommended)</span>
            </div>
            <div className="space-y-3">
              {localObj.secondaryObjectives.map((obj, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-xs text-blue-500 mt-3 w-6 flex-shrink-0">{idx + 2}.</span>
                  <input
                    type="text"
                    value={obj}
                    onChange={(e) => updateSecondary(idx, e.target.value)}
                    placeholder={`Secondary Objective ${idx + 1}`}
                    className="flex-1 bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  {localObj.secondaryObjectives.length > 1 && (
                    <button
                      onClick={() => removeSecondary(idx)}
                      className="mt-2 text-red-400 hover:text-red-300"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addSecondary}
                className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 bg-blue-900/30 px-3 py-1.5 rounded-lg"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Secondary Objective
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleProceed}
            disabled={!localObj.aim.trim() || !localObj.primaryObjective.trim()}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            Proceed to Methodology
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
