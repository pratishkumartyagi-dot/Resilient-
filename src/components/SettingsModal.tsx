"use client";

import React, { useState } from "react";
import { X, Settings as SettingsIcon, Key, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { testGeminiKey, testGroqKey } from "@/lib/ai";

export default function SettingsModal() {
  const { state, dispatch } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [geminiResult, setGeminiResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [groqResult, setGroqResult] = useState<{ ok: boolean; error?: string } | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined" && !loadedFromStorage) {
    try {
      const savedGemini = localStorage.getItem("resilient_gemini_api_key") || "";
      const savedGroq = localStorage.getItem("resilient_groq_api_key") || "";
      setGeminiKey(savedGemini);
      setGroqKey(savedGroq);
      if (savedGemini || savedGroq) {
        dispatch({ type: "SET_GEMINI_KEY", payload: savedGemini });
        dispatch({ type: "SET_GROQ_KEY", payload: savedGroq });
      }
      } catch {
        // Storage unavailable
      }
      setLoadedFromStorage(true);
    }

    const handler = () => setIsOpen(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, [dispatch, loadedFromStorage]);

  const handleSave = () => {
    dispatch({ type: "SET_GEMINI_KEY", payload: geminiKey });
    dispatch({ type: "SET_GROQ_KEY", payload: groqKey });
    try {
      localStorage.setItem("resilient_gemini_api_key", geminiKey);
      localStorage.setItem("resilient_groq_api_key", groqKey);
    } catch {
      // Storage unavailable
    }
    setIsOpen(false);
    setGeminiResult(null);
    setGroqResult(null);
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiResult(null);
    const result = await testGeminiKey(geminiKey);
    setGeminiResult(result);
    setTestingGemini(false);
  };

  const handleTestGroq = async () => {
    setTestingGroq(true);
    setGroqResult(null);
    const result = await testGroqKey(groqKey);
    setGroqResult(result);
    setTestingGroq(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1b3e] border border-blue-900/60 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-blue-900/50">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-yellow-400" />
            <h3 className="text-lg font-bold text-white">API Settings</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-lg text-blue-300 hover:bg-blue-900/40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-blue-200">
              <Key size={14} className="text-yellow-400" />
              Gemini API Key <span className="text-xs text-blue-400">(Primary)</span>
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Enter Gemini API key..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestGemini}
                disabled={testingGemini || !geminiKey.trim()}
                className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-900/70 disabled:opacity-50 flex items-center gap-1"
              >
                {testingGemini ? <Loader2 size={12} className="animate-spin" /> : null}
                Test Connection
              </button>
              {geminiResult && geminiResult.ok && (
                <span className="text-xs text-green-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Connected
                </span>
              )}
              {geminiResult && !geminiResult.ok && (
                <span className="text-xs text-red-300 flex items-center gap-1">
                  <XCircle size={12} /> Failed: {geminiResult.error || "Check key and network"}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-blue-200">
              <Key size={14} className="text-yellow-400" />
               Groq API Key <span className="text-xs text-blue-400">(Llama 3.3 70B fallback)</span>
            </label>
            <input
              type="password"
              value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
              placeholder="Enter Groq API key..."
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestGroq}
                disabled={testingGroq || !groqKey.trim()}
                className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-900/70 disabled:opacity-50 flex items-center gap-1"
              >
                {testingGroq ? <Loader2 size={12} className="animate-spin" /> : null}
                Test Connection
              </button>
              {groqResult && groqResult.ok && (
                <span className="text-xs text-green-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Connected
                </span>
              )}
              {groqResult && !groqResult.ok && (
                <span className="text-xs text-red-300 flex items-center gap-1">
                  <XCircle size={12} /> Failed: {groqResult.error || "Check key and network"}
                </span>
              )}
            </div>
          </div>

          <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-3">
            <p className="text-xs text-blue-300">
               Keys are stored locally in the application state. Gemini 3.1 Flash Lite is the primary AI provider. Groq (Llama 3.3 70B) is the fallback.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-blue-900/50 bg-[#0a1428]">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 rounded-lg text-sm text-blue-300 hover:bg-blue-900/40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2 rounded-lg text-sm"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
