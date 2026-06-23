"use client";

import React, { useState, useRef } from "react";
import { Download, FileUp, Sparkles, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";

const generateMockSynthesis = (papers: any[]): any[] => {
  if (papers.length === 0) return [];
  return papers.slice(0, 5).map((p, i) => ({
    id: `syn-${Date.now()}-${i}`,
    reference: `${p.authors} ${p.title}. <em>${p.journal}</em>. ${p.year}. doi:${p.doi}`,
    keyFindings: `Study ${i + 1} investigated ${p.title.toLowerCase().replace(/^[^:]+:\s*/, "")} with notable findings related to the research topic.`,
    synopsis: `This ${p.studyType.toLowerCase()} contributes to the evidence base by examining outcomes across the selected population and settings.`,
    studyDetails: `Population and setting details derived from the study context. Time period aligns with publication year ${p.year}.`,
    researchGaps: `Further research needed to address generalizability, long-term follow-up, and diverse population representation.`,
  }));
};

export default function Step3Synthesis() {
  const { state, dispatch } = useApp();
  const [showUpload, setShowUpload] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localSynthesis, setLocalSynthesis] = useState<any[]>(state.synthesisTable);

  const handleGenerateSynthesis = async () => {
    const selected = state.papers.filter((p) => p.selected);
    if (selected.length === 0) {
      alert("Please select at least one paper to proceed.");
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    setError("");

    try {
      const prompt = `You are a research synthesis assistant. Generate a structured evidence synthesis table for the following selected papers. Return JSON only in this exact format:
[
  {
    "id": "string",
    "reference": "string (Vancouver style with HTML emphasis tags)",
    "keyFindings": "string",
    "synopsis": "string",
    "studyDetails": "string (include population, setting, time, intervention/diagnostic tested)",
    "researchGaps": "string"
  }
]

Selected papers:
${selected.map((p, i) => `${i + 1}. ${p.authors}. ${p.title}. ${p.journal}. ${p.year}. DOI: ${p.doi}. Study Type: ${p.studyType}. Abstract: ${p.abstract}`).join("\n\n")}`;

      let synthesis: any[] = [];

      if (state.geminiApiKey) {
        const response = await callGemini(state.geminiApiKey, prompt);
        const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
        synthesis = JSON.parse(cleaned);
      } else if (state.openRouterApiKey) {
        const response = await callOpenRouter(state.openRouterApiKey, prompt);
        const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
        synthesis = JSON.parse(cleaned);
      } else {
        synthesis = generateMockSynthesis(selected);
      }

      dispatch({ type: "SET_SYNTHESIS", payload: synthesis });
      setLocalSynthesis(synthesis);
      dispatch({ type: "SET_STEP", payload: 4 });
    } catch (err: any) {
      console.error("Synthesis generation failed:", err);
      setError(err.message || "Failed to generate synthesis table. Using mock data.");
      const fallback = generateMockSynthesis(selected);
      dispatch({ type: "SET_SYNTHESIS", payload: fallback });
      setLocalSynthesis(fallback);
      dispatch({ type: "SET_STEP", payload: 4 });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
      setGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 5) {
      alert("Maximum 5 files allowed");
      return;
    }
    dispatch({ type: "SET_UPLOADED_DOCS", payload: [...state.uploadedDocuments, ...files].slice(0, 5) });
  };

  const removeDoc = (index: number) => {
    const updated = state.uploadedDocuments.filter((_, i) => i !== index);
    dispatch({ type: "SET_UPLOADED_DOCS", payload: updated });
  };

  const handleDownload = () => {
    alert(`Downloading as ${downloadFormat.toUpperCase()}...`);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["pdf"].includes(ext || "")) return "📄";
    if (["doc", "docx"].includes(ext || "")) return "📝";
    if (["csv"].includes(ext || "")) return "📊";
    if (["xls", "xlsx"].includes(ext || "")) return "📗";
    return "📁";
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Step 3: Synthesis Table</h2>
        <p className="text-sm text-blue-300 mb-6">
          Extract and synthesize key findings from selected papers into a structured evidence table.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={handleGenerateSynthesis}
            disabled={state.isLoading || state.papers.filter((p) => p.selected).length === 0}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Generating Synthesis..." : "Generate Synthesis Table"}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/60 text-sm"
            >
              <FileUp size={16} />
              Upload source document
            </button>

            <div className="relative">
              <select
                value={downloadFormat}
                onChange={(e) => setDownloadFormat(e.target.value)}
                className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm appearance-none pr-8"
              >
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
                <option value="pdf">PDF</option>
                <option value="word">Word</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 text-sm"
            >
              <Download size={16} />
              Download
            </button>
          </div>
        </div>

        {showUpload && (
          <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-blue-200 font-medium">Upload supporting documents (max 5)</p>
              <span className="text-xs text-blue-400">{state.uploadedDocuments.length}/5 files</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.csv,.xls,.xlsx"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-blue-700 rounded-lg py-4 text-sm text-blue-300 hover:border-yellow-500 hover:text-yellow-300 transition-colors"
            >
              Click to select files (PDF, Word, CSV, Excel)
            </button>
            {state.uploadedDocuments.length > 0 && (
              <div className="mt-3 space-y-2">
                {state.uploadedDocuments.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-blue-900/30 rounded px-3 py-2">
                    <span className="text-sm text-white flex items-center gap-2">
                      <span>{getFileIcon(file.name)}</span>
                      {file.name}
                    </span>
                    <button onClick={() => removeDoc(idx)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state.isLoading && !state.synthesisTable.length && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Analyzing selected papers and generating synthesis...</p>
            </div>
          </div>
        )}

        {!state.isLoading && localSynthesis.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <Sparkles size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select papers in Step 2 and click Generate to create the synthesis table.</p>
          </div>
        )}

        {localSynthesis.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-blue-900/60 text-left">
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[15%]">Reference (Vancouver)</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[15%]">Key Findings</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[20%]">Synopsis / Takeaway</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[25%]">Study Conducted</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[25%]">Research Gaps</th>
                </tr>
              </thead>
              <tbody>
                {localSynthesis.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-900/20">
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">
                      <span dangerouslySetInnerHTML={{ __html: row.reference }} />
                    </td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">{row.keyFindings}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">{row.synopsis}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top whitespace-pre-line">{row.studyDetails}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">{row.researchGaps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
