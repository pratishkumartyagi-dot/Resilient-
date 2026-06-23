# Active Context: Resilient Researcher Assistant

## Current State

**App Status**: ✅ Fully functional prototype built

**App Name**: Resilient Research App
**Description**: AI-powered research intelligence platform for systematic reviews, evidence synthesis, and academic writing.
**Tech Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Lucide React, Recharts

## Recently Completed

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript configuration with strict mode
- [x] Tailwind CSS 4 integration
- [x] ESLint configuration
- [x] Memory bank documentation
- [x] Recipe system for common features
- [x] **Resilient Researcher Assistant** fully implemented
  - [x] Logo integrated (top-left header)
  - [x] "Resilient Research App" centered top header
  - [x] 11-step research pipeline (Search → Results → Synthesis → Lit Review → Themes → Questions → Titles → Aims → Methodology → Protocol → Impact)
  - [x] 6 main top tabs: Research Pipeline, Resilient Chat, Statistical Analysis, Sample Size Calculator, Systematic Review/RCT, Paper Writer & Reviewer, Grant Writing
  - [x] Global state management with React Context + useReducer
  - [x] Mock AI generation flows for all steps
  - [x] PRISMA 2020 diagram in Step 2
  - [x] Vancouver-style synthesis table with export toggles
  - [x] Theme generation (10 themes with reasoning)
  - [x] Research question & title generation
  - [x] Aim & objectives editor
  - [x] Methodology with sample size calculator links
  - [x] Protocol generation
  - [x] Impact assessment module
  - [x] Chat, stats, systematic review, paper writer, grant writing tabs implemented
  - [x] Production build passes cleanly (`bun run build`)

## Recent Enhancements (2026-06-23)

- [x] Header layout update: moved "AI-Powered Research Intelligence Platform" from below logo to below centered "Resilient Research App" title; removed "Powered Research Intelligence Platform" subtitle
- [x] Step1: made "Select All" a true toggle (selects all databases when partial, deselects all when all are selected)
- [x] Step1: removed artificial cap on mock paper count; now scales dynamically by selected databases (dbs.length × 15, no upper limit)
- [x] Step1: app now auto-advances to Step 2 immediately after search completes
- [x] Step3: fixed invalid Gemini model name (`gemini-3.1-flash-lite` → `gemini-2.0-flash`) so real AI synthesis actually works
- [x] Step3: error handling now surfaces API key requirement instead of silently falling back to mock data
- [x] Header rebrand: removed "Resilient Researcher Assistant" and "Systematic Review & Evidence Synthesis"; replaced center subtitle with "Powered Research Intelligence Platform"
- [x] Added Settings gear icon to header, triggering API key configuration modal
- [x] Created API settings modal (`SettingsModal`) supporting Gemini 3.1 Flash Lite (primary) and OpenRouter gpt-oss-120b (fallback), with test-connection buttons
- [x] Added `src/lib/ai.ts` with wrapper functions for Gemini and OpenRouter REST endpoints
- [x] Updated `AppContext` with `geminiApiKey` and `openRouterApiKey` state fields
- [x] Fixed `selectedPapers` state sync bug in reducer (was always empty, blocking Step 3 generation)
- [x] Step 1: expanded mock paper generation from fixed 12 to scale by selected databases (`min(selectedDbs * 15, 100)`)
- [x] Step 2: toggle-to-select-all already present; confirmed functionality across all unique papers
- [x] Step 3: synthesis generation now uses real AI when API keys are configured; falls back to mock data; properly advances to Step 4 after generation
- [x] AI utilization integrated into content generation workflow; ready for extension to other pipeline steps
