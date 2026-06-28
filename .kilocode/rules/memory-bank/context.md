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
  - [x] DeepSeek R1 integrated as primary deep reasoning engine across Steps 3–10 and Protocol Generator
  - [x] DeepSeek API key configurable in Settings modal with test connection

## Recent Enhancements (2026-06-23)

- [x] Header layout update: moved "AI-Powered Research Intelligence Platform" from below logo to below centered "Resilient Research App" title; removed "Powered Research Intelligence Platform" subtitle
- [x] Step1: made "Select All" a true toggle (selects all databases when partial, deselects all when all are selected)
- [x] Step1: removed artificial cap on mock paper count; now scales dynamically by selected databases (dbs.length × 15, no upper limit)
- [x] Step1: app now auto-advances to Step 2 immediately after search completes
- [x] Step3: fixed invalid Gemini model name to `gemini-3.1-flash-lite-preview` so real AI synthesis works
- [x] Step3: error handling surfaces API key requirement instead of silently falling back to mock data
- [x] Steps 3–10: integrated AIPOCH Medical Research Skills prompts from github.com/aipoch/medical-research-skills
  - Step 3: tooluniverse-literature-deep-research (evidence-graded synthesis table)
  - Step 4: literature-review (thematic narrative review with PRISMA)
  - Step 5: medical-topic-saturation-and-whitespace-checker (research themes)
  - Step 6: clinical-question-clarifier (structured research questions)
  - Step 7: title-and-abstract-optimizer (publication-ready titles)
  - Step 8: aim-and-hypothesis-designer (aim hierarchy + testable hypotheses)
  - Step 9: methods-section-writer (CONSORT/STROBE/PRISMA Methods)
  - Step 10: clinical-cohort-protocol-designer (A–L cohort protocol framework)
- [x] Created `src/lib/research-skills.ts` exporting typed prompt builders for Steps 3–10
- [x] Steps 4, 5, 6, 7, 8, 9, 10: replaced mock/setTimeout-only generation with real AI calls (Gemini primary, OpenRouter fallback)
- [x] Step3: fixed loading spinner condition to show during all loading states
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
- [x] Replaced mock 180-paper generation in Step 1 Search with real live API calls (OpenAlex, PubMed E-utilities, Europe PMC) via `src/lib/database-apis.ts`
- [x] Step 1 now fetches real paper metadata (title, authors, journal, year, DOI, abstract, PMID) across all 12 selected databases; dedupes by DOI+title before storing in state
- [x] Databases without free live APIs fall back to simulated stub data with realistic structure
- [x] All 12 UI databases mapped to live APIs in `fetchRealPapers`: PubMed, OpenAlex, Europe PMC, Google Scholar, WHO IRIS, Semantic Scholar, Shodhganga, Prospero, ScienceDirect, ClinicalTrials.gov, DOAJ, Clarivate
- [x] Added DOI-based citation validation using Crossref API (`validateDoiViaCrossref`, `verifyCitations` in `src/lib/database-apis.ts`) per AIPOCH citation-validator approach
- [x] Citation validation runs automatically after every search; results stored in `AppState.citationValidationResults`
- [x] Step 2 Results view shows per-paper citation badges: ✓ DOI verified / ⚠ DOI not found / no DOI / unchecked, plus aggregate stats in header
- [x] Step 3: replaced AI-only synthesis with deterministic non-AI local engine (`src/lib/local-synthesis.ts`) applying decipher-research-agent + Research-Assistant methodology
  - Extracts Key Findings, Study Details, Research Gaps using regex/keyword heuristics on paper abstracts
  - Validates every DOI via Crossref (api.crossref.org) after each search
  - Vancouver-style references with DOI links and verification badge
  - Evidence tier grading (T1 mechanistic → T4 mention) per study type
  - Runs without any API key; AI (Gemini/OpenRouter) remains as optional fallback if keys are configured
- [x] API keys persist via localStorage; `AppContext` extended with citation validation state

## Step 1 DOI-Finder Integration & Pagination (2026-06-25)

- [x] Integrated torfbolt/DOI-finder methodology into Step 1 search flow
- [x] Added DOI ascertainment in `src/lib/database-apis.ts`:
  - `findDoiByTitleAuthor`: uses Crossref Query API (`query.bibliographic`, `query.author`) + fuzzy matching to resolve DOIs for papers missing them
  - `fuzzyMatch`: word-pair based similarity scorer (matches DOI-finder Python approach)
  - `enrichPapersWithDois`: batch processes papers without DOIs (chunks of 20), assigns newly found DOIs, updates `url`
- [x] DOI ascertainment runs BEFORE advancing to Step 2 in `Step1Search.tsx`
- [x] Citation verification (`verifyCitations`) now runs on enriched papers so newly found DOIs are also validated
- [x] Removed search caps / implemented full pagination:
  - OpenAlex: cursor-based pagination, per-page=100, max 100 pages
  - PubMed: `retmax=10000` with batched efetch (200/batch)
  - Europe PMC: `pageSize=100` with offset pagination until exhausted
- [x] All databases now retrieve complete result sets instead of 50/paper caps

## Long CoT Prompt Integration — Step 3 & Step 4 (2026-06-25)

- [x] Integrated [LightChen233/Awesome-Long-Chain-of-Thought-Reasoning](https://github.com/LightChen233/Awesome-Long-Chain-of-Thought-Reasoning) reasoning methodology into `src/lib/research-skills.ts`
- [x] Step 3 (`buildStep3Prompt`): added 4-phase Long CoT protocol before synthesis generation:
  - Phase 1: Evidence Inventory (primary claim, evidence strength, population/setting/time)
  - Phase 2: Claim Extraction & Cross-Study Comparison (overlapping, conflicting, divergent findings)
  - Phase 3: Evidence Grading (T1 mechanistic → T4 mention)
  - Phase 4: Feasible Reflection (self-critique: claim supported? contradictions acknowledged? gaps plausible?)
- [x] Step 4 (`buildStep4Prompt`): added 4-phase Long CoT protocol before literature review generation:
  - Phase 1: Planning/Scoping with PICO framework
  - Phase 2: Evidence Mapping (themes, study design weight, temporal trends)
  - Phase 3: Thematic Synthesis (convergent/divergent findings, strongest evidence tier)
  - Phase 4: Feasible Reflection (self-critique: true synthesis vs summary? evidence-limited claims? knowledge gaps?)
- [x] Both prompts now instruct the model to follow the deep reasoning chain before producing the final output

## Systematic Review & Meta-Analysis Pipeline (2026-06-23)

**Tab renamed**: "Systematic Review / RCT" → "Systematic Review & Meta-analysis"

The systematic review tab now contains a full 8-step systematic review / meta-analysis pipeline with state managed via `systematicStep` (1–8) in `AppContext`.

### New SR Pipeline Steps

| Step | Component | Description |
|------|-----------|-------------|
| 1 | `SRStep1Search` | Broad research area search with AND/OR/NOT logic, year filter (From–To), Study Type filter (single select), 8 databases: PubMed, OpenAlex, Europe PMC, ERIC, Google Scholar, Shodhganga, CTRI – India, scite.ai. Semantic search active. Select All / Clear All toggle. Pubmed-style Boolean logic. No upper search limits per database. Citation Validator (DOI-based) referenced. All results → Step 2. |
| 2 | `SRStep2Screening` | Deduplication using DOI+title key (`DedupEndNote`-style). Unique papers displayed with abstracts, filterable by database and keyword. Checkbox + Select All / Deselect All. Papers move to Step 3. |
| 3 | `SRStep3Synthesis` | AI-powered synthesis table (AIPOCH tooluniverse-literature-deep-research) with columns: Vancouver reference + DOI link, Key Findings (T1–T4 graded), Synopsis, Study Conducted (Population/Setting/Time/Hypothesis/Intervention), Research Gaps. Upload source doc toggle (PDF/Word/CSV/Excel, max 5). Download: CSV/Excel/PDF/Word. Auto-advances to Step 4. |
| 4 | `SRStep4Themes` | Generate 10 AI themes (AIPOCH medical-topic-saturation-and-whitespace-checker) with title, description, reasoning. NotebookLM-style formatting: Key Findings, Evidence Bias, Gap per theme. Custom theme textbox with checkbox multi-select. |
| 5 | `SRStep5Questions` | Generate 10 research questions from themes + evidence gaps (AIPOCH clinical-question-clarifier). Toggle: Qualitative / Quantitative. ICMR Beginner's Guide referenced. |
| 6 | `SRStep6Titles` | Generate 5 research titles (AIPOCH title-and-abstract-optimizer + Idea2Proposal guidelines + ICMR Beginners Guide). CSS/DS/ES framing per ICMR. Selected/editable title. |
| 7 | `SRStep7Protocol` | Systematic Review vs Meta-Analysis toggle. Protocol generation (AIPOCH clinical-cohort-protocol-designer adapted for SR/MA). PRISMA 2020, PROSPERO-ready. PICO eligibility, search strategy, screening, data extraction, quality assessment, synthesis plan. |
| 8 | `SRStep8AcademicWriting` | Full manuscript generator (AIPOCH academic-writing skill). Toggle: Systematic Review / Meta-Analysis / Narrative Review. PRISMA 2020, CONSORT, ICMR compliant. IMRAD structure. Export as Markdown. |

### Files Created / Modified

**New files:**
- `src/components/systematic/SystematicReviewPipeline.tsx` — 8-step SR pipeline wrapper with step navigator
- `src/components/systematic/SRStep1Search.tsx` — Step 1: search with 8 databases
- `src/components/systematic/SRStep2Screening.tsx` — Step 2: deduplication + screening
- `src/components/systematic/SRStep3Synthesis.tsx` — Step 3: AI synthesis table + upload/download
- `src/components/systematic/SRStep4Themes.tsx` — Step 4: 10 AI themes
- `src/components/systematic/SRStep5Questions.tsx` — Step 5: 10 research questions
- `src/components/systematic/SRStep6Titles.tsx` — Step 6: 5 title candidates
- `src/components/systematic/SRStep7Protocol.tsx` — Step 7: SR/MA protocol
- `src/components/systematic/SRStep8AcademicWriting.tsx` — Step 8: academic writing

**Modified files:**
- `src/context/AppContext.tsx` — Added `systematicStep`, `srStudyTypeCategory`, `dedupPapers`, `filteredPapers`, `SET_SYSTEMATIC_STEP`, `SET_SR_CATEGORY`, `SET_SELECTED_PAPERS`, `SET_DEDUP_PAPERS`, `SET_FILTERED_PAPERS` actions
- `src/app/page.tsx` — Replaced `SystematicReviewTab` import with `SystematicReviewPipeline`
- `src/components/TopTabs.tsx` — Renamed "Systematic Review / RCT" → "Systematic Review & Meta-analysis"

### Skills Used (SR Pipeline)

- Step 3: AIPOCH `tooluniverse-literature-deep-research`
- Step 4: AIPOCH `medical-topic-saturation-and-whitespace-checker`
- Step 5: AIPOCH `clinical-question-clarifier`
- Step 6: AIPOCH `title-and-abstract-optimizer` + `Idea2Proposal`
- Step 7: AIPOCH `clinical-cohort-protocol-designer` (adapted for SR/MA)
- Step 8: AIPOCH `academic-writing`

### Key Design Decisions

- DOI + title deduplication key (DedupEndNote-style) in Step 2
- No external database links shown — app handles all searches internally
- Pubmed Boolean AND/OR/NOT logic applied to all database searches
- No upper search limits per database
- ASReview / prismAId references preserved as future integrations
- Manalyzer meta-analysis config available in Step 7
- `RESET_STATE` resets SR pipeline data alongside main pipeline

## Europe PMC and API robustness fixes (2026-06-26)

- [x] Fixed Europe PMC endpoint: `SEARCH` (uppercase) → `search` (lowercase) — old URL returned 404
- [x] Fixed Europe PMC pagination: replaced obsolete `start` offset with `cursorMark` / `nextCursorMark`
- [x] Fixed Europe PMC response parsing: `data.result?.result` → `data.resultList?.result`
- [x] Removed forbidden `User-Agent` header from browser `fetch` calls (OpenAlex, Crossref) — would throw TypeError in strict browser environments
- [x] Added `fetchWithTimeout` helper (15s AbortController) to all database and Crossref fetches in `src/lib/database-apis.ts`
- [x] Verified production build passes (`bun run build`), typecheck and lint clean

## Protocol Generator — Perplexity-style Deep Reasoning Chat (2026-06-26)

**New tab added**: "Protocol Generator" in `TopTabs` (between "Paper Writer & Reviewer" and "Grant Writing")

### New Component: `ProtocolChatTab`
- Perplexity/open-notebook style chat dashboard
- Deep Reasoning toggle (Long CoT mode inspired by github.com/LightChen233/Awesome-Long-Chain-of-Thought-Reasoning)
- File upload support: `.docx`, `.pdf`, `.txt`, `.md`
- Document parsed with `mammoth` (Word) and `pdfjs-dist` (PDF)
- 6-phase Long CoT reasoning: Context Analysis → Gap Identification → Design Alignment → Feasibility Check → Bias Audit → Output Generation
- AIPOCH Clinical Cohort Protocol Designer (Sections A–L) generation
- Word (.doc) download with AIPOCH-formatted protocol
- Click "Generate" or type "generate protocol" to produce full protocol
- Inline document upload status bar with file size and remove button
- Perplexity-style: centered chat, minimal chrome, sources preview

### New Utility: `src/lib/document-parser.ts`
- `parseWordDocument(file)` — uses `mammoth.extractRawText`
- `parsePDFDocument(file)` — uses `pdfjs-dist` with worker fallback
- `parseTextDocument(file)` — uses `File.text()`
- `parseUploadedDocument(file)` — dispatches by extension, returns `{ name, content, type }`
- `ALLOWED_DOCUMENT_TYPES` constant for `<input accept>` attribute

### New Packages Installed
- `mammoth@1.12.0` — Word document text extraction
- `pdfjs-dist@6.0.227` — PDF text extraction in browser

### Context Changes
- Removed unused `protocolGenerationEnabled`, `isDeepReasoning`, `documentContent` from `AppState`
- Deep reasoning and document state now managed locally within `ProtocolChatTab` to avoid global state bloat
- `TopTabs.tsx` extended with 7th tab: `{ id: "protocol", label: "Protocol Generator", icon: ScrollText }`
- `page.tsx` updated to render `ProtocolChatTab` when `currentTab === "protocol"`

## DeepSeek R1 Integration — Deep Reasoning Engine (2026-06-26)

**New AI provider**: DeepSeek R1 (`deepseek/deepseek-r1`) via OpenRouter API as the primary deep reasoning engine for evidence synthesis throughout the research pipeline.

### Files Modified
- `src/lib/ai.ts` — Added `callDeepSeek()` (wraps OpenRouter with `deepseek/deepseek-r1` model) and `testDeepSeekKey()`
- `src/context/AppContext.tsx` — Added `deepseekApiKey` state field and `SET_DEEPSEEK_KEY` reducer action
- `src/components/SettingsModal.tsx` — Added DeepSeek API key input with Test Connection button; localStorage key `resilient_deepseek_api_key`
- `src/components/steps/Step3Synthesis.tsx` — DeepSeek R1 primary for synthesis generation
- `src/components/steps/Step4LiteratureReview.tsx` — DeepSeek R1 primary for literature review generation
- `src/components/steps/Step5Themes.tsx` — DeepSeek R1 primary for theme generation
- `src/components/steps/Step6ResearchQuestions.tsx` — DeepSeek R1 primary for research question generation
- `src/components/steps/Step7ResearchTitles.tsx` — DeepSeek R1 primary for title optimization
- `src/components/steps/Step8AimObjectives.tsx` — DeepSeek R1 primary for aims/hypotheses generation
- `src/components/steps/Step9Methodology.tsx` — DeepSeek R1 primary for methods section writing
- `src/components/steps/Step10Protocol.tsx` — DeepSeek R1 primary for protocol generation
- `src/components/tabs/ProtocolChatTab.tsx` — DeepSeek R1 primary for deep reasoning chat and protocol generation

### AI Provider Priority (updated)
1. **DeepSeek R1** (`deepseek/deepseek-r1`) — primary for deep reasoning with papers
2. **Gemini 3.1 Flash Lite** — fallback
3. **OpenRouter gpt-oss-120b** — secondary fallback

### Model Selection
- DeepSeek R1 is accessed via OpenRouter API using model identifier `deepseek/deepseek-r1`
- Users can provide their OpenRouter API key in the DeepSeek field; the same key works for both models
- All steps 3–10 and the Protocol Generator chat now prefer DeepSeek R1 when a key is configured

## Evidence Synthesis & Meta-analysis Tab Overhaul (2026-06-26)

**File rewritten**: `src/components/tabs/EvidenceSynthesisTab.tsx` fully rebuilt to be functional end-to-end, aligned with https://github.com/evidencesynthesis-tools/awesome-evidence-synthesis.

### Step 1 — Search & Screening
- Added **Year From / To** filter inputs so users can constrain the search by publication year range
- Client-side year filtering applied to retrieved papers before display
- Shows "X records retrieved • Y after year filter • Z selected" count
- Clear button to reset year filters

### Step 3 — Risk of Bias (functional)
- Added **Overall RoB Assessment Instructions** textarea for user guidance
- Per-study **Risk of Bias** dropdown (Low / Some concerns / High) and **Assessor Notes** input
- **Save Assessments** button persists RoB judgments into extracted data
- Data flows forward into synthesis and reporting steps

### Step 4 — Synthesis & Meta-analysis (functional)
- Added **Review Type** selector: Systematic Review, Systematic Review & Meta-analysis, Narrative Review, Umbrella Review, Scoping Review, Rapid Review, Mixed Methods Review, Diagnostic Test Accuracy Review
- Added **Specific Requirements** textbox for user-defined review instructions (subgroups, study design filters, GRADE, meta-regression, etc.)
- Added **Additional Synthesis Instructions** textbox for fine-tuning the synthesis approach
- AI generates narrative synthesis using DeepSeek R1 (primary) / Gemini / OpenRouter
  - Prompt incorporates review type, user requirements, and extracted studies
  - Meta-analysis steps included when review type contains "Meta-analysis"
- Parsed effect-size table rendered as editable inputs (Study, Effect Estimate, 95% CI, Weight)
- Output rendered as formatted markdown (headings, tables, body text)

### Step 5 — Reporting & PRISMA (functional)
- Generates **robvis-style Risk of Bias Summary** (bar chart proportions: Low / Some concerns / High / Pending)
- Generates **robvis-style Traffic Light Plot** table (D1–D5 bias domain grid)
- Computes **PRISMA 2020 Flow Diagram** counts (Identification → Deduplication → Screening → Excluded → Assessed → Included)
- Displays synthesis summary and effect-size table for reporting use
- **Download PRISMA CSV** and **Download RoB CSV** buttons for export

### Tools Referenced
- Literature search: OpenAlex, PubMed E-utilities, Europe PMC, ASReview, prismAId, CitationChaser
- RoB visualization: robvis (traffic-light + summary plots)
- Meta-analysis: meta, metafor, metaumbrella, forestplot
- Reporting: PRISMA 2020, ROSES

## Omics & Bioinformatics Mode Toggle — Resilient Chat (2026-06-26)

**Feature**: Added toggle in `ResilientChatTab` to switch between "Research Pipeline" and "Omics & Bioinformatics" modes, leveraging https://github.com/aipoch/medical-research-skills capabilities.

### Files Modified
- `src/context/AppContext.tsx` — Added `omicsEnabled: boolean` to `AppState`, `TOGGLE_OMICS` reducer action
- `src/components/tabs/ResilientChatTab.tsx` — Added toggle button, omics-specific response generator, contextual UI styling

### New Tab
- `src/components/tabs/OmicsBioinformaticsTab.tsx` — Dedicated Omics & Bioinformatics chat tab with file upload support for .docx, .pdf, .txt, .md, .csv, .tsv

### Capabilities Available in Omics Mode
- Single-cell RNA-seq: Scanpy QC-to-clustering, scVI-tools batch integration, cell type annotation, spatial transcriptomics
- Bulk RNA-seq: PyDESeq2, limma/edgeR, DEG screening, volcano/heatmap visualization, batch correction
- Pathway & network: GO/KEGG, GSEA, GSVA, WGCNA, ceRNA, PPI, Sankey diagrams
- Immune infiltration: CIBERSORTx (22 immune cell types), ssGSEA, ESTIMATE
- Genomics & sequence: Biopython, BLAST, SAM/BAM/CRAM/VCF, CRISPR, Circos, deepTools
- Dimensionality reduction: PCA, UMAP, t-SNE, consensus clustering, KNN imputation
- Microbiome & other modalities: scikit-bio, FlowIO, pyOpenMS, Neuropixels/Kilosort4
- All outputs formatted for manuscript figures and methods sections

## robvis Integration — EvidenceSynthesisTab Risk of Bias (2026-06-27)

**Feature**: Integrated [mcguinlu/robvis](https://github.com/mcguinlu/robvis) methodology (publication-quality RoB visualisation) into the Systematic Review & Meta-analysis pipeline, Step 3 (Risk of Bias) and Step 5 (Reporting).

### Files Modified
- `src/components/tabs/EvidenceSynthesisTab.tsx` — full RoB per-domain upgrade

### Data Structure
- Replaced flat `RobAssessment { rob: string; notes: string }` with per-domain structure
- `RobAssessment { tool: string; overall: string; notes: string; domains: Record<domainId, DomainJudgment> }`
- 7 tool templates: ROB2, ROB2-Cluster, ROBINS-I, ROBINS-E, QUADAS-2, QUIPS, Generic
- Each template defines domain names + valid judgment levels (e.g. ROB2: Low/Some concerns/High/No Information)

### Step 3 Changes
- Added tool-type selector dropdown with full robvis tool catalogue
- Replaced single RoB dropdown with per-domain judgment table (cols = tool domains + Overall + Notes)
- Each cell shows colored swatch preview and dropdown for the judgment level
- `initRobAssessment`, `updateRobDomain`, `updateRobOverall`, `updateRobNotes` helper functions
- `saveRobAssessments` and `downloadRobCsv` updated for per-domain data

### Step 5 Changes  
- Replaced CSS progress-bar summary with Recharts stacked horizontal bar chart (`BarChart`) per robvis domain + Overall
- Replaced static traffic-light table with proper per-domain judgments (colored cells per domain per study)
- Tool template label displayed below traffic light plot

### Recharts
- Uses `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`, `Legend`
- Color scheme: Cochrane (green/yellow/red/blue) matching robvis R defaults

### Bug Fix — OmicsBioinformaticsTab duplicate declaration (2026-06-27)

- [x] Fixed "createInitialMessages is defined multiple times" build error in `src/components/tabs/OmicsBioinformaticsTab.tsx`
- [x] Removed orphaned duplicate `createInitialMessages` declaration at module scope (line 42)
- [x] Kept the single wired declaration at line 99 (used by `useState` and `handleClear`)

## Step 4 Local Synthesis (API-key-free) + API Routing (2026-06-27)

**Feature**: Step 4 ("Synthesis & Meta-analysis") now works without any API key. When no DeepSeek/Gemini/OpenRouter key is configured, `generateLocalSynthesis()` produces a structured PRISMA/ROSES-ready report from `extractedData` + `robAssessments` only.

### Local Synthesis Details
- Review-type-aware sections:
  - **Systematic Review / Narrative Review**: thematic/narrative synthesis, study findings by study, heterogeneity note
  - **Systematic Review & Meta-analysis / Meta-Analysis**: random-effects guidance, forest-plot-ready effect table, heterogeneity (I², τ²) pointers, metafor/meta/OpenMEE references
- Robvis commentary auto-generated from domain-level counts (Low/Some/High/Pending)
- Effect Size table populated from existing `effectSizes` entries or placeholder rows
- Explicit "Generated locally using awesome-evidence-synthesis open-source workflow standards" footer
- Button label switches between "Generate Local Synthesis" and "Generate AI Synthesis" based on key presence

### API Routing Fix
- `src/lib/ai.ts` `callGemini`/`callOpenRouter`/`callDeepSeek` now route through `src/app/api/chat/route.ts` (server-side Next.js API route)
- Client-side browser calls no longer hit AI providers directly; avoids CORS and inadvertent key leakage in client bundles
- Server route accepts `{ provider, prompt, apiKey, model? }` and returns `{ content }` or `{ error }`

### Bug Fix API Key Test
- `testGeminiKey`/`testOpenRouterKey`/`testDeepSeekKey` previously checked `result.toLowerCase().includes("ok")` causing false failures when provider replied without the literal "ok" substring
- Fixed: test now returns `true` on any successful HTTP call with non-empty content; `false` only on caught exception / HTTP error

## Step 6 Writing Review & Meta-analysis — Narrative Review Example Added (2026-06-27)

**File**: `src/components/tabs/EvidenceSynthesisTab.tsx`

- [x] Added missing `pipelineStep === 6` rendering block (previously only defined in `PIPELINE_STEPS` but never rendered)
- [x] Updated step navigator chevron to show through all 6 steps (`s.num < PIPELINE_STEPS.length`)
- [x] Added example narrative review content: "The Impact of Digital Health Interventions on Chronic Disease Management — A State-of-the-Art Review"
- [x] Added "Narrative Review Structure Reference" grid (8-section structure: Title, Abstract, Introduction, Methods, Results/Themes, Discussion, Conclusion, References)
- [x] Integrated existing `generateManuscript` and `downloadManuscript` functions into Step 6
- [x] Fixed JSX nesting issues and duplicate closing tags introduced during edit
- [x] Escaped unescaped quotes in narrative review example text (`react/no-unescaped-entities` lint fix)
- [x] Verified `bun typecheck`, `bun lint`, and `bun run build` all pass cleanly

## Literature Review Step Added After Risk of Bias (2026-06-27)

**File**: `src/components/tabs/EvidenceSynthesisTab.tsx`

**Feature**: Added full Literature Review generation step after Step 3 (Risk of Bias). All selected papers from prior steps are automatically included as references in the generated review.

### Step Renumbering
- Step 4: Literature Review (NEW)
- Step 5: Synthesis & Meta-analysis (was 4)
- Step 6: Reporting & PRISMA (was 5)
- Step 7: Writing Review & Meta-analysis (was 6)

### Literature Review Structure
The AI-generated narrative review follows a strict heading structure:
1. Introduction / Background
2. Problem Statement (Global, South-East Asia, India)
3. Research gaps
4. Future studies to be carried out
5. Conclusion
6. References (auto-populated from selected papers)

### AI Integration
- Uses DeepSeek R1 (primary) for deep reasoning via `callDeepSeek`
- Falls back to Gemini / OpenRouter if configured
- Prompt incorporates janhq/jan-inspired Long CoT methodology:
  - Step-by-step reasoning before drafting each section
  - Explicit uncertainty acknowledgment
  - Cross-checking claims against available evidence
  - Reflecting on global/regional/national representation gaps
  - Logical narrative flow (broad context → specific problem → gaps → recommendations)
- User can trigger generation with "Generate Literature Review" button
- Output rendered as formatted Markdown with styled headings

### State Added
- `literatureReview` (string) — generated review text
- `literatureReviewLoading` (boolean) — loading state during generation

### UI Features
- BookOpen icon added to `lucide-react` imports
- "Proceed to Literature Review" button replaces "Proceed to Synthesis" in Step 3
- Back button to return to Risk of Bias from Literature Review
- Proceed button to advance to Synthesis from Literature Review
- Shows selected paper count and extracted study count
- Displays loading spinner during generation
- Presents generated review with styled h1/h2/h3/blockquote/list elements

### Bug Fixes
- Escaped unescaped quotes in narrative review example text
- Fixed JSX nesting issues and duplicate closing tags from prior edits
- Verified `bun typecheck`, `bun lint`, and `bun run build` all pass cleanly

## Replace OpenRouter with Groq (DeepSeek-R1-Distill-Llama-70B) (2026-06-28)

**Feature**: Removed OpenRouter / `gpt-oss-120b` fallback and replaced it with Groq using `deepseek-r1-distill-llama-70b`.

### Files Modified
- `src/app/api/chat/route.ts` — Replaced OpenRouter endpoint with Groq endpoint (`https://api.groq.com/openai/v1/chat/completions`), model `deepseek-r1-distill-llama-70b`, updated provider type from `"openrouter"` to `"groq"`
- `src/lib/ai.ts` — Renamed `callOpenRouter` → `callGroq`, `testOpenRouterKey` → `testGroqKey`; `callDeepSeek` now routes through Groq as well
- `src/context/AppContext.tsx` — Renamed `openRouterApiKey` → `groqApiKey`, `SET_OPENROUTER_KEY` → `SET_GROQ_KEY`
- `src/components/SettingsModal.tsx` — UI label changed from "OpenRouter API Key" to "Groq API Key (DeepSeek-R1-Distill-Llama-70B fallback)"
- `src/components/steps/Step3Synthesis.tsx` — Updated imports and fallback chain
- `src/components/steps/Step4LiteratureReview.tsx` — Updated imports and fallback chain
- `src/components/steps/Step5Themes.tsx` — Updated imports and fallback chain
- `src/components/steps/Step6ResearchQuestions.tsx` — Updated imports and fallback chain
- `src/components/steps/Step7ResearchTitles.tsx` — Updated imports and fallback chain
- `src/components/steps/Step8AimObjectives.tsx` — Updated imports and fallback chain
- `src/components/steps/Step9Methodology.tsx` — Updated imports and fallback chain
- `src/components/steps/Step10Protocol.tsx` — Updated imports and fallback chain
- `src/components/tabs/ProtocolChatTab.tsx` — Updated imports and fallback chain
- `src/components/tabs/EvidenceSynthesisTab.tsx` — Updated imports, fallback chain, and user-facing copy

### AI Provider Priority (updated)
1. **DeepSeek R1** (`deepseek-r1-distill-llama-70b`) — primary deep reasoning engine (via Groq)
2. **Gemini 3.1 Flash Lite** — fallback
3. **Groq DeepSeek-R1-Distill-Llama-70B** — secondary fallback (was OpenRouter `gpt-oss-120b`)

## Predictive Analysis Tab — 13-Step Clinical Prediction Pipeline (2026-06-28)

**New tab added**: "Predictive Analysis" in `TopTabs` (between "Sample Size Calculator" and "Evidence Synthesis & Meta-analysis")

### New Component: `PredictiveAnalysisTab`
- 13-step wizard based on Efthimiou et al. (BMJ 2024) "Developing clinical prediction models: a step-by-step guide"
- Uses PyHealth (sunlabuiuc/pyhealth) concepts and code references throughout
- AI assistance via existing DeepSeek / Gemini / Groq providers on every step
- State managed via `predictionStep` and related prediction fields in `AppContext`

### Pipeline Steps

| Step | Label | PyHealth / AI Integration |
|------|-------|---------------------------|
| 1 | Aims & Protocol | AI drafts TRIPOD protocol from population/outcome inputs |
| 2 | Model Strategy | AI recommends develop-new vs update-existing |
| 3 | Outcome Definition | Outome type selector + AI guidance on time-to-event vs binary |
| 4 | Predictor Selection | Textarea + AI suggestions; references `pyhealth.medcode` for standardisation |
| 5 | Data Collection | CSV upload with preview + AI data quality guidance |
| 6 | Sample Size | Events/predictors/R² inputs + AI Riley-style guidance + EPV warning |
| 7 | Missing Data | Strategy selector (MICE/single/complete case/model-based) + AI recommendation |
| 8 | Model Fitting | PyHealth model selector (33+ models: Transformer, RETAIN, RF, etc.) + AI configuration |
| 9 | Performance | Discrimination/calibration checklist + AI interpretation guidance |
| 10 | Final Model | AI recommendation + Occam&apos;s razor advice |
| 11 | Decision Curve | Threshold inputs + AI DCA guidance (net benefit, optimal threshold) |
| 12 | Predictor Importance | AI SHAP/permutation importance explanation |
| 13 | Report & Publish | AI generates TRIPOD checklist summary + deployment guidance |

### Files Created / Modified

**New files:**
- `src/components/tabs/PredictiveAnalysisTab.tsx` — full 13-step predictive analysis wizard

**Modified files:**
- `src/context/AppContext.tsx` — Added 16 prediction state fields + 15 prediction reducer actions
- `src/components/TopTabs.tsx` — Inserted `{ id: "predictive", label: "Predictive Analysis", icon: BarChart3 }` before systematic
- `src/app/page.tsx` — Added `PredictiveAnalysisTab` import and `case "predictive"` render
- `services/researcher/requirements.txt` — Added `pyhealth==2.0.1`, `numpy`, `pandas`, `scikit-learn`
- `services/researcher/app.py` — Added `/predictive/assist` endpoint with step-specific PyHealth guidance and `/predictive/health` endpoint

### Key Design Decisions
- Frontend AI assistance uses existing `/api/chat` route (DeepSeek/Gemini/Groq) so it works without the researcher service running
- Backend `/predictive/assist` provides step-specific structured guidance and PyHealth hints (e.g., `pyhealth.datasets`, `pyhealth.models`, `pyhealth.trainer`, `pyhealth.metrics`)
- Step 6 uses `events|predictors` pipe-delimited state to keep two related numbers in one field
- Step 8 references `pyhealth.trainer.Trainer` with early stopping and penalisation (ridge/LASSO) to prevent overfitting
- Step 11 notes that DCA can be computed via external Python packages (`dcurves`) after PyHealth `predict_proba()` output
