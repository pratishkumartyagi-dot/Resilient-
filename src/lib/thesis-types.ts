export type ThesisLevel =
  | "research_paper"
  | "case_series"
  | "bachelor"
  | "master"
  | "phd";

export type ThesisStyle = "apa" | "vancouver" | "ieee" | "mla" | "harvard";

export type ThesisLanguage = "en" | "es" | "fr" | "de" | "zh";

export type ThesisProvider = "gemini" | "groq" | "qwen" | "mlc";

export type StudyDesign =
  | "rct"
  | "observational"
  | "case_series"
  | "review"
  | "other";

export interface ThesisPaper {
  id: string;
  title: string;
  authors: string;
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  database?: string;
  studyType?: string;
  url?: string;
}

export interface ThesisSection {
  id: string;
  title: string;
  wordTarget?: number;
  content?: string;
}

export interface ThesisChapter {
  number: number;
  title: string;
  sections: ThesisSection[];
  wordTarget?: number;
}

export interface ThesisOutline {
  title: string;
  abstract: string;
  chapters: ThesisChapter[];
}

export interface ArgumentAudit {
  claims: string[];
  evidenceGaps: string[];
  logicalFlowScore: number;
  citationCoverage: number;
  recommendations: string[];
}

export interface ChapterFile {
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  sections: ThesisSection[];
  wordCount: number;
  citations: string[];
  argumentAudit: ArgumentAudit;
}

export interface ThesisStageSubResult {
  ok: boolean;
  error?: string;
  data?: any;
}

export interface ThesisPipelineStats {
  totalWords: number;
  totalReferences: number;
  totalChapters: number;
  generationTimeMs: number;
}

export interface ThesisPipelineResult {
  outline: ThesisOutline;
  fullThesis: string;
  markdownOutline: string;
  chapters: ChapterFile[];
  references: ThesisPaper[];
  papers: ThesisPaper[];
  stats: ThesisPipelineStats;
  stages: {
    outline: boolean;
    prose: boolean;
    refine: boolean;
    humanise: boolean;
    complete: boolean;
  };
  subResults: {
    outline: ThesisStageSubResult;
    prose: ThesisStageSubResult;
    refine: ThesisStageSubResult;
    humanise: ThesisStageSubResult;
  };
}

export interface ThesisGeneratorConfig {
  topic: string;
  level: ThesisLevel;
  style: ThesisStyle;
  language: ThesisLanguage;
  author?: string;
  institution?: string;
  apiKey: string;
  provider: ThesisProvider;
  yearFrom?: number;
  yearTo?: number;
  studyDesign?: StudyDesign;
  targetWordCount?: number;
  minWordCount?: number;
  maxWordCount?: number;
  maxReferences?: number;
  onProgress?: (stage: string, message: string) => void;
  aiFn: (prompt: string, opts?: { searchEnabled?: boolean; searchQuery?: string }) => Promise<string>;
}

export interface ThesisGeneratorState {
  status: "idle" | "generating" | "completed" | "error";
  stage: string;
  progress: number;
  result: ThesisPipelineResult | null;
  error: string | null;
}

export const DEFAULT_CONFIG: Partial<ThesisGeneratorConfig> = {
  level: "master",
  style: "vancouver",
  language: "en",
  provider: "gemini",
  yearFrom: undefined,
  yearTo: undefined,
  studyDesign: "other",
  targetWordCount: undefined,
  minWordCount: undefined,
  maxWordCount: undefined,
  maxReferences: 150,
};

export const LEVEL_WORD_RANGES: Record<ThesisLevel, { min: number; max: number }> = {
  research_paper: { min: 3000, max: 5000 },
  case_series: { min: 1500, max: 2500 },
  bachelor: { min: 8000, max: 15000 },
  master: { min: 15000, max: 40000 },
  phd: { min: 60000, max: 100000 },
};

export const LEVEL_REFERENCE_TARGETS: Record<ThesisLevel, { min: number; max: number; searchMax: number }> = {
  research_paper: { min: 20, max: 50, searchMax: 100 },
  case_series: { min: 10, max: 30, searchMax: 60 },
  bachelor: { min: 30, max: 60, searchMax: 100 },
  master: { min: 60, max: 120, searchMax: 150 },
  phd: { min: 150, max: 400, searchMax: 300 },
};

export const STUDY_DESIGN_GUIDELINES: Record<StudyDesign, string> = {
  rct: "CONSORT",
  observational: "STROBE",
  case_series: "CARE",
  review: "PRISMA",
  other: "none",
};
