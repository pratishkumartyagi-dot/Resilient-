"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, User, Bot, Trash2, FlaskConical, Paperclip, X, Download, FileText, Loader2, Dna, BarChart3, Network, Shield, Search, GitBranch, Bug, Table2, FileJson, FileType2, Printer, ChevronRight, ChevronDown, FolderOpen, BookOpen, Microscope, Database, Workflow, FlaskRound, Atom, Stethoscope, HeartPulse, type LucideIcon } from "lucide-react";
import { parseOmicsDataFile, ALLOWED_OMICS_TYPES } from "@/lib/document-parser";
import { getSkillsByCategory, getSkillsBySubcategory, getAllCategories, getSkillById, MEDICAL_SKILLS_REGISTRY } from "@/lib/medical-skills/skills-registry";
import { useApp } from "@/context/AppContext";
import { callDeepSeek } from "@/lib/ai";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "scientific-databases": Database,
  "bioinformatics-gptomics": FlaskRound,
  "omics-computational": Atom,
  "clawbio-pipelines": Workflow,
  "bioos-extended": Microscope,
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  skillId?: string;
}

interface TableData {
  header: string[];
  rows: string[][];
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildSkillContext(skillId?: string): string {
  if (!skillId) return "";
  const skill = getSkillById(skillId);
  if (!skill) return "";
  return `[Active Skill Context]\nSkill: ${skill.name}\nCategory: ${skill.subcategory}\nDescription: ${skill.description}\nSource: ${skill.sourceRepo}/${skill.skillPath}\n\nUse this skill's methodology when responding. If the skill involves specific tools, databases, or workflows, reference them explicitly.`;
}

async function callAI(provider: "gemini" | "groq" | "local", apiKey: string, prompt: string, skillId?: string): Promise<string> {
  const skillContext = buildSkillContext(skillId);
  const finalPrompt = skillContext ? `${skillContext}\n\n[User Request]\n${prompt}` : prompt;

  if (provider === "local") {
    return await callDeepSeek(finalPrompt);
  }

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, prompt: finalPrompt, apiKey }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  return data.content || "No response generated.";
}

function generateLocalResponse(userMessage: string, skillId?: string): string {
  const skill = skillId ? getSkillById(skillId) : null;
  const q = userMessage.toLowerCase();

  if (skill) {
    return `**${skill.name}**\n\n${skill.description}\n\nThis skill is part of ${skill.sourceRepo} (${skill.skillPath}). Configure an API key in Settings to get AI-powered guidance for this workflow.`;
  }

  if (q.includes("single-cell") || q.includes("scanpy") || q.includes("scrna")) {
    return "**Single-cell RNA-seq (Scanpy/scVI) pipeline**\n\n1. **QC & filtering**: remove low-gene, low-count, high-mt cells\n2. **Normalization**: log-normalize or scran scaling\n3. **Feature selection**: highly variable genes (HVGs)\n4. **Scaling + PCA**: regress out unwanted variation\n5. **Batch integration**: scVI-tools probabilistic integration\n6. **Clustering**: Leiden / Louvain graph clustering\n7. **Visualization**: UMAP / t-SNE\n8. **Cell type annotation**: marker-based or automated\n9. **Spatial mapping**: 10x Visium / Xenium integration\n\nI can guide you through any step in detail. Select a skill from the sidebar for domain-specific assistance.";
  }

  if (q.includes("bulk") || q.includes("differential expression") || q.includes("deg") || q.includes("deseq2") || q.includes("limma")) {
    return "**Bulk RNA-seq & Differential Expression**\n\n- **PyDESeq2 / DESeq2**: Wald/LRT, lfcShrink, padj < 0.05\n- **limma-voom**: precision weights for log-CPM\n- **edgeR**: GLM-based, exact test, quasi-likelihood\n- **Visualization**: volcano plots, clustered heatmaps, PCA/MDS\n- **Batch correction**: limma removeBatchEffect, ComBat-seq\n- **Normalization**: TPM, RPKM/FPKM, TMM, RLE\n\nTell me your experimental design and I'll suggest the most appropriate workflow.";
  }

  if (q.includes("pathway") || q.includes("enrichment") || q.includes("go") || q.includes("kegg") || q.includes("gsea")) {
    return "**Pathway & Network Analysis**\n\n- **Enrichment**: GO/KEGG via gseapy or enrichr\n- **GSEA**: preranked or gene-set mode, leading-edge analysis\n- **GSVA**: sample-level pathway scoring + limma differential analysis\n- **Immune**: ssGSEA immune gene-set scoring\n- **Networks**:\n  - WGCNA co-expression modules\n  - STRING PPI networks\n  - ceRNA / lncRNA-mRNA / TF-target networks\n- **Visualization**: Sankey diagrams, dot plots, bar plots\n\nWhich approach matches your data and question?";
  }

  if (q.includes("immune") || q.includes("infiltration") || q.includes("cibersort") || q.includes("estimate")) {
    return "**Immune Infiltration Profiling**\n\n- **CIBERSORTx / EPIC**: deconvolve 22 immune cell subsets from bulk RNA-seq\n- **MCPcounter / xCell / TIMER**: alternative deconvolution strategies\n- **ssGSEA**: immune signature scoring at sample level\n- **ESTIMATE**: ImmuneScore, StromalScore, ESTIMATEScore\n- **scRNA-seq**: cluster-level immune profiling, trajectory inference\n- **Outputs**: proportions, correlations with survival/response, publication-ready visualizations\n\nI can help you pick signatures, run QC, or format results for your manuscript.";
  }

  if (q.includes("genomics") || q.includes("blast") || q.includes("seq") || q.includes("biopython") || q.includes("vcf") || q.includes("bam") || q.includes("crispr")) {
    return "**Genomics & Sequence Analysis**\n\n- **Sequence handling**: Biopython (FASTA, FASTQ, GenBank)\n- **Alignment**: NCBI BLAST, pairwise/Multiple sequence alignment\n- **Variant context**: pysam for BAM/CRAM/VCF operations\n- **CRISPR screens**: MAGeCK / Rockhopper essential gene calls\n- **QC & coverage**: fastqc reports + deepTools (bamCoverage, heatmaps, correlation)\n- **Visualization**: Circos plots, sequence logos, ideograms\n\nSend me your file type, pipeline stage, or specific question.";
  }

  if (q.includes("dimensionality") || q.includes("umap") || q.includes("tsne") || q.includes("pca") || q.includes("clustering") || q.includes("subtype")) {
    return "**Dimensionality Reduction & Clustering**\n\n- **PCA**: scree plot, elbow method, JackStraw\n- **UMAP / t-SNE**: visualization and neighborhood preservation\n- **Clustering**: Leiden / Louvain / hierarchical\n- **Consensus clustering**: molecular subtyping (NMF, spectral, CC)\n- **Imputation**: KNN or MAGIC for missing values\n- **Integration**: Harmony, scVI, Seurat RPCA for multimodal data\n\nLet me know your dataset size and modality.";
  }

  if (q.includes("microbiome") || q.includes("diversity") || q.includes("ordination") || q.includes("fcs") || q.includes("flow") || q.includes("mass spec") || q.includes("neuropixels") || q.includes("kilosort")) {
    return "**Microbiome & Other Modalities**\n\n- **16S / shotgun**: alpha/beta diversity (Shannon, Bray-Curtis), PCoA/NMDS, differential abundance\n- **Proteomics**: pyOpenMS LC-MS/MS pipeline\n- **Flow cytometry**: FlowIO FCS parsing\n- **Neuropixels**: Kilosort4 spike sorting + post-processing\n- **Multi-omics pairing**: RNA + protein, chromatin + expression\n\nWhich modality do you need help with?";
  }

  if (q.includes("help") || q.includes("how") || q.includes("start")) {
    return "**Omics & Bioinformatics — Capability Overview**\n\nIntegrated OpenClaw-Medical-Skills (869 skills across 5 categories):\n\n🧬 **Scientific Databases** — Genomics, proteins, pathways, cancer genomics, structural biology\n🧫 **Bioinformatics** — Sequencing QC, variant analysis, differential expression, pathways, single-cell, epigenomics, microbiome, immunoinformatics, multi-omics, proteomics, structural biology, causal genomics\n🧬 **Omics & Computational Biology** — Single-cell, proteomics, cheminformatics, protein structure, phylogenetics\n🕸️ **ClawBio Pipelines** — Orchestration, GWAS, ancestry, structural biology\n🤖 **BioOS Extended Suite** — Extended bioinformatics, oncology, hematology, immunology, single-cell, drug discovery, clinical AI, research infrastructure\n\nBrowse the sidebar to select a specific skill, or ask me about any omics topic.";
  }

  return `**Omics & Bioinformatics mode active**\n\nI can assist with:\n- single-cell / bulk RNA-seq pipelines\n- pathway and network analysis\n- immune deconvolution\n- genomics and sequence analysis\n- microbiome and proteomics workflows\n\nSelect a skill from the sidebar for specialized guidance, or configure an API key for AI-powered responses.`;
}

export default function OmicsBioinformaticsTab() {
  const { state } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; type: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => getAllCategories(), []);
  const integratedSkillCount = useMemo(() => MEDICAL_SKILLS_REGISTRY.filter(s => s.integrated).length, []);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleSubcategory = (sub: string) => {
    setExpandedSubcategories(prev => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() && !uploadedFile) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim() || (uploadedFile ? `[Uploaded file: ${uploadedFile.name}]\nPlease analyze this omics data file.` : ""),
      timestamp: new Date(),
      skillId: selectedSkill || undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    const currentFile = uploadedFile;
    setInput("");
    setUploadedFile(null);
    setIsTyping(true);

    try {
      let prompt = currentInput;
      if (currentFile) {
        prompt += `\n\n[Uploaded File: ${currentFile.name}]\n${currentFile.content.substring(0, 5000)}`;
      }
      if (selectedSkill) {
        const skill = getSkillById(selectedSkill);
        if (skill) {
          prompt = `[Skill: ${skill.name}]\n${skill.description}\n\nUser request: ${prompt}`;
        }
      }

      const geminiKey = state.geminiApiKey;
      const groqKey = state.groqApiKey;

      let responseContent = "";
      if (geminiKey) {
        responseContent = await callAI("gemini", geminiKey, prompt, selectedSkill || undefined);
      } else if (groqKey) {
        responseContent = await callAI("groq", groqKey, prompt, selectedSkill || undefined);
      } else {
        responseContent = await callAI("local", "", prompt, selectedSkill || undefined);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseContent,
        timestamp: new Date(),
        skillId: selectedSkill || undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}. Please check your API keys in Settings.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setSelectedSkill(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseOmicsDataFile(file);
      setUploadedFile({ name: parsed.name, content: parsed.content, type: parsed.type });
    } catch (err) {
      alert(`Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSkillSelect = (skillId: string) => {
    setSelectedSkill(skillId);
    const skill = getSkillById(skillId);
    if (skill) {
      const welcomeMsg: Message = {
        id: `skill-welcome-${Date.now()}`,
        role: "assistant",
        content: `**${skill.name}** selected.\n\n${skill.description}\n\nSource: ${skill.sourceRepo}/${skill.skillPath}\n\nAsk me anything about this skill's domain. I can help with workflows, tool selection, data analysis steps, and interpretation.`,
        timestamp: new Date(),
        skillId,
      };
      setMessages((prev) => [...prev, welcomeMsg]);
    }
  };

  const handleDownloadCSV = (data: TableData, filename: string) => {
    const csv = [data.header.join(","), ...data.rows.map(row => row.map(escapeCsvField).join(","))].join("\n");
    downloadBlob(csv, filename, "text/csv");
  };

  const handleDownloadWord = (content: string, filename: string) => {
    const html = `<html><body><pre style="font-family: monospace; white-space: pre-wrap;">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
    downloadBlob(html, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  };

  const handleDownloadPDF = (content: string, filename: string) => {
    const html = `<html><head><title>${filename}</title><style>body { font-family: Arial, sans-serif; margin: 40px; } pre { white-space: pre-wrap; font-family: monospace; }</style></head><body><pre>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.print();
    }
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === "user";
    const skill = msg.skillId ? getSkillById(msg.skillId) : null;
    return (
      <div key={msg.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? "bg-yellow-600 text-[#0a1a3a]" : "bg-emerald-700 text-white"
        }`}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>
        <div className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser ? "bg-yellow-900/30 border border-yellow-700/40 text-yellow-50" : "bg-emerald-950/60 border border-emerald-800 text-emerald-100"
        }`}>
          {skill && !isUser && (
            <div className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded-full inline-block mb-2">
              {skill.name}
            </div>
          )}
          <div className="prose prose-sm prose-invert" dangerouslySetInnerHTML={{
            __html: msg.content
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br/>")
              .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-300 underline">$1</a>')
              .replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, '<pre class="bg-black/30 p-2 rounded text-xs overflow-x-auto"><code>$2</code></pre>'),
          }} />
        </div>
      </div>
    );
  };

  const renderSidebar = () => {
    if (!sidebarOpen) return null;
    return (
      <div className="w-72 bg-[#0a1628] border-r border-blue-900/50 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <div className="p-3 border-b border-blue-900/50">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2 text-blue-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter skills..."
              className="w-full bg-blue-950/50 border border-blue-800 text-white text-xs rounded px-7 py-1.5 placeholder:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-2">
          <button
            onClick={handleClear}
            className="w-full text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1.5 rounded hover:bg-red-950/30"
          >
            <Trash2 size={12} /> Clear Session
          </button>
        </div>
        <div className="px-2 pb-2 space-y-1">
          {categories
            .filter(cat => !searchQuery || cat.category.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(({ category, subsections }) => {
              const Icon = CATEGORY_ICONS[category] || FolderOpen;
              const isExpanded = expandedCategories.has(category);
              const filteredSubs = searchQuery
                ? subsections.filter(sub => sub.toLowerCase().includes(searchQuery.toLowerCase()))
                : subsections;
              if (filteredSubs.length === 0 && searchQuery) return null;
              return (
                <div key={category} className="mb-1">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-950/50 rounded"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Icon size={14} />
                    {formatCategory(category)}
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {filteredSubs.map(sub => {
                        const skills = getSkillsBySubcategory(category as any, sub);
                        if (skills.length === 0 && searchQuery) return null;
                        const subExpanded = expandedSubcategories.has(sub);
                        return (
                          <div key={sub}>
                            <button
                              onClick={() => toggleSubcategory(sub)}
                              className="w-full flex items-center gap-1 px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-950/40 rounded"
                            >
                              {subExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              <BookOpen size={10} />
                              {sub}
                            </button>
                            {subExpanded && (
                              <div className="ml-3 mt-0.5 space-y-0.5">
                                {skills.map(skill => (
                                  <button
                                    key={skill.id}
                                    onClick={() => handleSkillSelect(skill.id)}
                                    className={`w-full text-left px-2 py-1 text-[10px] rounded flex items-center gap-1 ${
                                      selectedSkill === skill.id
                                        ? "bg-emerald-900/60 text-emerald-200 border border-emerald-700"
                                        : "text-blue-300 hover:bg-blue-950/30"
                                    }`}
                                  >
                                    <Microscope size={10} />
                                    {skill.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-0">
      <div className="bg-[#0d1b3e] border border-emerald-900/50 rounded-lg shadow flex" style={{ height: "calc(100vh - 220px)" }}>
        {renderSidebar()}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-900/50 bg-[#071f1a]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-emerald-400 hover:text-emerald-300 mr-1"
              >
                <FlaskConical size={18} />
              </button>
              <FlaskConical size={18} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">Omics & Bioinformatics</h2>
              <span className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded-full">
                OpenClaw-Medical-Skills
              </span>
              {selectedSkill && (
                <span className="text-[10px] bg-blue-900/80 text-blue-200 px-2 py-0.5 rounded-full ml-2">
                  {getSkillById(selectedSkill)?.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {uploadedFile && (
                <span className="text-[10px] bg-yellow-900/80 text-yellow-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Paperclip size={10} />
                  {uploadedFile.name}
                  <button onClick={() => setUploadedFile(null)} className="hover:text-red-300">
                    <X size={10} />
                  </button>
                </span>
              )}
              <button
                onClick={handleClear}
                className="text-xs text-emerald-300 hover:text-red-400 flex items-center gap-1"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a1612]">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <FlaskConical size={48} className="mx-auto text-emerald-700 mb-4" />
                <h3 className="text-lg font-semibold text-emerald-300 mb-2">Omics & Bioinformatics Workbench</h3>
                <p className="text-sm text-emerald-400/70 max-w-2xl mx-auto mb-4">
                   Browse {integratedSkillCount}+ OpenClaw-Medical-Skills organized into 5 categories:
                  Scientific Databases, Bioinformatics, Omics & Computational Biology, ClawBio Pipelines, and BioOS Extended Suite.
                  Select a skill from the sidebar to get specialized assistance.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["single-cell", "bulk", "pathway", "immune", "genomics", "dimred", "microbiome"].map(topic => (
                    <button
                      key={topic}
                      onClick={() => setInput(`Help me with ${topic} analysis`)}
                      className="text-xs bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-3 py-1.5 rounded-full hover:bg-emerald-900/40"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(renderMessage)}
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-emerald-950/60 border border-emerald-800 rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {uploadedFile && (
            <div className="px-4 py-2 bg-yellow-950/30 border-t border-yellow-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-yellow-300">
                <FileText size={12} />
                <span>{uploadedFile.name}</span>
                <span className="text-yellow-500">({uploadedFile.type})</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDownloadCSV({ header: ["Column"], rows: [[uploadedFile.content.substring(0, 100)]] }, `${uploadedFile.name}.csv`)} className="text-[10px] bg-blue-900/60 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60">
                  CSV
                </button>
                <button onClick={() => handleDownloadWord(uploadedFile.content, `${uploadedFile.name}.doc`)} className="text-[10px] bg-purple-900/60 text-purple-200 px-2 py-1 rounded hover:bg-purple-800/60">
                  Word
                </button>
                <button onClick={() => handleDownloadPDF(uploadedFile.content, `${uploadedFile.name}.pdf`)} className="text-[10px] bg-red-900/60 text-red-200 px-2 py-1 rounded hover:bg-red-800/60">
                  PDF
                </button>
              </div>
            </div>
          )}

          <div className="px-4 py-3 border-t border-emerald-900/50 bg-[#071f1a]">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder={selectedSkill ? `Ask about ${getSkillById(selectedSkill)?.name}...` : "Ask about RNA-seq, CRISPR, pathway analysis, or select a skill..."}
                  className="w-full bg-emerald-950 border border-emerald-800 text-white rounded-full px-4 py-2.5 pr-10 text-sm placeholder:text-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={isTyping}
                />
              </div>
              <input ref={fileInputRef} type="file" accept={ALLOWED_OMICS_TYPES.join(",")} onChange={handleFileUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-emerald-400 hover:text-emerald-300 p-2.5"
                title="Upload omics data file"
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="bg-emerald-500 hover:bg-emerald-600 text-[#0a1a3a] p-2.5 rounded-full disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-3 text-[10px] text-emerald-500">
                <span>{integratedSkillCount} skills integrated</span>
                <span>•</span>
                <span>AI: {state.geminiApiKey ? "Gemini" : state.groqApiKey ? "Groq" : "Local"}</span>
              </div>
              {selectedSkill && (
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                >
                  Clear skill selection
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCategory(cat: string): string {
  return cat.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
