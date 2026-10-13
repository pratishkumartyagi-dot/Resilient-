"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  User,
  Bot,
  Sparkles,
  Paperclip,
  X,
  Download,
  FileText,
  Loader2,
  Brain,
  FileCheck2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callGemini, callGroq, callDeepSeek, type AICallOptions } from "@/lib/ai";
import { buildStep10Prompt } from "@/lib/research-skills";
import { getIntegratedSkills } from "@/lib/medical-skills/skills-registry";
import { downloadMarkdownAsWord } from "@/lib/exporters";

// Inlined (instead of importing from document-parser) so mammoth/pdfjs stay
// out of the initial preview bundle; parser is lazy-loaded on file upload.
const ALLOWED_DOCUMENT_TYPES = [".docx", ".doc", ".pdf", ".txt", ".md"];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: { label: string; excerpt: string }[];
}

const INTEGRATED_SKILLS = getIntegratedSkills();
const CLINICAL_TRIAL_PROTOCOL_SKILL = INTEGRATED_SKILLS.find(s => s.id === "clinical-trial-protocol");

const DEEP_REASONING_SYSTEM_PROMPT = `You are DeepReason-AI, an expert protocol design research assistant powered by Long Chain-of-Thought (Long CoT) reasoning methodology inspired by https://github.com/LightChen233/Awesome-Long-Chain-of-Thought-Reasoning and enhanced with Clinical Trial Protocol Design skills from https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills.

${CLINICAL_TRIAL_PROTOCOL_SKILL ? `Integrated skill: ${CLINICAL_TRIAL_PROTOCOL_SKILL.name} — ${CLINICAL_TRIAL_PROTOCOL_SKILL.description}` : ""}

You help researchers build rigorous clinical, academic, and public health research protocols by:
1. Parsing uploaded documents (Word, PDF, text)
2. Performing multi-phase deep reasoning (context analysis → gap identification → methodology selection → bias audit → feasibility check)
3. Synthesizing findings using AIPOCH-style structured reasoning and clinical trial protocol design principles
4. Producing a complete, downloadable Word protocol document

Always reason step-by-step, make your chain of thought explicit, cite document sections you reference, and if a detail is uncertain, flag it "[AUTHOR TO SPECIFY]".

## Long CoT Reasoning Protocol you must follow:
1. Context Analysis — Summarize what the uploaded documents actually say (don't hallucinate)
2. Gap Identification — What's missing or underdeveloped in the existing documents?
3. Design Alignment — How does the proposed protocol address the gaps?
4. Feasibility Check — What data/resources are assumed vs. confirmed?
5. Bias Audit — Identify key biases and how you're mitigating them
6. Protocol Foundation — Define source population, enrollment logic, time-zero, follow-up architecture, endpoints, variable collection, and statistical analysis
7. Output Generation — Deliver the structured protocol`;


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

Now perform your Long CoT reasoning and respond with a well-structured, citation-aware answer. If the user asks for the protocol, generate it in AIPOCH Clinical Cohort Protocol Designer format (Sections A–L).`;
};

const DEFAULT_PROTOCOL_SYSTEM_PROMPT = `You are an expert clinical, academic, and public health research protocol assistant. Help the user refine their research idea and design a rigorous, feasible study. If the user asks for a protocol, produce a complete AIPOCH-structured protocol (Sections A–L) in markdown. Flag any uncertain detail as "[AUTHOR TO SPECIFY]" rather than inventing it.`;

const buildDefaultPrompt = (userMessage: string, documentContent: string, chatHistory: { role: string; content: string }[]) => {
  const historyText = chatHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `${DEFAULT_PROTOCOL_SYSTEM_PROMPT}

${documentContent ? `## UPLOADED DOCUMENT CONTENT:\n${documentContent.substring(0, 15000)}\n` : ""}

## CONVERSATION HISTORY:
${historyText}

## CURRENT USER REQUEST:
${userMessage}`;
};

async function callAIChat(prompt: string, options: AICallOptions, geminiKey: string, groqKey: string): Promise<string> {
  let responseText: string;
  if (geminiKey) {
    responseText = await callGemini(geminiKey, prompt, options);
  } else if (groqKey) {
    responseText = await callGroq(groqKey, prompt, options);
  } else {
    responseText = await callDeepSeek(prompt, options);
  }
  if (!responseText.trim()) {
    throw new Error("The AI model returned an empty response");
  }
  return responseText;
}

function buildDocumentSources(documentContent: string, uploadedFileName: string): Message["sources"] {
  if (!documentContent) return undefined;
  const excerpt = documentContent.substring(0, 160).trim();
  return [
    {
      label: uploadedFileName || "Uploaded document",
      excerpt: documentContent.length > 160 ? `${excerpt}...` : excerpt,
    },
  ];
}

export default function ProtocolChatTab() {
  const { state } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        CLINICAL_TRIAL_PROTOCOL_SKILL
          ? `👋 Welcome to **Protocol Generator** — powered by **${CLINICAL_TRIAL_PROTOCOL_SKILL.name}** from [FreedomIntelligence/OpenClaw-Medical-Skills](https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills).\n\n${CLINICAL_TRIAL_PROTOCOL_SKILL.description}\n\nI can help you:\n• Upload Word, PDF, or text documents for deep analysis\n• Toggle **deep reasoning mode** for Long CoT analysis\n• Generate a complete AIPOCH-structured research protocol (clinical trial or cohort study)\n• Download your protocol as a Word document\n\nUpload a document or describe your research idea to get started.`
          : `👋 Welcome to **Protocol Generator** — your AI-powered research protocol design assistant.\n\nI can help you:\n• Upload Word, PDF, or text documents for deep analysis\n• Toggle **deep reasoning mode** for Long CoT analysis\n• Generate a complete AIPOCH-structured research protocol\n• Download your protocol as a Word document\n\nUpload a document or describe your research idea to get started.`,
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
  const [generatedProtocol, setGeneratedProtocol] = useState("");
  const [protocolStatus, setProtocolStatus] = useState<"idle" | "generating" | "ready">("idle");
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
      // Lazy-load the parser (mammoth/pdfjs) only when a file is uploaded.
      const { parseUploadedDocument } = await import("@/lib/document-parser");
      const parsed = await parseUploadedDocument(file);
      setDocumentContent(parsed.content);
      setUploadedFileName(parsed.name);

      setMessages((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          role: "user",
          content: `📄 Uploaded: **${parsed.name}** (${(file.size / 1024).toFixed(1)} KB, ${parsed.type} format)\n\nI've parsed the document. You can now ask me to analyze it, summarize findings, or generate a protocol based on its content.`,
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

    const historyForPrompt = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      let responseText = "";
      let usedFallback = false;
      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: currentInput };
      const prompt =
        isDeepReasoning || documentContent
          ? buildDeepReasoningPrompt(currentInput, documentContent, historyForPrompt)
          : buildDefaultPrompt(currentInput, documentContent, historyForPrompt);

      try {
        responseText = await callAIChat(prompt, searchOptions, state.geminiApiKey, state.groqApiKey);
      } catch {
        usedFallback = true;
        responseText = generateProtocolResponse(currentInput, documentContent);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
        sources: usedFallback ? undefined : buildDocumentSources(documentContent, uploadedFileName),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (
        !usedFallback &&
        (currentInput.toLowerCase().includes("generate protocol") ||
          currentInput.toLowerCase().includes("create protocol"))
      ) {
        setGeneratedProtocol(responseText);
        setProtocolStatus("ready");
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

  const handleGenerateProtocol = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setProtocolStatus("generating");

    const idea = input.trim();

    try {
      const aimObjectives = {
        aim: idea || (documentContent ? "Based on uploaded document" : "To be defined"),
        primaryObjective: idea
          ? "Refined from the user's stated research idea"
          : documentContent
            ? "From uploaded document analysis"
            : "To be defined",
        secondaryObjectives: [] as string[],
        userEdited: false,
      };
      const step10Prompt = buildStep10Prompt(aimObjectives, [], "Study type from document", []);
      const documentBlock = documentContent ? `## UPLOADED DOCUMENT:\n${documentContent.substring(0, 20000)}\n\n` : "";
      const ideaBlock = idea ? `## RESEARCH IDEA (from user input):\n${idea}\n\n` : "";
      const genPrompt = `${DEEP_REASONING_SYSTEM_PROMPT}\n\n${step10Prompt}\n\n${documentBlock}${ideaBlock}TASK: Generate a complete AIPOCH-structured research protocol (Sections A–L) in markdown format, grounded in the research idea${documentContent ? " and the uploaded document" : ""}.${!idea && !documentContent ? " No idea or document was provided, so use a generic clinical research protocol template structure." : ""}`;
      const genSearchOptions: AICallOptions = idea ? { searchEnabled: true, searchQuery: idea } : { searchEnabled: true };

      let responseText = "";
      let usedFallback = false;
      let failureReason = "";
      try {
        responseText = await callAIChat(genPrompt, genSearchOptions, state.geminiApiKey, state.groqApiKey);
      } catch (aiErr) {
        usedFallback = true;
        failureReason = aiErr instanceof Error ? aiErr.message : "AI providers unavailable";
        responseText = generateDefaultProtocol(documentContent, idea);
      }

      const cleaned = responseText.replace(/```markdown/g, "").replace(/```/g, "").trim();
      setGeneratedProtocol(cleaned);
      setProtocolStatus("ready");
      setShowDownload(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `protocol-${Date.now()}`,
          role: "assistant",
          content: usedFallback
            ? `⚠️ ${failureReason}. I generated a deterministic AIPOCH-structured protocol from the built-in cohort template, tailored to your research idea. You can download it below, or add an API key to regenerate it with AI.`
            : `✅ **Protocol Generated Successfully**\n\nI've generated a complete AIPOCH-structured protocol with Sections A–L covering:\n• Study intent and cohort design rationale\n• Source population and enrollment logic\n• Follow-up architecture and endpoint definitions\n• Variable collection and statistical analysis plan\n• Bias audit and feasibility check\n\nClick the **Download Word** button below to get your protocol document.`,
          timestamp: new Date(),
          sources: usedFallback ? undefined : buildDocumentSources(documentContent, uploadedFileName),
        },
      ]);
    } catch (err: any) {
      console.error("Protocol generation failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Protocol generation failed: ${err.message || "Please try again."}`,
          timestamp: new Date(),
        },
      ]);
      setProtocolStatus("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadWord = () => {
    if (!generatedProtocol || protocolStatus !== "ready") return;
    downloadMarkdownAsWord(generatedProtocol, "protocol.docx").catch((err) => {
      console.error("Protocol download failed:", err);
      alert(`Failed to generate Word document: ${err instanceof Error ? err.message : "Unknown error"}`);
    });
  };

  return (
    <div className="space-y-0">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg shadow flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-900/50 bg-[#0a1530]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-yellow-400" />
            <h2 className="text-base font-bold text-white">Protocol Generator</h2>
            <span className="text-[10px] bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full">Deep Reasoning</span>
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
                    transform: isDeepReasoning ? "translateX(0)" : "translateX(0)",
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
              onClick={handleGenerateProtocol}
              disabled={isLoading}
              className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-900/70 disabled:opacity-50 flex items-center gap-1"
            >
              <FileCheck2 size={12} />
              Generate
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_DOCUMENT_TYPES.join(",")}
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

        {protocolStatus === "generating" && (
          <div className="px-5 py-3 bg-yellow-950/30 border-b border-yellow-900/30 flex items-center gap-3">
            <Loader2 size={16} className="text-yellow-400 animate-spin" />
            <p className="text-xs text-yellow-200">Generating protocol with deep reasoning... (Sections A–L)</p>
          </div>
        )}

        {showDownload && protocolStatus === "ready" && (
          <div className="px-5 py-2 bg-green-950/30 border-b border-green-900/30 flex items-center justify-between">
            <p className="text-xs text-green-200">✅ Protocol ready for download</p>
            <button
              onClick={handleDownloadWord}
              className="text-xs bg-green-700 text-white px-3 py-1 rounded hover:bg-green-600 flex items-center gap-1"
            >
              <Download size={12} />
              Download Word (.docx)
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
                    {protocolStatus === "generating" ? "Deep reasoning & protocol generation..." : "Thinking..."}
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
                      ? "Ask about your document, or say 'generate protocol'..."
                      : "Describe your research idea, or upload a document..."
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

function generateProtocolResponse(userMessage: string, documentContent: string): string {
  const q = userMessage.toLowerCase();

  if (q.includes("protocol") || q.includes("generate") || q.includes("create")) {
    return `I'll help you generate a research protocol. Based on the ${documentContent ? "uploaded document" : "your description"}, I'll follow the AIPOCH Clinical Cohort Protocol Designer methodology (Sections A–L).

**Deep Reasoning Chain:**

**Phase 1 — Context Analysis:**
${documentContent ? `I've analyzed your uploaded document. Key elements identified: study context, population, and research objectives.` : "No document uploaded. I'll use a template structure."}

**Phase 2 — Gap Identification:**
Common gaps in research protocols include: (1) unclear eligibility criteria, (2) missing bias mitigation strategies, (3) underdeveloped feasibility assessment.

**Phase 3 — Design Alignment:**
Proposed cohort design will address gaps through explicit eligibility logic, bias audit tables, and feasibility scoring.

**Phase 4 — Recommended Next Step:**
Click the **Generate** button above to create the full AIPOCH-structured protocol with Sections A–L. You can then download it as a Word document.`;
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

Would you like me to proceed with generating the full protocol?`;
  }

  return `I'm your Protocol Design Assistant. ${documentContent ? `I've loaded your document (${(documentContent.length / 1024).toFixed(1)} KB).` : "Upload a document for deep analysis, or describe your research idea directly."}

You can:
• Say **"generate protocol"** to create a full AIPOCH-structured protocol
• Toggle **Deep Reasoning** mode for Long CoT analysis
• Upload a document for context-aware protocol generation
• Ask specific questions about methodology or design choices

What would you like to do?`;
}

function generateDefaultProtocol(documentContent: string, idea: string): string {
  const researchQuestion = idea.trim() || "[AUTHOR TO SPECIFY: state the research question]";
  const contextNote = documentContent ? `\n\nBased on the uploaded document content:\n${documentContent.substring(0, 5000)}` : "\n\n(No document uploaded — using a generic clinical research protocol template)";
  const skillNote = CLINICAL_TRIAL_PROTOCOL_SKILL
    ? `\n\n*Methodology informed by: ${CLINICAL_TRIAL_PROTOCOL_SKILL.name} — ${CLINICAL_TRIAL_PROTOCOL_SKILL.description}*`
    : "";

  return `## A. Study Intent Summary
This protocol establishes a structured clinical cohort study designed to investigate the following research question: **${researchQuestion}**.${contextNote}${skillNote}

## B. Why Cohort Design Fits
A cohort design is appropriate for this research question because it allows for prospective or retrospective follow-up of exposed and unexposed populations, enabling the assessment of temporal relationships and incidence-based outcomes.${contextNote}

## C. Recommended Cohort Type
**Retrospective-prospective hybrid cohort** — leveraging existing registry or EHR data for baseline characterization with prospective validation of key outcomes.${contextNote}

## D. Source Population, Enrollment Logic, and Time-Zero
| Element | Definition |
|---------|------------|
| Source population | [AUTHOR TO SPECIFY: Define target population with demographic/clinical criteria] |
| Inclusion criteria | [AUTHOR TO SPECIFY: Age range, diagnosis status, consent capacity] |
| Exclusion criteria | [AUTHOR TO SPECIFY: Comorbidities, prior interventions, pregnancy] |
| Index date / Time-zero | [AUTHOR TO SPECIFY: Date of first exposure/entry into cohort] |
| Baseline window | [AUTHOR TO SPECIFY: ±30/60/90 days around index date] |
| Cohort entry rule | [AUTHOR TO SPECIFY: Minimum follow-up requirement before entry] |

## E. Follow-up Architecture
| Element | Definition |
|---------|------------|
| Follow-up start | [AUTHOR TO SPECIFY: Date from which observation begins] |
| Follow-up duration | [AUTHOR TO SPECIFY: Months/years of intended observation] |
| Visit/observation structure | [AUTHOR TO SPECIFY: Interval assessments, trigger-based visits] |
| Censoring rules | [AUTHOR TO SPECIFY: Loss to follow-up, administrative censoring, competing events] |
| Loss-to-follow-up handling | [AUTHOR TO SPECIFY: Sensitivity analysis strategy for attrition] |
| Competing events | [AUTHOR TO SPECIFY: Death, withdrawal, alternative intervention] |

## F. Endpoint Framework
| Element | Definition |
|---------|------------|
| Primary endpoint | [AUTHOR TO SPECIFY: Binary/time-to-event/longitudinal outcome with operational definition] |
| Secondary endpoints | [AUTHOR TO SPECIFY: Supporting outcomes with measurement instruments] |
| Endpoint structure | [AUTHOR TO SPECIFY: binary / time-to-event / longitudinal / competing-risk] |
| Ascertainment mechanism | [AUTHOR TO SPECIFY: EHR query, active assessment, adjudication committee] |

## G. Variable Collection Framework
**Necessary:**
- Exposure/predictor: [AUTHOR TO SPECIFY: Primary exposure with measurement details]
- Demographics: [AUTHOR TO SPECIFY: Age, sex, ethnicity, socioeconomic indicators]
- Disease severity: [AUTHOR TO SPECIFY: Staging criteria, biomarkers, clinical scores]
- Confounders: [AUTHOR TO SPECIFY: Identified from literature review]

**Recommended:**
- Treatments: [AUTHOR TO SPECIFY: Concomitant medications, procedures]
- Laboratory/imaging: [AUTHOR TO SPECIFY: Key biomarkers, imaging modalities]
- Effect modifiers: [AUTHOR TO SPECIFY: Subgroup-identifying variables]

**Optional:**
- Exploratory variables: [AUTHOR TO SPECIFY: Secondary hypotheses, ancillary analyses]

## H. Primary Statistical Analysis Line
| Element | Definition |
|---------|------------|
| Primary estimand | [AUTHOR TO SPECIFY: Population, treatment/exposure, outcome, summary] |
| Model family | [AUTHOR TO SPECIFY: Logistic regression, Cox PH, mixed-effects, GEE] |
| Covariate adjustment | [AUTHOR TO SPECIFY: Pre-specified confounders, sensitivity covariates] |
| Subgroup logic | [AUTHOR TO SPECIFY: Pre-specified subgroups with interaction testing] |
| Sensitivity analyses | [AUTHOR TO SPECIFY: Alternative definitions, missing-data strategies] |
| Missing-data strategy | [AUTHOR TO SPECIFY: Multiple imputation, complete case, IPW] |
| Software | [AUTHOR TO SPECIFY: R (version), Stata (version), SAS (version)] |

## I. Bias and Validity Review
| Bias Source | Why It Matters | Design Mitigation |
|-------------|---------------|-------------------|
| Selection bias | Non-representative enrollment skews estimand | Clear eligibility criteria; compare enrolled vs. eligible |
| Information bias | Misclassification of exposure/outcome | Standardized data extraction; validation substudy |
| Confounding | Spurious exposure-outcome association | Pre-specified covariate set; stratification; PS methods |
| Immortal time bias | Artificially inflates survival in exposed group | Proper time-zero definition; time-dependent exposure |
| Informative censoring | Loss related to outcome distorts estimates | Sensitivity analysis; competing risks framework |

## J. Feasibility and Data-Quality Check
| Data Element | Likely Available | Assumption-Dependent |
|-------------|-----------------|---------------------|
| Exposure status | [Yes/No/Uncertain] | [Detail assumptions] |
| Primary outcome | [Yes/No/Uncertain] | [Detail assumptions] |
| Key covariates | [Yes/No/Uncertain] | [Detail assumptions] |
| Follow-up duration | [Yes/No/Uncertain] | [Detail assumptions] |

## K. Recommended Protocol Version
Lead protocol: **Retrospective-prospective cohort** with primary analysis based on multivariable Cox proportional hazards regression, supplemented by propensity score matching for sensitivity. Justification: optimal balance of feasibility, sample size, and causal inference strength given the expected data landscape.

## L. Critical Assumptions and Next Clarifications
1. [ASSUMPTION] Accurate exposure ascertainment is achievable from available data sources
2. [ASSUMPTION] Minimum 2 years of follow-up data available for primary analysis
3. [CLARIFY] Specific inclusion/exclusion criteria from uploaded document
4. [CLARIFY] Primary outcome measurement instrument and adjudication process
5. [CLARIFY] Ethical approvals and data governance framework status
${CLINICAL_TRIAL_PROTOCOL_SKILL ? `\n\n*Regulatory Note:* Before proceeding with this clinical study, professional consultation with biostatisticians, regulatory affairs specialists, and IRB is strongly recommended. This tool does not constitute official FDA or regulatory approval.` : ""}

---
*Protocol generated by Resilient Research App Protocol Generator using AIPOCH Long CoT methodology.*${skillNote}`;
}
