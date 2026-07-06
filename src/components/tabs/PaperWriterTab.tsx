"use client";

import React, { useState } from "react";
import { PenLine, ChevronRight, Download, Sparkles, Gauge, CheckCircle, XCircle } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "running" | "done" | "error";
}

const AGENTS: Agent[] = [
  { id: "lit-reviewer", name: "Literature Harmonizer", role: "Synthesizes sources & manages citations", status: "idle" },
  { id: "architect", name: "Section Architect", role: "Structure → outline → paragraph scaffolding", status: "idle" },
  { id: "writer", name: "Academic Writer", role: "Drafting manuscript sections per style guide", status: "idle" },
  { id: "methodologist", name: "Methodologist Agent", role: "Statistical accuracy & study design validation", status: "idle" },
  { id: "editor", name: "Copy Editor", role: "Grammar, style, flow, citation formatting", status: "idle" },
  { id: "ethics", name: "Ethics Compliance Agent", role: "CONSORT / PRISMA checks, ethical language", status: "idle" },
  { id: "peer-reviewer", name: "Peer Reviewer Simulator", role: "Generates reviewer-style critique per journal criteria", status: "idle" },
  { id: "referee", name: "Response Writer", role: "Drafts author responses to reviewer comments", status: "idle" },
  { id: "heatmap", name: "Quality Heatmap Agent", role: "Per-section quality scoring (0–100)", status: "idle" },
  { id: "cover-letter", name: "Cover Letter Composer", role: "Journal-specific cover letter generation", status: "idle" },
  { id: "translator", name: "Multi-Language Optimizer", role: "Simplified English / plain-language summaries", status: "idle" },
  { id: "excellence", name: "Excellence Auditor", role: "Final grading, assignability check, sign-off", status: "idle" },
];

const generateMockAnalysis = (): { agents: Agent[]; rubric: { criterion: string; score: number; note: string }[] } => {
  const statuses: Agent["status"][] = ["done", "done", "done", "done", "done", "done", "done", "done", "done", "done", "done", "done"];
  return {
    agents: AGENTS.map((a, i) => ({ ...a, status: statuses[i] })),
    rubric: [
      { criterion: "Abstract accuracy & completeness", score: 88, note: "Well structured: Background, Methods, Results, Conclusions. Minor word limit concern." },
      { criterion: "Introduction — gap articulation", score: 85, note: "Clear research gap identified. Could strengthen hypothesis statement in final paragraph." },
      { criterion: "Methods — reproducibility", score: 82, note: "Inclusion/exclusion criteria complete. Missing: recruitment timeline flowchart detail." },
      { criterion: "Statistical analysis rigour", score: 90, note: "Appropriate mixed-effects regression. Effect sizes with CIs provided. DAG absent." },
      { criterion: "Results presentation", score: 87, note: "Tables clear. CONSORT flow diagram suggested. Forest plot not present (meta-analysis present)." },
      { criterion: "Discussion — limitations", score: 78, note: "Limitations section brief. Funding & competing interests statements present." },
      { criterion: "Citation accuracy (reference check)", score: 92, note: "Vancouver style consistent across 47 references. 3 missing DOIs flagged." },
      { criterion: "Grammar, flow, readability", score: 91, note: "Flesch-Kincaid Grade Level 11.3 — suitable for BMC Medicine audience." },
      { criterion: "Ethical compliance (ICMJE)", score: 95, note: "IRB approval, consent statement, trial registration included." },
      { criterion: "Journal match & keyword optimization", score: 80, note: "Best fit: IJTLD, PLOS Medicine. Title length acceptable. Abstract word count 285/300 limit." },
    ],
  };
};

export default function PaperWriterTab() {
  const [mode, setMode] = useState<"academic" | "reviewer">("academic");
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<ReturnType<typeof generateMockAnalysis> | null>(null);
  const [showRubric, setShowRubric] = useState(true);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setDraft("");
    setAnalysis(null);

    for (let i = 0; i < AGENTS.length; i++) {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 600));
      if (analysis) {
        setAnalysis((prev) => {
          if (!prev) return prev;
          const updatedAgents = [...prev.agents];
          updatedAgents[i] = { ...updatedAgents[i], status: "done" };
          return { ...prev, agents: updatedAgents };
        });
      }
    }

    await new Promise((r) => setTimeout(r, 800));
    const result = generateMockAnalysis();
    setAnalysis(result);
    setDraft(
      `IMPLEMENTATION AND COST-EFFECTIVENESS OF ANNUAL IGRA-BASED LTBI SCREENING AMONG HEALTHCARE WORKERS: A MIXED-METHODS STUDY\n\n## Abstract\nBackground: LTBI remains underdiagnosed among HCWs particularly in LMIC settings where TST-based protocols dominate despite IGRA evidence superiority...\n\n## Introduction\nLatent tuberculosis infection (LTBI) affects approximately 25% of the global population (Houben & Dodd, 2014). Healthcare workers (HCWs) face disproportionate risk due to occupational exposure. Annual IGRA-based screening protocols offer superior specificity...\n\n## Methods [DRAFT — see Methodology section]\n\n## Results [Placeholder for RCT data]\n\n## Discussion\nThis study provides high-quality implementation and cost-effectiveness evidence for IGRA-based HCW screening in sub-Saharan Africa...\n\n---\nManuscript generated by Resilient 12-Agent Academic Paper Writer.\nRubric scores: see Quality Assessment panel.`
    );
    setIsGenerating(false);
  };

  const getStatusIcon = (status: Agent["status"]) => {
    switch (status) {
      case "done": return <CheckCircle size={14} className="text-green-400" />;
      case "running": return <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />;
      case "error": return <XCircle size={14} className="text-red-400" />;
      default: return <div className="w-3 h-3 rounded-full bg-blue-800" />;
    }
  };

  const overallScore = analysis ? Math.round(analysis.rubric.reduce((s, r) => s + r.score, 0) / analysis.rubric.length) : null;

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Paper Writer & Reviewer</h2>
        <p className="text-sm text-blue-300 mb-6">
          12-agent pipeline for academic paper drafting and peer review simulation.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setMode("academic")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === "academic" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/50 text-blue-300"}`}
          >
            ✍️ Academic Paper Writing
          </button>
          <button
            onClick={() => setMode("reviewer")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === "reviewer" ? "bg-yellow-500 text-[#0a1a3a]" : "bg-blue-900/50 text-blue-300"}`}
          >
            📝 Academic Paper Reviewer
          </button>
          <div className="relative">
            <select className="appearance-none bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm pr-8">
              <option>Target: BMC Medicine</option>
              <option>Target: IJTLD</option>
              <option>Target: PLOS Medicine</option>
            </select>
            <ChevronRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 rotate-[-90deg] pointer-events-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                {mode === "academic" ? "Paper content / topic / uploaded sections" : "Upload paper to review"}
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={mode === "academic" ? "Paste your research notes, aim, objectives, or section outline here. The agents will draft a complete manuscript..." : "Paste the paper you want reviewed..."}
                rows={4}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                <Sparkles size={18} />
                {isGenerating ? "Generating..." : mode === "academic" ? "Generate Academic Paper" : "Start Review Simulation"}
              </button>
            </div>

            {draft && (
              <div className="bg-blue-950 border border-blue-900 rounded-lg p-5 max-h-[500px] overflow-y-auto">
                <h3 className="text-sm font-bold text-yellow-300 mb-3">Generated Manuscript</h3>
                <pre className="text-sm text-blue-100 whitespace-pre-wrap font-serif leading-relaxed">{draft}</pre>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Gauge size={14} className="text-yellow-400" />
                12-Agent Pipeline Status
              </h4>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {(analysis?.agents || AGENTS).map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2">
                    {getStatusIcon(agent.status)}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{agent.name}</p>
                      <p className="text-[10px] text-blue-400 truncate">{agent.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {analysis && (
              <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Gauge size={14} className="text-yellow-400" />
                  Quality Grid
                  {overallScore !== null && (
                    <span className="ml-auto text-xs bg-yellow-500 text-[#0a1a3a] px-2 py-0.5 rounded-full font-bold">{overallScore}/100</span>
                  )}
                </h4>
                <div className="space-y-2">
                  {analysis.rubric.map((item, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-blue-200 truncate flex-1">{item.criterion}</span>
                        <span className={`text-xs font-bold ml-1 ${item.score >= 85 ? "text-green-400" : item.score >= 70 ? "text-yellow-400" : "text-red-400"}`}>{item.score}</span>
                      </div>
                      <div className="h-1.5 bg-blue-900 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.score >= 85 ? "bg-green-500" : item.score >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draft && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => alert("Exporting paper as DOCX...")}
                  className="w-full bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} />
                  Export to DOCX
                </button>
                <button
                  onClick={() => alert("Exporting review report as PDF...")}
                  className="w-full bg-blue-900/50 text-blue-200 px-4 py-2 rounded-lg hover:bg-blue-900/70 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} />
                  Export Review Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
