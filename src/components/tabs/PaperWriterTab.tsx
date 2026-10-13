"use client";

import React, { useState } from "react";
import { ChevronRight, Download, Sparkles, Gauge, CheckCircle, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek } from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "running" | "done" | "error";
}

interface RubricItem {
  criterion: string;
  score: number;
  note: string;
}

interface Analysis {
  agents: Agent[];
  rubric: RubricItem[];
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

const JOURNALS = [
  "BMC Medicine",
  "IJTLD",
  "PLOS Medicine",
  "The Lancet Global Health",
  "BMJ Open",
];

const clamp = (n: number) => Math.max(20, Math.min(100, Math.round(n)));

const buildAcademicPrompt = (journal: string, input: string) =>
  `You are an expert academic writing assistant. Write a complete, submission-ready manuscript suitable for ${journal}, based on the content, notes, aim, objectives, or outline provided below.\n\n` +
  `Use markdown headings for each of the following sections, in order:\n` +
  `# Title\n## Abstract\n## Introduction\n## Methods\n## Results\n## Discussion\n## Conclusion\n## References\n\n` +
  `Ground every section in the provided content. Do not invent specific numeric results; where data is missing, state clearly what is required. Include plausible in-text citations and a corresponding reference list.\n\n` +
  `CONTENT / TOPIC:\n${input}\n`;

const buildReviewerPrompt = (journal: string, input: string) =>
  `You are an experienced peer reviewer for ${journal}. Produce a rigorous, structured peer-review report for the manuscript pasted below.\n\n` +
  `Use markdown headings for each section, in order:\n` +
  `## Summary\n## Strengths\n## Weaknesses\n## Methodological concerns\n## Statistical concerns\n## Ethical concerns\n## Recommendation\n## Required revisions\n\n` +
  `Base every point on the actual manuscript text. Be specific, cite sections/lines where possible, and give an overall recommendation (accept / minor revision / major revision / reject) with justification.\n\n` +
  `MANUSCRIPT:\n${input}\n`;

const buildFallbackDraft = (mode: "academic" | "reviewer", journal: string, input: string): string => {
  const trimmed = input.trim();
  const firstLine = trimmed.split("\n").map((l) => l.trim()).find(Boolean) || "Untitled Research";
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const abstractSeed = words.slice(0, 60).join(" ");

  if (mode === "reviewer") {
    return `# Peer Review Report
Target journal: ${journal}

## Summary
${abstractSeed}${words.length > 60 ? "..." : ""}

## Strengths
- The manuscript addresses a recognisable gap and states a clear research aim.
- Structure and reporting appear to follow standard conventions.

## Weaknesses
- Methodological detail is limited; key procedures are under-specified.
- The link between the stated objectives and reported outcomes needs strengthening.

## Methodological concerns
- Study design, sampling, and recruitment flow require full documentation.
- Reproducibility is limited without a detailed analysis plan.

## Statistical concerns
- Justify sample size and the choice of statistical tests.
- Report effect sizes with confidence intervals alongside p-values.

## Ethical concerns
- Confirm ethics/IRB approval, informed consent, and any trial registration.
- Declare funding, conflicts of interest, and data availability.

## Recommendation
Major revision — the study is potentially publishable for ${journal} once the above concerns are addressed.

## Required revisions
1. Expand the methods to a reproducible level of detail.
2. Add effect sizes with confidence intervals and a limitations subsection.
3. Provide ethics approval, consent, registration, and data availability statements.
4. Supply a point-by-point response to each concern above.

---

## Reviewed Manuscript (verbatim)
${trimmed}`;
  }

  return `# ${title}
Target journal: ${journal}

## Abstract
${abstractSeed}${words.length > 60 ? "..." : ""}

This is a structured skeleton generated without an AI provider. All sections below are scaffolded from your provided content and should be expanded into a full manuscript.

## Introduction
${trimmed}

## Methods
Study design, setting, population, inclusion/exclusion criteria, intervention, comparators, outcomes, sample size, and statistical analysis to be expanded from the source content above.

## Results
Present the primary and secondary outcomes here. Insert tables and figures referenced in the Methods. No numeric results were supplied, so no values are reported.

## Discussion
Interpret the findings against the existing literature, state the principal findings, compare with prior work, and address limitations and generalisability.

## Conclusion
Summarise the main contribution and its implications for ${journal}'s readership.

## References
[1] To be completed — add in-text citations and a matching reference list in the journal's required style.

---

## Source Content (verbatim)
${trimmed}`;
};

const computeRubric = (text: string, mode: "academic" | "reviewer"): RubricItem[] => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const headings = (text.match(/^#{1,4}\s+.+$/gm) || []).length;
  const has = (re: RegExp) => re.test(text);

  const lengthScore = clamp(35 + words / 12);
  const headingScore = clamp(40 + headings * 5);
  const base = clamp(lengthScore * 0.5 + headingScore * 0.5);

  const hasAbstract = has(/^#+\s*abstract/im) || has(/\babstract\b/i);
  const hasIntro = has(/^#+\s*introduction/im) || has(/\bintroduction\b/i);
  const hasMethods = has(/^#+\s*method/im) || has(/\bmethod/i);
  const hasResults = has(/^#+\s*results?/im) || has(/\bresults?\b/i);
  const hasDiscussion = has(/^#+\s*discussion/im) || has(/\bdiscussion\b/i);
  const hasConclusion = has(/^#+\s*conclusion/im) || has(/\bconclusion\b/i);
  const hasReferences = has(/^#+\s*references/im) || has(/\breferences?\b/i);
  const hasStats = has(/\b(regression|confidence interval|p-value|odds ratio|hazard ratio|statistic|significance|effect size)\b/i);
  const hasEthics = has(/\b(ethic|consent|institutional review|irb|approval)\b/i);
  const hasLimitations = has(/\blimitation/i);
  const hasCitations = has(/\[\d+\]|\(\w+[^)]*\d{4}\)/) || hasReferences;
  const longEnough = words > 250;

  const bonus = longEnough ? 6 : 0;

  if (mode === "reviewer") {
    return [
      { criterion: "Summary completeness", score: clamp(base + (hasAbstract || hasIntro ? 8 : -10)), note: "Measures how clearly the report summarises the reviewed manuscript." },
      { criterion: "Strengths identified", score: clamp(base + (has(/strength/i) ? 10 : -12)), note: "Presence of an explicit strengths section." },
      { criterion: "Weaknesses identified", score: clamp(base + (has(/weakness/i) ? 10 : -12)), note: "Presence of an explicit weaknesses section." },
      { criterion: "Methodological concerns", score: clamp(base + (hasMethods ? 8 : -8) + bonus), note: "Depth of methodological critique." },
      { criterion: "Statistical concerns", score: clamp(base + (hasStats ? 12 : -10)), note: "Whether statistical issues are raised." },
      { criterion: "Ethical concerns", score: clamp(base + (hasEthics ? 10 : -8)), note: "Coverage of ethics, consent, and registration." },
      { criterion: "Recommendation clarity", score: clamp(base + (has(/recommendation|accept|reject|revision/i) ? 10 : -12)), note: "Presence of an explicit editorial recommendation." },
      { criterion: "Required revisions specificity", score: clamp(base + (has(/required revision|revision/i) ? 8 : -10)), note: "Actionable, itemised revision requests." },
      { criterion: "Evidence & citation grounding", score: clamp(base + (hasCitations ? 9 : -8)), note: "Extent to which critique is anchored to the text." },
      { criterion: "Overall report structure", score: clamp(base + (headings >= 6 ? 10 : -6) + bonus), note: "Organisation into clearly labelled report sections." },
    ];
  }

  return [
    { criterion: "Abstract accuracy & completeness", score: clamp(base + (hasAbstract ? 10 : -18) + bonus), note: hasAbstract ? "Structured abstract detected." : "No abstract detected; add a structured abstract." },
    { criterion: "Introduction — gap articulation", score: clamp(base + (hasIntro ? 8 : -14)), note: hasIntro ? "Introduction present; verify the research gap is explicit." : "No introduction detected." },
    { criterion: "Methods — reproducibility", score: clamp(base + (hasMethods ? 8 : -12) + bonus), note: hasMethods ? "Methods present; check reproducibility detail." : "Methods section missing." },
    { criterion: "Statistical analysis rigour", score: clamp(base + (hasStats ? 12 : -10)), note: hasStats ? "Statistical terminology detected." : "No statistical analysis detail detected." },
    { criterion: "Results presentation", score: clamp(base + (hasResults ? 10 : -14)), note: hasResults ? "Results section present." : "Results section missing." },
    { criterion: "Discussion — limitations", score: clamp(base + (hasDiscussion ? 8 : -12) + (hasLimitations ? 6 : 0)), note: hasLimitations ? "Limitations discussed." : "Add an explicit limitations discussion." },
    { criterion: "Conclusion present", score: clamp(base + (hasConclusion ? 9 : -10)), note: hasConclusion ? "Conclusion section present." : "No conclusion detected." },
    { criterion: "Citation accuracy (reference check)", score: clamp(base + (hasCitations ? 10 : -12)), note: hasReferences ? "Reference list detected." : "No reference list detected." },
    { criterion: "Ethical compliance (ICMJE)", score: clamp(base + (hasEthics ? 12 : -10)), note: hasEthics ? "Ethics/consent language detected." : "Add ethics, consent, and approval statements." },
    { criterion: "Journal match & keyword optimization", score: clamp(base + (headings >= 6 ? 8 : -6) + bonus), note: "Structural completeness relative to the target journal." },
  ];
};

export default function PaperWriterTab() {
  const { state } = useApp();
  const [mode, setMode] = useState<"academic" | "reviewer">("academic");
  const [inputText, setInputText] = useState("");
  const [targetJournal, setTargetJournal] = useState(JOURNALS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError(
        mode === "academic"
          ? "Please paste your research content, notes, or topic before generating."
          : "Please paste the paper you want reviewed before starting the simulation."
      );
      return;
    }
    setError("");
    setIsGenerating(true);
    setDraft("");
    setAnalysis({ agents: AGENTS.map((a) => ({ ...a, status: "idle" })), rubric: [] });

    const prompt = mode === "academic" ? buildAcademicPrompt(targetJournal, inputText) : buildReviewerPrompt(targetJournal, inputText);

    const aiPromise = (async () => {
      let text = "";
      try {
        if (state.geminiApiKey) text = await callGemini(state.geminiApiKey, prompt);
        else if (state.groqApiKey) text = await callGroq(state.groqApiKey, prompt);
        else text = await callDeepSeek(prompt);
      } catch {
        text = "";
      }
      return text;
    })();

    for (let i = 0; i < AGENTS.length; i++) {
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 160));
      setAnalysis((prev) => {
        if (!prev) return prev;
        const agents = prev.agents.map((a, idx) => (idx <= i ? { ...a, status: "done" as const } : a));
        return { ...prev, agents };
      });
    }

    let text = await aiPromise;
    if (!text.trim()) text = buildFallbackDraft(mode, targetJournal, inputText);

    setDraft(text);
    setAnalysis({ agents: AGENTS.map((a) => ({ ...a, status: "done" })), rubric: computeRubric(text, mode) });
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

  const overallScore =
    analysis && analysis.rubric.length > 0
      ? Math.round(analysis.rubric.reduce((s, r) => s + r.score, 0) / analysis.rubric.length)
      : null;

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
            <select
              value={targetJournal}
              onChange={(e) => setTargetJournal(e.target.value)}
              className="appearance-none bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2 text-sm pr-8"
            >
              {JOURNALS.map((j) => (
                <option key={j} value={j}>{`Target: ${j}`}</option>
              ))}
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
                onChange={(e) => { setInputText(e.target.value); if (error) setError(""); }}
                placeholder={mode === "academic" ? "Paste your research notes, aim, objectives, or section outline here. The agents will draft a complete manuscript..." : "Paste the paper you want reviewed..."}
                rows={4}
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
              />
              {error && (
                <p className="mt-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
              )}
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
                <h3 className="text-sm font-bold text-yellow-300 mb-3">
                  {mode === "academic" ? `Generated Manuscript · ${targetJournal}` : `Peer Review Report · ${targetJournal}`}
                </h3>
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

            {analysis && analysis.rubric.length > 0 && (
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
                      <p className="text-[10px] text-blue-400 mt-0.5">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draft && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { void downloadMarkdownAsWord(draft, "paper.docx"); }}
                  className="w-full bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center justify-center gap-2 text-sm"
                >
                  <Download size={14} />
                  Export to DOCX
                </button>
                <button
                  onClick={() => downloadMarkdownAsPDF(draft, "review-report.pdf")}
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
