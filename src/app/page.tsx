"use client";

import dynamic from "next/dynamic";
import { AppProvider, useApp } from "@/context/AppContext";
import Header from "@/components/Header";
import TopTabs from "@/components/TopTabs";
import StepNavigator from "@/components/StepNavigator";

const Step1Search = dynamic(() => import("@/components/steps/Step1Search"), { ssr: false });
const Step2Results = dynamic(() => import("@/components/steps/Step2Results"), { ssr: false });
const Step3Synthesis = dynamic(() => import("@/components/steps/Step3Synthesis"), { ssr: false });
const Step4LiteratureReview = dynamic(() => import("@/components/steps/Step4LiteratureReview"), { ssr: false });
const Step5Themes = dynamic(() => import("@/components/steps/Step5Themes"), { ssr: false });
const Step6ResearchQuestions = dynamic(() => import("@/components/steps/Step6ResearchQuestions"), { ssr: false });
const Step7ResearchTitles = dynamic(() => import("@/components/steps/Step7ResearchTitles"), { ssr: false });
const Step8AimObjectives = dynamic(() => import("@/components/steps/Step8AimObjectives"), { ssr: false });
const Step9Methodology = dynamic(() => import("@/components/steps/Step9Methodology"), { ssr: false });
const Step10Protocol = dynamic(() => import("@/components/steps/Step10Protocol"), { ssr: false });
const Step11Impact = dynamic(() => import("@/components/steps/Step11Impact"), { ssr: false });

const ResilientChatTab = dynamic(() => import("@/components/tabs/ResilientChatTab"), { ssr: false });
const StatisticalAnalysisTab = dynamic(() => import("@/components/tabs/StatisticalAnalysisTab"), { ssr: false });
const SampleSizeTab = dynamic(() => import("@/components/tabs/SampleSizeTab"), { ssr: false });
const PredictiveAnalysisTab = dynamic(() => import("@/components/tabs/PredictiveAnalysisTab"), { ssr: false });
const EvidenceSynthesisTab = dynamic(() => import("@/components/tabs/EvidenceSynthesisTab"), { ssr: false });
const PaperWriterTab = dynamic(() => import("@/components/tabs/PaperWriterTab"), { ssr: false });
const ProtocolChatTab = dynamic(() => import("@/components/tabs/ProtocolChatTab"), { ssr: false });
const GrantWritingTab = dynamic(() => import("@/components/tabs/GrantWritingTab"), { ssr: false });
const OmicsBioinformaticsTab = dynamic(() => import("@/components/tabs/OmicsBioinformaticsTab"), { ssr: false });

import SettingsModal from "@/components/SettingsModal";
import ModelLoadingIndicator from "@/components/ModelLoadingIndicator";

function AppContent() {
  const { state } = useApp();

  const renderMainPipeline = () => {
    switch (state.currentStep) {
      case 1: return <Step1Search />;
      case 2: return <Step2Results />;
      case 3: return <Step3Synthesis />;
      case 4: return <Step4LiteratureReview />;
      case 5: return <Step5Themes />;
      case 6: return <Step6ResearchQuestions />;
      case 7: return <Step7ResearchTitles />;
      case 8: return <Step8AimObjectives />;
      case 9: return <Step9Methodology />;
      case 10: return <Step10Protocol />;
      case 11: return <Step11Impact />;
      default: return <Step1Search />;
    }
  };

  const renderTabContent = () => {
    switch (state.currentTab) {
      case "main": return <StepNavigator>{renderMainPipeline()}</StepNavigator>;
      case "omics": return <OmicsBioinformaticsTab />;
      case "chat": return <ResilientChatTab />;
      case "stats": return <StatisticalAnalysisTab />;
      case "samplesize": return <SampleSizeTab />;
      case "predictive": return <PredictiveAnalysisTab />;
      case "systematic": return <EvidenceSynthesisTab />;
      case "paperwriter": return <PaperWriterTab />;
      case "protocol": return <ProtocolChatTab />;
      default: return <GrantWritingTab />;
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
