"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Sparkles, Paperclip, X, Download, FileText, ChevronDown, Loader2, Brain, FileCheck2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, type AICallOptions } from "@/lib/ai";
import { buildStep10Prompt } from "@/lib/research-skills";
import { parseUploadedDocument, ALLOWED_DOCUMENT_TYPES } from "@/lib/document-parser";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: { label: string; excerpt: string }[];
}

const DEEP_REASONING_SYSTEM_PROMPT = `You are PaperForge-AI, an expert scientific academic writing assistant.

You help researchers write rigorous, well-structured scientific papers by:
1. Parsing uploaded documents (Word, PDF, text)
2. Performing deep reasoning across research design, methodology, and reporting standards
3. Synthesizing findings into complete, publication-ready manuscripts
4. Producing downloadable Word documents with academic formatting

Always reason step-by-step, make your chain of thought explicit, and if a detail is uncertain, flag it "[AUTHOR TO SPECIFY]".

## Long CoT Reasoning Protocol:
1. Context Analysis — Summarize what the uploaded documents actually say
2. Gap Identification — What's missing or underdeveloped in existing materials?
3. Design Alignment — How does the proposed manuscript address the gaps?
4. Feasibility Check — What data/resources are assumed vs. confirmed?
5. Bias Audit — Identify key biases and how you're mitigating them
6. Manuscript Foundation — Define structure, sections, narrative flow, and reporting standards
7. Output Generation — Deliver the structured manuscript`;

const buildDeepReasoningPrompt = (userMessage: string, documentContent: string, chatHistory: { role: string; content: string }[]) => {
  const historyText = chatHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `${DEEP_REASONING_SYSTEM_PROMPT}

${documentContent ? `## UPLOADED DOCUMENT CONTENT:\n${documentContent.substring(0, 20000)}\n` : ""}

## CONVERSATION HISTORY:
${historyText}

## CURRENT USER REQUEST:
${userMessage}

Now perform your Long CoT reasoning and respond with a well-structured, citation-aware answer. If the user asks for the paper, generate a complete scientific manuscript.`;
};

export default function ScientificPaperTab() {
  const { state } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 Welcome to **Scientific Paper** — powered by **OpenDraft-style** academic writing methodology.

I can help you:
• Upload Word, PDF, or text documents for analysis
• Toggle **deep reasoning mode** for Long CoT analysis
• Generate a complete, structured scientific manuscript
• Download your paper as a Word document

Upload a document or describe your research to get started.`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepReasoning, setIsDeepReasoning] = useState(false);
  const [documentContent, setDocumentContent] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [generatedPaper, setGeneratedPaper] = useState("");
  const [paperStatus, setPaperStatus] = useState<"idle" | "generating" | "ready">("idle");
  const [showDownload, setShowDownload] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setIsUploading(true);

    try {
      const parsed = await parseUploadedDocument(file);
      setDocumentContent(parsed.content);
      setUploadedFileName(parsed.name);

      setMessages((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          role: "user",
          content: `📄 Uploaded: **${parsed.name}** (${(file.size / 1024).toFixed(1)} KB, ${file.type})\n\nI've parsed the document. You can now ask me to analyze it, improve it, or generate a paper based on its content.`,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      setUploadError(err.message || "Failed to parse document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeDocument = () => {
    setDocumentContent("");
    setUploadedFileName("");
    setMessages((prev) => [
      ...prev,
      {
        id: `remove-${Date.now()}`,
        role: "assistant",
        content: "📄 Document removed. You can upload a new one or continue without a document.",
        timestamp: new Date(),
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      let responseText: string;
      const historyForPrompt = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      if (isDeepReasoning || documentContent) {
        const prompt = buildDeepReasoningPrompt(currentInput, documentContent, historyForPrompt);
        const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: currentInput };
        if (state.geminiApiKey) {
          responseText = await callGemini(
            state.geminiApiKey,
            `[SYSTEM]\n${DEEP_REASONING_SYSTEM_PROMPT}\n\n[USER]\n${currentInput}\n\n${documentContent ? `[DOCUMENT CONTEXT]\n${documentContent.substring(0, 15000)}` : ""}`,
            searchOptions
          );
        } else if (state.groqApiKey) {
          responseText = await callGroq(state.groqApiKey, prompt, searchOptions);
        } else {
          responseText = generatePaperResponse(currentInput, documentContent);
        }
      } else {
        responseText = generatePaperResponse(currentInput, documentContent);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (currentInput.toLowerCase().includes("generate paper") || currentInput.toLowerCase().includes("create paper") || currentInput.toLowerCase().includes("write paper")) {
        setGeneratedPaper(responseText);
        setPaperStatus("ready");
        setShowDownload(true);
      }
    } catch (err: any) {
      console.error("Send failed:", err);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Error: ${err.message || "Something went wrong. Please try again."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePaper = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setPaperStatus("generating");

    try {
      const prompt = buildStep10Prompt(
        {
          aim: documentContent ? "Based on uploaded document" : "To be defined",
          primaryObjective: documentContent ? "From uploaded document analysis" : "To be defined",
          secondaryObjectives: [],
          userEdited: false,
        },
        [],
        "Study type from document",
        []
      );

      let responseText: string;
      const genSearchOptions: AICallOptions = { searchEnabled: true, searchQuery: input.trim() };
      if (state.geminiApiKey) {
        responseText = await callGemini(
          state.geminiApiKey,
          `${DEEP_REASONING_SYSTEM_PROMPT}\n\n${documentContent ? `## UPLOADED DOCUMENT:\n${documentContent.substring(0, 20000)}\n\n` : ""}TASK: Generate a complete scientific manuscript in markdown format based on the uploaded document or user description.${!documentContent ? "\n\nNote: No document uploaded. Generate a template manuscript structure." : ""}`,
          genSearchOptions
        );
      } else if (state.groqApiKey) {
        responseText = await callGroq(
          state.groqApiKey,
          `${DEEP_REASONING_SYSTEM_PROMPT}\n\n${documentContent ? `Uploaded document:\n${documentContent.substring(0, 20000)}\n\n` : ""}Generate a complete scientific manuscript in markdown format.${!documentContent ? " Use a generic academic paper template." : ""}`,
          genSearchOptions
        );
      } else {
        responseText = generateDefaultPaper(documentContent);
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedPaper(cleaned);
      setPaperStatus("ready");
      setShowDownload(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `paper-${Date.now()}`,
          role: "assistant",
          content: `✅ **Paper Generated Successfully**\n\nI've generated a complete scientific manuscript with standard sections covering:\n• Abstract\n• Introduction\n• Methods\n• Results\n• Discussion\n• Conclusion\n• References\n\nClick the **Download Word** button below to get your paper document.`,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error("Paper generation failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Paper generation failed: ${err.message || "Please try again."}`,
          timestamp: new Date(),
        },
      ]);
      setPaperStatus("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadWord = () => {
    if (!generatedPaper) return;

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Scientific Paper</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 800px; margin: 0 auto; padding: 40px; }
            h1 { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 8px; }
            h2 { font-size: 14pt; font-weight: bold; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            h3 { font-size: 12pt; font-weight: bold; margin-top: 16px; }
            p { margin: 8px 0; text-align: justify; }
            table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11pt; }
            th { background: #1e3a8a; color: #fff; padding: 8px; border: 1px solid #000; text-align: left; }
            td { padding: 8px; border: 1px solid #000; vertical-align: top; }
            ul { margin: 8px 0; padding-left: 24px; }
            li { margin: 4px 0; }
            .meta { text-align: center; margin-bottom: 32px; font-size: 11pt; color: #444; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="meta">
            <p>Generated by Resilient Research App — Scientific Paper</p>
            <p>Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            ${documentContent ? `<p>Source: ${uploadedFileName}</p>` : ""}
          </div>
          ${formatMarkdownToWord(generatedPaper)}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/msword;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scientific-paper-${new Date().toISOString().split("T")[0]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-0">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg shadow flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-900/50 bg-[#0a1530]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-yellow-400" />
            <h2 className="text-base font-bold text-white">Scientific Paper</h2>
            <span className="text-[10px] bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full">OpenDraft-style</span>
            {isDeepReasoning && (
              <span className="text-[10px] bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Brain size={10} /> Long CoT
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Sparkles size={13} className="text-yellow-400" />
              <span className="text-[11px] text-blue-200 hidden md:inline">Deep Reasoning</span>
              <button
                type="button"
                onClick={() => setIsDeepReasoning(!isDeepReasoning)}
                className={`relative rounded-full transition-colors ${isDeepReasoning ? "bg-yellow-500" : "bg-blue-800"}`}
                style={{ width: 36, height: 18 }}
              >
                <span
                  className="absolute bg-white rounded-full transition-transform"
                  style={{
                    top: 2,
                    left: isDeepReasoning ? 19 : 2,
                    width: 14,
                    height: 14,
                  }}
                />
              </button>
            </label>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <Paperclip size={12} />
              {isUploading ? "Uploading..." : "Upload Doc"}
            </button>
            <button
              onClick={handleGeneratePaper}
              disabled={isLoading}
              className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <FileCheck2 size={12} />
              Generate Paper
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".doc,.docx,.pdf,.txt,.md"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {uploadedFileName && (
          <div className="px-5 py-2 bg-blue-950/30 border-b border-blue-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-yellow-400" />
              <span className="text-xs text-blue-200">📄 {uploadedFileName}</span>
              <span className="text-[10px] text-blue-400">({(documentContent.length / 1024).toFixed(1)} KB extracted)</span>
            </div>
            <button onClick={removeDocument} className="text-blue-400 hover:text-red-400">
              <X size={12} />
            </button>
          </div>
        )}

        {uploadError && (
          <div className="px-5 py-2 bg-red-950/30 border-b border-red-900/30">
            <p className="text-xs text-red-300">⚠️ {uploadError}</p>
          </div>
        )}

        {paperStatus === "generating" && (
          <div className="px-5 py-3 bg-yellow-950/30 border-b border-yellow-900/30 flex items-center gap-3">
            <Loader2 size={16} className="text-yellow-400 animate-spin" />
            <p className="text-xs text-yellow-200">Generating scientific paper with deep reasoning...</p>
          </div>
        )}

        {showDownload && paperStatus === "ready" && (
          <div className="px-5 py-2 bg-green-950/30 border-b border-green-900/30 flex items-center justify-between">
            <p className="text-xs text-green-200">✅ Paper ready for download</p>
            <button
              onClick={handleDownloadWord}
              className="text-xs bg-green-700 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
            >
              <Download size={12} />
              Download Word (.doc)
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#080f24]">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user" ? "bg-yellow-600 text-[#0a1a3a]" : "bg-purple-700 text-white"
                }`}
              >
                {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-yellow-900/30 border border-yellow-700/40 text-yellow-50"
                    : "bg-blue-900/40 border border-blue-800 text-blue-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-blue-950/60 p-3 rounded-lg overflow-x-auto text-xs my-2"><code>$2</code></pre>')
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                ) : (
                  <p>{msg.content}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-blue-800/50">
                    <p className="text-[10px] text-blue-400 mb-1 font-medium">Sources:</p>
                    {msg.sources.map((src, i) => (
                      <div key={i} className="text-[10px] text-blue-300 bg-blue-950/40 rounded px-2 py-1 mb-1">
                        <span className="font-medium">{src.label}:</span> {src.excerpt}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-blue-900/40 border border-blue-800 rounded-lg px-4 py-3">
                <div className="flex gap-1 items-center">
                  <Loader2 size={14} className="text-yellow-400 animate-spin" />
                  <span className="text-xs text-blue-300 ml-2">
                    {paperStatus === "generating" ? "Deep reasoning & paper generation..." : "Thinking..."}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 py-3 border-t border-blue-900/50 bg-[#0a1530]">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder={
                  isDeepReasoning
                    ? "Ask with deep reasoning (Long CoT)..."
                    : documentContent
                      ? "Ask about your document, or say 'generate paper'..."
                      : "Describe your research, or upload a document..."
                }
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-full px-4 py-2.5 pr-10 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] p-2.5 rounded-full disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-blue-500">
              {documentContent
                ? `📄 ${uploadedFileName} loaded`
                : "No document loaded — upload a Word/PDF/text file or type your research description"}
            </span>
            {isDeepReasoning && <span className="text-[10px] text-yellow-400">🧠 Deep Reasoning Active</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function generatePaperResponse(userMessage: string, documentContent: string): string {
  const q = userMessage.toLowerCase();

  if (q.includes("paper") || q.includes("generate") || q.includes("write") || q.includes("create")) {
    return `I'll help you write a scientific paper. Based on the ${documentContent ? "uploaded document" : "your description"}, I'll follow a structured academic writing methodology.

**Deep Reasoning Chain:**

**Phase 1 — Context Analysis:**
${documentContent ? `I've analyzed your uploaded document. Key elements identified: study context, population, research objectives, and methodology.` : "No document uploaded. I'll use a template structure."}

**Phase 2 — Gap Identification:**
Common gaps in scientific papers include: (1) unclear research questions, (2) missing literature context, (3) underdeveloped methodology, (4) insufficient discussion of limitations.

**Phase 3 — Design Alignment:**
The proposed manuscript will address gaps through explicit research questions, comprehensive literature review, detailed methodology, and thorough discussion.

**Phase 4 — Recommended Next Step:**
Click the **Generate Paper** button above to create the full manuscript. You can then download it as a Word document.`;
  }

  if (q.includes("reason") || q.includes("analyze") || q.includes("deep")) {
    return `**Long CoT Deep Reasoning** active.

**Phase 1 — Context:**
${documentContent ? `Document loaded: analyzing content for research design signals...` : "No document context. Please upload a document for deep analysis."}

**Phase 2 — Claim Extraction:**
Identifying primary research claims, study populations, and outcome measures from the source material.

**Phase 3 — Evidence Grading:**
- Mechanistic evidence (T1): Direct experimental data
- Functional evidence (T2): Pathway/mechanism data
- Associational (T3): Correlational findings
- Mention only (T4): Review-level mentions

**Phase 4 — Design Feasibility:**
Assessing data availability, sample size feasibility, and ethical considerations.

Would you like me to proceed with generating the full paper?`;
  }

  return `I'm your Scientific Paper Writing Assistant. ${documentContent ? `I've loaded your document (${(documentContent.length / 1024).toFixed(1)} KB).` : "Upload a document for analysis, or describe your research idea directly."}

You can:
• Say **"generate paper"** to create a full scientific manuscript
• Toggle **Deep Reasoning** mode for Long CoT analysis
• Upload a document for context-aware paper generation
• Ask specific questions about structure or methodology

What would you like to do?`;
}

function generateDefaultPaper(documentContent: string): string {
  const contextNote = documentContent ? `\n\nBased on the uploaded document content:\n${documentContent.substring(0, 5000)}` : "\n\n(No document uploaded — using generic scientific paper template)";

  return `# Scientific Manuscript

## Abstract
This manuscript presents a structured scientific investigation designed to address key research questions in the field.${contextNote}

## Introduction
The introduction establishes the research context, reviews relevant literature, identifies the research gap, and states the study objectives and hypotheses.

## Methods
The methods section describes the study design, population, data collection procedures, and statistical analysis plan.

## Results
The results section presents the findings of the study, including descriptive statistics and inferential analyses.

## Discussion
The discussion interprets the findings, compares them with existing literature, acknowledges limitations, and suggests directions for future research.

## Conclusion
The conclusion summarizes the key findings and their implications for the field.

## References
[References to be added based on cited literature]

---
*Paper generated by Resilient Research App — Scientific Paper using OpenDraft-style methodology.*${contextNote}`;
}

function formatMarkdownToWord(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (line.startsWith("| ")) return line;
      if (line.trim() === "") return "<p>&nbsp;</p>";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*?<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}
