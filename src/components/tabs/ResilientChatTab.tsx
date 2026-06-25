"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, MessageSquare, Sparkles, User, Bot, Trash2, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const generateMockResponse = (userMessage: string, pipelineState: any): string => {
  const q = userMessage.toLowerCase();

  if (q.includes("synthesis") || q.includes("evidence table")) {
    return `Based on your ${pipelineState.selectedPapers.length} selected papers, here is the synthesized evidence:\n\n1. **Prevalence Pattern**: LTBI prevalence among HCWs ranges from 15–45% across your included studies, with LMIC settings showing significantly higher burden (p<0.001).\n\n2. **Diagnostic Accuracy**: IGRA maintains 95% specificity vs TST at 78%. For BCG-vaccinated populations, this difference is critical.\n\n3. **Cost-Effectiveness**: ICER estimate from your synthesis: ~$1,240/QALY — well below WHO threshold for SSA adoption.\n\n4. **Innovation Evidence**: Digital health tools yielded 47% improvement in contact tracing completion rates (Kumar et al., 2024).\n\nWould you like me to expand on any of these findings?`;
  }

  if (q.includes("theme") || q.includes("themes")) {
    return `I identified 10 key themes from your evidence table:\n\n🔬 **Theme #1**: Occupational exposure protocol gaps — 8/23 studies noted inconsistent screening schedules.\n🏥 **Theme #5**: IPC infrastructure as a moderator — ventilation standards showed dose-response relationship.\n💰 **Theme #7**: Economic evidence — ICERs range $680–$4,100/QALY across contexts.\n🧠 **Theme #8**: Stigma and psychological impact — 4 qualitative studies consistently identified disclosure anxiety.\n\nYou can view the full thematic analysis in Step 5 of the pipeline.`;
  }

  if (q.includes("question") || q.includes("research question")) {
    return `Your research questions are organized by methodology:\n\n🔵 **Qualitative** (10 questions): Focus on HCW perception, stigma, IPC implementation experiences, and digital tool usability.\n\n🟢 **Quantitative** (10 questions): Cover prevalence comparison (RCT design), cost-effectiveness modeling (ICER calculation), and operational outcome measurement.\n\nI've formatted them with PICO-ready phrasing where relevant. Review and select them in Step 6.`;
  }

  if (q.includes("title") || q.includes("titles")) {
    return `I generated 5 research titles for you:\n\n1. *Implementation and Cost-Effectiveness...* — Mixed-methods, for doctoral dissertation\n2. *Digital Health-Enhanced Contact Tracing...* — RCT manuscript (PICO-ready)\n3. *Structural Determinants...* — Systematic review + meta-analysis\n4. *Integrating Mobile Radiology Van...* — Stepped-wedge trial design\n5. *Stigma, Disclosure, and Mental Health...* — Qualitative evidence synthesis\n\nSelect the one that best aligns with your target journal and study design in Step 7.`;
  }

  if (q.includes("aim") || q.includes("objective")) {
    return `Your refined aim and objectives:\n\n**Aim**: To evaluate the implementation and cost-effectiveness of annual IGRA-based LTBI screening among HCWs in tertiary care hospitals.\n\n**Primary**: Determine LTBI prevalence in HCWs using annual IGRA vs. standard TST.\n\n**Secondary (selected)**:\n- Assess HCW acceptability of IGRA programs\n- Measure digital reminder impact on IPT completion\n- Budget impact at national network level\n\nContinue refining in Step 8.`;
  }

  if (q.includes("methodology") || q.includes("method") || q.includes("design")) {
    return `Your methodology summary:\n\n**Design**: Mixed-methods sequential explanatory (cRCT + qualitative process evaluation)\n**Setting**: 8 tertiary hospitals, Lagos & Abuja\n**N**: ~3,200 HCWs\n**Intervention**: Annual IGRA + SMS for IPT\n**Comparator**: TST annual\n**Primary Outcome**: LTBI conversion at 12 months\n\nI can help refine your sampling strategy or power calculation. Check Step 9 for the built-in calculator.`;
  }

  if (q.includes("protocol") || q.includes("paper") || q.includes("manuscript")) {
    return `Your protocol components are ready:\n\n✅ **Background**: Drafts loaded from synthesis\n✅ **Objectives**: 1 primary + 4 secondary defined\n✅ **Methods**: cRCT, mixed-methods design documented\n✅ **Expected Outcomes**: 4 outcomes + dissemination plan\n\nAll sections are editable in Step 10. Would you like me to export any specific section?`;
  }

  if (q.includes("impact")) {
    return `Your Impact Assessment scores:\n\n📊 **Overall Composite**: 76.5 / 100\n- Scientific Rigor: 82\n- Policy Relevance: 88\n- Social Justice: 76\n- Economic Value: 74\n- Capacity Building: 71\n\nKey export: Policy brief (2-page) + Dataverse dataset. Final ROI estimate: $1,107/QALY.\n\nComplete summary available in Step 11.`;
  }

  if (q.includes("help") || q.includes("how") || q.includes("guide")) {
    return `I'm your Resilient Research Assistant. Here's how I can help:\n\n🔬 **Step-by-step guidance**: Navigate the 11-step pipeline from search to impact assessment.\n📊 **Evidence synthesis**: Explain any theme, table row, or literature finding.\n🎯 **Research design**: Refine your aims, objectives, and methodology alignment.\n✍️ **Writing support**: Help articulate protocol sections or title options.\n\nFeel free to ask about any specific step or concept!`;
  }

  return `I understand your question relates to the research pipeline. Based on your current progress (Step ${pipelineState.currentStep}):\n\n• You have ${pipelineState.selectedPapers.length} papers selected\n• ${pipelineState.themes.filter((t: any) => t.selected).length} themes selected\n• ${pipelineState.researchQuestions.filter((q: any) => q.selected).length} research questions selected\n\nI can provide more specific insights once you let me know which area you'd like to explore—try asking about "synthesis", "themes", "questions", "titles", "methodology", or "impact".`;
};

const createInitialMessages = (): Message[] => [
  {
    id: "welcome",
    role: "assistant",
    content: `👋 Welcome to **Resilient Chat** — NotebookLM-style research companion.\n\nI have access to your entire research pipeline. Ask me to:\n• Explain any synthesis table finding\n• Summarize your selected themes\n• Refine research questions or titles\n• Analyze your methodology strengths/weaknesses\n• Generate ready-to-use protocol sections\n\nWhat would you like to explore?`,
    timestamp: new Date(),
  },
];

export default function ResilientChatTab() {
  const { state } = useApp();
  const [messages, setMessages] = useState<Message[]>(createInitialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const responseContent = generateMockResponse(input, state);
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1200 + Math.random() * 1000);
  };

  const handleClear = () => {
    setMessages(createInitialMessages());
  };

  return (
    <div className="space-y-0">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg shadow flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-900/50 bg-[#0a1530]">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-yellow-400" />
            <h2 className="text-base font-bold text-white">Resilient Chat</h2>
            <span className="text-[10px] bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">Connected to Pipeline</span>
          </div>
          <button
            onClick={handleClear}
            className="text-xs text-blue-400 hover:text-red-400 flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#080f24]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-yellow-600 text-[#0a1a3a]"
                    : "bg-blue-700 text-white"
                }`}
              >
                {msg.role === "user" ? (
                  <User size={16} />
                ) : (
                  <Bot size={16} />
                )}
              </div>
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-yellow-900/30 border border-yellow-700/40 text-yellow-50"
                    : "bg-blue-900/40 border border-blue-800 text-blue-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>") }} />
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-blue-900/40 border border-blue-800 rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
                placeholder="Ask about your research pipeline, synthesis findings, or methodology..."
                className="w-full bg-blue-950 border border-blue-800 text-white rounded-full px-4 py-2.5 pr-10 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] p-2.5 rounded-full disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
