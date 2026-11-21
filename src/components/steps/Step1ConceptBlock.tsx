"use client";

import React, { useState, useRef } from "react";
import { callAiWithFallback } from "@/lib/ai";

export default function Step1ConceptBlock() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [finalised, setFinalised] = useState("");
  const [conceptBlock, setConceptBlock] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!query.trim() || !finalised.trim()) {
      setError("Both query and finalised version must be provided.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const prompt = `User query: "${query}"\nUser finalised version: "${finalised}"\n\nGenerate a concise concept block (max 150 words) that captures the core idea, research question, and methodology. Use plain text, no markdown.`;
      const response = await callAiWithFallback(prompt, { searchEnabled: false });
      const cleaned = response.trim();
      setConceptBlock(cleaned);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate concept block");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Step 1 – Concept Block</h2>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Concept Block"}
        </button>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-semibold text-yellow-300 mb-1">
          Research Query
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe the research topic, aim, or question"
          rows={4}
          className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />

        <label className="block text-sm font-semibold text-yellow-300 mt-2 mb-1">
          Finalised Version
        </label>
        <textarea
          value={finalised}
          onChange={(e) => setFinalised(e.target.value)}
          placeholder="Enter the finalised version of the query (e.g., after user feedback)"
          rows={4}
          className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

      {loading && <p className="text-yellow-300 text-sm mt-2">Generating concept block...</p>}

      {conceptBlock && (
        <div className="mt-4 p-4 bg-gray-800 text-white rounded-lg text-sm overflow-y-auto">
          <pre className="whitespace-pre-wrap">{conceptBlock}</pre>
        </div>
      )}
    </div>
  );
}