"use client";

import React, { useState } from "react";
import { Sparkles, BookOpen, RotateCcw } from "lucide-react";
import { useApp } from "@/context/AppContext";

const generateMockLiteratureReview = (): string => {
  return `1. Introduction and Background

Latent tuberculosis infection (LTBI) represents a significant global public health challenge, affecting approximately one-quarter of the world's population (Houben & Dodd, 2014). Healthcare workers (HCWs) are disproportionately exposed to Mycobacterium tuberculosis due to their occupational proximity to infectious patients, making systematic LTBI screening an essential institutional safeguard. Multiple epidemiological studies have demonstrated that HCWs face a substantially elevated risk of LTBI acquisition compared to the general population, with meta-analytic estimates suggesting a two- to three-fold increased odds ratio (Diel et al., 2022).

2. Global Prevalence and Epidemiological Patterns

A comprehensive systematic review encompassing 23 studies across 12 countries reported LTBI prevalence among HCWs ranging from 15% to 45%, with marked heterogeneity attributed to geographical region, healthcare setting type, and diagnostic modality employed (Maguire et al., 2022). Low- and middle-income countries (LMICs) consistently reported higher prevalence rates, which may reflect both genuine exposure gradients and differential access to occupational health infrastructure. The pooling of data across diverse healthcare contexts—from tertiary teaching hospitals in Western nations to primary care clinics in rural sub-Saharan Africa—revealed that structural factors, including ventilation adequacy, institutional IPC budget, and staff-to-patient ratios, mediated LTBI risk independent of individual-level determinants (Osei et al., 2023).

3. Diagnostic Approaches: IGRA versus Tuberculin Skin Test

The comparative diagnostic accuracy of interferon-gamma release assays (IGRAs) and tuberculin skin tests (TST) has been extensively debated. IGRAs demonstrated consistently higher specificity (median 95%) compared to TST (median 78%) in BCG-vaccinated populations, which has significant implications for screening program design in countries with universal BCG coverage (Zwerling et al., 2021). A multicentre study involving 8,500 HCWs across 4 tertiary hospitals in Nigeria found that IGRA-based annual screening yielded a cost per quality-adjusted life-year (QALY) gained of $1,240—well below the WHO willingness-to-pay threshold for sub-Saharan Africa—supporting the feasibility of routine IGRA implementation in resource-constrained settings (Okonkwo et al., 2023).

4. Innovative Delivery Models

Recent evidence has highlighted the role of innovative service delivery models in overcoming structural barriers to LTBI screening. A cluster randomized controlled trial evaluating a mobile radiology van program in rural China demonstrated a 320% increase in detection rates relative to fixed-site screening alone, with the combined approach of IGRA plus same-day chest radiography achieving 94% sensitivity (Chen et al., 2021). Similarly, digital health tools deployed in Mumbai slums were associated with a 47% improvement in contact tracing completion rates, achieved primarily through automated appointment reminders and biometric patient identification (Kumar et al., 2024).

5. Research Gaps and Future Directions

Despite the expanding evidence base, several critical research gaps persist. First, the exclusion of pediatric HCWs and ancillary staff from most studies limits generalizability to the broader workforce. Second, longitudinal follow-up data beyond five years post-exposure remain limited, impeding our understanding of late conversion dynamics and the durability of preventive therapy-induced immune modulation. Third, the integration of novel molecular diagnostics—including Xpert MTB/RIF Ultra—within routine occupational screening has received minimal empirical attention. Fourth, cost-effectiveness modeling from South Asian contexts outside India, as well as from Central and East African contexts, remains underdeveloped.

6. Conclusion

The accumulated evidence strongly supports the implementation of systematic, evidence-informed LTBI screening programs for HCWs, with IGRA-based protocols demonstrating superior specificity and favorable cost-effectiveness profiles in LMIC contexts. Delivery innovations—particularly those leveraging mobile and digital technologies—offer scalable solutions to access constraints. Future research priorities should include expanding the evidence base to understudied populations, evaluating newer diagnostic platforms, and assessing program sustainability beyond initial pilot phases.`;
};

export default function Step4LiteratureReview() {
  const { state, dispatch } = useApp();
  const [reviewText, setReviewText] = useState(state.literatureReview || "");

  const handleGenerateReview = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const mockReview = generateMockLiteratureReview();
      setReviewText(mockReview);
      dispatch({ type: "SET_LITERATURE_REVIEW", payload: mockReview });
      dispatch({ type: "SET_LOADING", payload: false });
    }, 2500);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setReviewText(newValue);
    dispatch({ type: "SET_LITERATURE_REVIEW", payload: newValue });
  };

  const handleReset = () => {
    if (confirm("Reset literature review to original AI-generated version?")) {
      const mockReview = generateMockLiteratureReview();
      setReviewText(mockReview);
      dispatch({ type: "SET_LITERATURE_REVIEW", payload: mockReview });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 4: Review of Literature</h2>
            <p className="text-sm text-blue-300">
              Generate a comprehensive narrative review synthesized from your selected papers.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={!reviewText || state.isLoading}
              className="flex items-center gap-2 bg-blue-900/50 text-blue-200 px-3 py-2 rounded-lg hover:bg-blue-800/60 text-sm disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleGenerateReview}
              disabled={state.isLoading}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles size={16} />
              {state.isLoading ? "Generating..." : "Generate Review of Literature"}
            </button>
          </div>
        </div>

        {state.isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Synthesizing evidence across selected papers...</p>
              <p className="text-blue-400 text-xs mt-1">This may take 30-60 seconds</p>
            </div>
          </div>
        )}

        {!state.isLoading && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-blue-400 flex items-center gap-1">
                <BookOpen size={12} />
                Editable — modify the generated text below
              </span>
              <span className="text-xs text-blue-500">{reviewText.length} characters | {reviewText.split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <textarea
              value={reviewText}
              onChange={handleTextChange}
              placeholder="AI-generated literature review will appear here. You can also paste your own text..."
              className="w-full h-[500px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-serif leading-relaxed placeholder:text-blue-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
            />
          </div>
        )}
      </div>
    </div>
  );
}
