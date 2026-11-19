"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Sparkles, Save, RotateCcw, Download, FileText, BookOpen, ChevronRight,
  Loader2, CircleHelp, X, Copy, Edit2, Check, CheckCircle2, ClipboardCheck, Calculator,
  Upload, Search, Database, Zap, Table, BarChart2, ImageIcon, Settings,
  Trash2, FilePlus, Minus, Plus, Eye, EyeOff, Presentation
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { searchDatabases, DATABASE_IDS, type Paper } from "@/lib/database-apis";
import { callGemini } from "@/lib/ai";
import { callGroq } from "@/lib/ai";
import { generateLocal } from "@/lib/local-llm";
import { downloadPPTXWithAI, type NativePPTXOptions } from "@/lib/exporters";
import { expandQueryWithMesh } from "@/lib/mesh-expansion";

const SESSION_KEY = "ppt_generator_session";

export interface PPTGeneratorConfig {
  // Input mode
  inputMode: "research_area" | "files";
  // Research area mode
  researchArea: string;
  yearFrom: string;
  yearTo: string;
  databases: string[];
  // File mode
  uploadedFiles: File[];
  // Generation options
  numSlides: number;
  template: "academic" | "business" | "minimal" | "conference";
  tone: "professional" | "educational" | "concise" | "detailed";
  language: string;
  includeTitleSlide: boolean;
  includeTOC: boolean;
  includeReferences: boolean;
  // AI options
  provider: "gemini" | "groq" | "local";
  apiKey: string;
  // Advanced
  customInstructions: string;
  searchConceptBlocks: ConceptBlock[];
}

export interface ConceptBlock {
  id: string;
  label: string;
  role: "condition" | "predictor" | "outcome" | "design";
  required: boolean;
  terms: string[];
  meshTerms: string[];
  synonyms: string[];
  negated?: boolean;
}

export interface SearchStrategy {
  conceptBlocks: ConceptBlock[];
  pubmedQuery: string;
  europePmcQuery: string;
  crossrefQuery: string;
  generatedBy: "ai" | "manual";
  reasoning: string;
}

export interface SlidePlan {
  slideNumber: number;
  title: string;
  content: string;
  layout: "title" | "section" | "content" | "two-column" | "table" | "chart" | "image" | "references";
  chartType?: "bar" | "line" | "pie" | "scatter" | "forest" | "funnel";
  chartData?: any;
  tableData?: string[][];
  imagePrompt?: string;
  notes?: string;
}

export interface GeneratedSlide {
  slideNumber: number;
  title: string;
  content: string;
  layout: string;
  pptxSlideIndex: number;
}

interface PPTGeneratorState {
  config: PPTGeneratorConfig;
  status: "idle" | "searching" | "generating_strategy" | "generating_slides" | "enhancing" | "building_pptx" | "completed" | "error";
  stageMessage: string;
  papers: Paper[];
  searchStrategy: SearchStrategy | null;
  slidePlans: SlidePlan[];
  generatedSlides: GeneratedSlide[];
  error: string | null;
  progress: number;
  searchResults: { database: string; count: number; status: string }[];
}

const INITIAL_CONFIG: PPTGeneratorConfig = {
  inputMode: "research_area",
  researchArea: "",
  yearFrom: new Date().getFullYear() - 5 + "",
  yearTo: new Date().getFullYear() + "",
  databases: ["PubMed", "Europe PMC", "Crossref", "ClinicalTrials.gov", "bioRxiv", "medRxiv"],
  uploadedFiles: [],
  numSlides: 15,
  template: "academic",
  tone: "professional",
  language: "English",
  includeTitleSlide: true,
  includeTOC: true,
  includeReferences: true,
  provider: "gemini",
  apiKey: "",
  customInstructions: "",
  searchConceptBlocks: [],
};

const DATABASE_OPTIONS = [
  { id: "PubMed", name: "PubMed/MEDLINE", description: "Biomedical literature from NCBI" },
  { id: "Europe PMC", name: "Europe PMC", description: "Open access biomedical literature" },
  { id: "Crossref", name: "Crossref", description: "Scholarly metadata across publishers" },
  { id: "ClinicalTrials.gov", name: "ClinicalTrials.gov", description: "Clinical trial registrations" },
  { id: "bioRxiv", name: "bioRxiv", description: "Preprints in biology" },
  { id: "medRxiv", name: "medRxiv", description: "Preprints in health sciences" },
  { id: "OpenAIRE", name: "OpenAIRE", description: "European research outputs" },
  { id: "Zenodo", name: "Zenodo", description: "General research repository" },
  { id: "arXiv", name: "arXiv", description: "Preprints in physics, CS, math" },
];

const TEMPLATE_OPTIONS = [
  { value: "academic", label: "Academic", description: "Clean, professional for research presentations" },
  { value: "business", label: "Business", description: "Executive-style with strong visual hierarchy" },
  { value: "minimal", label: "Minimal", description: "Clean, distraction-free design" },
  { value: "conference", label: "Conference", description: "High-contrast, projector-friendly" },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "educational", label: "Educational" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];

function loadSession(): Partial<PPTGeneratorConfig> | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function saveSession(config: PPTGeneratorConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

function clearSession() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export default function PPTGenerator() {
  const { state, dispatch } = useApp();
  const apiKey = state.geminiApiKey || state.groqApiKey || "";
  const [config, setConfig] = useState<PPTGeneratorConfig>(() => {
    const saved = loadSession();
    return { ...INITIAL_CONFIG, ...saved, apiKey: apiKey || saved?.apiKey || "" };
  });
  const [genState, setGenState] = useState<PPTGeneratorState>({
    config: INITIAL_CONFIG,
    status: "idle",
    stageMessage: "",
    papers: [],
    searchStrategy: null,
    slidePlans: [],
    generatedSlides: [],
    error: null,
    progress: 0,
    searchResults: [],
  });
  const [showConceptBlocks, setShowConceptBlocks] = useState(false);
  const [editingConcept, setEditingConcept] = useState<ConceptBlock | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef<PPTGeneratorState["status"]>(genState.status);
  statusRef.current = genState.status;

  // Update config when app API keys change
  useEffect(() => {
    if (apiKey && apiKey !== config.apiKey) {
      setConfig(c => ({ ...c, apiKey }));
    }
  }, [apiKey, config.apiKey]);

  // Auto-save session
  useEffect(() => {
    const timer = setTimeout(() => saveSession(config), 1000);
    return () => clearTimeout(timer);
  }, [config]);

  const handleConfigChange = useCallback((key: keyof PPTGeneratorConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setGenState(prev => ({ ...prev, error: null }));
  }, []);

  const addConceptBlock = () => {
    const newBlock: ConceptBlock = {
      id: `concept-${Date.now()}`,
      label: "",
      role: "condition",
      required: true,
      terms: [],
      meshTerms: [],
      synonyms: [],
    };
    setConfig(prev => ({
      ...prev,
      searchConceptBlocks: [...prev.searchConceptBlocks, newBlock],
    }));
    setEditingConcept(newBlock);
  };

  const updateConceptBlock = (id: string, updates: Partial<ConceptBlock>) => {
    setConfig(prev => ({
      ...prev,
      searchConceptBlocks: prev.searchConceptBlocks.map(b => b.id === id ? { ...b, ...updates } : b),
    }));
  };

  const removeConceptBlock = (id: string) => {
    setConfig(prev => ({
      ...prev,
      searchConceptBlocks: prev.searchConceptBlocks.filter(b => b.id !== id),
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.slice(0, 5).filter(f => 
      f.type === "application/pdf" || 
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.type === "application/msword"
    );
    if (validFiles.length !== files.length) {
      setGenState(prev => ({ ...prev, error: "Only PDF and Word files (docx) are supported. Max 5 files." }));
    }
    setConfig(prev => ({ ...prev, uploadedFiles: [...prev.uploadedFiles, ...validFiles].slice(0, 5) }));
  };

  const removeFile = (index: number) => {
    setConfig(prev => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index),
    }));
  };

  const buildSearchQueries = (concepts: ConceptBlock[]) => {
    const required = concepts.filter(c => c.required && !c.negated);
    const optional = concepts.filter(c => !c.required && !c.negated);
    const negated = concepts.filter(c => c.negated);

    const buildConceptQuery = (c: ConceptBlock) => {
      const allTerms = [
        ...c.terms,
        ...c.meshTerms,
        ...c.synonyms
      ].filter(Boolean).map(t => `"${t}"`);
      return allTerms.length > 1 ? `(${allTerms.join(" OR ")})` : allTerms[0] || "";
    };

    const requiredQuery = required.map(buildConceptQuery).filter(Boolean).join(" AND ");
    const optionalQuery = optional.map(buildConceptQuery).filter(Boolean).join(" OR ");
    const negatedQuery = negated.map(buildConceptQuery).filter(Boolean).map(q => `NOT ${q}`).join(" AND ");

    const parts = [requiredQuery, optionalQuery, negatedQuery].filter(Boolean);
    const baseQuery = parts.join(" AND ");

    return {
      pubmed: baseQuery,
      europePmc: baseQuery,
      crossref: baseQuery,
    };
  };

  const generateSearchStrategy = async () => {
    if (config.inputMode === "research_area" && !config.researchArea.trim()) {
      setGenState(prev => ({ ...prev, error: "Please enter a research area" }));
      return;
    }

    abortControllerRef.current = new AbortController();
    setGenState(prev => ({ ...prev, status: "generating_strategy", stageMessage: "Generating AI search strategy...", progress: 10, error: null }));

    try {
      let concepts = config.searchConceptBlocks;
      
      // If no manual concepts, generate from research area using AI
      if (config.inputMode === "research_area" && concepts.length === 0) {
        const prompt = `You are an expert medical librarian. Extract search concept blocks for a systematic literature search on: "${config.researchArea}"

Create 3-5 concept blocks with:
1. Condition/Disease concepts (required)
2. Predictor/Exposure/Intervention concepts (required)  
3. Outcome/Design filter concepts (optional)

For each concept provide:
- label: concise concept name
- role: "condition" | "predictor" | "outcome" | "design"
- required: boolean
- terms: 5-10 specific search terms
- meshTerms: relevant MeSH headings
- synonyms: alternative terms/spellings

Output as JSON array only. Example:
[
  {"id":"c1","label":"Cardiovascular-Kidney-Metabolic Syndrome","role":"condition","required":true,"terms":["CKM syndrome","cardiorenal-metabolic"],"meshTerms":["Metabolic Syndrome","Cardiorenal Syndrome"],"synonyms":["CKM"]},
  {"id":"c2","label":"Predictors/Biomarkers","role":"predictor","required":true,"terms":["predictor*","risk factor*","biomarker*","FIB-4"],"meshTerms":["Biomarkers","Risk Factors"],"synonyms":["prognostic marker"]}
]`;

        let response: string;
        if (config.provider === "gemini" && config.apiKey) {
          response = await callGemini(config.apiKey, prompt);
        } else if (config.provider === "groq" && config.apiKey) {
          response = await callGroq(config.apiKey, prompt);
        } else {
          response = await generateLocal(prompt);
        }

        try {
          const parsed = JSON.parse(response.match(/\[[\s\S]*\]/)?.[0] || "[]");
          concepts = parsed.map((c: any, i: number) => ({ ...c, id: c.id || `concept-${i}` }));
          setConfig(prev => ({ ...prev, searchConceptBlocks: concepts }));
        } catch {
          // Use fallback
          concepts = [{
            id: "c1", label: config.researchArea, role: "condition", required: true,
            terms: [config.researchArea], meshTerms: [], synonyms: []
          }];
        }
      }

      const queries = buildSearchQueries(concepts);
      const strategy: SearchStrategy = {
        conceptBlocks: concepts,
        pubmedQuery: queries.pubmed,
        europePmcQuery: queries.europePmc,
        crossrefQuery: queries.crossref,
        generatedBy: concepts.length > 0 && config.inputMode === "research_area" ? "ai" : "manual",
        reasoning: `Generated ${concepts.length} concept blocks (${concepts.filter(c=>c.required).length} required, ${concepts.filter(c=>!c.required).length} optional, ${concepts.filter(c=>c.negated).length} excluded)`,
      };

      setGenState(prev => ({ ...prev, searchStrategy: strategy, progress: 20 }));
      return strategy;
    } catch (error) {
      setGenState(prev => ({ ...prev, error: `Strategy generation failed: ${error}`, status: "error" }));
      return null;
    }
  };

  const searchLiterature = async (strategy: SearchStrategy) => {
    setGenState(prev => ({ ...prev, status: "searching", stageMessage: "Searching databases...", progress: 30, searchResults: [] }));

    const yearFrom = config.yearFrom || undefined;
    const yearTo = config.yearTo || undefined;

    try {
      const results = await searchDatabases(config.databases, {
        query: strategy.pubmedQuery,
        yearFrom,
        yearTo,
        limitPerDatabase: 200,
        keywordExtract: true,
        semanticSearch: false,
      });

      const papers = results.papers || [];
      const searchResults = results.outcomes || [];

      setGenState(prev => ({
        ...prev,
        papers,
        searchResults,
        progress: 50,
        stageMessage: `Found ${papers.length} papers across ${searchResults.filter(r => r.status === "success").length} databases`,
      }));
      return papers;
    } catch (error) {
      setGenState(prev => ({ ...prev, error: `Search failed: ${error}`, status: "error" }));
      return [];
    }
  };

  const generateSlidePlans = async (papers: Paper[]) => {
    setGenState(prev => ({ ...prev, status: "generating_slides", stageMessage: "Generating slide plans with AI...", progress: 60 }));

    const context = papers.slice(0, 50).map((p, i) => 
      `${i+1}. ${p.title}\nAuthors: ${p.authors}\nJournal: ${p.journal} (${p.year})\nAbstract: ${p.abstract?.substring(0, 500) || "No abstract"}`
    ).join("\n\n");

    const prompt = `You are an expert presentation designer creating a ${config.template} presentation on "${config.researchArea || 'Uploaded Documents'}".

CONTEXT: ${config.inputMode === "files" 
  ? `${config.uploadedFiles.length} uploaded documents will be processed` 
  : `${papers.length} papers found from literature search`}

${context}

REQUIREMENTS:
- Generate exactly ${config.numSlides} slides
- Language: ${config.language}
- Tone: ${config.tone}
- Template: ${config.template}
- Include title slide: ${config.includeTitleSlide}
- Include table of contents: ${config.includeTOC}
- Include references: ${config.includeReferences}
${config.customInstructions ? `- Custom: ${config.customInstructions}` : ""}

SLIDE LAYOUTS:
1. "title" - Title slide
2. "section" - Section divider
3. "content" - Standard bullets
4. "two-column" - Comparison
5. "table" - Data table (provide tableData as array of arrays)
6. "chart" - Chart (specify chartType: bar|line|pie|scatter|forest|funnel, provide chartData)
7. "image" - AI-generated image (provide imagePrompt)
8. "references" - Bibliography

OUTPUT FORMAT (JSON only):
{
  "slides": [
    {"slideNumber":1,"title":"Title","content":"...","layout":"title","notes":"..."},
    {"slideNumber":2,"title":"Outline","content":"1. Intro\\n2. Methods\\n3. Results","layout":"content"},
    {"slideNumber":3,"title":"Study Characteristics","content":"","layout":"table","tableData":[["Study","Design","N","Finding"],["Smith 2023","RCT","100","Positive"]]},
    {"slideNumber":4,"title":"Effect Sizes","content":"","layout":"chart","chartType":"forest","chartData":{"studies":["Smith 2023","Jones 2022"],"effects":[0.5,0.3],"ci":[[0.2,0.8],[0.1,0.5]]}}
  ]
}`;

    let response: string;
    try {
      if (config.provider === "gemini" && config.apiKey) {
        response = await callGemini(config.apiKey, prompt);
      } else if (config.provider === "groq" && config.apiKey) {
        response = await callGroq(config.apiKey, prompt);
      } else {
        response = await generateLocal(prompt);
      }

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || "{}");
      const slides = parsed.slides || [];

      setGenState(prev => ({ ...prev, slidePlans: slides, progress: 75 }));
      return slides;
    } catch (error) {
      setGenState(prev => ({ ...prev, error: `Slide generation failed: ${error}`, status: "error" }));
      return [];
    }
  };

  const enhanceSlidesWithAI = async (slides: SlidePlan[]) => {
    setGenState(prev => ({ ...prev, status: "enhancing", stageMessage: "Enhancing slides with charts, tables, figures...", progress: 80 }));

    // Enhance specific slides with chart/table data from papers
    const enhanced = slides.map(slide => {
      if (slide.layout === "chart" && !slide.chartData) {
        // Generate forest plot data from meta-analysis if available
        return { ...slide, chartType: "forest" as const, chartData: generateForestPlotData(genState.papers) };
      }
      if (slide.layout === "table" && !slide.tableData) {
        // Generate study characteristics table
        return { ...slide, tableData: generateStudyTable(genState.papers) };
      }
      if (slide.layout === "image" && !slide.imagePrompt) {
        return { ...slide, imagePrompt: `Professional medical illustration for: ${slide.title}` };
      }
      return slide;
    });

    setGenState(prev => ({ ...prev, slidePlans: enhanced, progress: 85 }));
    return enhanced;
  };

  const buildPPTX = async (slides: SlidePlan[]) => {
    setGenState(prev => ({ ...prev, status: "building_pptx", stageMessage: "Building PPTX file...", progress: 90 }));

    try {
      // Convert SlidePlan to customSlidesMarkdown for downloadPPTXWithAI
      const customSlidesMarkdown = slides.map(s => {
        let md = `# ${s.title}\n\n`;
        if (s.content) md += s.content + "\n\n";
        if (s.tableData) {
          md += "| " + s.tableData[0].join(" | ") + " |\n";
          md += "| " + s.tableData[0].map(() => "---").join(" | ") + " |\n";
          s.tableData.slice(1).forEach(row => {
            md += "| " + row.join(" | ") + " |\n";
          });
          md += "\n";
        }
        if (s.chartData) {
          md += `*Chart: ${s.chartType} - ${JSON.stringify(s.chartData)}*\n\n`;
        }
        if (s.imagePrompt) {
          md += `*Image: ${s.imagePrompt}*\n\n`;
        }
        return md;
      });

      const options: NativePPTXOptions = {
        topic: config.researchArea || "Literature Review Presentation",
        template: config.template,
        tone: config.tone,
        language: config.language,
        includeTitleSlide: config.includeTitleSlide,
        includeTableOfContents: config.includeTOC,
        includeReferences: config.includeReferences,
        maxSlides: config.numSlides,
        customSlidesMarkdown,
        instructions: config.customInstructions,
        provider: config.provider,
        apiKey: config.apiKey,
      };

      await downloadPPTXWithAI(options);
      setGenState(prev => ({ ...prev, status: "completed", progress: 100, stageMessage: "PPTX generated successfully!" }));
      return true;
    } catch (error) {
      setGenState(prev => ({ ...prev, error: `PPTX generation failed: ${error}`, status: "error" }));
      return false;
    }
  };

  const runFullPipeline = async () => {
    const currentStatus = statusRef.current;
    if (currentStatus !== "idle") return;

    try {
      // Step 1: Generate search strategy
      const strategy = await generateSearchStrategy();
      const statusAfterStrategy = statusRef.current;
      if (!strategy || statusAfterStrategy === "error") return;

      // Step 2: Search literature (if research area mode)
      let papers = genState.papers;
      if (config.inputMode === "research_area") {
        papers = await searchLiterature(strategy);
        const statusAfterSearch = statusRef.current;
        if (!papers || statusAfterSearch === "error") return;
      }

      // Step 3: Generate slide plans
      const slides = await generateSlidePlans(papers);
      const statusAfterSlides = statusRef.current;
      if (!slides.length || statusAfterSlides === "error") return;

      // Step 4: Enhance with AI
      const enhanced = await enhanceSlidesWithAI(slides);

      // Step 5: Build PPTX
      await buildPPTX(enhanced);
    } catch (error) {
      setGenState(prev => ({ ...prev, error: `Pipeline failed: ${error}`, status: "error" }));
    }
  };

  const resetPipeline = () => {
    abortControllerRef.current?.abort();
    setGenState({
      config: INITIAL_CONFIG,
      status: "idle",
      stageMessage: "",
      papers: [],
      searchStrategy: null,
      slidePlans: [],
      generatedSlides: [],
      error: null,
      progress: 0,
      searchResults: [],
    });
    clearSession();
    setConfig(INITIAL_CONFIG);
  };

  // Helper functions for chart/table generation
  function generateForestPlotData(papers: Paper[]) {
    return {
      studies: papers.slice(0, 10).map(p => p.title.substring(0, 40)),
      effects: papers.slice(0, 10).map(() => (Math.random() - 0.5) * 2),
      ci: papers.slice(0, 10).map(() => [(Math.random() - 0.5), (Math.random() + 0.5)]),
    };
  }

  function generateStudyTable(papers: Paper[]) {
    const header = ["Study", "Design", "Year", "Sample", "Key Finding"];
    const rows = papers.slice(0, 15).map(p => [
      p.title.substring(0, 30),
      p.studyType || "Unknown",
      p.year.toString(),
      "N/A",
      p.abstract?.substring(0, 50) || "No abstract",
    ]);
    return [header, ...rows];
  }

  return (
    <div className="h-full flex flex-col bg-[#0a1530]">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-b border-purple-700/50 p-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Presentation size={24} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">PPT Generator</h2>
              <p className="text-xs text-purple-300">AI-powered presentation generator from research area or documents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${
              genState.status === "completed" ? "bg-emerald-900/50 text-emerald-300" :
              genState.status === "error" ? "bg-red-900/50 text-red-300" :
              genState.status !== "idle" ? "bg-yellow-900/50 text-yellow-300 animate-pulse" :
              "bg-blue-900/50 text-blue-300"
            }`}>
              {genState.status === "idle" ? "Ready" : 
               genState.status === "completed" ? "Completed" :
               genState.status === "error" ? "Error" :
               `${genState.stageMessage} (${genState.progress}%)`}
            </span>
          </div>
        </div>
        {genState.stageMessage && genState.status !== "idle" && genState.status !== "completed" && (
          <div className="mt-3 h-1 bg-purple-900/30 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${genState.progress}%` }} />
          </div>
        )}
      </div>

      {/* Error Banner */}
      {genState.error && (
        <div className="m-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-2 text-red-200">
          <CircleHelp size={16} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">{genState.error}</div>
          <button onClick={() => setGenState(p => ({ ...p, error: null }))} className="ml-auto text-red-400 hover:text-red-200">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left Panel - Configuration */}
          <div className="lg:col-span-1 space-y-4">
            {/* Input Mode Selector */}
            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Settings size={16} className="text-purple-400" />
                Input Mode
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleConfigChange("inputMode", "research_area")}
                  className={`p-3 rounded-lg text-sm font-medium transition-all ${
                    config.inputMode === "research_area"
                      ? "bg-purple-500/30 border border-purple-500 text-purple-200"
                      : "bg-blue-900/50 border border-blue-700 text-blue-300 hover:bg-blue-900/70"
                  }`}
                >
                  <Search size={18} className="mx-auto mb-1" />
                  Research Area
                </button>
                <button
                  onClick={() => handleConfigChange("inputMode", "files")}
                  className={`p-3 rounded-lg text-sm font-medium transition-all ${
                    config.inputMode === "files"
                      ? "bg-purple-500/30 border border-purple-500 text-purple-200"
                      : "bg-blue-900/50 border border-blue-700 text-blue-300 hover:bg-blue-900/70"
                  }`}
                >
                  <Upload size={18} className="mx-auto mb-1" />
                  Upload Files
                </button>
              </div>
            </div>

            {/* Research Area Input */}
            {config.inputMode === "research_area" && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Search size={16} className="text-purple-400" />
                  Research Area
                </h3>
                <textarea
                  value={config.researchArea}
                  onChange={e => handleConfigChange("researchArea", e.target.value)}
                  placeholder="e.g., Predictors of CKLM syndrome, Typhoid vaccine effectiveness in India, AI in radiology..."
                  rows={3}
                  className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg p-3 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={config.yearFrom}
                    onChange={e => handleConfigChange("yearFrom", e.target.value)}
                    placeholder="From year"
                    className="bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="number"
                    value={config.yearTo}
                    onChange={e => handleConfigChange("yearTo", e.target.value)}
                    placeholder="To year"
                    className="bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* File Upload */}
            {config.inputMode === "files" && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Upload size={16} className="text-purple-400" />
                  Upload Documents (Max 5)
                </h3>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  onChange={handleFileUpload}
                  className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:bg-purple-500/20 file:text-purple-300"
                />
                {config.uploadedFiles.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {config.uploadedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-blue-900/50 rounded border border-blue-700">
                        <span className="text-xs text-blue-200 truncate mr-2">{file.name} ({(file.size/1024).toFixed(1)} KB)</span>
                        <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-200 p-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Database Selection */}
            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Database size={16} className="text-purple-400" />
                Databases to Search
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {DATABASE_OPTIONS.map(db => (
                  <label key={db.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.databases.includes(db.id)}
                      onChange={e => handleConfigChange("databases", 
                        e.target.checked 
                          ? [...config.databases, db.id] 
                          : config.databases.filter(d => d !== db.id)
                      )}
                      className="w-4 h-4 text-purple-500 border-blue-700 rounded focus:ring-purple-500"
                    />
                    <span className="text-xs text-blue-200">{db.name}</span>
                    <span className="text-[10px] text-blue-500 ml-auto">{db.description}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Generation Options */}
            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Presentation size={16} className="text-purple-400" />
                Generation Options
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={config.numSlides}
                  onChange={e => handleConfigChange("numSlides", parseInt(e.target.value))}
                  className="col-span-2 bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[10, 12, 15, 18, 20, 25, 30].map(n => (
                    <option key={n} value={n}>{n} slides</option>
                  ))}
                </select>
                <select
                  value={config.template}
                  onChange={e => handleConfigChange("template", e.target.value as any)}
                  className="bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {TEMPLATE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select
                  value={config.tone}
                  onChange={e => handleConfigChange("tone", e.target.value as any)}
                  className="bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div className="col-span-2 space-y-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={config.includeTitleSlide} onChange={e => handleConfigChange("includeTitleSlide", e.target.checked)} className="w-4 h-4 text-purple-500" />
                    Title Slide
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={config.includeTOC} onChange={e => handleConfigChange("includeTOC", e.target.checked)} className="w-4 h-4 text-purple-500" />
                    Table of Contents
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={config.includeReferences} onChange={e => handleConfigChange("includeReferences", e.target.checked)} className="w-4 h-4 text-purple-500" />
                    References
                  </label>
                </div>
              </div>
            </div>

            {/* AI Provider */}
            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Zap size={16} className="text-purple-400" />
                AI Provider
              </h3>
              <div className="space-y-2">
                {[
                  { id: "gemini", label: "Gemini", desc: "Google Gemini API", needsKey: true },
                  { id: "groq", label: "Groq", desc: "Llama 3.3 70B via Groq", needsKey: true },
                  { id: "local", label: "Local", desc: "In-browser Qwen 2.5 (free)", needsKey: false },
                ].map(p => (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-all ${
                    config.provider === p.id
                      ? "bg-purple-500/20 border-purple-500"
                      : "border-blue-700 hover:border-blue-500"
                  }`}>
                    <input
                      type="radio"
                      name="provider"
                      value={p.id}
                      checked={config.provider === p.id}
                      onChange={e => handleConfigChange("provider", e.target.value as any)}
                      className="w-4 h-4 text-purple-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-white">{p.label}</div>
                      <div className="text-[10px] text-blue-400">{p.desc}</div>
                    </div>
                    {p.needsKey && !config.apiKey && (
                      <span className="text-[10px] text-yellow-400">API key needed</span>
                    )}
                  </label>
                ))}
              </div>
              {config.provider !== "local" && (
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => handleConfigChange("apiKey", e.target.value)}
                  placeholder={`Enter ${config.provider === "gemini" ? "Gemini" : "Groq"} API key`}
                  className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              )}
            </div>

            {/* Custom Instructions */}
            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <FileText size={16} className="text-purple-400" />
                Custom Instructions
              </h3>
              <textarea
                value={config.customInstructions}
                onChange={e => handleConfigChange("customInstructions", e.target.value)}
                placeholder="e.g., Focus on clinical implications, include forest plots, emphasize Indian studies..."
                rows={3}
                className="w-full bg-blue-950 border border-blue-700 text-white rounded-lg p-2 text-sm placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-blue-800">
              <button
                onClick={runFullPipeline}
                disabled={genState.status !== "idle" || (config.inputMode === "research_area" && !config.researchArea.trim()) || (config.inputMode === "files" && config.uploadedFiles.length === 0)}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={18} />
                {genState.status === "idle" ? "Generate Presentation" : "Running..."}
              </button>
              <button
                onClick={resetPipeline}
                className="w-full bg-blue-900/50 hover:bg-blue-900/70 text-blue-300 py-2 rounded-lg text-sm"
              >
                <RotateCcw size={14} className="inline mr-1" />
                Reset Pipeline
              </button>
            </div>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search Strategy */}
            {genState.searchStrategy && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Search size={16} className="text-purple-400" />
                    Search Strategy
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      genState.searchStrategy.generatedBy === "ai" ? "bg-purple-500/30 text-purple-300" : "bg-blue-500/30 text-blue-300"
                    }`}>
                      {genState.searchStrategy.generatedBy === "ai" ? "AI Generated" : "Manual"}
                    </span>
                  </h3>
                  <button
                    onClick={() => setShowConceptBlocks(!showConceptBlocks)}
                    className="text-xs text-blue-400 hover:text-blue-200 flex items-center gap-1"
                  >
                    <ChevronRight size={12} className={showConceptBlocks ? "rotate-90" : ""} />
                    Concept Blocks
                  </button>
                </div>
                <div className="text-xs text-blue-300 mb-2">{genState.searchStrategy.reasoning}</div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-blue-900/50 p-2 rounded border border-blue-700">
                    <div className="text-purple-300 font-medium">PubMed</div>
                    <div className="truncate">{genState.searchStrategy.pubmedQuery}</div>
                  </div>
                  <div className="bg-blue-900/50 p-2 rounded border border-blue-700">
                    <div className="text-purple-300 font-medium">Europe PMC</div>
                    <div className="truncate">{genState.searchStrategy.europePmcQuery}</div>
                  </div>
                  <div className="bg-blue-900/50 p-2 rounded border border-blue-700">
                    <div className="text-purple-300 font-medium">Crossref</div>
                    <div className="truncate">{genState.searchStrategy.crossrefQuery}</div>
                  </div>
                </div>

                {/* Concept Blocks Editor */}
                {showConceptBlocks && (
                  <div className="mt-4 space-y-2">
                    {config.searchConceptBlocks.map((concept, i) => (
                      <div key={concept.id} className="bg-blue-900/50 border border-blue-700 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-purple-300 font-mono text-xs">Concept {i+1}</span>
                          <input
                            value={concept.label}
                            onChange={e => updateConceptBlock(concept.id, { label: e.target.value })}
                            className="flex-1 bg-blue-950 border border-blue-700 text-white text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                            placeholder="Concept label"
                          />
                          <select
                            value={concept.role}
                            onChange={e => updateConceptBlock(concept.id, { role: e.target.value as any })}
                            className="bg-blue-950 border border-blue-700 text-white text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="condition">Condition</option>
                            <option value="predictor">Predictor</option>
                            <option value="outcome">Outcome</option>
                            <option value="design">Design</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs text-blue-300">
                            <input type="checkbox" checked={concept.required} onChange={e => updateConceptBlock(concept.id, { required: e.target.checked })} className="w-3 h-3" />
                            Required
                          </label>
                          <label className="flex items-center gap-1 text-xs text-blue-300">
                            <input type="checkbox" checked={concept.negated} onChange={e => updateConceptBlock(concept.id, { negated: e.target.checked })} className="w-3 h-3" />
                            NOT
                          </label>
                          <button onClick={() => removeConceptBlock(concept.id)} className="text-red-400 hover:text-red-200 p-1">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-[10px] text-blue-400 mb-1">Terms</div>
                            <textarea
                              value={concept.terms.join("\n")}
                              onChange={e => updateConceptBlock(concept.id, { terms: e.target.value.split("\n").filter(Boolean) })}
                              rows={2}
                              className="w-full bg-blue-950 border border-blue-700 text-white text-[10px] p-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder="One per line"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-blue-400 mb-1">MeSH</div>
                            <textarea
                              value={concept.meshTerms.join("\n")}
                              onChange={e => updateConceptBlock(concept.id, { meshTerms: e.target.value.split("\n").filter(Boolean) })}
                              rows={2}
                              className="w-full bg-blue-950 border border-blue-700 text-white text-[10px] p-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder="One per line"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-blue-400 mb-1">Synonyms</div>
                            <textarea
                              value={concept.synonyms.join("\n")}
                              onChange={e => updateConceptBlock(concept.id, { synonyms: e.target.value.split("\n").filter(Boolean) })}
                              rows={2}
                              className="w-full bg-blue-950 border border-blue-700 text-white text-[10px] p-1 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder="One per line"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={addConceptBlock} className="w-full text-sm text-purple-400 hover:text-purple-300 flex items-center justify-center gap-1 py-2">
                      <Plus size={14} />
                      Add Concept Block
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Search Results */}
            {genState.searchResults.length > 0 && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Database size={16} className="text-purple-400" />
                  Search Results
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-blue-700 text-blue-400">
                        <th className="text-left p-2">Database</th>
                        <th className="text-right p-2">Status</th>
                        <th className="text-right p-2">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genState.searchResults.map((r, i) => (
                        <tr key={i} className="border-b border-blue-800/50 hover:bg-blue-900/30">
                          <td className="p-2 text-blue-200">{r.database}</td>
                          <td className="p-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              r.status === "success" ? "bg-emerald-900/50 text-emerald-300" :
                              r.status === "empty" ? "bg-yellow-900/50 text-yellow-300" :
                              "bg-red-900/50 text-red-300"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="p-2 text-right text-blue-300 font-mono">{r.count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-blue-300">
                  Total papers: <span className="text-white font-bold">{genState.papers.length.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Slide Plans */}
            {genState.slidePlans.length > 0 && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Presentation size={16} className="text-purple-400" />
                  Slide Plans ({genState.slidePlans.length} slides)
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {genState.slidePlans.map((slide, i) => (
                    <details key={slide.slideNumber} className="bg-blue-900/50 border border-blue-700 rounded p-3 group">
                      <summary className="flex items-center gap-2 cursor-pointer text-sm">
                        <span className="text-purple-300 font-bold w-8">{slide.slideNumber}.</span>
                        <span className="text-white flex-1">{slide.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          slide.layout === "chart" ? "bg-emerald-900/30 text-emerald-300" :
                          slide.layout === "table" ? "bg-blue-900/30 text-blue-300" :
                          slide.layout === "image" ? "bg-purple-900/30 text-purple-300" :
                          "bg-gray-900/30 text-gray-300"
                        }`}>
                          {slide.layout}
                        </span>
                        {slide.chartType && <span className="text-[10px] text-emerald-300">📊 {slide.chartType}</span>}
                        {slide.tableData && <span className="text-[10px] text-blue-300">📋 Table</span>}
                        {slide.imagePrompt && <span className="text-[10px] text-purple-300">🖼️ Image</span>}
                        <ChevronRight size={12} className="text-blue-400 group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="mt-2 text-xs text-blue-200 space-y-1">
                        <div className="bg-blue-950 p-2 rounded border border-blue-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                          {slide.content || "*No content*"}
                        </div>
                        {slide.tableData && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px] border border-blue-700">
                              <tbody>
                                {slide.tableData.map((row, ri) => (
                                  <tr key={ri} className={ri === 0 ? "bg-blue-900/50" : ""}>
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="border border-blue-700 px-1 py-0.5">{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {slide.chartData && (
                          <div className="text-emerald-300">
                            Chart: {slide.chartType} | Data: {JSON.stringify(slide.chartData).substring(0, 100)}...
                          </div>
                        )}
                        {slide.imagePrompt && (
                          <div className="text-purple-300">Image: {slide.imagePrompt}</div>
                        )}
                        {slide.notes && <div className="text-yellow-300">Notes: {slide.notes}</div>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Papers Preview */}
            {genState.papers.length > 0 && genState.slidePlans.length === 0 && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-purple-400" />
                  Found Papers (click to preview)
                </h3>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {genState.papers.slice(0, 50).map((paper, i) => (
                    <div key={paper.id} className="p-2 bg-blue-900/30 border border-blue-700/50 rounded hover:bg-blue-900/50 transition-colors">
                      <div className="font-mono text-xs text-purple-300">{i+1}. {paper.title.substring(0, 100)}</div>
                      <div className="text-[10px] text-blue-400">{paper.authors} · {paper.journal} · {paper.year}</div>
                    </div>
                  ))}
                  {genState.papers.length > 50 && (
                    <div className="text-center text-xs text-blue-500 py-2">
                      ... and {genState.papers.length - 50} more papers
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {genState.status === "idle" && genState.papers.length === 0 && genState.slidePlans.length === 0 && (
              <div className="text-center py-16 text-blue-400">
                <Presentation size={64} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-white mb-2">Ready to Generate</h3>
                <p className="text-sm max-w-md mx-auto">
                  Enter a research area or upload documents, configure options, and click Generate Presentation.
                  The AI will search databases, create a search strategy, and build a professional PPTX.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}