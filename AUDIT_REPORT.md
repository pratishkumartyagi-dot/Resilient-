# Audit Report — Resilient Research App

**Date:** 2026-11-15
**Version:** 0.7.6 → 0.7.7 (next)
**Branch:** kilo/warm-key-dj6

## Scope

Two pipelines audited:
1. **Main research pipeline** (11 steps + topic tabs), `src/components/steps/Step*.tsx`, `src/components/tabs/*.tsx`.
2. **Evidence Synthesis & Meta-analysis pipeline** (6 steps), `src/components/tabs/EvidenceSynthesisTab.tsx`.

Plus the new **PaperOrchestra (google-research/paper-orchestra)** multi-agent writing integration.

---

## 1. Main research pipeline

### Structure
11 steps wired in `src/app/page.tsx:50-65` via `StepNavigator`:
1. Search, 2. Results, 3. Synthesis Table, 4. Review of Literature, 5. Themes,
6. Research Questions, 7. Research Titles, 8. Aim & Objectives, 9. Methodology,
10. Protocol, 11. Impact.

Tabs: main, omics, chat, stats, samplesize, predictive, systematic (evidence synthesis),
paperwriter, protocol, grant, thesis, slr, appraisal, jbi.

### Findings
- **Step 3 (Synthesis)** (`src/components/steps/Step3Synthesis.tsx`): AI-assisted structured synthesis (Vancouver refs, key findings, synopsis, study details, research gaps) with Gemini/Groq/local fallback and CSV/Excel/PDF/Word export. Proceeds to Step 4.
- **Step 4 (Review of Literature)** (`src/components/steps/Step4LiteratureReview.tsx`): 6 sections (Introduction, Global & Indian Situations, Research Gaps, Future Advice, Summary, References) with deep chain-of-thought reasoning, per-section regeneration, deep-reasoning analysis, MD copy/download. References auto-populated from synthesis table (Vancouver).
- **Fallback chain**: `callAiWithFallback` in `src/lib/ai.ts` → Gemini → Groq → local Qwen2.5 0.5B, with quota cooldowns and fallback events. Existing `/api/chat` API route is wired and used.
- **Gaps**: Step 4 sections are generated one monolithic prompt per section; no multi-agent outline/lit-review/section-writing/refinement cadence. No PaperOrchestra integration previously.

### Audit verdict: Functional. AI fallback robust. Section-writing is single-pass; benefits from PaperOrchestra multi-agent treatment.

---

## 2. Evidence Synthesis & Meta-analysis pipeline

### Structure (6 steps, `PIPELINE_STEPS` in EvidenceSynthesisTab.tsx)
1. Search & Screening, 2. Data Extraction, 3. Risk of Bias, 4. Synthesis & Meta-analysis,
5. Reporting & PRISMA, 6. Research Paper Draft.

### Findings
- **Step 1 Search** (`EvidenceSynthesisStep1`): multi-database (PubMed, OpenAlex, Europe PMC, Crossref, arXiv, bioRxiv, medRxiv, etc.), boolean/semantic search, citation validation, per-database results, dedup. Calls `/api/literature-search`.
- **Step 2 Extraction** (`runExtraction`): structured PICO extraction, deterministic seed + AI refinement (meta-pipe, decipher-research-agent, t0mst0ne gaps framework), Vancouver refs, effect estimates/CI, evidence level T1-T4.
- **Step 3 Risk of Bias**: robvis (Cochrane ROB2/ROBINS-I/QUADAS-2/QUIPS) and PROBAST+AI, per-domain traffic-light, heuristic + AI assessment, save to localStorage.
- **Step 4 Synthesis**: narrative/thematic synthesis + inverse-variance meta-analysis (fixed & random effects, I², τ², forest data), effect-size table, `metafor`/`meta` alignment. `metafor-compute.ts`.
- **Step 5 Reporting**: PRISMA 2020 flow, ROSES CSV, robvis traffic light, full synthesis report markdown (PRISMA + appendices), `medical-skills/prisma-utils`.
- **Step 6 Draft**: Academic Writing Agents (andrehuang/academic-writing-agents) and STORM (stanford-oval/storm) modes; manuscript → review → revise → audit cycle; export PDF/Word/LaTeX.
- **Gap**: Step 6 had Academic Writing Agents + STORM but **no PaperOrchestra** (google-research/paper-orchestra) multi-agent writer. Now added.

### Audit verdict: Complete and PRISMA-aligned. Last step (manuscript) now augmented with PaperOrchestra.

---

## 3. PaperOrchestra integration (new)

Adapted google-research/paper-orchestra's four-agent pipeline (Outline → Literature Review → Section Writing → Content Refinement) to TypeScript in `src/lib/paper-orchestra.ts`:

- `orchestratePaperOrchestra(callModel, ctx)` — provider-agnostic core.
- `runPaperOrchestraPipeline(apiKey, provider, ctx)` — client wrapper over `callAiWithFallback` → existing `/api/chat` API (Gemini → Groq → local).
- `generateLiteratureReviewSections(...)` — per-section first-5 lit-review sections.
- Server route `src/app/api/paper-orchestra-write/route.ts` — wired endpoint that runs the pipeline directly against Gemini/Groq using the client-supplied API key.

### Wiring
- **Evidence Synthesis Step 6 (last step)**: new "PaperOrchestra Manuscript (Google Research)" block — generates, edits, and exports (PDF/Word/LaTeX) a PRISMA-aligned, Vancouver-cited manuscript from extracted studies. Calls `/api/paper-orchestra-write`.
- **Main pipeline Step 4 (Review of Literature)**: new "PaperOrchestra Sections" button generates the first 5 sections individually (Introduction, Global & Indian Situations, Research Gaps, Future Advice, Summary) via PaperOrchestra section-writing agent; persists to `state.literatureReview`.

### Existing API wiring
- `/api/chat` already wired via `callAiWithFallback` (used by Step 3, Step 4, PaperWriter, EvidenceSynthesis).
- `/api/literature-search` wired (EvidenceSynthesis Step 1, PaperWriter reference search).
- New `/api/paper-orchestra-write` wired (PaperOrchestra manuscript server endpoint).
- Other routes exist (`/api/citation-validator`, `/api/crossref`, `/api/doi-verification`, `/api/paper-search`, `/api/paper-search-mcp`, `/api/thesis-generate`, `/api/web-search`) but are not directly invoked by the paper-writing flow; they remain available.

---

## 4. Recommendations

1. Add a PRISMA 2020 checklist completion tracker to Step 5.
2. Wire `/api/citation-validator` into Step 2/3 for DOI verification UI feedback.
3. Add figure/table generation (plotting agent) to PaperOrchestra for meta-analysis forest plots.
4. Persist PaperOrchestra agent log + outline to `state` for audit trail.

---

## 5. Release notes (next version 0.7.7)

- Integrate PaperOrchestra (google-research/paper-orchestra) multi-agent manuscript writer into Evidence Synthesis Step 6 (last step) and Review of Literature first 5 sections.
- Wire new server API route `/api/paper-orchestra-write`.
- Bump version to 0.7.7.
- Desktop `.exe`: build via `bun run dist:win` (Windows, or GitHub Actions "Build Desktop Artifact" workflow). Linux sandbox cannot cross-build NSIS `.exe` without Wine; tag `v0.7.7` to be applied on GitHub on the session branch.
