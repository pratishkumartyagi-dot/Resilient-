"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";

export interface Paper {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  abstract: string;
  database: string;
  studyType: string;
  selected: boolean;
  url?: string;
  pmid?: string;
}

export interface SynthesisRow {
  id: string;
  reference: string;
  keyFindings: string;
  synopsis: string;
  studyDetails: string;
  researchGaps: string;
}

export interface Theme {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  selected: boolean;
}

export interface ResearchQuestion {
  id: string;
  question: string;
  type: "qualitative" | "quantitative";
  selected: boolean;
}

export interface ResearchTitle {
  id: string;
  title: string;
  explanation: string;
  selected: boolean;
}

export interface AimObjective {
  aim: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  userEdited: boolean;
}

export interface MethodologyInputs {
  studySite: string;
  setting: string;
  population: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  hypothesis: string;
  outcomes: string[];
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  type: string;
  options?: string[];
}

export interface ProtocolSection {
  background: string;
  objectives: string;
  methods: string;
  expectedOutcomes: string;
}

export interface AppState {
  currentTab: string;
  currentStep: number;
  systematicStep: number;
  searchQuery: string;
  searchLogic: string;
  yearFrom: string;
  yearTo: string;
  studyType: string;
  papers: Paper[];
  selectedPapers: Paper[];
  synthesisTable: SynthesisRow[];
  literatureReview: string;
  themes: Theme[];
  researchQuestions: ResearchQuestion[];
  researchTitles: ResearchTitle[];
  aimObjectives: AimObjective;
  methodology: MethodologyInputs;
  questionnaire: QuestionnaireItem[];
  protocol: ProtocolSection;
  impactAssessment: string;
  uploadedDocuments: File[];
  userThemeInput: string;
  userAimInput: string;
  userTitleInput: string;
  userQuestionInput: string;
  isLoading: boolean;
  error: string;
  showPrisma: boolean;
  selectedDatabases: string[];
  geminiApiKey: string;
  groqApiKey: string;
  srStudyTypeCategory: "systematic" | "meta" | null;
  dedupPapers: Paper[];
  filteredPapers: Paper[];
  citationValidationResults: Record<string, { valid: boolean; title?: string; message: string }>;
  citationValidationStatus: "idle" | "running" | "done";
  omicsEnabled: boolean;
  predictionStep: number;
  predictionAim: string;
  predictionPopulation: string;
  predictionOutcome: string;
  predictionOutcomeType: "binary" | "continuous" | "survival" | "competing_risk";
  predictionPredictors: string;
  predictionModelType: string;
  predictionDataFile: File | null;
  predictionSampleSize: string;
  predictionMissingDataStrategy: string;
  predictionModelResult: string;
  predictionPerformance: string;
  predictionDecisionCurve: string;
  predictionReport: string;
  predictionLoading: boolean;
  predictionModelStrategy: "new" | "update" | null;
  predictionDcaMinThreshold: string;
  predictionDcaMaxThreshold: string;
  predictionImportanceMethod: "shap" | "permutation" | "captum" | "both" | "all" | null;
  predictionReportNotes: string;
  predictionCaptumEnabled: boolean;
  predictionCaptumResults: string;
}

type Action =
  | { type: "SET_TAB"; payload: string }
  | { type: "SET_STEP"; payload: number }
  | { type: "SET_SEARCH"; payload: { query?: string; logic?: string; yearFrom?: string; yearTo?: string; studyType?: string } }
  | { type: "SET_PAPERS"; payload: Paper[] }
  | { type: "TOGGLE_PAPER"; payload: string }
  | { type: "SELECT_ALL_PAPERS"; payload: boolean }
  | { type: "SET_SYNTHESIS"; payload: SynthesisRow[] }
  | { type: "SET_LITERATURE_REVIEW"; payload: string }
  | { type: "SET_THEMES"; payload: Theme[] }
  | { type: "TOGGLE_THEME"; payload: string }
  | { type: "SET_USER_THEME_INPUT"; payload: string }
  | { type: "SET_RESEARCH_QUESTIONS"; payload: ResearchQuestion[] }
  | { type: "TOGGLE_QUESTION"; payload: string }
  | { type: "SET_USER_QUESTION_INPUT"; payload: string }
  | { type: "SET_RESEARCH_TITLES"; payload: ResearchTitle[] }
  | { type: "TOGGLE_TITLE"; payload: string }
  | { type: "SET_USER_TITLE_INPUT"; payload: string }
  | { type: "SET_AIM_OBJECTIVES"; payload: Partial<AimObjective> }
  | { type: "SET_METHODOLOGY"; payload: Partial<MethodologyInputs> }
  | { type: "ADD_OUTCOME"; payload: string }
  | { type: "REMOVE_OUTCOME"; payload: string }
  | { type: "SET_QUESTIONNAIRE"; payload: QuestionnaireItem[] }
  | { type: "SET_PROTOCOL"; payload: Partial<ProtocolSection> }
  | { type: "SET_IMPACT"; payload: string }
  | { type: "SET_UPLOADED_DOCS"; payload: File[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string }
  | { type: "TOGGLE_PRISMA"; payload: boolean }
  | { type: "SET_SELECTED_DATABASES"; payload: string[] }
  | { type: "SET_SELECTED_PAPERS"; payload: Paper[] }
  | { type: "SET_GEMINI_KEY"; payload: string }
  | { type: "SET_GROQ_KEY"; payload: string }
  | { type: "SET_SYSTEMATIC_STEP"; payload: number }
  | { type: "SET_SR_CATEGORY"; payload: "systematic" | "meta" | null }
  | { type: "SET_DEDUP_PAPERS"; payload: any[] }
  | { type: "SET_FILTERED_PAPERS"; payload: any[] }
  | { type: "SET_CITATION_RESULTS"; payload: Record<string, { valid: boolean; title?: string; message: string }> }
  | { type: "SET_CITATION_STATUS"; payload: "idle" | "running" | "done" }
  | { type: "RESET_STATE" }
  | { type: "TOGGLE_OMICS"; payload: boolean }
  | { type: "SET_PREDICTION_STEP"; payload: number }
  | { type: "SET_PREDICTION_AIM"; payload: string }
  | { type: "SET_PREDICTION_POPULATION"; payload: string }
  | { type: "SET_PREDICTION_OUTCOME"; payload: string }
  | { type: "SET_PREDICTION_OUTCOME_TYPE"; payload: "binary" | "continuous" | "survival" | "competing_risk" }
  | { type: "SET_PREDICTION_PREDICTORS"; payload: string }
  | { type: "SET_PREDICTION_MODEL"; payload: string }
  | { type: "SET_PREDICTION_DATA"; payload: File | null }
  | { type: "SET_PREDICTION_SAMPLE_SIZE"; payload: string }
  | { type: "SET_PREDICTION_MISSING"; payload: string }
  | { type: "SET_PREDICTION_MODEL_RESULT"; payload: string }
  | { type: "SET_PREDICTION_PERFORMANCE"; payload: string }
  | { type: "SET_PREDICTION_DECISION_CURVE"; payload: string }
  | { type: "SET_PREDICTION_REPORT"; payload: string }
  | { type: "SET_PREDICTION_LOADING"; payload: boolean }
  | { type: "SET_PREDICTION_MODEL_STRATEGY"; payload: "new" | "update" | null }
  | { type: "SET_PREDICTION_DCA_MIN"; payload: string }
  | { type: "SET_PREDICTION_DCA_MAX"; payload: string }
  | { type: "SET_PREDICTION_IMPORTANCE_METHOD"; payload: "shap" | "permutation" | "captum" | "both" | "all" | null }
  | { type: "SET_PREDICTION_REPORT_NOTES"; payload: string }
  | { type: "SET_PREDICTION_CAPTUM_ENABLED"; payload: boolean }
  | { type: "SET_PREDICTION_CAPTUM_RESULTS"; payload: string }
  | { type: "RESET_STATE" };

const initialState: AppState = {
  currentTab: "main",
  currentStep: 1,
  systematicStep: 1,
  searchQuery: "",
  searchLogic: "AND",
  yearFrom: "",
  yearTo: "",
  studyType: "All Study Types",
  papers: [],
  selectedPapers: [],
  synthesisTable: [],
  literatureReview: "",
  themes: [],
  researchQuestions: [],
  researchTitles: [],
  aimObjectives: {
    aim: "",
    primaryObjective: "",
    secondaryObjectives: [],
    userEdited: false,
  },
  methodology: {
    studySite: "",
    setting: "",
    population: "",
    inclusionCriteria: "",
    exclusionCriteria: "",
    hypothesis: "",
    outcomes: [],
  },
  questionnaire: [],
  protocol: {
    background: "",
    objectives: "",
    methods: "",
    expectedOutcomes: "",
  },
  impactAssessment: "",
  uploadedDocuments: [],
  userThemeInput: "",
  userAimInput: "",
  userTitleInput: "",
  userQuestionInput: "",
  isLoading: false,
  error: "",
  showPrisma: false,
  selectedDatabases: [
    "PubMed",
    "OpenAlex",
    "Europe PMC",
    "Google Scholar",
    "ClinicalTrials.gov",
    "WHO IRIS",
    "Semantic Scholar",
    "Shodhganga",
    "Prospero",
    "ScienceDirect",
    "DOAJ",
    "Clarivate",
  ],
  geminiApiKey: "",
  groqApiKey: "",
  srStudyTypeCategory: null,
  dedupPapers: [],
  filteredPapers: [],
  citationValidationResults: {},
  citationValidationStatus: "idle",
  omicsEnabled: false,
  predictionStep: 1,
  predictionAim: "",
  predictionPopulation: "",
  predictionOutcome: "",
  predictionOutcomeType: "binary",
  predictionPredictors: "",
  predictionModelType: "",
  predictionDataFile: null,
  predictionSampleSize: "",
  predictionMissingDataStrategy: "",
  predictionModelResult: "",
  predictionPerformance: "",
  predictionDecisionCurve: "",
  predictionReport: "",
  predictionLoading: false,
  predictionModelStrategy: null,
  predictionDcaMinThreshold: "5",
  predictionDcaMaxThreshold: "50",
  predictionImportanceMethod: null,
  predictionReportNotes: "",
  predictionCaptumEnabled: false,
  predictionCaptumResults: "",
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, currentTab: action.payload };
    case "SET_STEP":
      return { ...state, currentStep: action.payload };
    case "SET_SEARCH":
      return {
        ...state,
        searchQuery: action.payload.query ?? state.searchQuery,
        searchLogic: action.payload.logic ?? state.searchLogic,
        yearFrom: action.payload.yearFrom ?? state.yearFrom,
        yearTo: action.payload.yearTo ?? state.yearTo,
        studyType: action.payload.studyType ?? state.studyType,
      };
    case "SET_PAPERS":
      return { ...state, papers: action.payload, selectedPapers: action.payload.filter((p) => p.selected) };
    case "TOGGLE_PAPER":
      return {
        ...state,
        papers: state.papers.map((p) =>
          p.id === action.payload ? { ...p, selected: !p.selected } : p
        ),
        selectedPapers: state.papers.map((p) =>
          p.id === action.payload ? { ...p, selected: !p.selected } : p
        ).filter((p) => p.selected),
      };
    case "SELECT_ALL_PAPERS":
      return {
        ...state,
        papers: state.papers.map((p) => ({ ...p, selected: action.payload })),
        selectedPapers: action.payload ? [...state.papers] : [],
      };
    case "SET_SYNTHESIS":
      return { ...state, synthesisTable: action.payload };
    case "SET_LITERATURE_REVIEW":
      return { ...state, literatureReview: action.payload };
    case "SET_THEMES":
      return { ...state, themes: action.payload };
    case "TOGGLE_THEME":
      return {
        ...state,
        themes: state.themes.map((t) =>
          t.id === action.payload ? { ...t, selected: !t.selected } : t
        ),
      };
    case "SET_USER_THEME_INPUT":
      return { ...state, userThemeInput: action.payload };
    case "SET_RESEARCH_QUESTIONS":
      return { ...state, researchQuestions: action.payload };
    case "TOGGLE_QUESTION":
      return {
        ...state,
        researchQuestions: state.researchQuestions.map((q) =>
          q.id === action.payload ? { ...q, selected: !q.selected } : q
        ),
      };
    case "SET_USER_QUESTION_INPUT":
      return { ...state, userQuestionInput: action.payload };
    case "SET_RESEARCH_TITLES":
      return { ...state, researchTitles: action.payload };
    case "TOGGLE_TITLE":
      return {
        ...state,
        researchTitles: state.researchTitles.map((t) =>
          t.id === action.payload ? { ...t, selected: !t.selected } : t
        ),
      };
    case "SET_USER_TITLE_INPUT":
      return { ...state, userTitleInput: action.payload };
    case "SET_AIM_OBJECTIVES":
      return {
        ...state,
        aimObjectives: { ...state.aimObjectives, ...action.payload },
      };
    case "SET_METHODOLOGY":
      return {
        ...state,
        methodology: { ...state.methodology, ...action.payload },
      };
    case "ADD_OUTCOME":
      return {
        ...state,
        methodology: {
          ...state.methodology,
          outcomes: [...state.methodology.outcomes, action.payload],
        },
      };
    case "REMOVE_OUTCOME":
      return {
        ...state,
        methodology: {
          ...state.methodology,
          outcomes: state.methodology.outcomes.filter((o) => o !== action.payload),
        },
      };
    case "SET_QUESTIONNAIRE":
      return { ...state, questionnaire: action.payload };
    case "SET_PROTOCOL":
      return {
        ...state,
        protocol: { ...state.protocol, ...action.payload },
      };
    case "SET_IMPACT":
      return { ...state, impactAssessment: action.payload };
    case "SET_UPLOADED_DOCS":
      return { ...state, uploadedDocuments: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "TOGGLE_PRISMA":
      return { ...state, showPrisma: action.payload };
    case "SET_SELECTED_DATABASES":
      return { ...state, selectedDatabases: action.payload };
    case "SET_SELECTED_PAPERS":
      return { ...state, selectedPapers: action.payload };
    case "SET_GEMINI_KEY":
      return { ...state, geminiApiKey: action.payload };
    case "SET_GROQ_KEY":
      return { ...state, groqApiKey: action.payload };
    case "SET_SYSTEMATIC_STEP":
      return { ...state, systematicStep: action.payload };
    case "SET_SR_CATEGORY":
      return { ...state, srStudyTypeCategory: action.payload };
    case "SET_DEDUP_PAPERS":
      return { ...state, dedupPapers: action.payload };
    case "SET_FILTERED_PAPERS":
      return { ...state, filteredPapers: action.payload };
    case "SET_CITATION_RESULTS":
      return { ...state, citationValidationResults: action.payload };
    case "SET_CITATION_STATUS":
      return { ...state, citationValidationStatus: action.payload };
    case "TOGGLE_OMICS":
      return { ...state, omicsEnabled: action.payload };
    case "SET_PREDICTION_STEP":
      return { ...state, predictionStep: action.payload };
    case "SET_PREDICTION_AIM":
      return { ...state, predictionAim: action.payload };
    case "SET_PREDICTION_POPULATION":
      return { ...state, predictionPopulation: action.payload };
    case "SET_PREDICTION_OUTCOME":
      return { ...state, predictionOutcome: action.payload };
    case "SET_PREDICTION_OUTCOME_TYPE":
      return { ...state, predictionOutcomeType: action.payload };
    case "SET_PREDICTION_PREDICTORS":
      return { ...state, predictionPredictors: action.payload };
    case "SET_PREDICTION_MODEL":
      return { ...state, predictionModelType: action.payload };
    case "SET_PREDICTION_DATA":
      return { ...state, predictionDataFile: action.payload };
    case "SET_PREDICTION_SAMPLE_SIZE":
      return { ...state, predictionSampleSize: action.payload };
    case "SET_PREDICTION_MISSING":
      return { ...state, predictionMissingDataStrategy: action.payload };
    case "SET_PREDICTION_MODEL_RESULT":
      return { ...state, predictionModelResult: action.payload };
    case "SET_PREDICTION_PERFORMANCE":
      return { ...state, predictionPerformance: action.payload };
    case "SET_PREDICTION_DECISION_CURVE":
      return { ...state, predictionDecisionCurve: action.payload };
    case "SET_PREDICTION_REPORT":
      return { ...state, predictionReport: action.payload };
    case "SET_PREDICTION_LOADING":
      return { ...state, predictionLoading: action.payload };
    case "SET_PREDICTION_MODEL_STRATEGY":
      return { ...state, predictionModelStrategy: action.payload };
    case "SET_PREDICTION_DCA_MIN":
      return { ...state, predictionDcaMinThreshold: action.payload };
    case "SET_PREDICTION_DCA_MAX":
      return { ...state, predictionDcaMaxThreshold: action.payload };
    case "SET_PREDICTION_IMPORTANCE_METHOD":
      return { ...state, predictionImportanceMethod: action.payload };
    case "SET_PREDICTION_REPORT_NOTES":
      return { ...state, predictionReportNotes: action.payload };
    case "SET_PREDICTION_CAPTUM_ENABLED":
      return { ...state, predictionCaptumEnabled: action.payload };
    case "SET_PREDICTION_CAPTUM_RESULTS":
      return { ...state, predictionCaptumResults: action.payload };
    case "RESET_STATE":
      return { ...initialState };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
