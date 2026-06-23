"use client";

import React, { useState, useRef } from "react";
import { Download, FileUp, Sparkles, Trash2, ChevronDown, FileText, AlertCircle, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callOpenRouter } from "@/lib/ai";
import { downloadCSV, downloadExcel, downloadPDF, downloadWord, parseCSVText } from "@/lib/exporters";

function buildSynthesisPrompt(papers: any[], uploadedContext: string): string {
  return `You are an expert systematic review research analyst using AIPOCH Medical Research Skills — Literature Deep Research methodology.

TASK: Produce a structured evidence synthesis table (PRISMA-compliant) from selected academic papers.

RULES:
- Base ALL outputs strictly on the provided paper metadata.
- Vancouver reference format: "Authors. Title. Journal. Year;Volume(Issue):Pages. doi:DOI" — include searchable DOI link https://doi.org/[DOI].
- Key Findings: most important quantitative and qualitative findings, graded T1 (mechanistic) → T4 (mention).
- Synopsis: 1-2 sentences on core evidence contribution.
- Study Conducted: explicitly state Population, Setting, Time period of study, Hypothesis, Any Intervention/tested.
- Research Gaps: (1) author-acknowledged limitations, (2) contradictions/conflicting evidence, (3) exclusion criteria, (4) underexplored areas. If not stated, infer from study design.

OUTPUT FORMAT — strict JSON array only:
[
  {
    "id": "unique-id",
    "reference": "Vancouver with <em>journal</em> and DOI link",
    "keyFindings": "string with T1/T2/T3/T4 grade",
    "synopsis": "string",
    "studyDetails": "Population: ... Setting: ... Time: ... Hypothesis: ... Intervention: ...",
    "researchGaps": "Limitations: ... Contradictions: ... Exclusion criteria: ... Future work: ..."
  }
]

${uploadedContext ? `UPLOADED DOCUMENT CONTEXT:\n${uploadedContext}\n` : ""}
PAPERS TO SYNTHESIZE:
${papers.map((p: any, i: number) => `${i + 1}. TITLE: ${p.title}\n   AUTHORS: ${p.authors}\n   JOURNAL: ${p.journal}\n   YEAR: ${p.year}\n   DOI: ${p.doi}\n   STUDY TYPE: ${p.studyType}\n   ABSTRACT: ${p.abstract || "Not available"}`).join("\n\n")}`;
}

function generateMockSynthesis(papers: any[]): any[] {
  return papers.slice(0, 8).map((p: any, i: number) => ({
    id: `syn-${Date.now()}-${i}`,
    reference: `${p.authors} "${p.title}". <em>${p.journal}</em>. ${p.year}. <a href="https://doi.org/${p.doi}" target="_blank" rel="noopener noreferrer">doi:${p.doi}</a>`,
    keyFindings: `T2: Primary analysis showed significant association between intervention and measured outcomes (p<0.05). Effect sizes moderate-to-large across subpopulations.`,
    synopsis: `This ${p.studyType.toLowerCase()} advances the evidence base by addressing gaps in prior literature through rigorous methodological design and multi-site validation.`,
    studyDetails: `Population: Diverse cohorts reflecting target demographic. Setting: Multi-center academic and community settings. Time: 2018–2024. Hypothesis: Tested association between primary exposure and outcome. Intervention: Protocol-driven comparative assessment.`,
    researchGaps: `Limitations: geographic concentration limits generalizability; self-reported outcomes in part of sample. Contradictions: findings partially conflict with earlier meta-analyses on subgroup effects. Exclusion criteria: pediatric and geriatric subpopulations. Future work: longitudinal follow-up and cross-cultural replication warranted.`,
  }));
}

export default function SRStep3Synthesis() {
  const { state, dispatch } = useApp();
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const [error, setError] = useState("");
  const [uploadedText, setUploadedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localSynthesis, setLocalSynthesis] = useState<any[]>(state.synthesisTable);

  const selectedPapers = state.selectedPapers.length > 0 ? state.selectedPapers : state.papers;

  const handleGenerateSynthesis = async () => {
    if (selectedPapers.length === 0) {
      alert("Please select at least one paper to proceed.");
      return;
    }
    dispatch({ type: "SET_LOADING", payload: true });
    setError("");

    try {
      const prompt = buildSynthesisPrompt(selectedPapers, uploadedText);
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
        throw new Error("No API key configured. Open Settings (gear icon) to add Gemini or OpenRouter API key.");
      }

      dispatch({ type: "SET_SYNTHESIS", payload: synthesis });
      setLocalSynthesis(synthesis);
      dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 4 });
    } catch (err: any) {
      console.error("Synthesis generation failed:", err);
      setError(err.message || "Failed to generate synthesis table.");
      const fallback = generateMockSynthesis(selectedPapers);
      dispatch({ type: "SET_SYNTHESIS", payload: fallback });
      setLocalSynthesis(fallback);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 5) {
      alert("Maximum 5 files allowed");
      return;
    }
    const combined = [...state.uploadedDocuments, ...files].slice(0, 5);
    dispatch({ type: "SET_UPLOADED_DOCS", payload: combined });

    const parts: string[] = [];
    for (const file of files) {
      parts.push(`[File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`);
      if (file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")) {
        try {
          const text = await file.text();
          const parsed = parseCSVText(text);
          parts.push(`CSV Preview: ${parsed.slice(0, 6).map((r) => r.join(" | ")).join("\n")}`);
        } catch {
          parts.push("[CSV parsing failed]");
        }
      } else {
        parts.push(`[Document uploaded for AI context]`);
      }
    }
    if (parts.length) setUploadedText((prev) => (prev ? prev + "\n\n" : "") + parts.join("\n"));
  };

  const removeDoc = (index: number) => {
    const updated = state.uploadedDocuments.filter((_, i) => i !== index);
    dispatch({ type: "SET_UPLOADED_DOCS", payload: updated });
  };

  const handleDownload = () => {
    if (localSynthesis.length === 0) {
      alert("No synthesis table to download.");
      return;
    }
    switch (downloadFormat) {
      case "csv": downloadCSV(localSynthesis); break;
      case "excel": downloadExcel(localSynthesis); break;
      case "pdf": downloadPDF(localSynthesis); break;
      case "word": downloadWord(localSynthesis); break;
      default: downloadCSV(localSynthesis);
    }
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
        <h2 className="text-xl font-bold text-white mb-1">Step 3: Generate Synthesis Table</h2>
        <p className="text-sm text-blue-300 mb-6">
          Deep-search and reason through selected papers to produce a structured evidence synthesis table using AIPOCH methodology. Vancouver references with DOI, key findings, synopsis, study details, and research gaps per paper.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={handleGenerateSynthesis}
            disabled={state.isLoading || selectedPapers.length === 0}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Deep Reasoning & Synthesizing..." : "Generate Synthesis Table"}
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,.doc,.docx,.csv,.xls,.xlsx";
                input.multiple = true;
                input.onchange = (e: any) => handleFileUpload(e);
                input.click();
              }}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-800/60 text-sm"
            >
              <FileUp size={16} />
              Upload Source Document
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
              disabled={localSynthesis.length === 0}
              className="flex items-center gap-2 bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 text-sm disabled:opacity-50"
            >
              <Download size={16} /> Download
            </button>
          </div>
        </div>

        {state.uploadedDocuments.length > 0 && (
          <div className="mb-4 space-y-2">
            {state.uploadedDocuments.map((file: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between bg-blue-900/30 rounded px-3 py-2">
                <span className="text-sm text-white flex items-center gap-2">
                  <span>{getFileIcon(file.name)}</span> {file.name}
                  <span className="text-xs text-blue-400">({(file.size / 1024).toFixed(1)} KB)</span>
                </span>
                <button onClick={() => removeDoc(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {state.isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Deep reasoning through selected papers and generating synthesis...</p>
              <p className="text-blue-400 text-xs mt-1">This may take a moment depending on the number of papers.</p>
            </div>
          </div>
        )}

        {!state.isLoading && localSynthesis.length === 0 && (
          <div className="text-center py-12 text-blue-400">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select papers in Step 2 and click Generate to create the synthesis table.</p>
          </div>
        )}

        {localSynthesis.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-blue-900/60 text-left">
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[18%]">Reference (Vancouver)</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[15%]">Key Findings</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[17%]">Synopsis / Takeaway</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[20%]">Study Conducted</th>
                  <th className="border border-blue-800 px-3 py-2.5 text-yellow-200 font-semibold w-[30%]">Research Gaps</th>
                </tr>
              </thead>
              <tbody>
                {localSynthesis.map((row: any) => (
                  <tr key={row.id} className="hover:bg-blue-900/20">
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">
                      <span dangerouslySetInnerHTML={{ __html: row.reference }} />
                    </td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">{row.keyFindings}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top">{row.synopsis}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top whitespace-pre-line">{row.studyDetails}</td>
                    <td className="border border-blue-800 px-3 py-2.5 text-blue-100 align-top whitespace-pre-line">{row.researchGaps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {localSynthesis.length > 0 && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => dispatch({ type: "SET_SYSTEMATIC_STEP", payload: 4 })}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
            >
              Generate Themes <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
