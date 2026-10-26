"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";
import { configureAiKeys } from "@/lib/ai";

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
  sources?: string[];
  sourceBackend?: string;
  citationStatus?: "verified" | "unverified" | "no-doi";
  citationMessage?: string;
  memberIds?: string[];
}

export interface SynthesisRow {
  id: string;
  reference: string;
  keyFindings: string;
  synopsis: string;
  studyDetails: string;
  researchGaps: string;
}

export interface AppState {
  currentTab: string;
  papers: Paper[];
  selectedPapers: Paper[];
  synthesisTable: SynthesisRow[];
  literatureReview: string;
  uploadedDocuments: File[];
  isLoading: boolean;
  error: string;
  selectedDatabases: string[];
  geminiApiKey: string;
  groqApiKey: string;
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
  | { type: "SET_PAPERS"; payload: Paper[] }
  | { type: "TOGGLE_PAPER"; payload: string }
  | { type: "SET_PAPER_SELECTION"; payload: { ids: string[]; selected: boolean } }
  | { type: "SELECT_ALL_PAPERS"; payload: boolean }
  | { type: "SET_SYNTHESIS"; payload: SynthesisRow[] }
  | { type: "SET_LITERATURE_REVIEW"; payload: string }
  | { type: "SET_UPLOADED_DOCS"; payload: File[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_SELECTED_DATABASES"; payload: string[] }
  | { type: "SET_SELECTED_PAPERS"; payload: Paper[] }
  | { type: "SET_GEMINI_KEY"; payload: string }
  | { type: "SET_GROQ_KEY"; payload: string }
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
  currentTab: "chat",
  papers: [],
  selectedPapers: [],
  synthesisTable: [],
  literatureReview: "",
  uploadedDocuments: [],
  isLoading: false,
  error: "",
  selectedDatabases: [
    "PubMed",
    "Europe PMC",
    "bioRxiv",
    "medRxiv",
    "Crossref",
    "arXiv",
    "OpenAIRE",
    "Zenodo",
    "ClinicalTrials.gov",
  ],
  geminiApiKey: "",
  groqApiKey: "",
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
    case "SET_PAPERS":
      return { ...state, papers: action.payload, selectedPapers: action.payload.filter((p) => p.selected) };
    case "TOGGLE_PAPER":
      return {
        ...state,
        papers: state.papers.map((p) => (p.id === action.payload ? { ...p, selected: !p.selected } : p)),
        selectedPapers: state.papers.map((p) =>
          p.id === action.payload ? { ...p, selected: !p.selected } : p
        ).filter((p) => p.selected),
      };
    case "SET_PAPER_SELECTION": {
      const ids = new Set(action.payload.ids);
      const selected = action.payload.selected;
      const papers = state.papers.map((p) => (ids.has(p.id) ? { ...p, selected } : p));
      return { ...state, papers, selectedPapers: papers.filter((p) => p.selected) };
    }
    case "SELECT_ALL_PAPERS": {
      const papers = state.papers.map((p) => ({ ...p, selected: action.payload }));
      return { ...state, papers, selectedPapers: papers.filter((p) => p.selected) };
    }
    case "SET_SYNTHESIS":
      return { ...state, synthesisTable: action.payload };
    case "SET_LITERATURE_REVIEW":
      return { ...state, literatureReview: action.payload };
    case "SET_UPLOADED_DOCS":
      return { ...state, uploadedDocuments: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SELECTED_DATABASES":
      return { ...state, selectedDatabases: action.payload };
    case "SET_SELECTED_PAPERS":
      return { ...state, selectedPapers: action.payload };
    case "SET_GEMINI_KEY":
      return { ...state, geminiApiKey: action.payload };
    case "SET_GROQ_KEY":
      return { ...state, groqApiKey: action.payload };
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

  React.useEffect(() => {
    configureAiKeys({ gemini: state.geminiApiKey, groq: state.groqApiKey });
  }, [state.geminiApiKey, state.groqApiKey]);

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
