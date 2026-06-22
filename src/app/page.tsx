"use client";

import { useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import Header from "@/components/Header";
import TopTabs from "@/components/TopTabs";
import StepNavigator from "@/components/StepNavigator";
import Step1Search from "@/components/steps/Step1Search";
import Step2Results from "@/components/steps/Step2Results";
import Step3Synthesis from "@/components/steps/Step3Synthesis";
import Step4LiteratureReview from "@/components/steps/Step4LiteratureReview";
import Step5Themes from "@/components/steps/Step5Themes";
import Step6ResearchQuestions from "@/components/steps/Step6ResearchQuestions";
import Step7ResearchTitles from "@/components/steps/Step7ResearchTitles";
import Step8AimObjectives from "@/components/steps/Step8AimObjectives";
import Step9Methodology from "@/components/steps/Step9Methodology";
import Step10Protocol from "@/components/steps/Step10Protocol";
import Step11Impact from "@/components/steps/Step11Impact";
import ResilientChatTab from "@/components/tabs/ResilientChatTab";
import StatisticalAnalysisTab from "@/components/tabs/StatisticalAnalysisTab";
import SampleSizeTab from "@/components/tabs/SampleSizeTab";
import SystematicReviewTab from "@/components/tabs/SystematicReviewTab";
import PaperWriterTab from "@/components/tabs/PaperWriterTab";
import GrantWritingTab from "@/components/tabs/GrantWritingTab";

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
      case "chat": return <ResilientChatTab />;
      case "stats": return <StatisticalAnalysisTab />;
      case "samplesize": return <SampleSizeTab />;
      case "systematic": return <SystematicReviewTab />;
      case "paperwriter": return <PaperWriterTab />;
      default: return <GrantWritingTab />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a]">
      <Header />
      <TopTabs />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{renderTabContent()}</main>
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
