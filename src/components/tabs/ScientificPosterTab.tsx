"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Sparkles, Paperclip, X, Download, FileText, ChevronDown, Loader2, Brain, FileCheck2, Printer, LayoutTemplate } from "lucide-react";
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

interface PosterSection {
  title: string;
  content: string;
  column?: "left" | "center" | "right";
}

const DEEP_REASONING_SYSTEM_PROMPT = `You are PosterForge-AI, an expert scientific poster design assistant inspired by https://github.com/SuperBruceJia/Poster_Template.

You help researchers create visually compelling, publication-ready scientific posters from uploaded documents by:
1. Parsing uploaded documents (Word, PDF, text)
2. Performing deep reasoning to extract key research elements
3. Structuring content into standard poster sections
4. Producing downloadable Word documents with academic poster formatting

Always reason step-by-step, make your chain of thought explicit, and if a detail is uncertain, flag it "[AUTHOR TO SPECIFY]".

## Long CoT Reasoning Protocol:
1. Context Analysis — Summarize what the uploaded documents actually say
2. Gap Identification — What's missing or underdeveloped in existing materials?
3. Design Alignment — How does the proposed poster address the gaps?
4. Feasibility Check — What data/resources are assumed vs. confirmed?
5. Bias Audit — Identify key biases and how you're mitigating them
6. Poster Foundation — Define structure, sections, visual hierarchy, and narrative flow
7. Output Generation — Deliver the structured poster content`;

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

Now perform your Long CoT reasoning and respond with a well-structured, citation-aware answer. If the user asks for the poster, generate a complete scientific poster layout.`;
};

export default function ScientificPosterTab() {
  const { state } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 Welcome to **Scientific Poster** — powered by **Poster_Template** methodology from [SuperBruceJia/Poster_Template](https://github.com/SuperBruceJia/Poster_Template).

I can help you:
• Upload Word, PDF, or text documents for analysis
• Toggle **deep reasoning mode** for Long CoT analysis
• Generate a complete scientific poster layout
• Download your poster as a Word document

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
  const [generatedPoster, setGeneratedPoster] = useState<PosterSection[] | null>(null);
  const [posterStatus, setPosterStatus] = useState<"idle" | "generating" | "ready">("idle");
  const [showDownload, setShowDownload] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

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
          content: `📄 Uploaded: **${parsed.name}** (${(file.size / 1024).toFixed(1)} KB, ${file.type})\n\nI've parsed the document. You can now ask me to analyze it, improve it, or generate a poster based on its content.`,
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
          responseText = generatePosterResponse(currentInput, documentContent);
        }
      } else {
        responseText = generatePosterResponse(currentInput, documentContent);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (currentInput.toLowerCase().includes("generate poster") || currentInput.toLowerCase().includes("create poster") || currentInput.toLowerCase().includes("design poster")) {
        const poster = parsePosterMarkdown(generateDefaultPoster(documentContent));
        setGeneratedPoster(poster);
        setPosterStatus("ready");
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

  const handleGeneratePoster = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setPosterStatus("generating");

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
          `${DEEP_REASONING_SYSTEM_PROMPT}\n\n${documentContent ? `## UPLOADED DOCUMENT:\n${documentContent.substring(0, 20000)}\n\n` : ""}TASK: Generate a complete scientific poster layout in markdown format based on the uploaded document or user description. The poster should include: Title, Authors, Introduction, Methods, Results, Conclusion, and References. Structure it as a conference-style academic poster.${!documentContent ? "\n\nNote: No document uploaded. Generate a template poster structure." : ""}`,
          genSearchOptions
        );
      } else if (state.groqApiKey) {
        responseText = await callGroq(
          state.groqApiKey,
          `${DEEP_REASONING_SYSTEM_PROMPT}\n\n${documentContent ? `Uploaded document:\n${documentContent.substring(0, 20000)}\n\n` : ""}Generate a complete scientific poster layout in markdown format.${!documentContent ? " Use a generic academic poster template." : ""}`,
          genSearchOptions
        );
      } else {
        responseText = generateDefaultPoster(documentContent);
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      const poster = parsePosterMarkdown(cleaned);
      setGeneratedPoster(poster);
      setPosterStatus("ready");
      setShowDownload(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `poster-${Date.now()}`,
          role: "assistant",
          content: `✅ **Poster Generated Successfully**\n\nI've generated a complete scientific poster layout with standard sections:\n• Title & Authors\n• Introduction\n• Methods\n• Results\n• Conclusion\n• References\n\nYou can preview the poster below or download it as a Word document.`,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error("Poster generation failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Poster generation failed: ${err.message || "Please try again."}`,
          timestamp: new Date(),
        },
      ]);
      setPosterStatus("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadWord = () => {
    if (!generatedPoster) return;

    const posterText = generatedPoster.map((section) => `## ${section.title}\n${section.content}`).join("\n\n");
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Scientific Poster</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 900px; margin: 0 auto; padding: 40px; }
            h1 { font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 8px; }
            h2 { font-size: 14pt; font-weight: bold; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; color: #1e3a8a; }
            h3 { font-size: 12pt; font-weight: bold; margin-top: 16px; }
            p { margin: 8px 0; text-align: justify; }
            table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11pt; }
            th { background: #1e3a8a; color: #fff; padding: 8px; border: 1px solid #000; text-align: left; }
            td { padding: 8px; border: 1px solid #000; vertical-align: top; }
            ul { margin: 8px 0; padding-left: 24px; }
            li { margin: 4px 0; }
            .meta { text-align: center; margin-bottom: 32px; font-size: 11pt; color: #444; }
            .poster-section { margin-bottom: 20px; page-break-inside: avoid; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="meta">
            <p>Generated by Resilient Research App — Scientific Poster Generator</p>
            <p>Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            ${documentContent ? `<p>Source: ${uploadedFileName}</p>` : ""}
          </div>
          ${formatPosterToWord(generatedPoster)}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/msword;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scientific-poster-${new Date().toISOString().split("T")[0]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPoster = () => {
    if (!posterRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const posterContent = posterRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Scientific Poster</title>
          <style>
            @page { size: 48in 36in; margin: 0.5in; }
            body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 20px; background: #fff; }
            .poster-container { width: 100%; max-width: 100%; }
            .poster-header { text-align: center; border-bottom: 4px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
            .poster-title { font-size: 28pt; font-weight: bold; color: #0a1a3a; margin-bottom: 10px; }
            .poster-authors { font-size: 14pt; color: #333; margin-bottom: 5px; }
            .poster-affiliation { font-size: 12pt; color: #666; }
            .poster-columns { display: flex; gap: 20px; }
            .poster-column { flex: 1; }
            .poster-section { margin-bottom: 20px; }
            .poster-section-title { font-size: 16pt; font-weight: bold; color: #fff; background: #1e3a8a; padding: 8px 12px; margin-bottom: 10px; }
            .poster-section-content { font-size: 11pt; line-height: 1.5; color: #000; }
            .poster-footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #1e3a8a; font-size: 10pt; color: #666; }
          </style>
        </head>
        <body>
          <div class="poster-container">${posterContent}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="space-y-0">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg shadow flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-900/50 bg-[#0a1530]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-yellow-400" />
            <h2 className="text-base font-bold text-white">Scientific Poster</h2>
            <span className="text-[10px] bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full">Poster_Template-style</span>
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
                  style={{ top: 2, left: isDeepReasoning ? 19 : 2, width: 14, height: 14 }}
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
              onClick={handleGeneratePoster}
              disabled={isLoading}
              className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <FileCheck2 size={12} />
              Generate Poster
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

        {posterStatus === "generating" && (
          <div className="px-5 py-3 bg-yellow-950/30 border-b border-yellow-900/30 flex items-center gap-3">
            <Loader2 size={16} className="text-yellow-400 animate-spin" />
            <p className="text-xs text-yellow-200">Generating scientific poster with deep reasoning...</p>
          </div>
        )}

        {showDownload && posterStatus === "ready" && (
          <div className="px-5 py-2 bg-green-950/30 border-b border-green-900/30 flex items-center justify-between">
            <p className="text-xs text-green-200">✅ Poster ready for download</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintPoster}
                className="text-xs bg-blue-700 text-white px-3 py-1 rounded hover:bg-blue-600 flex items-center gap-1"
              >
                <Printer size={12} />
                Print / Save PDF
              </button>
              <button
                onClick={handleDownloadWord}
                className="text-xs bg-green-700 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
              >
                <Download size={12} />
                Download Word (.doc)
              </button>
            </div>
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
                    {posterStatus === "generating" ? "Deep reasoning & poster generation..." : "Thinking..."}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {generatedPoster && posterStatus === "ready" && (
          <div className="px-4 py-3 border-t border-blue-900/50 bg-[#0a1530]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutTemplate size={14} className="text-yellow-400" />
                <span className="text-xs text-blue-300">Poster preview ready — use Print / Save PDF or Download Word</span>
              </div>
            </div>
          </div>
        )}

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
                      ? "Ask about your document, or say 'generate poster'..."
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

      {generatedPoster && posterStatus === "ready" && (
        <div className="mt-6 bg-[#0d1b3e] border border-blue-900/50 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <LayoutTemplate size={14} className="text-yellow-400" />
              Poster Preview
            </h3>
            <span className="text-[10px] text-blue-400">Conference-style layout inspired by Poster_Template</span>
          </div>
          <div
            ref={posterRef}
            className="bg-white text-black p-8 rounded shadow"
            style={{ minHeight: "600px" }}
          >
            <div className="poster-header">
              <div className="poster-title">{generatedPoster.find((s) => s.title.toLowerCase().includes("title"))?.content || "Scientific Poster"}</div>
              <div className="poster-authors">{generatedPoster.find((s) => s.title.toLowerCase().includes("author"))?.content || "Authors"}</div>
              <div className="poster-affiliation">{generatedPoster.find((s) => s.title.toLowerCase().includes("affiliation"))?.content || ""}</div>
            </div>
            <div className="poster-columns">
              <div className="poster-column">
                {generatedPoster
                  .filter((s) => ["left"].includes(s.column || "center"))
                  .map((section, idx) => (
                    <div key={idx} className="poster-section">
                      <div className="poster-section-title">{section.title}</div>
                      <div className="poster-section-content">{section.content}</div>
                    </div>
                  ))}
              </div>
              <div className="poster-column">
                {generatedPoster
                  .filter((s) => ["center", undefined].includes(s.column || "center"))
                  .map((section, idx) => (
                    <div key={idx} className="poster-section">
                      <div className="poster-section-title">{section.title}</div>
                      <div className="poster-section-content">{section.content}</div>
                    </div>
                  ))}
              </div>
              <div className="poster-column">
                {generatedPoster
                  .filter((s) => ["right"].includes(s.column || "center"))
                  .map((section, idx) => (
                    <div key={idx} className="poster-section">
                      <div className="poster-section-title">{section.title}</div>
                      <div className="poster-section-content">{section.content}</div>
                    </div>
                  ))}
              </div>
            </div>
            <div className="poster-footer">
              <strong>References</strong>
              <div className="poster-section-content">
                {generatedPoster.find((s) => s.title.toLowerCase().includes("reference"))?.content || "References to be added based on cited literature."}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generatePosterResponse(userMessage: string, documentContent: string): string {
  const q = userMessage.toLowerCase();

  if (q.includes("poster") || q.includes("generate") || q.includes("create") || q.includes("design")) {
    return `I'll help you create a scientific poster. Based on the ${documentContent ? "uploaded document" : "your description"}, I'll follow a structured academic poster design methodology inspired by Poster_Template.

**Deep Reasoning Chain:**

**Phase 1 — Context Analysis:**
${documentContent ? `I've analyzed your uploaded document. Key elements identified: study context, population, research objectives, and methodology.` : "No document uploaded. I'll use a template structure."}

**Phase 2 — Gap Identification:**
Common gaps in scientific posters include: (1) unclear visual hierarchy, (2) missing key findings, (3) underdeveloped discussion, (4) insufficient references.

**Phase 3 — Design Alignment:**
The proposed poster will address gaps through clear section hierarchy, prominent key findings, thorough discussion, and complete references.

**Phase 4 — Recommended Next Step:**
Click the **Generate Poster** button above to create the full poster layout. You can then download it as a Word document or print as PDF.`;
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

Would you like me to proceed with generating the full poster?`;
  }

  return `I'm your Scientific Poster Assistant. ${documentContent ? `I've loaded your document (${(documentContent.length / 1024).toFixed(1)} KB).` : "Upload a document for analysis, or describe your research idea directly."}

You can:
• Say **"generate poster"** to create a full scientific poster layout
• Toggle **Deep Reasoning** mode for Long CoT analysis
• Upload a document for context-aware poster generation
• Ask specific questions about structure or design choices

What would you like to do?`;
}

function generateDefaultPoster(documentContent: string): string {
  const contextNote = documentContent ? `\n\nBased on the uploaded document content:\n${documentContent.substring(0, 5000)}` : "\n\n(No document uploaded — using generic scientific poster template)";

  return `# Scientific Poster

## Title
[Your Research Title Here]

## Authors
[Author 1], [Author 2], [Author 3]

## Affiliation
[Department, Institution, City, Country]

## Introduction
This poster presents a structured scientific investigation designed to address key research questions in the field.${contextNote}

## Methods
The study design, population, data collection procedures, and statistical analysis plan are described here.

## Results
The findings of the study are presented, including descriptive statistics and inferential analyses.

## Conclusion
The key findings and their implications for the field are summarized here.

## References
[References to be added based on cited literature]

---
*Poster generated by Resilient Research App — Scientific Poster using Poster_Template-style methodology.*${contextNote}`;
}

function parsePosterMarkdown(markdown: string): PosterSection[] {
  const sections: PosterSection[] = [];
  const lines = markdown.split("\n");
  let currentSection: PosterSection | null = null;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(2).trim(), content: "" };
    } else if (line.startsWith("## ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(3).trim(), content: "" };
    } else if (currentSection && line.trim()) {
      currentSection.content += (currentSection.content ? "\n" : "") + line.trim();
    }
  }

  if (currentSection) sections.push(currentSection);

  const columnMap: Record<string, PosterSection["column"]> = {
    "introduction": "left",
    "methods": "left",
    "results": "center",
    "discussion": "right",
    "conclusion": "right",
    "references": "right",
  };

  return sections.map((section) => {
    const key = section.title.toLowerCase();
    const mappedColumn = Object.keys(columnMap).find((k) => key.includes(k));
    return {
      ...section,
      column: mappedColumn ? columnMap[mappedColumn] : "center",
    };
  });
}

function formatPosterToWord(sections: PosterSection[]): string {
  return sections
    .map((section) => `
      <div class="poster-section">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.content)}</p>
      </div>
    `)
    .join("\n");
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
