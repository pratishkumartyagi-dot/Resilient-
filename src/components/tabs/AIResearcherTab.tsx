"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Play,
  Square,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Mail,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

interface ResearchAgentStage {
  name: string;
  content: string;
  durationMs: number;
}

interface ResearchAgentOutput {
  query: string;
  references: string;
  literatureSurvey: string;
  researchIdea: string;
  researchPlan: string;
  critique: string;
  manuscript: string;
  stages: ResearchAgentStage[];
  createdAt: number;
}

export default function AIResearcherTab() {
  const { state } = useApp();
  const apiKey = state.geminiApiKey;

  const [query, setQuery] = useState("");
  const [references, setReferences] = useState("");
  const [provider, setProvider] = useState<"gemini" | "groq">("gemini");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [output, setOutput] = useState<ResearchAgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError("Enter a research query.");
      return;
    }
    if (!apiKey) {
      setError("No Gemini API key configured. Open Settings and add a Gemini key, then try again.");
      return;
    }
    setError(null);
    setStatus("running");
    setOutput(null);
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/research-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, references, apiKey, provider }),
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setOutput(data);
      setStatus("done");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err?.message || "Research agent failed");
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStatus("idle");
    abortRef.current = null;
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const canRun = Boolean(query.trim() && apiKey && status !== "running");

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={20} className="text-yellow-400" />
          <h2 className="text-lg font-bold text-white">AI Researcher (Autonomous Pipeline)</h2>
        </div>
        <p className="text-sm text-blue-300 mb-4">
          Runs an autonomous research loop — literature survey → idea → plan → critical appraisal → manuscript —
          using your configured Gemini key (Groq fallback). Modelled on{" "}
          <a
            href="https://github.com/hkuds/ai-researcher"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline"
          >
            hkuds/ai-researcher
          </a>.
        </p>

        <form onSubmit={handleRun} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Research Query</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. rotation-rescaling VQ-VAE gradient propagation through the quantization layer"
              rows={3}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Reference Papers / Literature</label>
            <textarea
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              placeholder="Paste reference titles, abstracts, or citations (one per line). Optional but improves the survey."
              rows={4}
              className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-blue-200">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "gemini" | "groq")}
              className="bg-blue-950 border border-blue-800 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="gemini">Gemini (primary)</option>
              <option value="groq">Groq (fallback)</option>
            </select>
            <span className="text-xs text-blue-400">
              Falls back to the other provider on quota/rate-limit errors.
            </span>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!canRun}
              className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-lg disabled:opacity-40 ${
                canRun
                  ? "bg-yellow-500 text-[#0a1a3a] hover:bg-yellow-600"
                  : "bg-blue-900/40 text-blue-500"
              }`}
            >
              {status === "running" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running agent…
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Autonomous Researcher
                </>
              )}
            </button>
            {status === "running" && (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 text-xs bg-red-900/40 text-red-300 px-3 py-1.5 rounded hover:bg-red-900/60"
              >
                <Square size={14} /> Stop
              </button>
            )}
          </div>
        </form>
      </div>

      {output && (
        <>
          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Research Output</h3>
              </div>
              <div className="text-xs text-blue-400">
                {Math.round((output.createdAt && Date.now() - output.createdAt) / 1000)}s ago
              </div>
            </div>

            <div className="space-y-3">
              {output.stages.map((stage) => (
                <details
                  key={stage.name}
                  className="border border-blue-900/50 rounded-lg overflow-hidden"
                  open={output.stages.indexOf(stage) === 0}
                >
                  <summary className="flex items-center justify-between bg-blue-950/50 px-4 py-3 cursor-pointer list-none hover:bg-blue-900/40">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${
                        stage.name.includes("Manuscript")
                          ? "text-green-300"
                          : stage.name.includes("Critique")
                          ? "text-purple-300"
                          : "text-blue-300"
                      }`}>
                        {stage.name}
                      </span>
                      <span className="text-[10px] text-blue-500 bg-blue-900/40 px-2 py-0.5 rounded">
                        {(stage.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <ChevronDown size={14} className="text-blue-500 transition-transform" />
                  </summary>
                  <div className="p-4 bg-blue-950/30 border-t border-blue-900/40">
                    <div className="whitespace-pre-wrap break-words text-sm text-blue-200 leading-relaxed">
                      {stage.content}
                    </div>
                    <button
                      onClick={() => handleCopy(stage.content)}
                      className="mt-3 text-xs text-blue-400 hover:text-white flex items-center gap-1"
                    >
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                </details>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-blue-900/40 flex items-center gap-3">
              <button
                onClick={() => handleCopy(output.manuscript)}
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-white"
              >
                <Copy size={14} /> Copy full manuscript
              </button>
              <a
                href={`data:text/markdown;charset=utf-8,${encodeURIComponent(output.manuscript)}`}
                download="ai-researcher-manuscript.md"
                className="flex items-center gap-2 text-xs bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-900/60"
              >
                <Mail size={14} /> Download manuscript
              </a>
            </div>
          </div>
        </>
      )}

      {!apiKey && (
        <div className="bg-blue-950/40 border border-blue-900 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            No Gemini API key configured. Open <span className="font-semibold text-yellow-300">Settings</span> and add your Gemini key (primary) or Groq key (fallback) to run the autonomous researcher.
          </p>
        </div>
      )}
    </div>
  );
}
