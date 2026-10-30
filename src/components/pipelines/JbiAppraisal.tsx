"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Copy,
  Download,
  Sparkles,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  appraiseDocument,
  buildJbiAiPrompt,
  listJbiChecklists,
  type AppraisalItem,
  type AppraisalResult,
  type JbiJudgment,
} from "@/lib/jbi-appraisal";
import { callGemini, callGroq } from "@/lib/ai";
import { downloadMarkdownAsPDF, downloadMarkdownAsWord } from "@/lib/exporters";

const JUDGMENT_STYLE: Record<JbiJudgment, { label: string; className: string; icon: React.ReactNode }> = {
  yes: { label: "YES", className: "bg-green-900/50 text-green-300 border-green-700", icon: <CheckCircle2 size={13} /> },
  no: { label: "NO", className: "bg-red-900/50 text-red-300 border-red-700", icon: <XCircle size={13} /> },
  not_applicable: { label: "N/A", className: "bg-gray-900/50 text-gray-400 border-gray-700", icon: <HelpCircle size={13} /> },
  not_clear: { label: "NOT CLEAR", className: "bg-yellow-900/40 text-yellow-300 border-yellow-700", icon: <HelpCircle size={13} /> },
};

export default function JbiAppraisal() {
  const { state } = useApp();
  const checklists = useMemo(() => listJbiChecklists(), []);

  const [file, setFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppraisalResult | null>(null);
  const [selectedChecklist, setSelectedChecklist] = useState<string>("");
  const [useAi, setUseAi] = useState(true);
  const [showReport, setShowReport] = useState(false);

  const [meta, setMeta] = useState({ title: "", authors: "", year: "", journal: "", reviewer: "", sourceFile: "" });

  const aiKey = state.geminiApiKey || state.groqApiKey || "";
  const hasAi = Boolean(aiKey);

  const handleFile = useCallback(async (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
    setParsing(true);
    setParseError(null);
    try {
      const { parseUploadedDocument } = await import("@/lib/document-parser");
      const parsed = await parseUploadedDocument(selected);
      if (!parsed.content || parsed.content.trim().length < 200) {
        setParseError(
          "Almost no text could be extracted from this file. Scanned/image-only PDFs need OCR before they can be appraised — please upload a text-based PDF or Word document.",
        );
        setDocumentText("");
        return;
      }
      setDocumentText(parsed.content);
      setMeta((m) => ({ ...m, title: m.title || parsed.name.replace(/\.[^.]+$/, ""), sourceFile: selected.name }));
    } catch (err: any) {
      setParseError(err?.message || "The document could not be parsed.");
      setDocumentText("");
    } finally {
      setParsing(false);
    }
  }, []);

  const requestAiJudgements = useCallback(
    async (checklistId: string, text: string): Promise<Record<string, { judgment: JbiJudgment; evidence?: string; rationale?: string }>> => {
      if (!aiKey) return {};
      const raw = aiKey === state.geminiApiKey ? await callGemini(aiKey, text, { searchEnabled: false }) : await callGroq(aiKey, text, { searchEnabled: false });
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("The AI reviewer did not return a usable judgement list.");
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) throw new Error("The AI reviewer returned an unexpected response shape.");
      const out: Record<string, { judgment: JbiJudgment; evidence?: string; rationale?: string }> = {};
      for (const entry of parsed) {
        if (!entry?.id) continue;
        const judgment = String(entry.judgment || "").toLowerCase().replace(/\s+/g, "_");
        if (judgment !== "yes" && judgment !== "no" && judgment !== "not_applicable" && judgment !== "not_clear") continue;
        out[entry.id] = {
          judgment: judgment as JbiJudgment,
          evidence: typeof entry.evidence === "string" ? entry.evidence.slice(0, 400) : undefined,
          rationale: typeof entry.rationale === "string" ? entry.rationale.slice(0, 600) : undefined,
        };
      }
      return out;
    },
    [aiKey, state.geminiApiKey],
  );

  const runAppraisal = useCallback(async () => {
    if (!documentText.trim()) {
      setError("Upload a PDF, Word or text document first.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const detectionRun = appraiseDocument({ text: documentText, checklistId: selectedChecklist || undefined, metadata: { ...meta, sourceFile: file?.name || "" } });
      const checklistId = selectedChecklist || detectionRun.checklistId;

      let aiJudgements: Record<string, { judgment: JbiJudgment; evidence?: string; rationale?: string }> = {};
      if (useAi && hasAi) {
        try {
          const prompt = buildJbiAiPrompt(checklistId, documentText);
          aiJudgements = await requestAiJudgements(checklistId, prompt);
        } catch (err: any) {
          setError(`The AI reviewer could not be used (${err?.message || "unknown error"}). The appraisal below was produced by the evidence-matching engine.`);
        }
      }

      const final = appraiseDocument({
        text: documentText,
        checklistId,
        metadata: { ...meta, sourceFile: file?.name || "" },
        aiJudgements,
      });
      setResult(final);
      setShowReport(false);
    } catch (err: any) {
      setError(err?.message || "The appraisal could not be completed.");
    } finally {
      setRunning(false);
    }
  }, [documentText, selectedChecklist, meta, file, useAi, hasAi, requestAiJudgements]);

  const reset = () => {
    setFile(null);
    setDocumentText("");
    setResult(null);
    setError(null);
    setParseError(null);
    setSelectedChecklist("");
    setShowReport(false);
  };

  const copyReport = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.reportMarkdown);
      setError("Report copied to the clipboard.");
      setTimeout(() => setError(null), 2500);
    } catch {
      setError("The report could not be copied — use Download instead.");
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const name = (meta.title || "jbi-appraisal").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    const blob = new Blob([result.reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "jbi-appraisal"}-jbi-report.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allItems: AppraisalItem[] = result ? result.sections.flatMap((s) => s.items) : [];

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck size={22} className="text-yellow-400" />
          <h2 className="text-xl font-bold text-white">JBI Critical Appraisal</h2>
        </div>
        <p className="text-sm text-blue-300 mb-6">
          Upload a PDF, Word or text version of a research paper. The study design is identified, the matching{" "}
          <a
            href="https://jbi.global/critical-appraisal-tools"
            target="_blank"
            rel="noreferrer"
            className="text-yellow-300 underline inline-flex items-center gap-0.5"
          >
            JBI critical appraisal tool
            <ExternalLink size={11} />
          </a>{" "}
          is applied item by item (yes / no / not applicable / not clear), and a complete appraisal report is produced.
        </p>
        <p className="text-[10px] text-blue-400 mb-6">
          This is a separate analysis from the CASP appraisal tool. JBI uses its own validity items and an include/exclude/seek-further-information
          recommendation derived from the critical items.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Study document (PDF / Word / TXT)</label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-800 rounded-lg p-6 cursor-pointer hover:border-yellow-500/70 transition-colors bg-blue-950/40">
                {parsing ? (
                  <Loader2 size={26} className="animate-spin text-yellow-400 mb-2" />
                ) : file ? (
                  <FileText size={26} className="text-green-400 mb-2" />
                ) : (
                  <Upload size={26} className="text-blue-300 mb-2" />
                )}
                <span className="text-sm text-white font-medium">{file ? file.name : "Choose a file to appraise"}</span>
                <span className="text-xs text-blue-400 mt-1">{file ? `${(file.size / 1024).toFixed(0)} KB — ${documentText.length.toLocaleString()} characters extracted` : ""}</span>
                <input type="file" accept=".pdf,.doc,.docx,.txt,.md" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
              </label>
              {parseError && (
                <p className="mt-2 text-xs text-red-300 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {parseError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">Paper title</label>
                <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm" placeholder="e.g. Nurse-led hypertension clinics: a randomised trial" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">Authors</label>
                <input value={meta.authors} onChange={(e) => setMeta({ ...meta, authors: e.target.value })} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm" placeholder="e.g. Smith J, Khan A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">Year</label>
                <input value={meta.year} onChange={(e) => setMeta({ ...meta, year: e.target.value })} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm" placeholder="2024" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">Journal</label>
                <input value={meta.journal} onChange={(e) => setMeta({ ...meta, journal: e.target.value })} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm" placeholder="Journal name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">Reviewer</label>
                <input value={meta.reviewer} onChange={(e) => setMeta({ ...meta, reviewer: e.target.value })} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-200 mb-1">JBI checklist</label>
                <select value={selectedChecklist || result?.checklistId || ""} onChange={(e) => setSelectedChecklist(e.target.value)} className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm">
                  <option value="">Detect automatically</option>
                  {checklists.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} ({c.itemCount} criteria)</option>
                  ))}
                </select>
              </div>
            </div>

            {hasAi && (
              <label className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="w-3.5 h-3.5 rounded border-blue-700 bg-blue-950 text-yellow-500 focus:ring-yellow-500" />
                <Sparkles size={12} className="text-yellow-400" />
                Add an AI critical reading of the paper (falls back to the evidence-matching engine when unavailable)
              </label>
            )}

            <div className="flex gap-2">
              <button onClick={runAppraisal} disabled={running || parsing || !documentText} className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2">
                {running ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} {running ? "Appraising..." : "Run JBI appraisal"}
              </button>
              <button onClick={reset} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70 flex items-center gap-1.5">
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            {error && <p className="text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-800/60 rounded px-3 py-2">{error}</p>}
          </div>

          <div className="bg-blue-950/40 border border-blue-900/50 rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-2">JBI checklists available</h3>
            <ul className="space-y-1.5 text-[11px]">
              {checklists.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-200 hover:text-yellow-300 inline-flex items-center gap-1">
                    {c.label}
                    <ExternalLink size={9} />
                  </a>
                  <span className="text-blue-500 whitespace-nowrap">{c.itemCount} criteria</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-blue-500 mt-3 leading-relaxed">
              JBI critical appraisal tools are published by the Joanna Briggs Institute (jbi.global). JBI checklists use YES / NO / NOT APPLICABLE /
              NOT CLEAR scoring and produce an include / exclude / seek further information recommendation.
            </p>
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
            <h3 className="text-lg font-bold text-white mb-1">Study design</h3>
            <p className="text-sm text-blue-200">{result.detection.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.detection.signals.slice(0, 4).map((s) => (
                <span
                  key={s.checklistId}
                  className={`text-[10px] px-2 py-1 rounded ${s.checklistId === result.checklistId ? "bg-yellow-500/20 text-yellow-300 border border-yellow-700" : "bg-blue-900/40 text-blue-400"}`}
                >
                  {s.design}: {s.score} signal{s.score === 1 ? "" : "s"}
                </span>
              ))}
            </div>
            <p className="text-xs text-blue-400 mt-3">
              JBI tool applied:{result.checklistSourceUrl && " "}
              <a href={result.checklistSourceUrl} target="_blank" rel="noreferrer" className="text-yellow-300 underline">{result.checklistLabel}</a>
              {result.usedAi && " • AI critical reading included"}
            </p>
          </div>

          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
            <h3 className="text-lg font-bold text-white mb-3">Appraisal summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-3">
                <p className="text-[10px] text-blue-400 uppercase">Validity</p>
                <p className="text-sm font-bold text-white mt-0.5">{result.summary.validity}</p>
              </div>
              <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-3">
                <p className="text-[10px] text-blue-400 uppercase">Quality score</p>
                <p className="text-sm font-bold text-white mt-0.5">{result.summary.qualityScore}%</p>
                <p className="text-[10px] text-blue-400 mt-0.5">{result.summary.yes} yes · {result.summary.no} no · {result.summary.notClear} not clear · {result.summary.notApplicable} N/A</p>
              </div>
              <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-3">
                <p className="text-[10px] text-blue-400 uppercase">Applicability</p>
                <p className="text-sm font-bold text-white mt-0.5">{result.summary.applicability.split(" — ")[0]}</p>
              </div>
              <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-3">
                <p className="text-[10px] text-blue-400 uppercase">Recommendation</p>
                <p className={`text-sm font-bold mt-0.5 ${result.summary.inclusionRecommendation === "Include" ? "text-green-300" : result.summary.inclusionRecommendation === "Exclude" ? "text-red-300" : "text-yellow-300"}`}>{result.summary.inclusionRecommendation}</p>
              </div>
            </div>

            <p className="text-sm text-blue-200 mb-2">{result.summary.results}</p>
            <p className="text-sm text-blue-300 mb-4">{result.summary.applicability}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-950/20 border border-green-900/40 rounded-lg p-3">
                <p className="text-xs font-bold text-green-300 mb-1.5">Key strengths</p>
                <ul className="space-y-1 text-[11px] text-blue-200">
                  {result.summary.strengths.length ? result.summary.strengths.map((s, i) => <li key={i}>✅ {s}</li>) : <li>None clearly evidenced in the uploaded document.</li>}
                </ul>
              </div>
              <div className="bg-red-950/20 border border-red-900/40 rounded-lg p-3">
                <p className="text-xs font-bold text-red-300 mb-1.5">Key limitations</p>
                <ul className="space-y-1 text-[11px] text-blue-200">
                  {result.summary.limitations.length ? result.summary.limitations.map((s, i) => <li key={i}>⚠️ {s}</li>) : <li>None identified.</li>}
                </ul>
              </div>
            </div>

            <p className="text-xs text-blue-300 mt-3">{result.summary.recommendationReason}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => setShowReport((v) => !v)} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70">{showReport ? "Hide full report" : "Show full report"}</button>
              <button onClick={copyReport} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70 flex items-center gap-1.5"><Copy size={12} /> Copy report</button>
              <button onClick={downloadReport} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70"><Download size={12} /> Markdown</button>
              <button onClick={() => downloadMarkdownAsWord(result.reportMarkdown, "jbi-appraisal-report")} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70">Word</button>
              <button onClick={() => downloadMarkdownAsPDF(result.reportMarkdown, "jbi-appraisal-report")} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-2 rounded hover:bg-blue-900/70">PDF</button>
            </div>
          </div>

          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
            <h3 className="text-lg font-bold text-white mb-3">JBI checklist appraisal</h3>
            <div className="space-y-5">
              {result.sections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-yellow-300">{section.title}</h4>
                    <span className="text-[10px] text-blue-400">{section.yes} yes · {section.no} no · {section.notClear} not clear · {section.notApplicable} N/A</span>
                  </div>
                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const style = JUDGMENT_STYLE[item.judgment];
                      return (
                        <div key={item.id} className="bg-blue-950/40 border border-blue-900/50 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 whitespace-nowrap ${style.className}`}>{style.icon} {style.label}</span>
                            <p className="text-xs text-white flex-1">{item.text}</p>
                          </div>
                          <p className="text-[11px] text-blue-300 mt-1.5">{item.rationale}</p>
                          {item.evidence && (
                            <p className="text-[11px] text-blue-400 mt-1 italic border-l-2 border-blue-800 pl-2">&ldquo;{item.evidence}&rdquo;</p>
                          )}
                          {item.source === "ai" && <span className="text-[9px] text-purple-300 mt-1 inline-block">AI reviewed</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showReport && (
            <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
              <h3 className="text-lg font-bold text-white mb-3">Full JBI appraisal report</h3>
              <pre className="bg-blue-950/70 border border-blue-900/50 rounded-lg p-4 text-[11px] text-blue-100 whitespace-pre-wrap max-h-[600px] overflow-y-auto">{result.reportMarkdown}</pre>
            </div>
          )}

          <p className="text-[10px] text-blue-500">
            {allItems.length} criteria appraised against {result.checklistLabel}. Every judgement quotes the uploaded document; where the paper does not report
            something, the criterion is recorded as &ldquo;Not Clear&rdquo; rather than assumed.
          </p>
        </>
      )}
    </div>
  );
}
