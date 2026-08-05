"use client";

import { Suspense, lazy } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import Header from "@/components/Header";
import TopTabs from "@/components/TopTabs";
import StepNavigator from "@/components/StepNavigator";

const Step1Search = lazy(() => import("@/components/steps/Step1Search"));
const Step2Results = lazy(() => import("@/components/steps/Step2Results"));
const Step3Synthesis = lazy(() => import("@/components/steps/Step3Synthesis"));
const Step4LiteratureReview = lazy(() => import("@/components/steps/Step4LiteratureReview"));
const Step5Themes = lazy(() => import("@/components/steps/Step5Themes"));
const Step6ResearchQuestions = lazy(() => import("@/components/steps/Step6ResearchQuestions"));
const Step7ResearchTitles = lazy(() => import("@/components/steps/Step7ResearchTitles"));
const Step8AimObjectives = lazy(() => import("@/components/steps/Step8AimObjectives"));
const Step9Methodology = lazy(() => import("@/components/steps/Step9Methodology"));
const Step10Protocol = lazy(() => import("@/components/steps/Step10Protocol"));
const Step11Impact = lazy(() => import("@/components/steps/Step11Impact"));

const ResilientChatTab = lazy(() => import("@/components/tabs/ResilientChatTab"));
const StatisticalAnalysisTab = lazy(() => import("@/components/tabs/StatisticalAnalysisTab"));
const SampleSizeTab = lazy(() => import("@/components/tabs/SampleSizeTab"));
const PredictiveAnalysisTab = lazy(() => import("@/components/tabs/PredictiveAnalysisTab"));
const EvidenceSynthesisTab = lazy(() => import("@/components/tabs/EvidenceSynthesisTab"));
const PaperWriterTab = lazy(() => import("@/components/tabs/PaperWriterTab"));
const ProtocolChatTab = lazy(() => import("@/components/tabs/ProtocolChatTab"));
const GrantWritingTab = lazy(() => import("@/components/tabs/GrantWritingTab"));
const OmicsBioinformaticsTab = lazy(() => import("@/components/tabs/OmicsBioinformaticsTab"));

import SettingsModal from "@/components/SettingsModal";
import ModelLoadingIndicator from "@/components/ModelLoadingIndicator";

function LazyStep({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8 text-blue-300">Loading...</div>}>
      {children}
    </Suspense>
  );
}

function AppContent() {
  const { state } = useApp();

  const renderMainPipeline = () => {
    switch (state.currentStep) {
      case 1: return <LazyStep><Step1Search /></LazyStep>;
      case 2: return <LazyStep><Step2Results /></LazyStep>;
      case 3: return <LazyStep><Step3Synthesis /></LazyStep>;
      case 4: return <LazyStep><Step4LiteratureReview /></LazyStep>;
      case 5: return <LazyStep><Step5Themes /></LazyStep>;
      case 6: return <LazyStep><Step6ResearchQuestions /></LazyStep>;
      case 7: return <LazyStep><Step7ResearchTitles /></LazyStep>;
      case 8: return <LazyStep><Step8AimObjectives /></LazyStep>;
      case 9: return <LazyStep><Step9Methodology /></LazyStep>;
      case 10: return <LazyStep><Step10Protocol /></LazyStep>;
      case 11: return <LazyStep><Step11Impact /></LazyStep>;
      default: return <LazyStep><Step1Search /></LazyStep>;
    }
  };

  const renderTabContent = () => {
    switch (state.currentTab) {
      case "main": return <StepNavigator>{renderMainPipeline()}</StepNavigator>;
      case "omics": return <LazyStep><OmicsBioinformaticsTab /></LazyStep>;
      case "chat": return <LazyStep><ResilientChatTab /></LazyStep>;
      case "stats": return <LazyStep><StatisticalAnalysisTab /></LazyStep>;
      case "samplesize": return <LazyStep><SampleSizeTab /></LazyStep>;
      case "predictive": return <LazyStep><PredictiveAnalysisTab /></LazyStep>;
      case "systematic": return <LazyStep><EvidenceSynthesisTab /></LazyStep>;
      case "paperwriter": return <LazyStep><PaperWriterTab /></LazyStep>;
      case "protocol": return <LazyStep><ProtocolChatTab /></LazyStep>;
      default: return <LazyStep><GrantWritingTab /></LazyStep>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a]">
      <Header />
      <TopTabs />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{renderTabContent()}</main>
      <SettingsModal />
      <ModelLoadingIndicator />
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
