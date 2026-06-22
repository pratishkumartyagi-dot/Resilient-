"use client";

import React, { useState } from "react";
import { Sparkles, Trophy, Users, Globe, Download, Share2, ArrowLeft } from "lucide-react";
import { useApp } from "@/context/AppContext";

const generateMockImpactAssessment = (): string => {
  return `IMPACT ASSESSMENT: AI-DRIVEN RESEARCH IMPACT ANALYSIS
================================================================

STUDY IDENTIFIER
Title: Implementation and Cost-Effectiveness of Annual IGRA-Based LTBI Screening Among Healthcare Workers in Tertiary Care Hospitals: A Mixed-Methods Study
Principal Investigator: [To be assigned]
Funder Context: WHO AFRO, Nigeria MoH, Research Grants Council

════════════════════════════════════════════════════════════════
1. SCIENTIFIC IMPACT
════════════════════════════════════════════════════════════════
• Novelty Score (0–100): 82/100
  – Integrates three high-value innovation threads: (1) sub-Saharan cost-effectiveness evidence, (2) mobile digital contact tracing, and (3) implementation science framing.
  – Addresses a critical gap: almost no studies combine economic evaluation with mixed-methods HCW acceptability measurement in this context.

• Evidence Gap Addressed: The 10 identified themes span diagnostic, economic, structural, stigma, and methodological domains—ensuring multi-dimensional contribution.

• Citation Potential: HIGH. Comparator (TST annual screening) studies are declining in LMIC publications; this work will serve as a benchmark.

⬆️ Anticipated H-index Contribution: +3 to +5 primary-author citations within 3 years of publication in IJTLD or PLOS Medicine.

════════════════════════════════════════════════════════════════
2. POLICY & HEALTH SYSTEM IMPACT
════════════════════════════════════════════════════════════════
• Policy Alignment: Strong alignment with WHO 2023 LTBI guidelines (targets HCWs as priority group), Nigeria National TB & Leprosy Control Programme (NTLCP) strategic plan 2023–2027.

• Scalability Indicator: HIGH. Intervention leverages existing hospital occupational health infrastructure; no novel capital equipment required beyond IGRA kits.

• Policy Recommendation Output: Yes — a policy brief (2-page digest) will be produced alongside the primary manuscript for MoH submission.

════════════════════════════════════════════════════════════════
3. SOCIAL & COMMUNITY IMPACT
════════════════════════════════════════════════════════════════
• HCW Well-being: Estimated 18% reduction in LTBI-related anxiety symptomology (based on StD reduction from digital reminder support group data).

• Stigma Mitigation: Confidential peer-group counseling component will be piloted—expected to reduce self-stigma scores by ≥30% (measured using Berger HIV Stigma Scale, adapted).

• Economic Risk Reduction: Preventive therapy initiation within 3 months of IGRA positivity reduces individual TB progression risk by 90% (WHO metanalysis, 2022), translating to approximately N=360 future productive life-years saved per 1,000 HCWs screened.

════════════════════════════════════════════════════════════════
4. CAPACITY BUILDING & TRAINING
════════════════════════════════════════════════════════════════
• Local Research Capacity: 4 MSc Epidemiology students embedded as research assistants → skills transfer in sampling, data management, and mixed-methods analysis.
• Training Materials: Developed SOP manual and 8 CPD-accredited e-learning modules on IGRA interpretation.
• Community Advisory Board Establishment: Proposed 12-member CAB including HCW representatives, patient advocates, and NTLCP personnel to ensure community-led implementation design.

════════════════════════════════════════════════════════════════
5. ECONOMIC IMPACT MATRIX
════════════════════════════════════════════════════════════════
| Metric                          | Estimate (USD)      | Confidence |
|---------------------------------|----------------------|------------|
| Program Cost (3 years)          | $1,240,000           | Medium     |
| QALYs Gained                    | 1,120 QALYs          | High       |
| ICER                            | $1,107 / QALY        | High       |
| Budget Impact (National Scale)  | $18.4M / year        | Low        |
| Cost Aversion (TB Case Prevented)| $3,200 / case       | Medium     |

════════════════════════════════════════════════════════════════
6. RISK ASSESSMENT & MITIGATION STRATEGIES
════════════════════════════════════════════════════════════════
| Risk Level | Risk Description                    | Mitigation                              |
|------------|-------------------------------------|-----------------------------------------|
| HIGH       | Staff turnover during study period  | Cross-training and redundancy protocol  |
| MEDIUM     | IGRA supply chain intermittency     | 3-month buffer stock + dual-supplier    |
| MEDIUM     | Low IPT uptake due to stigma        | Anonymous counseling pilot              |
| LOW        | Power shortfall if effect small     | Pre-planned Bayesian futility analysis  |

════════════════════════════════════════════════════════════════
7. SUSTAINABILITY & LONG-TERM TRACKING
════════════════════════════════════════════════════════════════
• Sustainability Plan: Handover to NTLCP operational budget in Year 4 with reduced external dependency.
• Data Sharing: De-identified dataset deposited in Harvard Dataverse under CC-BY-4.0 within 12 months of publication.
• Follow-up: 5-year post-intervention prevalence survey to assess sustained program effects.

════════════════════════════════════════════════════════════════
8. OVERALL IMPACT SCORE SUMMARY
════════════════════════════════════════════════════════════════
| Domain                    | Score (0–100) |
|---------------------------|---------------|
| Scientific Rigor          | 82            |
| Policy Relevance          | 88            |
| Social Justice            | 76            |
| Economic Value            | 74            |
| Capacity Building         | 71            |
| Risk Management Quality   | 68            |
|----------------------------|---------------|
| OVERALL COMPOSITE SCORE   | 76.5 / 100    |

================================================================
Generated by Resilient Research Assistant AI — Powered by [Model]
Timestamp: ${new Date().toISOString()}
================================================================`;
};

export default function Step11Impact() {
  const { state, dispatch } = useApp();
  const [impactText, setImpactText] = useState(state.impactAssessment);
  const [isEditing, setIsEditing] = useState(false);

  const handleGenerateImpact = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    setTimeout(() => {
      const mockImpact = generateMockImpactAssessment();
      setImpactText(mockImpact);
      dispatch({ type: "SET_IMPACT", payload: mockImpact });
      dispatch({ type: "SET_LOADING", payload: false });
    }, 2500);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setImpactText(e.target.value);
    dispatch({ type: "SET_IMPACT", payload: e.target.value });
  };

  const handleExport = () => {
    const blob = new Blob([impactText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "impact-assessment.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Step 11: Impact Assessment</h2>
            <p className="text-sm text-blue-300">
              AI-driven research impact analysis across scientific, policy, social, economic, and capacity domains.
            </p>
          </div>
          <button
            onClick={handleGenerateImpact}
            disabled={state.isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={16} />
            {state.isLoading ? "Analyzing Impact..." : "Generate Impact Assessment"}
          </button>
        </div>

        {state.isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-blue-200 text-sm">Running multi-domain impact analysis...</p>
              <p className="text-blue-400 text-xs mt-1">Evaluating scientific, policy, economic, and social outputs</p>
            </div>
          </div>
        )}

        {!state.isLoading && impactText && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs bg-blue-900/50 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-900/70"
                >
                  {isEditing ? "Preview Mode" : "Edit Mode"}
                </button>
                <button
                  onClick={handleExport}
                  className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded hover:bg-green-900/70 flex items-center gap-1"
                >
                  <Download size={12} />
                  Export
                </button>
                <button
                  onClick={() => alert("Share link copied to clipboard (mock)")}
                  className="text-xs bg-purple-900/50 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-900/70 flex items-center gap-1"
                >
                  <Share2 size={12} />
                  Share
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-yellow-300 bg-yellow-900/20 border border-yellow-700/50 rounded px-2 py-1">
                  <Trophy size={12} /> Composite Score: 76.5 / 100
                </span>
                <span className="text-blue-400">FI-RECOM FINAL STEP</span>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={impactText}
                onChange={handleTextChange}
                className="w-full h-[500px] bg-blue-950 border border-blue-800 text-white rounded-lg p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y whitespace-pre-wrap"
              />
            ) : (
              <div className="bg-blue-950 border border-blue-900 rounded-lg p-5 h-[500px] overflow-y-auto">
                <pre className="text-sm text-blue-100 font-mono leading-relaxed whitespace-pre-wrap">{impactText}</pre>
              </div>
            )}
          </div>
        )}

        {!state.isLoading && !impactText && (
          <div className="text-center py-12 text-blue-400">
            <Trophy size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Generate your research impact assessment to review publication-readiness scores and policy relevance.</p>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => dispatch({ type: "SET_STEP", payload: 10 })}
            className="bg-blue-900/50 text-blue-200 hover:bg-blue-900/70 px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Protocol
          </button>
          <button
            onClick={() => alert("Congratulations! Research pipeline complete. You can export your full project from individual steps.")}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-lg flex items-center gap-2"
          >
            <Trophy size={16} />
            Complete Research Pipeline
          </button>
        </div>
      </div>
    </div>
  );
}
