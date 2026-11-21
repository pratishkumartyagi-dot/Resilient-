"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Sparkles, Save, RotateCcw, Download, FileText, BookOpen, ChevronRight,
  Loader2, CircleHelp, X, Copy, Edit2, Check, CheckCircle2, ClipboardCheck,
  BarChart3, Table, Image, Layout, PenTool, Eye, MessageSquare, Brain,
  Zap, RefreshCw, FileCode, Palette, Type, Layers, Search, Trash2,
  ArrowUp, ArrowDown, GripVertical, Settings, Shield, Star, AlertCircle
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { callAiWithFallback, type AICallOptions } from "@/lib/ai";
import { downloadPPTX } from "@/lib/exporters";
import { marked } from "marked";

const PREMIUM_COLOR_SCHEMES = [
  { name: "Deep Ocean", bg: "0f172a", accent: "0ea5e9", text: "f8fafc", secondary: "64748b" },
  { name: "Forest Canopy", bg: "052e16", accent: "22c55e", text: "f0fdf4", secondary: "86efac" },
  { name: "Royal Purple", bg: "1e1b4b", accent: "a855f7", text: "faf5ff", secondary: "c4b5fd" },
  { name: "Crimson Gold", bg: "450a0a", accent: "f97316", text: "fff7ed", secondary: "fdba74" },
  { name: "Slate Professional", bg: "0f172a", accent: "64748b", text: "f1f5f9", secondary: "94a3b8" },
  { name: "Midnight Teal", bg: "042f2e", accent: "14b8a6", text: "f0fdfa", secondary: "5eead4" },
];

interface SlideContent {
  id: string;
  slideNumber: number;
  title: string;
  content: string[];
  visualSuggestion: VisualSuggestion | null;
  speakerNotes: string;
  layout: "title" | "content" | "two-column" | "chart" | "table" | "image" | "quote" | "section-header";
  editable: boolean;
}

interface VisualSuggestion {
  type: "chart" | "graph" | "table" | "infographic" | "timeline" | "comparison" | "process" | "diagram";
  description: string;
  dataHint: string;
  priority: "high" | "medium" | "low";
  rationale: string;
}

interface PptGenerationState {
  topic: string;
  slides: SlideContent[];
  currentStep: "input" | "generating" | "review" | "refining" | "complete";
  colorScheme: typeof PREMIUM_COLOR_SCHEMES[0];
  reviewPass: ReviewResult | null;
  generationProgress: { current: number; total: number; status: string };
}

interface ReviewResult {
  score: number;
  issues: ReviewIssue[];
  suggestions: string[];
  approved: boolean;
}

interface ReviewIssue {
  slideId: string;
  type: "accuracy" | "clarity" | "design" | "storytelling" | "formatting";
  severity: "critical" | "warning" | "info";
  message: string;
  fixSuggestion: string;
}

const SECTION_HEADERS = [
  { id: "title", label: "Title Slide", required: true },
  { id: "agenda", label: "Agenda / Overview", required: true },
  { id: "introduction", label: "Introduction", required: true },
  { id: "background", label: "Background / Literature Review", required: false },
  { id: "methodology", label: "Methodology", required: false },
  { id: "results", label: "Key Findings / Results", required: true },
  { id: "discussion", label: "Discussion / Analysis", required: true },
  { id: "conclusions", label: "Conclusions", required: true },
  { id: "recommendations", label: "Recommendations", required: false },
  { id: "references", label: "References", required: false },
  { id: "closing", label: "Closing / Q&A", required: true },
];

export default function PptGenerator() {
  const { state, dispatch } = useApp();

  const [generationState, setGenerationState] = useState<PptGenerationState>({
    topic: "",
    slides: [],
    currentStep: "input",
    colorScheme: PREMIUM_COLOR_SCHEMES[0],
    reviewPass: null,
    generationProgress: { current: 0, total: 0, status: "" },
  });

  const [selectedSections, setSelectedSections] = useState<string[]>(
    SECTION_HEADERS.filter(s => s.required).map(s => s.id)
  );
  const [customSections, setCustomSections] = useState<Array<{id: string; label: string}>>([]);
  const [includeSpeakerNotes, setIncludeSpeakerNotes] = useState(true);
  const [includeVisualSuggestions, setIncludeVisualSuggestions] = useState(true);
  const [slideCount, setSlideCount] = useState(12);
  const [audience, setAudience] = useState("academic");
  const [tone, setTone] = useState("professional");
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editedSlide, setEditedSlide] = useState<SlideContent | null>(null);

  const callAi = useCallback(async (prompt: string): Promise<string> => {
    const searchOptions: AICallOptions = {
      searchEnabled: true,
      searchQuery: state.searchQuery || generationState.topic,
    };
    return callAiWithFallback(prompt, searchOptions);
  }, [state.searchQuery, generationState.topic]);

  const handleGenerate = async () => {
    if (!generationState.topic.trim()) {
      alert("Please enter a presentation topic.");
      return;
    }

    const sections = [...selectedSections, ...customSections.map(s => s.id)];
    const totalSlides = Math.max(sections.length, slideCount);

    setGenerationState(prev => ({
      ...prev,
      currentStep: "generating",
      slides: [],
      generationProgress: { current: 0, total: totalSlides, status: "Planning presentation structure..." },
    }));

    try {
      // Step 1: Generate presentation outline
      const outlinePrompt = buildOutlinePrompt(
        generationState.topic,
        sections,
        totalSlides,
        audience,
        tone
      );
      const outlineText = await callAi(outlinePrompt);
      const outline = parseOutline(outlineText, sections, totalSlides);

      // Step 2: Generate each slide individually
      const slides: SlideContent[] = [];
      for (let i = 0; i < outline.length; i++) {
        const slidePlan = outline[i];
        setGenerationState(prev => ({
          ...prev,
          generationProgress: {
            current: i + 1,
            total: totalSlides,
            status: `Generating slide ${i + 1}: ${slidePlan.title}...`,
          },
        }));

        const slide = await generateSlide(
          slidePlan,
          generationState.topic,
          callAi,
          includeVisualSuggestions,
          includeSpeakerNotes,
          i + 1,
          generationState.colorScheme
        );
        slides.push(slide);
      }

      // Step 3: Run review pass
      setGenerationState(prev => ({
        ...prev,
        generationProgress: { current: totalSlides, total: totalSlides, status: "Running review pass..." },
      }));

      const review = await runReviewPass(slides, generationState.topic, callAi);

      setGenerationState(prev => ({
        ...prev,
        slides,
        currentStep: "review",
        reviewPass: review,
        generationProgress: { current: totalSlides, total: totalSlides, status: "Complete!" },
      }));
    } catch (err: any) {
      console.error("PPT generation failed:", err);
      alert(`Generation failed: ${err?.message || "Unknown error"}`);
      setGenerationState(prev => ({ ...prev, currentStep: "input" }));
    }
  };

  const handleRegenerateSlide = async (slideId: string) => {
    const slide = generationState.slides.find(s => s.id === slideId);
    if (!slide) return;

    setGenerationState(prev => ({
      ...prev,
      generationProgress: { current: 0, total: 1, status: `Regenerating slide ${slide.slideNumber}...` },
    }));

    try {
      const newSlide = await generateSlide(
        { title: slide.title, layout: slide.layout, keyPoints: slide.content },
        generationState.topic,
        callAi,
        includeVisualSuggestions,
        includeSpeakerNotes,
        slide.slideNumber,
        generationState.colorScheme
      );

      setGenerationState(prev => ({
        ...prev,
        slides: prev.slides.map(s => s.id === slideId ? newSlide : s),
        generationProgress: { current: 1, total: 1, status: "Regenerated!" },
      }));
    } catch (err: any) {
      alert(`Regeneration failed: ${err?.message}`);
    }
  };

  const handleApplyReviewFixes = async () => {
    if (!generationState.reviewPass) return;

    setGenerationState(prev => ({
      ...prev,
      currentStep: "refining",
      generationProgress: { current: 0, total: generationState.slides.length, status: "Applying review fixes..." },
    }));

    try {
      const fixedSlides: SlideContent[] = [];
      for (let i = 0; i < generationState.slides.length; i++) {
        const slide = generationState.slides[i];
        const issues = generationState.reviewPass!.issues.filter(iss => iss.slideId === slide.id);
        
        if (issues.length === 0) {
          fixedSlides.push(slide);
          continue;
        }

        setGenerationState(prev => ({
          ...prev,
          generationProgress: { current: i + 1, total: generationState.slides.length, status: `Fixing slide ${slide.slideNumber}...` },
        }));

        const fixedSlide = await applyFixesToSlide(slide, issues, generationState.topic, callAi);
        fixedSlides.push(fixedSlide);
      }

      const newReview = await runReviewPass(fixedSlides, generationState.topic, callAi);

      setGenerationState(prev => ({
        ...prev,
        slides: fixedSlides,
        reviewPass: newReview,
        currentStep: "review",
        generationProgress: { current: generationState.slides.length, total: generationState.slides.length, status: "Review fixes applied!" },
      }));
    } catch (err: any) {
      alert(`Review fix failed: ${err?.message}`);
      setGenerationState(prev => ({ ...prev, currentStep: "review" }));
    }
  };

  const handleExportPptx = async () => {
    const markdown = buildMarkdownFromSlides(generationState.slides, generationState.colorScheme);
    try {
      await downloadPPTX(markdown, `${generationState.topic.replace(/[^a-z0-9]/gi, "_")}_presentation.pptx`);
    } catch (err: any) {
      alert(`Export failed: ${err?.message}`);
    }
  };

  const handleStartEdit = (slide: SlideContent) => {
    setEditingSlideId(slide.id);
    setEditedSlide({ ...slide });
  };

  const handleSaveEdit = () => {
    if (!editingSlideId || !editedSlide) return;
    setGenerationState(prev => ({
      ...prev,
      slides: prev.slides.map(s => s.id === editingSlideId ? editedSlide : s),
    }));
    setEditingSlideId(null);
    setEditedSlide(null);
  };

  const handleCancelEdit = () => {
    setEditingSlideId(null);
    setEditedSlide(null);
  };

  const handleReorderSlides = (fromIndex: number, toIndex: number) => {
    const newSlides = [...generationState.slides];
    const [moved] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, moved);
    setGenerationState(prev => ({
      ...prev,
      slides: newSlides.map((s, i) => ({ ...s, slideNumber: i + 1 })),
    }));
  };

  const handleAddCustomSection = () => {
    const label = prompt("Enter custom section name:");
    if (label) {
      const id = label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      setCustomSections(prev => [...prev, { id, label }]);
      setSelectedSections(prev => [...prev, id]);
    }
  };

  // Render based on current step
  if (generationState.currentStep === "input") {
    return renderInputStep();
  }

  if (generationState.currentStep === "generating") {
    return renderGeneratingStep();
  }

  return renderReviewStep();

  // ============================================================
  // INPUT STEP
  // ============================================================
  function renderInputStep() {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Layout size={24} className="text-[#0a1a3a]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">PPT Generator Pipeline</h2>
              <p className="text-sm text-blue-300">Create premium, editable PowerPoint presentations with AI</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Presentation Topic</label>
              <textarea
                value={generationState.topic}
                onChange={(e) => setGenerationState(prev => ({ ...prev, topic: e.target.value }))}
                placeholder="e.g., Impact of Machine Learning on Clinical Trial Design, or Cardiovascular-Kidney-Metabolic Syndrome: Evidence Review"
                rows={3}
                className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg px-4 py-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Target Audience</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="academic">Academic / Research</option>
                  <option value="clinical">Clinical / Medical</option>
                  <option value="industry">Industry / Business</option>
                  <option value="general">General Audience</option>
                  <option value="students">Students / Education</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="professional">Professional</option>
                  <option value="academic">Academic</option>
                  <option value="persuasive">Persuasive</option>
                  <option value="educational">Educational</option>
                  <option value="executive">Executive Summary</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Number of Slides</label>
              <input
                type="number"
                value={slideCount}
                onChange={(e) => setSlideCount(Math.max(5, Math.min(50, parseInt(e.target.value) || 12)))}
                min="5"
                max="50"
                className="w-32 bg-blue-950 border border-blue-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Color Scheme</label>
              <div className="flex flex-wrap gap-3">
                {PREMIUM_COLOR_SCHEMES.map((scheme) => (
                  <button
                    key={scheme.name}
                    onClick={() => setGenerationState(prev => ({ ...prev, colorScheme: scheme }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                      generationState.colorScheme.name === scheme.name
                        ? "border-yellow-500 shadow-lg shadow-yellow-500/20"
                        : "border-blue-800 hover:border-blue-600"
                    }`}
                    style={{ backgroundColor: `#${scheme.bg}` }}
                  >
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: `#${scheme.accent}` }} />
                    <span className="text-sm font-medium text-white">{scheme.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-blue-800 pt-4">
              <h3 className="text-sm font-medium text-blue-200 mb-3">Presentation Sections</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {SECTION_HEADERS.map((section) => (
                  <label key={section.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(section.id)}
                      onChange={(e) => setSelectedSections(prev =>
                        e.target.checked ? [...prev, section.id] : prev.filter(s => s !== section.id)
                      )}
                      className="w-3.5 h-3.5 rounded border-blue-600 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-xs text-blue-200">{section.label}</span>
                    {section.required && <span className="text-[10px] text-yellow-400">*</span>}
                  </label>
                ))}
                <button
                  onClick={handleAddCustomSection}
                  className="flex items-center gap-1.5 text-xs bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
                >
                  <span>+ Custom</span>
                </button>
              </div>
              {customSections.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customSections.map((s) => (
                    <span key={s.id} className="text-xs bg-purple-900/50 text-purple-200 px-2 py-1 rounded border border-purple-800 flex items-center gap-1">
                      {s.label}
                      <button onClick={() => {
                        setCustomSections(prev => prev.filter(c => c.id !== s.id));
                        setSelectedSections(prev => prev.filter(id => id !== s.id));
                      }} className="text-purple-300 hover:text-purple-200">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVisualSuggestions}
                  onChange={(e) => setIncludeVisualSuggestions(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-blue-600 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm text-blue-200">Include visual suggestions (charts, graphs, tables, infographics)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSpeakerNotes}
                  onChange={(e) => setIncludeSpeakerNotes(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-blue-600 bg-blue-950 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm text-blue-200">Generate speaker notes for every slide</span>
              </label>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-[#0a1a3a] font-bold px-6 py-3 rounded-lg flex items-center justify-center gap-2"
            >
              <Sparkles size={20} />
              Generate Presentation
            </button>
          </div>
        </div>

        <div className="bg-blue-950/40 border border-blue-900/40 rounded-lg p-4 text-xs text-blue-300">
          <h4 className="font-semibold text-blue-200 mb-2">Pipeline Stages:</h4>
          <ol className="space-y-1 list-decimal list-inside">
            <li><strong>Structure Planning:</strong> AI creates optimal slide outline based on topic and sections</li>
            <li><strong>Slide Generation:</strong> Each slide generated individually with premium design</li>
            <li><strong>Visual Suggestions:</strong> Charts, graphs, tables, infographics recommended per slide</li>
            <li><strong>Speaker Notes:</strong> Natural, conversational notes with transitions and examples</li>
            <li><strong>Review Pass:</strong> Accuracy, clarity, design consistency, storytelling review</li>
            <li><strong>Refinement:</strong> Auto-fix issues, improve transitions, prepare final .pptx</li>
          </ol>
        </div>
      </div>
    );
  }

  // ============================================================
  // GENERATING STEP
  // ============================================================
  function renderGeneratingStep() {
    const { current, total, status } = generationState.generationProgress;
    const progress = total > 0 ? (current / total) * 100 : 0;

    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-24 h-24 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <h2 className="text-xl font-bold text-white mb-2">Generating Presentation...</h2>
        <p className="text-blue-300 mb-6">{status}</p>
        <div className="w-full bg-blue-900 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-blue-400 mt-2">{current} / {total} slides</p>
      </div>
    );
  }

  // ============================================================
  // REVIEW & REFINEMENT STEP
  // ============================================================
  function renderReviewStep() {
    const { slides, reviewPass, colorScheme } = generationState;
    const hasCriticalIssues = reviewPass?.issues.some(i => i.severity === "critical") ?? false;

    return (
      <div className="space-y-6">
        {/* Header with progress */}
        <div className="bg-[#0a1530] border border-blue-900/50 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
                <CheckCircle2 size={20} className="text-[#0a1a3a]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{generationState.topic}</h2>
                <p className="text-xs text-blue-300">{slides.length} slides • {reviewPass ? `Score: ${reviewPass.score}/100` : "No review yet"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={colorScheme.name}
                onChange={(e) => {
                  const scheme = PREMIUM_COLOR_SCHEMES.find(s => s.name === e.target.value);
                  if (scheme) setGenerationState(prev => ({ ...prev, colorScheme: scheme }));
                }}
                className="bg-blue-950 border border-blue-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                {PREMIUM_COLOR_SCHEMES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <button
                onClick={handleExportPptx}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Download size={16} />
                Download .pptx
              </button>
            </div>
          </div>
        </div>

        {/* Review Summary */}
        {reviewPass && (
          <div className={`bg-[#0a1530] border rounded-lg p-4 ${
            hasCriticalIssues ? "border-red-500/50" : "border-green-500/50"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Shield size={16} className={hasCriticalIssues ? "text-red-400" : "text-green-400"} />
                Review Pass Results
              </h3>
              <span className={`text-lg font-bold ${hasCriticalIssues ? "text-red-400" : "text-green-400"}`}>
                {reviewPass.score}/100
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm mb-3">
              <div className="bg-red-900/30 p-2 rounded">
                <div className="text-red-300 font-bold">{reviewPass.issues.filter(i => i.severity === "critical").length}</div>
                <div className="text-red-500">Critical</div>
              </div>
              <div className="bg-yellow-900/30 p-2 rounded">
                <div className="text-yellow-300 font-bold">{reviewPass.issues.filter(i => i.severity === "warning").length}</div>
                <div className="text-yellow-500">Warnings</div>
              </div>
              <div className="bg-blue-900/30 p-2 rounded">
                <div className="text-blue-300 font-bold">{reviewPass.issues.filter(i => i.severity === "info").length}</div>
                <div className="text-blue-500">Info</div>
              </div>
              <div className="bg-green-900/30 p-2 rounded">
                <div className="text-green-300 font-bold">{reviewPass.suggestions.length}</div>
                <div className="text-green-500">Suggestions</div>
              </div>
            </div>
            {!reviewPass.approved && hasCriticalIssues && (
              <button
                onClick={handleApplyReviewFixes}
                className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-4 py-2 rounded-lg flex items-center gap-2 mx-auto"
              >
                <RefreshCw size={16} />
                Auto-Fix All Issues
              </button>
            )}
            {reviewPass.approved && (
              <div className="text-center text-green-300 text-sm">
                ✓ All critical issues resolved. Presentation ready for export.
              </div>
            )}
          </div>
        )}

        {/* Slides List */}
        <div className="space-y-3">
          {slides.map((slide, index) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              index={index}
              colorScheme={colorScheme}
              editingSlideId={editingSlideId}
              editedSlide={editedSlide}
              reviewPass={reviewPass}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onEditChange={(updatedSlide) => setEditedSlide(updatedSlide)}
              onRegenerate={handleRegenerateSlide}
              onMoveUp={() => index > 0 && handleReorderSlides(index, index - 1)}
              onMoveDown={() => index < slides.length - 1 && handleReorderSlides(index, index + 1)}
              onDelete={() => {
                if (confirm(`Delete slide ${slide.slideNumber}?`)) {
                  setGenerationState(prev => ({
                    ...prev,
                    slides: prev.slides.filter((_, i) => i !== index).map((s, i) => ({ ...s, slideNumber: i + 1 }))
                  }));
                }
              }}
            />
          ))}
        </div>

        {/* Add slide button */}
        <button
          onClick={() => {
            const newSlide: SlideContent = {
              id: `slide-${Date.now()}`,
              slideNumber: slides.length + 1,
              title: "New Slide",
              content: ["Add your content here"],
              visualSuggestion: null,
              speakerNotes: "",
              layout: "content",
              editable: true,
            };
            setGenerationState(prev => ({
              ...prev,
              slides: [...prev.slides, newSlide],
            }));
          }}
          className="w-full border-2 border-dashed border-blue-700 rounded-lg py-4 text-blue-300 hover:border-yellow-500 hover:text-yellow-300 transition-colors flex items-center justify-center gap-2"
        >
          <span>+ Add Slide</span>
        </button>
      </div>
    );
  }
}

// ============================================================
// SLIDE CARD COMPONENT
// ============================================================
interface SlideCardProps {
  slide: SlideContent;
  index: number;
  colorScheme: typeof PREMIUM_COLOR_SCHEMES[0];
  editingSlideId: string | null;
  editedSlide: SlideContent | null;
  reviewPass: ReviewResult | null;
  onStartEdit: (slide: SlideContent) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (slide: SlideContent) => void;
  onRegenerate: (slideId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function SlideCard({
  slide,
  index,
  colorScheme,
  editingSlideId,
  editedSlide,
  reviewPass,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
  onRegenerate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: SlideCardProps) {
  const isEditing = editingSlideId === slide.id;
  const currentSlide = isEditing ? editedSlide : slide;

  if (!currentSlide) return null;

  const issues = reviewPass?.issues.filter(i => i.slideId === slide.id) || [];
  const hasCritical = issues.some(i => i.severity === "critical");

  return (
    <div className={`bg-[#0a1530] border rounded-lg overflow-hidden transition-colors ${
      hasCritical ? "border-red-500/50" : "border-blue-800"
    }`} style={{ borderLeft: `4px solid #${colorScheme.accent}` }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-900 rounded text-xs font-bold text-blue-300 flex-shrink-0">
              {slide.slideNumber}
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-white truncate">{currentSlide.title}</h4>
              <p className="text-xs text-blue-400 capitalize">{currentSlide.layout} layout</p>
            </div>
            {currentSlide.visualSuggestion && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-900/50 text-purple-200 text-[10px] rounded border border-purple-800">
                <BarChart3 size={10} />
                {currentSlide.visualSuggestion.type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onStartEdit(slide)}
              disabled={isEditing}
              className="p-1.5 text-blue-300 hover:text-yellow-400 hover:bg-blue-800 rounded transition-colors disabled:opacity-50"
              title="Edit"
            >
              <PenTool size={14} />
            </button>
            <button
              onClick={() => onRegenerate(slide.id)}
              className="p-1.5 text-blue-300 hover:text-green-400 hover:bg-blue-800 rounded transition-colors"
              title="Regenerate"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1.5 text-blue-300 hover:text-blue-200 hover:bg-blue-800 rounded transition-colors disabled:opacity-30"
              title="Move Up"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={onMoveDown}
              className="p-1.5 text-blue-300 hover:text-blue-200 hover:bg-blue-800 rounded transition-colors"
              title="Move Down"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-blue-300 hover:text-red-400 hover:bg-blue-800 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3 border-t border-blue-800 pt-3">
            <input
              type="text"
              value={currentSlide.title}
              onChange={(e) => onEditChange({ ...currentSlide, title: e.target.value })}
              className="w-full bg-blue-950 border border-blue-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <textarea
              value={currentSlide.content.join("\n")}
              onChange={(e) => onEditChange({ ...currentSlide, content: e.target.value.split("\n").filter(l => l.trim()) })}
              rows={4}
              className="w-full bg-blue-950 border border-blue-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
              placeholder="One bullet point per line"
            />
            {currentSlide.speakerNotes && (
              <textarea
                value={currentSlide.speakerNotes}
                onChange={(e) => onEditChange({ ...currentSlide, speakerNotes: e.target.value })}
                rows={3}
                className="w-full bg-blue-950 border border-blue-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                placeholder="Speaker notes..."
              />
            )}
            <div className="flex gap-2">
              <button onClick={onSaveEdit} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium">Save</button>
              <button onClick={onCancelEdit} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 text-sm text-blue-100 mb-3">
              {currentSlide.content.map((point, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-yellow-400 flex-shrink-0">•</span>
                  <span className="truncate">{point}</span>
                </div>
              ))}
            </div>

            {currentSlide.visualSuggestion && (
              <div className="bg-purple-900/30 border border-purple-800/50 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 size={14} className="text-purple-300" />
                  <span className="font-medium text-purple-200 capitalize">{currentSlide.visualSuggestion.type} Suggestion</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    currentSlide.visualSuggestion.priority === "high" ? "bg-red-900/50 text-red-300" :
                    currentSlide.visualSuggestion.priority === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                    "bg-blue-900/50 text-blue-300"
                  }`}>
                    {currentSlide.visualSuggestion.priority}
                  </span>
                </div>
                <p className="text-xs text-purple-300">{currentSlide.visualSuggestion.description}</p>
                <p className="text-[10px] text-purple-500 mt-1">Data needed: {currentSlide.visualSuggestion.dataHint}</p>
                <p className="text-[10px] text-purple-500 mt-1 italic">{currentSlide.visualSuggestion.rationale}</p>
              </div>
            )}

            {currentSlide.speakerNotes && (
              <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-green-300" />
                  <span className="font-medium text-green-200">Speaker Notes</span>
                </div>
                <p className="text-xs text-green-300 whitespace-pre-wrap">{currentSlide.speakerNotes}</p>
              </div>
            )}

            {issues.length > 0 && (
              <div className="border-t border-blue-800 pt-3 mt-3">
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <AlertCircle size={12} className="text-red-400" />
                  <span className="font-medium text-red-300">Review Issues ({issues.length})</span>
                </div>
                <div className="space-y-1">
                  {issues.map((issue, i) => (
                    <div key={i} className={`text-[10px] px-2 py-1 rounded border-l-2 ${
                      issue.severity === "critical" ? "bg-red-900/30 border-red-500 text-red-200" :
                      issue.severity === "warning" ? "bg-yellow-900/30 border-yellow-500 text-yellow-200" :
                      "bg-blue-900/30 border-blue-500 text-blue-200"
                    }`}>
                      <div className="font-medium capitalize">{issue.type}</div>
                      <div>{issue.message}</div>
                      <div className="italic mt-0.5">→ {issue.fixSuggestion}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AI PROMPT BUILDERS
// ============================================================
function buildOutlinePrompt(
  topic: string,
  sections: string[],
  slideCount: number,
  audience: string,
  tone: string
): string {
  return `You are an expert presentation designer creating a premium PowerPoint outline.

TOPIC: "${topic}"
TARGET AUDIENCE: ${audience}
TONE: ${tone}
TARGET SLIDE COUNT: ${slideCount}
REQUIRED SECTIONS: ${sections.join(", ")}

TASK: Create a detailed slide-by-slide outline for a professional presentation. Each slide must have:
1. Slide number
2. Title
3. Layout type (title, content, two-column, chart, table, image, quote, section-header)
4. 3-6 key bullet points
5. Visual suggestion (type: chart/graph/table/infographic/timeline/comparison/process/diagram, description, data needed, rationale, priority)
6. Speaker notes guidance

FORMAT: Return as structured JSON array. Example:
[
  {
    "slideNumber": 1,
    "title": "Presentation Title",
    "layout": "title",
    "keyPoints": ["Subtitle", "Presenter name", "Date", "Institution"],
    "visualSuggestion": null,
    "speakerNotesGuidance": "Welcome the audience, introduce yourself and the topic"
  }
]

Ensure logical flow, strong storytelling arc, and visual variety. The first slide must be a title slide, the last a closing/Q&A slide.`;
}

function parseOutline(text: string, sections: string[], slideCount: number) {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((slide: any, i: number) => ({
        ...slide,
        slideNumber: slide.slideNumber || i + 1,
      }));
    }
  } catch {}
  // Fallback: create basic structure from sections
  return sections.map((section, i) => ({
    slideNumber: i + 1,
    title: section.charAt(0).toUpperCase() + section.slice(1).replace(/_/g, " "),
    layout: i === 0 ? "title" : i === sections.length - 1 ? "content" : "content",
    keyPoints: [`Key point 1 for ${section}`, `Key point 2 for ${section}`],
    visualSuggestion: null,
    speakerNotesGuidance: `Explain ${section}`,
  }));
}

async function generateSlide(
  slidePlan: any,
  topic: string,
  callAi: (prompt: string) => Promise<string>,
  includeVisuals: boolean,
  includeNotes: boolean,
  slideNumber: number,
  colorScheme: typeof PREMIUM_COLOR_SCHEMES[0]
): Promise<SlideContent> {
  const visualPrompt = includeVisuals ? `
VISUAL SUGGESTION REQUIRED: For this slide, recommend the BEST visual element:
- Type: chart | graph | table | infographic | timeline | comparison | process | diagram
- Description: What the visual should show
- Data Hint: What data the user would need to provide
- Rationale: Why this visual improves understanding
- Priority: high | medium | low` : "VISUAL SUGGESTION: null (visuals disabled)";

  const notesPrompt = includeNotes ? `
SPEAKER NOTES REQUIRED: Write natural, conversational speaker notes that:
- Explain the key message in simple language
- Add smooth transitions from previous slide
- Include relevant examples or analogies
- Sound confident and engaging
- Time estimate: ~1-2 minutes per slide` : "SPEAKER NOTES: empty string (notes disabled)";

  const prompt = `You are a premium presentation designer creating individual slides for a professional PowerPoint.

TOPIC: "${topic}"
SLIDE NUMBER: ${slideNumber}
SLIDE TITLE: ${slidePlan.title}
LAYOUT: ${slidePlan.layout || "content"}
KEY POINTS TO COVER: ${Array.isArray(slidePlan.keyPoints) ? slidePlan.keyPoints.join("; ") : slidePlan.keyPoints}
COLOR SCHEME: ${colorScheme.name} (bg: #${colorScheme.bg}, accent: #${colorScheme.accent})

${visualPrompt}
${notesPrompt}

REQUIREMENTS:
- Content must be specific to the topic, not generic
- Use professional, precise language
- Each bullet point should be substantial (1-2 sentences max)
- Visual suggestions must be data-driven and realistic
- Speaker notes must be conversational, not robotic

OUTPUT FORMAT (JSON only):
{
  "title": "Slide Title",
  "content": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4"],
  "visualSuggestion": { "type": "chart", "description": "...", "dataHint": "...", "rationale": "...", "priority": "high" } | null,
  "speakerNotes": "Natural conversational notes...",
  "layout": "content"
}`;

  try {
    const response = await callAi(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        id: `slide-${slideNumber}-${Date.now()}`,
        slideNumber,
        title: parsed.title || slidePlan.title,
        content: parsed.content || slidePlan.keyPoints || [],
        visualSuggestion: parsed.visualSuggestion || null,
        speakerNotes: parsed.speakerNotes || "",
        layout: parsed.layout || slidePlan.layout || "content",
        editable: true,
      };
    }
  } catch (err) {
    console.error("Slide generation failed:", err);
  }

  // Fallback
  return {
    id: `slide-${slideNumber}-${Date.now()}`,
    slideNumber,
    title: slidePlan.title,
    content: Array.isArray(slidePlan.keyPoints) ? slidePlan.keyPoints : [`Content for ${slidePlan.title}`],
    visualSuggestion: null,
    speakerNotes: "",
    layout: slidePlan.layout || "content",
    editable: true,
  };
}

async function runReviewPass(
  slides: SlideContent[],
  topic: string,
  callAi: (prompt: string) => Promise<string>
): Promise<ReviewResult> {
  const slidesSummary = slides.map(s => 
    `Slide ${s.slideNumber}: ${s.title}\nLayout: ${s.layout}\nContent: ${s.content.join("; ")}\nVisual: ${s.visualSuggestion?.type || "none"}\nNotes: ${s.speakerNotes ? "yes" : "no"}`
  ).join("\n\n");

  const prompt = `You are an expert presentation reviewer conducting a comprehensive quality review.

TOPIC: "${topic}"
TOTAL SLIDES: ${slides.length}

SLIDES TO REVIEW:
${slidesSummary}

REVIEW CRITERIA (score each 0-100, overall = average):
1. ACCURACY: Factual correctness, no hallucinated data, claims grounded
2. CLARITY: Clear messaging, appropriate detail level, jargon explained
3. DESIGN CONSISTENCY: Logical layout progression, visual hierarchy, color scheme adherence
4. STORYTELLING: Narrative arc, smooth transitions, compelling structure
5. FORMATTING: Consistent bullet style, readable fonts, proper hierarchy

For each issue found, provide:
- slideId (use "slide-{number}")
- type: accuracy | clarity | design | storytelling | formatting
- severity: critical | warning | info
- message: specific description
- fixSuggestion: actionable fix

Also provide 3-5 general improvement suggestions.

OUTPUT FORMAT (JSON only):
{
  "score": 85,
  "issues": [
    { "slideId": "slide-3", "type": "clarity", "severity": "warning", "message": "...", "fixSuggestion": "..." }
  ],
  "suggestions": ["...", "..."],
  "approved": true
}`;

  try {
    const response = await callAi(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error("Review pass failed:", err);
  }

  return { score: 75, issues: [], suggestions: ["Review completed with basic checks"], approved: false };
}

async function applyFixesToSlide(
  slide: SlideContent,
  issues: ReviewIssue[],
  topic: string,
  callAi: (prompt: string) => Promise<string>
): Promise<SlideContent> {
  const issuesText = issues.map(i => `- [${i.severity.toUpperCase()}] ${i.type}: ${i.message} → Fix: ${i.fixSuggestion}`).join("\n");

  const prompt = `You are fixing a presentation slide based on review feedback.

TOPIC: "${topic}"
CURRENT SLIDE: ${slide.slideNumber} - ${slide.title}
LAYOUT: ${slide.layout}
CONTENT: ${slide.content.join("\n")}
VISUAL: ${slide.visualSuggestion ? JSON.stringify(slide.visualSuggestion) : "none"}
SPEAKER NOTES: ${slide.speakerNotes || "none"}

ISSUES TO FIX:
${issuesText}

REQUIREMENTS:
- Fix all issues while maintaining the slide's purpose
- Keep the same layout and visual suggestion type
- Improve clarity, accuracy, and flow
- Return the complete fixed slide

OUTPUT FORMAT (JSON only):
{
  "title": "...",
  "content": ["...", "..."],
  "visualSuggestion": {...} | null,
  "speakerNotes": "...",
  "layout": "..."
}`;

  try {
    const response = await callAi(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...slide,
        title: parsed.title || slide.title,
        content: parsed.content || slide.content,
        visualSuggestion: parsed.visualSuggestion !== undefined ? parsed.visualSuggestion : slide.visualSuggestion,
        speakerNotes: parsed.speakerNotes !== undefined ? parsed.speakerNotes : slide.speakerNotes,
        layout: parsed.layout || slide.layout,
      };
    }
  } catch (err) {
    console.error("Fix application failed:", err);
  }

  return slide;
}

function buildMarkdownFromSlides(slides: SlideContent[], colorScheme: typeof PREMIUM_COLOR_SCHEMES[0]): string {
  let markdown = `<!-- Color Scheme: ${colorScheme.name} (bg: #${colorScheme.bg}, accent: #${colorScheme.accent}) -->\n\n`;

  for (const slide of slides) {
    markdown += `## ${slide.title}\n\n`;
    
    for (const point of slide.content) {
      markdown += `- ${point}\n`;
    }
    markdown += "\n";

    if (slide.visualSuggestion) {
      markdown += `> **Visual Suggestion (${slide.visualSuggestion.type}):** ${slide.visualSuggestion.description}\n`;
      markdown += `> Data needed: ${slide.visualSuggestion.dataHint}\n`;
      markdown += `> Priority: ${slide.visualSuggestion.priority}\n\n`;
    }

    if (slide.speakerNotes) {
      markdown += `> **Speaker Notes:** ${slide.speakerNotes}\n\n`;
    }

    markdown += "---\n\n";
  }

  return markdown;
}