"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  Download,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callAiWithFallback } from "@/lib/ai";
import mammoth from "mammoth";
import PptxGenJS from "pptxgenjs";

const MAX_FILES = 5;

interface SlideContent {
  title: string;
  bullets: string[];
  figurePrompt?: string; // prompt for AI image generation (optional)
}

export default function PptGenerator() {
  const { state } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"upload" | "generate">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pptxBase64, setPptxBase64] = useState<string | null>(null); // base64 PPTX
  const [figurePrompts, setFigurePrompts] = useState<string[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }
    setFiles(selected);
    setMode("upload");
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || "";
  };

  const generateFigurePrompt = async (slideTitle: string, bullets: string[]) => {
    const prompt = `Generate a concise AI-image prompt (max 2 sentences) for a figure illustrating the following slide content: Title: "${slideTitle}", Bullets: ${JSON.stringify(bullets)}. Return only the prompt text, no markdown, no extra commentary.`;
    try {
      const response = await callAiWithFallback(prompt, { searchEnabled: false });
      return response.trim();
    } catch {
      return "";
    }
  };

  const generateSlides = async () => {
    if (files.length === 0) {
      setError("Please upload or provide slide content");
      return;
    }
    setLoading(true);
    setError(null);
    setFigurePrompts([]);
    try {
      let slideContents: SlideContent[] = [];

      // Process uploaded files
      if (mode === "upload") {
        slideContents = await Promise.all(
          files.map(async (file) => {
            let text = "";
            if (file.name.endsWith(".docx")) {
              text = await extractTextFromDocx(file);
            } else {
              // PDF: placeholder - could integrate pdf-parse later
              text = `Content from ${file.name}. PDF text extraction not yet configured.`;
            }
            // Split text into title and bullets (simple heuristic: first line as title, rest as bullets)
            const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
            const title = lines[0] || "Uploaded Content";
            const bullets = lines.slice(1).slice(0, 3); // up to 3 bullet points
            // Generate figure prompt for this slide
            const figurePrompt = await generateFigurePrompt(title, bullets);
            return { title, bullets, figurePrompt };
          })
        );
      } else {
        // Generate slides using AI based on user query
        const prompt = `Generate a concise 5-slide PowerPoint outline on the topic: ${state.searchQuery || "research topic"}. For each slide provide a title and 3 bullet points. Return JSON array of objects with title and bullets.`;
        const aiResponse = await callAiWithFallback(prompt, { searchEnabled: false });
        try {
          const parsed = JSON.parse(aiResponse);
          if (Array.isArray(parsed)) {
            slideContents = parsed.map((s: any) => ({
              title: s.title || "Slide",
              bullets: s.bullets || [],
            }));
          }
        } catch {
          // fallback
          slideContents = [
            { title: "Introduction", bullets: ["Background"] },
            { title: "Methods", bullets: ["Study design"] },
            { title: "Results", bullets: ["Key findings"] },
            { title: "Discussion", bullets: ["Interpretation"] },
            { title: "Conclusion", bullets: ["Future work"] },
          ];
        }
      }

      // Build figure prompts for each slide (if not already set)
      if (mode === "upload") {
        setFigurePrompts(slideContents.map((s) => s.figurePrompt || ""));
      }

      // Build PPTX using pptxgenjs
      const pptxGen = new PptxGenJS({});
      slideContents.forEach((sc, i) => {
        const slide = pptxGen.addSlide();
        slide.addText(sc.title, { x: 1, y: 1, fontSize: 24 });
        let y = 3;
        sc.bullets.forEach((b) => {
          slide.addText(`• ${b}`, { x: 1, y, fontSize: 16 });
          y += 1;
        });
        // Add figure placeholder with prompt text
        const figureText = sc.figurePrompt
          ? `[Figure: ${sc.figurePrompt}]`
          : "[Figure placeholder]";
        slide.addText(figureText, { x: 1, y: y + 1, fontSize: 12, color: "999999" });
      });

      // Generate download blob
      const blob = await pptxGen.writeBuffer({ bookType: "pptx" });
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string || "");
        reader.readAsDataURL(blob);
      });
      setPptxBase64(base64);
      setLoading(false);
    } catch (err: any) {
      console.error("PPT generation error:", err);
      setError(err.message || "Failed to generate PPT");
      setLoading(false);
    }
  };

  const downloadPptx = () => {
    if (!pptxBase64) return;
    const link = document.createElement("a");
    link.href = pptxBase64;
    link.download = "generated-pptx.pptx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {mode === "upload" ? "PPT Generator" : "Generate PPT with AI"}
          </h2>
          <button
            onClick={() => setMode((m) => (m === "upload" ? "generate" : "upload"))}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded disabled:opacity-50"
          >
            {mode === "upload" ? "Generate with AI" : "Upload documents"}
          </button>
        </div>

        {/* Upload mode */}
        {mode === "upload" && (
          <div>
            <p className="text-blue-300 mb-2">
              Upload up to {MAX_FILES} documents (docx or pdf)
            </p>
            <input
              type="file"
              multiple
              accept=".docx,.pdf"
              onChange={handleFileSelect}
              className="bg-blue-950 border border-blue-800 text-white rounded px-4 py-2.5 flex items-center gap-2"
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>
        )}

        {/* AI generate mode */}
        {mode === "generate" && (
          <div>
            <p className="text-blue-300 mb-2">
              Enter a research topic or use the current search query:
            </p>
            <p className="mt-2 font-mono text-sm text-blue-400">
              {state.searchQuery || "—"}
            </p>
            <button
              onClick={generateSlides}
              disabled={loading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate Slides"}
            </button>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        )}

        {/* Result */}
        {pptxBase64 && (
          <div>
            <p className="text-green-400 mb-2">PPTX generated successfully</p>
            <button onClick={downloadPptx} className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded">
              Download PPTX
            </button>
            <p className="text-sm text-blue-400 mt-2">
              Generated {mode === "upload" ? "from uploaded documents" : "using AI prompts"}.
            </p>
            {/* Display figure prompts */}
            {figurePrompts.length > 0 && (
              <div className="mt-4 p-4 bg-gray-800 text-white rounded-lg text-sm overflow-y-auto">
                <pre className="whitespace-pre-wrap">
                  {figurePrompts.map((p, i) => `Slide ${i + 1}: ${p}`).join("\n")}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}