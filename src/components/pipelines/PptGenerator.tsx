"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload, Sparkles, Loader2, Download, FileText, ImageIcon, Table, BarChart2,
  X, Plus, Minus, ChevronRight, Edit2, Save, Trash2, Settings,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callAiWithFallback, type AICallOptions } from "@/lib/ai";
import { downloadMarkdownAsWord, downloadMarkdownAsPDF } from "@/lib/exporters";
import PptxGenJS from "pptxgenjs";

const MAX_FILES = 5;

export default function PptGenerator() {
  const { state, dispatch } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [fileTexts, setFileTexts] = useState<Record<string, string>>({});
  const [numSlides, setNumSlides] = useState(10);
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<"idle" | "generating" | "completed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Array<{ title: string; content: string; charts?: string[]; tables?: string[]; images?: string[] }>>([]);
  const [editingSlide, setEditingSlide] = useState<number | null>(null);
  const [slideDraft, setSlideDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).slice(0, MAX_FILES - files.length);
    if (newFiles.length === 0) return;

    const updatedFiles = [...files, ...newFiles].slice(0, MAX_FILES);
    setFiles(updatedFiles);

    for (const file of newFiles) {
      let text = `[File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`;
      const lowerName = file.name.toLowerCase();
      
      try {
        if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
          const { parseUploadedDocument } = await import("@/lib/document-parser");
          const { content } = await parseUploadedDocument(file);
          text += content.trim() ? `\nPDF Text:\n${content}` : "\n[PDF document — no extractable text found]";
        } else if (
          file.type === "application/msword" ||
          file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          lowerName.endsWith(".doc") ||
          lowerName.endsWith(".docx")
        ) {
          const { parseUploadedDocument } = await import("@/lib/document-parser");
          const { content } = await parseUploadedDocument(file);
          text += content.trim() ? `\nWord Text:\n${content}` : "\n[Word document — no extractable text found]";
        } else if (file.type.startsWith("image/")) {
          text += "\n[Image file uploaded]";
        } else {
          const content = await file.text();
          text += content.trim() ? `\nText:\n${content.slice(0, 5000)}` : "\n[Empty file]";
        }
      } catch {
        text += "\n[Could not parse file content]";
      }
      
      setFileTexts(prev => ({ ...prev, [file.name]: text }));
    }
  }, [files.length]);

  const removeFile = (index: number) => {
    const removed = files[index];
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    setFileTexts(prev => {
      const next = { ...prev };
      delete next[removed.name];
      return next;
    });
  };

  const generateSlides = async () => {
    if (files.length === 0 && !topic.trim()) {
      setError("Please upload files or enter a topic.");
      return;
    }
    if (numSlides < 1 || numSlides > 50) {
      setError("Number of slides must be between 1 and 50.");
      return;
    }

    setStatus("generating");
    setError(null);

    try {
      const combinedContext = Object.values(fileTexts).join("\n\n---\n\n") + 
        (topic.trim() ? `\n\nUser Topic: ${topic}` : "");

      const prompt = `You are an expert presentation designer. Create a detailed slide deck outline for a professional presentation.

CONTEXT FROM UPLOADED FILES:
${combinedContext || "No files uploaded - generate from topic only."}

TASK:
Generate exactly ${numSlides} slides. For each slide, provide:
1. A clear, concise title
2. Bullet-point content (4-6 bullets per slide)
3. Suggestions for charts, tables, or images that would enhance the slide (describe what data/visualization would be appropriate)

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"],
      "visualizations": {
        "charts": ["Description of chart needed"],
        "tables": ["Description of table needed"],
        "images": ["Description of image needed"]
      }
    }
  ]
}

Make the presentation professional, well-structured, and visually engaging. Include title slide, agenda/overview, content slides, and conclusion slide.`;

      const searchOptions: AICallOptions = { searchEnabled: true, searchQuery: topic || state.searchQuery };
      let responseText = "";

      try {
        responseText = await callAiWithFallback(prompt, searchOptions);
      } catch (err) {
        throw new Error(`AI generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }

      const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed: { slides: Array<{ title: string; bullets: string[]; visualizations: { charts: string[]; tables: string[]; images: string[] } }> };

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No valid JSON found in response");
        parsed = JSON.parse(jsonMatch[0]);
      }

      if (!parsed.slides || !Array.isArray(parsed.slides)) {
        throw new Error("Invalid response format: missing slides array");
      }

      const formattedSlides = parsed.slides.slice(0, numSlides).map((s) => ({
        title: s.title || "Untitled Slide",
        content: s.bullets?.map((b: string) => `• ${b}`).join("\n") || "",
        charts: s.visualizations?.charts || [],
        tables: s.visualizations?.tables || [],
        images: s.visualizations?.images || [],
      }));

      setSlides(formattedSlides);
      setStatus("completed");
    } catch (err: any) {
      setError(err?.message || "Failed to generate slides");
      setStatus("error");
    }
  };

  const handleEditSlide = (index: number) => {
    setEditingSlide(index);
    setSlideDraft(slides[index]?.content || "");
  };

  const handleSaveSlideEdit = () => {
    if (editingSlide === null) return;
    setSlides(prev => {
      const next = [...prev];
      next[editingSlide] = { ...next[editingSlide], content: slideDraft };
      return next;
    });
    setEditingSlide(null);
    setSlideDraft("");
  };

  const handleAddSlide = () => {
    setSlides(prev => [...prev, { title: "New Slide", content: "", charts: [], tables: [], images: [] }]);
  };

  const handleRemoveSlide = (index: number) => {
    setSlides(prev => prev.filter((_, i) => i !== index));
  };

  const handleExportPPTX = async () => {
    if (slides.length === 0) {
      setError("No slides to export. Generate slides first.");
      return;
    }

    try {
      const pptx = new PptxGenJS();
      pptx.author = "Resilient Research App";
      pptx.title = topic || "Generated Presentation";

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const pptSlide = pptx.addSlide();
        pptSlide.background = { color: "FFFFFF" };

        // Title
        pptSlide.addText(slide.title, {
          x: 0.5, y: 0.4, w: "90%", h: 0.8,
          fontSize: 28, bold: true, color: "1e3a8a",
        });

        // Content
        if (slide.content) {
          pptSlide.addText(slide.content, {
            x: 0.5, y: 1.5, w: "90%", h: "70%",
            fontSize: 18, color: "333333", bullet: true, valign: "top",
          });
        }

        // Add placeholder for charts/tables/images
        const vizItems = [
          ...(slide.charts || []).map(c => `[CHART: ${c}]`),
          ...(slide.tables || []).map(t => `[TABLE: ${t}]`),
          ...(slide.images || []).map(img => `[IMAGE: ${img}]`),
        ];

        if (vizItems.length > 0) {
          pptSlide.addText(vizItems.join("\n"), {
            x: 0.5, y: 5.5, w: "90%", h: 1.5,
            fontSize: 12, color: "666666", italic: true, valign: "bottom",
          });
        }
      }

      await pptx.writeFile({ fileName: `${topic || "presentation"}.pptx` });
    } catch (err: any) {
      setError(`Export failed: ${err?.message || "Unknown error"}`);
    }
  };

  const handleExportWord = () => {
    if (slides.length === 0) return;
    const markdown = `# ${topic || "Presentation"}\n\n` +
      slides.map((s, i) => `## Slide ${i + 1}: ${s.title}\n\n${s.content}\n\n${(s.charts || []).map(c => `*Chart: ${c}*`).join("\n")}\n${(s.tables || []).map(t => `*Table: ${t}*`).join("\n")}\n${(s.images || []).map(img => `*Image: ${img}*`).join("\n")}`).join("\n\n");
    downloadMarkdownAsWord(markdown, `${topic || "presentation"}.docx`);
  };

  const handleExportPDF = () => {
    if (slides.length === 0) return;
    const markdown = `# ${topic || "Presentation"}\n\n` +
      slides.map((s, i) => `## Slide ${i + 1}: ${s.title}\n\n${s.content}\n\n${(s.charts || []).map(c => `*Chart: ${c}*`).join("\n")}\n${(s.tables || []).map(t => `*Table: ${t}*`).join("\n")}\n${(s.images || []).map(img => `*Image: ${img}*`).join("\n")}`).join("\n\n");
    downloadMarkdownAsPDF(markdown, `${topic || "presentation"}.pdf`);
  };

  const hasContent = files.length > 0 || topic.trim();

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FilePlus size={22} className="text-purple-400" />
          <div>
            <h2 className="text-xl font-bold text-white">PPT Generator</h2>
            <p className="text-xs text-blue-300">
              Upload up to 5 files (PDF, Word, images, text) and specify slide count. AI generates an editable slide deck with chart/table/image suggestions.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {status === "completed" && (
            <>
              <button onClick={handleExportWord} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60">
                <Download size={12} /> Word
              </button>
              <button onClick={handleExportPDF} className="text-xs bg-emerald-900/50 text-emerald-300 px-3 py-1.5 rounded hover:bg-emerald-800/60">
                <Download size={12} /> PDF
              </button>
              <button onClick={handleExportPPTX} className="text-xs bg-purple-900/50 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-800/60">
                <Download size={12} /> PPTX
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 text-red-200 text-sm">{error}</div>
      )}

      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-blue-300 mb-1">Presentation Topic (optional)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Impact of telemedicine on diabetes management outcomes"
              className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-blue-300 mb-1">Number of Slides</label>
            <input
              type="number"
              value={numSlides}
              onChange={(e) => setNumSlides(Math.min(50, Math.max(1, Number(e.target.value) || 10)))}
              min="1"
              max="50"
              className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-blue-300 mb-1">Upload Files (max {MAX_FILES}) - PDF, Word, Images, Text</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
            className={`w-full border-2 border-dashed rounded-lg py-4 text-sm transition-colors ${
              files.length >= MAX_FILES
                ? "border-blue-700 text-blue-500 cursor-not-allowed"
                : "border-blue-700 text-blue-300 hover:border-purple-500 hover:text-purple-300"
            }`}
          >
            {files.length >= MAX_FILES ? `Maximum ${MAX_FILES} files reached` : "Click to select files (PDF, Word, Images, Text)"}
          </button>
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-blue-900/30 rounded px-3 py-2">
                  <span className="text-sm text-white flex items-center gap-2">
                    <FileText size={14} className="text-blue-400" />
                    {file.name}
                    <span className="text-xs text-blue-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </span>
                  <button onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-300">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={generateSlides}
          disabled={status === "generating" || (!hasContent)}
          className={`flex items-center gap-2 w-full md:w-auto bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${status === "generating" ? "animate-pulse" : ""}`}
        >
          {status === "generating" ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating slides…
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generate Slide Deck
            </>
          )}
        </button>

        {status === "generating" && (
          <p className="text-sm text-blue-400 text-center">AI is creating your slide deck with visualizations...</p>
        )}
      </div>

      {slides.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-yellow-400" />
            Generated Slides ({slides.length}) - Click to Edit
          </h3>
          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
            {slides.map((slide, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                  editingSlide === index
                    ? "bg-purple-900/20 border-purple-600/50"
                    : "bg-blue-950/50 border-blue-900 hover:border-blue-700"
                }`}
                onClick={() => editingSlide === index ? null : handleEditSlide(index)}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-400 bg-blue-900/50 px-2 py-0.5 rounded">
                      Slide {index + 1}
                    </span>
                    <h4 className="text-sm font-semibold text-white">{slide.title}</h4>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditSlide(index); }}
                      className="text-[10px] bg-blue-900/50 text-blue-200 px-2 py-1 rounded hover:bg-blue-800/60"
                    >
                      <Edit2 size={10} /> Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveSlide(index); }}
                      className="text-[10px] bg-red-900/50 text-red-200 px-2 py-1 rounded hover:bg-red-900/70"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                {editingSlide === index ? (
                  <div className="space-y-2">
                    <input
                      value={slide.title}
                      onChange={(e) => setSlides(prev => {
                        const next = [...prev];
                        next[index] = { ...next[index], title: e.target.value };
                        return next;
                      })}
                      className="w-full bg-blue-950 border border-blue-800 text-white rounded px-3 py-2 text-sm"
                    />
                    <textarea
                      value={slideDraft}
                      onChange={(e) => setSlideDraft(e.target.value)}
                      rows={6}
                      className="w-full bg-blue-950/60 border border-blue-900 rounded p-3 text-white text-xs font-mono leading-relaxed focus:outline-none resize-y whitespace-pre-wrap"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveSlideEdit} className="text-xs bg-yellow-500 text-[#0a1a3a] font-bold px-3 py-1.5 rounded hover:bg-yellow-600">
                        <Save size={12} /> Save
                      </button>
                      <button onClick={() => { setEditingSlide(null); setSlideDraft(""); }} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-blue-100 font-serif leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {slide.content || "(no content)"}
                  </div>
                )}
                {(slide.charts?.length || slide.tables?.length || slide.images?.length) && (
                  <div className="mt-2 pt-2 border-t border-blue-800/50">
                    <p className="text-[10px] text-purple-400 font-semibold mb-1">Suggested Visualizations:</p>
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {slide.charts?.map((c, i) => (
                        <span key={`chart-${i}`} className="bg-purple-900/30 text-purple-200 px-2 py-0.5 rounded border border-purple-700">
                          <BarChart2 size={10} className="inline mr-1" /> {c}
                        </span>
                      ))}
                      {slide.tables?.map((t, i) => (
                        <span key={`table-${i}`} className="bg-emerald-900/30 text-emerald-200 px-2 py-0.5 rounded border border-emerald-700">
                          <Table size={10} className="inline mr-1" /> {t}
                        </span>
                      ))}
                      {slide.images?.map((img, i) => (
                        <span key={`img-${i}`} className="bg-blue-900/30 text-blue-200 px-2 py-0.5 rounded border border-blue-700">
                          <ImageIcon size={10} className="inline mr-1" /> {img}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddSlide} className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-800/60 flex items-center gap-1">
              <Plus size={12} /> Add Slide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}