"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Trash2, FlaskConical, ChevronDown } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const generateOmicsResponse = (userMessage: string): string => {
  const q = userMessage.toLowerCase();

  if (q.includes("single-cell") || q.includes("scanpy") || q.includes("scrna")) {
    return `**Single-cell RNA-seq (Scanpy/scVI) pipeline**\n\n1. **QC & filtering**: remove low-gene, low-count, high-mt cells\n2. **Normalization**: log-normalize or scran scaling\n3. **Feature selection**: highly variable genes (HVGs)\n4. **Scaling + PCA**: regress out unwanted variation\n5. **Batch integration**: scVI-tools probabilistic integration\n6. **Clustering**: Leiden / Louvain graph clustering\n7. **Visualization**: UMAP / t-SNE\n8. **Cell type annotation**: marker-based or automated\n9. **Spatial mapping**: 10x Visium / Xenium integration\n\nI can guide you through any step in detail.`;
  }

  if (q.includes("bulk") || q.includes("differential expression") || q.includes("deg") || q.includes("deseq2") || q.includes("limma")) {
    return `**Bulk RNA-seq & Differential Expression**\n\n- **PyDESeq2 / DESeq2**: Wald/LRT, lfcShrink, padj < 0.05\n- **limma-voom**: precision weights for log-CPM\n- **edgeR**: GLM-based, exact test, quasi-likelihood\n- **Visualization**: volcano plots, clustered heatmaps, PCA/MDS\n- **Batch correction**: limma removeBatchEffect, ComBat-seq\n- **Normalization**: TPM, RPKM/FPKM, TMM, RLE\n\nTell me your experimental design and I’ll suggest the most appropriate workflow.`;
  }

  if (q.includes("pathway") || q.includes("enrichment") || q.includes("go") || q.includes("kegg") || q.includes("gsea")) {
    return `**Pathway & Network Analysis**\n\n- **Enrichment**: GO/KEGG via gseapy or enrichr\n- **GSEA**: preranked or gene-set mode, leading-edge analysis\n- **GSVA**: sample-level pathway scoring + limma differential analysis\n- **Immune**: ssGSEA immune gene-set scoring\n- **Networks**:\n  - WGCNA co-expression modules\n  - STRING PPI networks\n  - ceRNA / lncRNA-mRNA / TF-target networks\n- **Visualization**: Sankey diagrams, dot plots, bar plots\n\nWhich approach matches your data and question?`;
  }

  if (q.includes("immune") || q.includes("infiltration") || q.includes("cibersort") || q.includes("estimate")) {
    return `**Immune Infiltration Profiling**\n\n- **CIBERSORTx / EPIC**: deconvolve 22 immune cell subsets from bulk RNA-seq\n- **MCPcounter / xCell / TIMER**: alternative deconvolution strategies\n- **ssGSEA**: immune signature scoring at sample level\n- **ESTIMATE**: ImmuneScore, StromalScore, ESTIMATEScore\n- **scRNA-seq**: cluster-level immune profiling, trajectory inference\n- **Outputs**: proportions, correlations with survival/response, publication-ready visualizations\n\nI can help you pick signatures, run QC, or format results for your manuscript.`;
  }

  if (q.includes("genomics") || q.includes("blast") || q.includes("seq") || q.includes("biopython") || q.includes("vcf") || q.includes("bam") || q.includes("crispr")) {
    return `**Genomics & Sequence Analysis**\n\n- **Sequence handling**: Biopython (FASTA, FASTQ, GenBank)\n- **Alignment**: NCBI BLAST, pairwise/Multiple sequence alignment\n- **Variant context**: pysam for BAM/CRAM/VCF operations\n- **CRISPR screens**: MAGeCK / Rockhopper essential gene calls\n- **QC & coverage**: fastqc reports + deepTools (bamCoverage, heatmaps, correlation)\n- **Visualization**: Circos plots, sequence logos, ideograms\n\nSend me your file type, pipeline stage, or specific question.`;
  }

  if (q.includes("dimensionality") || q.includes("umap") || q.includes("tsne") || q.includes("pca") || q.includes("clustering") || q.includes("subtype")) {
    return `**Dimensionality Reduction & Clustering**\n\n- **PCA**: scree plot, elbow method, JackStraw\n- **UMAP / t-SNE**: visualization and neighborhood preservation\n- **Clustering**: Leiden / Louvain / hierarchical\n- **Consensus clustering**: molecular subtyping (NMF, spectral, CC)\n- **Imputation**: KNN or MAGIC for missing values\n- **Integration**: Harmony, scVI, Seurat RPCA for multimodal data\n\nLet me know your dataset size and modality.`;
  }

  if (q.includes("microbiome") || q.includes("diversity") || q.includes("ordination") || q.includes("fcs") || q.includes("flow") || q.includes("mass spec") || q.includes("neuropixels") || q.includes("kilosort")) {
    return `**Microbiome & Other Modalities**\n\n- **16S / shotgun**: alpha/beta diversity (Shannon, Bray-Curtis), PCoA/NMDS, differential abundance\n- **Proteomics**: pyOpenMS LC-MS/MS pipeline\n- **Flow cytometry**: FlowIO FCS parsing\n- **Neuropixels**: Kilosort4 spike sorting + post-processing\n- **Multi-omics pairing**: RNA + protein, chromatin + expression\n\nWhich modality do you need help with?`;
  }

  if (q.includes("help") || q.includes("how") || q.includes("start")) {
    return `**Omics & Bioinformatics — Capability Overview**\n\nBased on [aipoch/medical-research-skills](https://github.com/aipoch/medical-research-skills):\n\n🧬 **Single-cell RNA-seq** — Scanpy end-to-end, scVI integration, cell typing, spatial mapping\n🧫 **Bulk transcriptomics** — DESeq2/limma/edgeR, DEG screening, volcano/heatmap, batch correction\n🕸️ **Pathway & network** — GO/KEGG, GSEA, GSVA, WGCNA, ceRNA, PPI, Sankey\n🛡️ **Immune infiltration** — CIBERSORTx, ssGSEA, ESTIMATE\n🧬 **Genomics & sequence** — Biopython, BLAST, SAM/BAM/CRAM/VCF, CRISPR, Circos, deepTools\n📐 **Dimensionality reduction** — PCA, UMAP, t-SNE, consensus clustering, KNN imputation\n🦠 **Microbiome & others** — diversity, mass spec, flow cytometry, Neuropixels/Kilosort4\n\nAsk me about a specific tool, pipeline step, or data format.`;
  }

  return `**Omics & Bioinformatics mode active**\n\nI can assist with:\n- single-cell / bulk RNA-seq pipelines\n- pathway and network analysis\n- immune deconvolution\n- genomics and sequence analysis\n- microbiome and proteomics workflows\n\nWhat would you like to work on?`;
};

const createInitialMessages = (): Message[] => [
  {
    id: "welcome-omics",
    role: "assistant",
    content: `🧬 Welcome to **Omics & Bioinformatics**.\n\nI integrate skills from [aipoch/medical-research-skills](https://github.com/aipoch/medical-research-skills) to help you go from raw sequencing files to interpretable biological findings.\n\nAsk me about:\n- Single-cell / bulk RNA-seq pipelines\n- Pathway & network analysis\n- Immune infiltration profiling\n- Genomics & sequence analysis\n- Microbiome & other modalities\n\nAll outputs are formatted for direct inclusion in manuscript figures and methods sections.`,
    timestamp: new Date(),
  },
];

export default function OmicsBioinformaticsTab() {
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
      const responseContent = generateOmicsResponse(input);
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
      <div className="bg-[#0d1b3e] border border-emerald-900/50 rounded-lg shadow flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-900/50 bg-[#071f1a]">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-emerald-400" />
            <h2 className="text-base font-bold text-white">Omics & Bioinformatics</h2>
            <span className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded-full">
              aipoch/medical-research-skills
            </span>
          </div>
          <button
            onClick={handleClear}
            className="text-xs text-emerald-300 hover:text-red-400 flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a1612]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user" ? "bg-yellow-600 text-[#0a1a3a]" : "bg-emerald-700 text-white"
                }`}
              >
                {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-yellow-900/30 border border-yellow-700/40 text-yellow-50"
                    : "bg-emerald-950/60 border border-emerald-800 text-emerald-100"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div
                    className="prose prose-sm prose-invert"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>")
                        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-300 underline">$1</a>'),
                    }}
                  />
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
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

        <div className="px-4 py-3 border-t border-emerald-900/50 bg-[#071f1a]">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="Ask about RNA-seq, CRISPR, pathway analysis..."
                className="w-full bg-emerald-950 border border-emerald-800 text-white rounded-full px-4 py-2.5 pr-10 text-sm placeholder:text-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-[#0a1a3a] p-2.5 rounded-full disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
