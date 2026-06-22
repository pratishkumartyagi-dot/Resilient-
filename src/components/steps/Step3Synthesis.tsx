"use client";

import React, { useState, useRef } from "react";
import { Download, FileUp, Sparkles, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";

const generateMockSynthesis = (): any[] => {
  const papers = [
    {
      id: "syn-1",
      reference: "Smith J, Doe A, et al. Latent tuberculosis infection screening among healthcare workers: a systematic review. <em>J Infect Dis</em>. 2022;185(3):456-468. doi:10.1000/jid.2022.456",
      keyFindings: "Prevalence of LTBI among HCWs ranged from 15-45% across 23 studies. IGRA demonstrated higher specificity (95%) compared to TST (78%).",
      synopsis: "This systematic review synthesized evidence from 23 studies involving 45,000+ healthcare workers. The authors found significantly higher LTBI prevalence in low-income countries (p<0.001) and identified inadequate infection control measures as a primary driver.",
      studyDetails: "Population: N=45,000 HCWs across 12 countries. Setting: Hospital-based and community health centers. Time: 2010–2022. Hypothesis: HCWs have 2.5× higher LTBI risk vs general population. Intervention: Annual IGRA screening program.",
      researchGaps: "Limited data on transgender HCWs, rural hospital settings underrepresented, long-term follow-up beyond 5 years scarce.",
    },
    {
      id: "syn-2",
      reference: "Chen L, Wang M, et al. Implementation challenges of mobile radiology van screening in rural China. <em>Trop Med Int Health</em>. 2021;26(8):901-912. doi:10.1000/tmih.2021.901",
      keyFindings: "Mobile van screening increased detection rates by 320% in remote districts. Combined IGRA + chest X-ray approach yielded 94% sensitivity.",
      synopsis: "Innovative delivery of LTBI screening via mobile radiology units demonstrated substantial feasibility gains. The study identified key enablers (community trust, flexible scheduling) and barriers (power interruptions, staff turnover).",
      studyDetails: "Population: N=12,000 rural residents across 8 counties. Setting: Mobile radiology vans + fixed health posts. Time: 2018–2021. Hypothesis: Mobile units reduce structural barriers to screening access. Intervention: Quarterly mobile van screening with same-day chest X-ray.",
      researchGaps: "Insufficient data on TB preventive therapy uptake post-positive test, cost-effectiveness not modeled, seasonal access variation unanalyzed.",
    },
    {
      id: "syn-3",
      reference: "Okonkwo C, Eze P, et al. IGRA uptake and cost-effectiveness in Nigerian tertiary hospitals. <em>BMC Public Health</em>. 2023;23:1245. doi:10.1000/bmcph.2023.1245",
      keyFindings: "IGRA screening cost per QALY gained: $1,240. Below WHO threshold of $3,000/QALY. Acceptability among 82% of HCWs surveyed.",
      synopsis: "This economic evaluation from Nigeria provides cost-effectiveness evidence supporting IGRA implementation in sub-Saharan African tertiary hospitals. The study also captured qualitative HCW perspectives highlighting stigma-related concerns.",
      studyDetails: "Population: N=3,200 HCWs (1:2 nurse-to-doctor ratio). Setting: 4 tertiary hospitals in Lagos and Abuja. Time: 2020–2023. Hypothesis: IGRA is cost-effective at local income thresholds. Intervention: Annual workplace IGRA + counseling.",
      researchGaps: "Pediatric HCWs not included, no comparison with molecular diagnostics (e.g., Xpert MTB), external validity to non-hospital settings limited.",
    },
    {
      id: "syn-4",
      reference: "Kumar R, Sharma P, et al. Digital health tools for LTBI contact tracing in Mumbai slums. <em>Glob Health Sci Pract</em>. 2024;12(1):67-78. doi:10.1000/ghsp.2024.067",
      keyFindings: "Mobile app-based contact tracing improved completion rates by 47%. Digital reminders reduced defaulting from 18% to 6%.",
      synopsis: "A cluster RCT demonstrated that digital health tools (SMS reminders, WhatsApp appointment scheduling) significantly improved LTBI contact tracing completion rates in densely populated urban slums. The tool also reduced time-to-diagnosis by 35%.",
      studyDetails: "Population: N=8,500 close contacts of TB index cases. Setting: Mumbai slum communities + 12 local clinics. Time: 2022–2024. Hypothesis: Digital reminders improve contact tracing completion. Intervention: Custom mobile app with biometric ID verification.",
      researchGaps: "App depends on smartphone ownership (60% baseline penetration), non-literate user interface not tested, long-term maintenance strategy absent.",
    },
  ];

  return papers;
};

export default function Step3Synthesis() {
  const { state, dispatch } = useApp();
  const [showUpload, setShowUpload] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState("csv");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localSynthesis, setLocalSynthesis] = useState<any[]>(state.synthesisTable);

  const handleGenerateSynthesis = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const mockData = generateMockSynthesis();
      dispatch({ type: "SET_SYNTHESIS", payload: mockData });
      setLocalSynthesis(mockData);
      dispatch({ type: "SET_LOADING", payload: false });
      dispatch({ type: "SET_STEP", payload: 4 });
    }, 2000);
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

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={handleGenerateSynthesis}
            disabled={state.isLoading || state.selectedPapers.length === 0}
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
