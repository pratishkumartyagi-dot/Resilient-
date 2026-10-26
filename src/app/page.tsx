"use client";

import { lazy, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { AppProvider, useApp } from "@/context/AppContext";
import Header from "@/components/Header";
import TopTabs from "@/components/TopTabs";
import TabLoadingSkeleton from "@/components/TabLoadingSkeleton";

// SettingsModal and ModelLoadingIndicator are NOT part of the first paint:
// they subscribe to events / model progress only. Loaded client-side after
// hydration so they (and their transitive deps) never block the preview.
const SettingsModal = dynamic(() => import("@/components/SettingsModal"), { ssr: false });
const ModelLoadingIndicator = dynamic(() => import("@/components/ModelLoadingIndicator"), { ssr: false });

const ThesisGenerator = lazy(() => import("@/components/pipelines/ThesisGenerator"));
const EvidenceSynthesis = lazy(() => import("@/components/pipelines/EvidenceSynthesis"));
const PaperWriterTab = lazy(() => import("@/components/tabs/PaperWriterTab"));
const ProtocolChatTab = lazy(() => import("@/components/tabs/ProtocolChatTab"));
const GrantWritingTab = lazy(() => import("@/components/tabs/GrantWritingTab"));
const OmicsBioinformaticsTab = lazy(() => import("@/components/tabs/OmicsBioinformaticsTab"));
const ResilientChatTab = lazy(() => import("@/components/tabs/ResilientChatTab"));
const StatisticalAnalysisTab = lazy(() => import("@/components/tabs/StatisticalAnalysisTab"));
const SampleSizeTab = lazy(() => import("@/components/tabs/SampleSizeTab"));
const PredictiveAnalysisTab = lazy(() => import("@/components/tabs/PredictiveAnalysisTab"));
const CriticalAppraisal = lazy(() => import("@/components/pipelines/CriticalAppraisal"));

function withSuspense(node: React.ReactNode, label?: string) {
  return <Suspense fallback={<TabLoadingSkeleton label={label} />}>{node}</Suspense>;
}

function AppContent() {
  const { state, dispatch } = useApp();

  const renderTabContent = () => {
    switch (state.currentTab) {
      case "chat":
        return withSuspense(<ResilientChatTab />, "Resilient Chat");
      case "stats":
        return withSuspense(<StatisticalAnalysisTab />, "Statistical Analysis");
      case "samplesize":
        return withSuspense(<SampleSizeTab />, "Sample Size Calculator");
      case "predictive":
        return withSuspense(<PredictiveAnalysisTab />, "Predictive Analysis");
      case "paperwriter":
        return withSuspense(<PaperWriterTab />, "Paper Writer & Reviewer");
      case "protocol":
        return withSuspense(<ProtocolChatTab />, "Protocol Generator");
      case "grant":
        return withSuspense(<GrantWritingTab />, "Grant Writing");
      case "omics":
        return withSuspense(<OmicsBioinformaticsTab />, "Omics & Bioinformatics");
      case "thesis":
        return withSuspense(<ThesisGenerator />, "Thesis Generator");
      case "evidence-synthesis":
        return withSuspense(<EvidenceSynthesis />, "Evidence Synthesis");
      case "appraisal":
        return withSuspense(<CriticalAppraisal />, "Critical Appraisal");
      default:
        return withSuspense(<GrantWritingTab />, "Grant Writing");
    }
  };

  // Header dispatches "open-thesis-generator" to switch directly to the Thesis Generator tab.
  useEffect(() => {
    const onOpenThesisGenerator = () => dispatch({ type: "SET_TAB", payload: "thesis" });
    window.addEventListener("open-thesis-generator", onOpenThesisGenerator);
    return () => window.removeEventListener("open-thesis-generator", onOpenThesisGenerator);
  }, [dispatch]);

  // Header dispatches "open-evidence-synthesis" to switch directly to the Evidence Synthesis tab.
  useEffect(() => {
    const onOpenEvidenceSynthesis = () => dispatch({ type: "SET_TAB", payload: "evidence-synthesis" });
    window.addEventListener("open-evidence-synthesis", onOpenEvidenceSynthesis);
    return () => window.removeEventListener("open-evidence-synthesis", onOpenEvidenceSynthesis);
  }, [dispatch]);

  // Header dispatches "open-appraisal" to switch directly to the Critical Appraisal tab.
  useEffect(() => {
    const onOpenAppraisal = () => dispatch({ type: "SET_TAB", payload: "appraisal" });
    window.addEventListener("open-appraisal", onOpenAppraisal);
    return () => window.removeEventListener("open-appraisal", onOpenAppraisal);
  }, [dispatch]);

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
