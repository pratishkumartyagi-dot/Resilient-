"use client";

import { lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import { AppProvider, useApp } from "@/context/AppContext";
import Header from "@/components/Header";
import TopTabs from "@/components/TopTabs";
import StepNavigator from "@/components/StepNavigator";
import TabLoadingSkeleton from "@/components/TabLoadingSkeleton";

// SettingsModal and ModelLoadingIndicator are NOT part of the first paint:
// they subscribe to events / model progress only. Loaded client-side after
// hydration so they (and their transitive deps) never block the preview.
const SettingsModal = dynamic(() => import("@/components/SettingsModal"), { ssr: false });
const ModelLoadingIndicator = dynamic(() => import("@/components/ModelLoadingIndicator"), { ssr: false });

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

function withSuspense(node: React.ReactNode, label?: string) {
  return <Suspense fallback={<TabLoadingSkeleton label={label} />}>{node}</Suspense>;
}

function AppContent() {
  const { state } = useApp();

  const renderMainPipeline = () => {
    switch (state.currentStep) {
      case 1: return withSuspense(<Step1Search />, "Research Pipeline · Step 1");
      case 2: return withSuspense(<Step2Results />, "Research Pipeline · Step 2");
      case 3: return withSuspense(<Step3Synthesis />, "Research Pipeline · Step 3");
      case 4: return withSuspense(<Step4LiteratureReview />, "Research Pipeline · Step 4");
      case 5: return withSuspense(<Step5Themes />, "Research Pipeline · Step 5");
      case 6: return withSuspense(<Step6ResearchQuestions />, "Research Pipeline · Step 6");
      case 7: return withSuspense(<Step7ResearchTitles />, "Research Pipeline · Step 7");
      case 8: return withSuspense(<Step8AimObjectives />, "Research Pipeline · Step 8");
      case 9: return withSuspense(<Step9Methodology />, "Research Pipeline · Step 9");
      case 10: return withSuspense(<Step10Protocol />, "Research Pipeline · Step 10");
      case 11: return withSuspense(<Step11Impact />, "Research Pipeline · Step 11");
      default: return withSuspense(<Step1Search />, "Research Pipeline · Step 1");
    }
  };

  const renderTabContent = () => {
    switch (state.currentTab) {
      case "main":
        return <StepNavigator>{renderMainPipeline()}</StepNavigator>;
      case "omics":
        return withSuspense(<OmicsBioinformaticsTab />, "Omics & Bioinformatics");
      case "chat":
        return withSuspense(<ResilientChatTab />, "Resilient Chat");
      case "stats":
        return withSuspense(<StatisticalAnalysisTab />, "Statistical Analysis");
      case "samplesize":
        return withSuspense(<SampleSizeTab />, "Sample Size Calculator");
      case "predictive":
        return withSuspense(<PredictiveAnalysisTab />, "Predictive Analysis");
      case "systematic":
        return withSuspense(<EvidenceSynthesisTab />, "Evidence Synthesis & Meta-analysis");
      case "paperwriter":
        return withSuspense(<PaperWriterTab />, "Paper Writer & Reviewer");
      case "protocol":
        return withSuspense(<ProtocolChatTab />, "Protocol Generator");
      case "grant":
        return withSuspense(<GrantWritingTab />, "Grant Writing");
      default:
        return withSuspense(<GrantWritingTab />, "Grant Writing");
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