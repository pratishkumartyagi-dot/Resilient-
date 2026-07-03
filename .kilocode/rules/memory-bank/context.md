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
- [x] Step3: fixed invalid Gemini model name to `gemini-3.1-flash-lite` so real AI synthesis works
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
- [x] Created API settings modal (`SettingsModal`) supporting Gemini 3.1 Flash Lite (primary) and Groq/DeepSeek fallback, with test-connection buttons
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

**New AI provider**: DeepSeek R1 (`deepseek/deepseek-r1`) via DeepSeek API as the tertiary fallback deep reasoning engine for evidence synthesis throughout the research pipeline. Priority order is: Gemini 3.1 Flash Lite (primary) → Groq (secondary) → DeepSeek API Key (tertiary).

### Files Modified
- `src/lib/ai.ts` — Added `callDeepSeek()` (wraps DeepSeek API with `deepseek-reasoner` model) and `testDeepSeekKey()`
- `src/context/AppContext.tsx` — Added `deepseekApiKey` state field and `SET_DEEPSEEK_KEY` reducer action
- `src/components/SettingsModal.tsx` — Added DeepSeek API key input with Test Connection button; localStorage key `resilient_deepseek_api_key`
- `src/components/steps/Step3Synthesis.tsx` — Updated: Gemini 3.1 Flash Lite primary for synthesis generation
- `src/components/steps/Step4LiteratureReview.tsx` — Updated: Gemini 3.1 Flash Lite primary for literature review generation
- `src/components/steps/Step5Themes.tsx` — Updated: Gemini 3.1 Flash Lite primary for theme generation
- `src/components/steps/Step6ResearchQuestions.tsx` — Updated: Gemini 3.1 Flash Lite primary for research question generation
- `src/components/steps/Step7ResearchTitles.tsx` — Updated: Gemini 3.1 Flash Lite primary for title optimization
- `src/components/steps/Step8AimObjectives.tsx` — Updated: Gemini 3.1 Flash Lite primary for aims/hypotheses generation
- `src/components/steps/Step9Methodology.tsx` — Updated: Gemini 3.1 Flash Lite primary for methods section writing
- `src/components/steps/Step10Protocol.tsx` — Updated: Gemini 3.1 Flash Lite primary for protocol generation
- `src/components/tabs/ProtocolChatTab.tsx` — Updated: Gemini 3.1 Flash Lite primary for deep reasoning chat and protocol generation

### AI Provider Priority (updated)
1. **Gemini 3.1 Flash Lite** — primary AI provider for general synthesis
2. **Groq DeepSeek-R1-Distill-Llama-70B** — secondary fallback
3. **DeepSeek API Key (DeepSeek-R1 reasoning model)** — tertiary fallback

### Model Selection
- DeepSeek R1 is accessed via DeepSeek API (`api.deepseek.com`) using model identifier `deepseek-reasoner`
- Users should provide their DeepSeek API key in the DeepSeek field
- All steps 3–10 and the Protocol Generator chat now prefer Gemini 3.1 Flash Lite when a key is configured

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
- AI generates narrative synthesis using Gemini 3.1 Flash Lite (primary) / Groq (secondary) / DeepSeek R1 (fallback)
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

## Omics & Bioinformatics — Full OpenClaw-Medical-Skills Integration (2026-06-30)

**Feature**: Expanded `OmicsBioinformaticsTab` from a simple chat to a comprehensive Omics & Bioinformatics workbench integrating 869 skills from [FreedomIntelligence/OpenClaw-Medical-Skills](https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills) across 5 major categories.

### Files Modified
- `src/lib/medical-skills/skills-registry.ts` — Added 850+ new skills across 5 new categories; added `subcategory` field to `MedicalSkill` interface; added `getSkillsBySubcategory()` and `getAllCategories()` helper functions
- `src/components/tabs/OmicsBioinformaticsTab.tsx` — Full rewrite: collapsible sidebar category tree, skill-aware chat, real AI integration (Gemini/Groq via `/api/chat`), file upload for omics data, skill-specific context injection, download buttons (CSV/Word/PDF)

### New Categories in Registry
1. **Scientific Databases** (40 skills) — Genomics & Variants, Proteins/Pathways/Drugs, Cancer Genomics, Genomic & Molecular, Structural Biology & Drug Discovery
2. **Bioinformatics (gptomics bio-* suite)** (200+ skills) — Tools & Pipelines, Clinical Databases & Variant Analysis, Sequencing & Read QC, Differential Expression, Pathway & Network, Single-Cell & Spatial, Epigenomics & Chromatin, Metagenomics & Microbiome, Immunoinformatics & Flow Cytometry, Multi-Omics Integration, Proteomics & Metabolomics, Structural Biology & Cheminformatics, Epidemiological & Causal Genomics
3. **Omics & Computational Biology** (40+ skills) — Single-Cell & Spatial Omics, Single-Cell & Trajectory Analysis, Proteomics & Mass Spectrometry, Cheminformatics & Drug Discovery, Protein Structure & Design, Phylogenetics & Network Analysis
4. **ClawBio Pipelines** (21 skills) — Bioinformatics Orchestration, Genomics/Ancestry/Pharmacogenomics, Structural Biology & Literature
5. **BioOS Extended Suite** (285+ skills) — Extended Bioinformatics, Oncology & Precision Medicine, Hematology & Blood Disorders, Immunology & Cell Therapy, Single-Cell & Spatial Agents, Drug Discovery & Design, Clinical AI & Healthcare, Research Infrastructure & Agents

### Tab Features
- **Collapsible sidebar**: Browse all 869 skills organized by category and subcategory; search/filter skills
- **Skill selection**: Click any skill to inject its methodology into the AI prompt
- **Chat interface**: Real AI responses (Gemini primary, Groq fallback, local mock fallback)
- **File upload**: `.csv`, `.tsv`, `.xlsx`, `.txt`, `.md` omics data files with preview
- **AI context**: Selected skill metadata automatically prepended to prompts
- **Downloads**: CSV export for tables, Word/PDF for analysis results
- **Session management**: Clear chat, reset skill selection
- **Status bar**: Shows active skill, AI provider mode, total skill count

### AI Integration
- Uses existing `/api/chat` route with Gemini 3.1 Flash Lite (primary) and Groq (fallback)
- No API key required: falls back to local rule-based responses
- Prompts include skill name, description, and source repo for specialized guidance

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

**Feature**: Step 4 ("Synthesis & Meta-analysis") now works without any API key. When no Gemini/Groq/DeepSeek key is configured, `generateLocalSynthesis()` produces a structured PRISMA/ROSES-ready report from `extractedData` + `robAssessments` only.

### Local Synthesis Details
- Review-type-aware sections:
  - **Systematic Review / Narrative Review**: thematic/narrative synthesis, study findings by study, heterogeneity note
  - **Systematic Review & Meta-analysis / Meta-Analysis**: random-effects guidance, forest-plot-ready effect table, heterogeneity (I², τ²) pointers, metafor/meta/OpenMEE references
- Robvis commentary auto-generated from domain-level counts (Low/Some/High/Pending)
- Effect Size table populated from existing `effectSizes` entries or placeholder rows
- Explicit "Generated locally using awesome-evidence-synthesis open-source workflow standards" footer
- Button label switches between "Generate Local Synthesis" and "Generate AI Synthesis" based on key presence

### API Routing Fix
- `src/lib/ai.ts` `callGemini`/`callGroq`/`callDeepSeek` now route through `src/app/api/chat/route.ts` (server-side Next.js API route)
- Client-side browser calls no longer hit AI providers directly; avoids CORS and inadvertent key leakage in client bundles
- Server route accepts `{ provider, prompt, apiKey, model? }` and returns `{ content }` or `{ error }`

### Bug Fix API Key Test
- `testGeminiKey`/`testGroqKey`/`testDeepSeekKey` previously checked `result.toLowerCase().includes("ok")` causing false failures when provider replied without the literal "ok" substring
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
- Uses Gemini 3.1 Flash Lite (primary) for general synthesis via `callGemini`
- Falls back to Groq / DeepSeek API if configured
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

## Literature Review Step — Heading Mismatch & AI Connectivity Fix (2026-07-03)

**Root cause**: The AI prompt instructed headings (`Problem Statement`, `Future Studies to Be Carried Out`, `Conclusion`) that did not match the section parser regex (`globalIndian`, `futureAdvice`, `summary`). The AI was generating a full response, but the parser extracted content into only `introduction` and `references`, leaving the other 4 sections empty. Users saw an empty form and concluded the step was not generating a response.

**Fix applied** (`src/components/tabs/EvidenceSynthesisTab.tsx`):
- Aligned prompt headings with UI labels and parser expectations:
  - `Problem Statement (Global, South-East Asia, India)` → `Global & Indian Situation`
  - `Future Studies to Be Carried Out` → `Advice for Future Research`
  - `Conclusion` → `Summary`
- Hardened `parseLiteratureReview` regex to accept markdown prefixes (`#`, `##`) and alternate phrasings
- Added raw-text fallback: if parser returns ≤1 populated section, the full AI output is placed in `introduction` so the user always sees content
- Added lightweight planning phase before full generation (inspired by LitLLM): a short 6-point outline is generated first and injected into the main prompt, improving structure adherence
- Added async DOI validation for references using Crossref API (inspired by Research-Assistant `validateDoiViaCrossref`); invalid DOIs are noted in the references section
- Improved button disabled logic so it reflects actual eligible paper counts

**Validation**: `bun typecheck` ✅, `bun lint` ✅

## Replace OpenRouter with Groq (DeepSeek-R1-Distill-Llama-70B) (2026-06-28)

**Feature**: Removed OpenRouter / `gpt-oss-120b` fallback and replaced it with Groq using `deepseek-r1-distill-llama-70b`. DeepSeek R1 reasoning model now uses `deepseek-reasoner` via the official DeepSeek API (`api.deepseek.com`).

### Files Modified
- `src/app/api/chat/route.ts` — Separated DeepSeek and Groq backends: DeepSeek uses `https://api.deepseek.com/v1/chat/completions` with model `deepseek-reasoner`; Groq uses `https://api.groq.com/openai/v1/chat/completions` with model `deepseek-r1-distill-llama-70b`
- `src/lib/ai.ts` — Renamed `callOpenRouter` → `callGroq`, `testOpenRouterKey` → `testGroqKey`; `callDeepSeek` now routes through DeepSeek API directly
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
- `src/components/tabs/PredictiveAnalysisTab.tsx` — Updated imports and fallback chain

### AI Provider Priority (corrected)
1. **Gemini 3.1 Flash Lite** — primary AI provider for general synthesis
2. **Groq DeepSeek-R1-Distill-Llama-70B** — secondary fallback
3. **DeepSeek API Key (DeepSeek-R1 reasoning model)** — tertiary fallback

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

### Key Design Decisions
- Frontend AI assistance uses existing `/api/chat` route (DeepSeek/Gemini/Groq) so it works without the researcher service running
- Backend `/predictive/assist` provides step-specific structured guidance and PyHealth hints (e.g., `pyhealth.datasets`, `pyhealth.models`, `pyhealth.trainer`, `pyhealth.metrics`)
- Step 6 uses `events|predictors` pipe-delimited state to keep two related numbers in one field
- Step 8 references `pyhealth.trainer.Trainer` with early stopping and penalisation (ridge/LASSO) to prevent overfitting
- Step 11 notes that DCA can be computed via external Python packages (`dcurves`) after PyHealth `predict_proba()` output

## Step 14 — CSV Upload & Relationship Prediction (2026-06-29)

**New step added**: `src/components/tabs/PredictiveAnalysisTab.tsx` extended from 13 to 14 steps, adding a toggleable "CSV Prediction" step after "Report & Publish".

### Step 14 — CSV Upload & Relationship Prediction
- **Toggle**: Enable/disable the feature with a toggle switch in the step header
- **CSV Upload**: Upload `.csv` files; parsed locally and previewed (headers + first 10 rows)
- **AI Relationship Analysis**: Uses existing `/api/chat` route (Gemini/Groq/DeepSeek) to analyze column relationships and predict outcome variables from uploaded data
- **Results Display**: Shows AI-generated structured analysis (correlations, causal hints, prediction guidance)
- **Downloads**: Both Word (`.docx` via HTML-based Office document) and PDF (print-window) buttons available for the analysis results

### Step 13 — Report & Publish (enhanced)
- **Word Download**: "Download Word" button converts AI-generated TRIPOD report draft to a `.docx` file
- **PDF Download**: "Download PDF" button converts the same report to PDF via print dialog
- Both buttons are visible after the AI report is generated or when `predictionReport` state is populated

### Files Modified
- `src/lib/exporters.ts` — Added `downloadMarkdownAsWord` and `downloadMarkdownAsPDF` using `marked` for markdown-to-HTML conversion
- `src/components/tabs/PredictiveAnalysisTab.tsx` — Added step 14 toggle, CSV upload, AI analysis, and download buttons; updated step 13 with Word/PDF exports
- `package.json` — Added `@mohtasham/md-to-docx` and `marked` dependencies

### Referenced Open-Source Projects
- `Krishnadev-cmd/Casual-Competitor` — DoWhy-based causal discovery from CSV upload
- `ChunkyTortoise/insight-engine` — CSV/Excel upload → predictive models → PDF reports
- `Ananyaa-Tanwar/multi-agent-data-pipeline` — Multi-agent CSV/Excel analysis with relationship detection
- `SagarSreekumarPillai/insightpredictor` — Next.js + FastAPI CSV prediction with ML insights and PDF export

## Step 15 — LR Modeling & Variable Selection (AI Guidance Only) (2026-07-03)

**Refactor**: Removed AutoPrognosis execution path from Step 15. The step now provides AI guidance for logistic regression modeling and variable selection only.

**Files Modified**:
- `src/components/tabs/PredictiveAnalysisTab.tsx`
- `src/context/AppContext.tsx`

**Backend Cleanup**:
- Deleted `src/app/api/researcher/run-autoprognosis/route.ts`
- Deleted entire `services/researcher/` directory (unused FastAPI service, no deployment config references it)
- Removed zombie AutoPrognosis state from `AppContext.tsx`: `predictionAutoPrognosisReportHtml`, `predictionAutoPrognosisReportText`, `predictionAutoPrognosisLoading` and their reducer cases/action types

**Frontend Changes**:
- Removed `runAutoPrognosis` function and related state variables (`step15MaxVars`, `step15TestSize`, `step15NumIter`)
- Removed parameter form (Max Variables, Test Size, Iterations)
- Removed "Run AutoPrognosis Analysis" button
- Removed AutoPrognosis Report section and download buttons
- Updated step 15 title to "LR Modeling & Variable Selection"
- Updated AI prompt to cover LR modeling guidance without AutoPrognosis dependency
- Removed zombie AutoPrognosis state from `AppContext.tsx`: `predictionAutoPrognosisReportHtml`, `predictionAutoPrognosisReportText`, `predictionAutoPrognosisLoading` and their reducer cases/action types

**Remaining Step 15 Features**:
- AI LR Modeling Guidance button (uses existing `/api/chat` route)
- Markdown-rendered AI output display

**Validation**: `bun typecheck` ✅, `bun lint` ✅

## OpenClaw-Medical-Skills Integration (2026-06-30)

**Feature**: Replaced HTML-blob document exports with professional-grade generation using the same tech stack as https://github.com/Duds/md-converter (docx, exceljs, pptxgenjs). Chose Duds/md-converter over vace/markdown-docx because it supports DOCX, PPTX, and XLSX, and maintains consistent content/formatting across on-screen markdown and downloaded documents.

### New Dependencies Added
- `docx@9.7.1` — true DOCX generation with proper styles, headings, tables, and paragraph formatting
- `exceljs@4.4.0` — true XLSX with header formatting, frozen rows, auto-width columns, and cell wrap
- `pptxgenjs@4.0.1` — PPTX generation from markdown (headings → slides, lists → bullets, tables → slide tables)

### File Rewritten
- `src/lib/exporters.ts` — Full rewrite of document export functions:
  - `downloadWord()` — HTML blob hack replaced with DOCX (`docx` library, styled table headers, proper margins)
  - `downloadLiteratureReviewWord()` — replaced with DOCX generation using structured section mapping and markdown token parsing
  - `downloadMarkdownAsWord()` — replaced with `docx`-based markdown token-to-paragraph conversion (headings, bold, italic, lists, code blocks, tables, blockquotes)
  - `downloadExcel()` — replaced legacy `.xls` HTML blob with true `.xlsx` via `exceljs` (frozen header row, white-on-blue header styling, wrap text, auto-width columns)
  - `downloadPPTX()` — **NEW** export for PPTX from markdown (headings → title/section/content slides, bullet lists, code blocks, tables, blockquotes)
  - `downloadCSV()`, `downloadPDF()`, `downloadLiteratureReviewPDF()`, `downloadMarkdownAsPDF()`, `parseCSVText()` — preserved unchanged

### Markdown Parsing
- Uses `marked.lexer()` for token-based parsing (not vace/markdown-docx's token-to-docx pipeline, but same parser: `marked`)
- Inline formatting (bold, italic, code, links) rendered as native `TextRun` elements in DOCX and PPTX
- Tables rendered as `docx.Table` and `pptxgenjs` slide tables with header formatting

### Rationale for Library Choice
- **Duds/md-converter** selected because it covers all three formats (DOCX, PPTX, XLSX) required by the app
- **vace/markdown-docx** rejected because it is DOCX-only (no PPTX/XLSX support)
- Duds/md-converter's underlying libraries (`docx`, `exceljs`, `pptxgenjs`, `markdown-it`) are browser-compatible and were integrated directly into the Next.js client-side export layer

## OpenClaw-Medical-Skills Integration (2026-06-30)

**Source**: https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills
**License**: MIT
**Skills integrated**: 19 curated skills across 4 categories

### Integration Approach
Added as an add-on layer to the existing app — does not modify existing step numbering, tab layout, or prompt architecture. All core steps (1–11) and pipeline behavior remain unchanged.

### New Files Created
- `src/lib/medical-skills/skills-registry.ts` — Registry of 19 integrated OpenClaw medical skills with categories, descriptions, source repo paths, and integration status
- `src/lib/medical-skills/evidence-grading.ts` — T1–T4 evidence grading utilities (Mechanistic → Functional → Associational → Mention) used across synthesis and literature review prompts
- `src/lib/medical-skills/prisma-utils.ts` — PRISMA flow diagram builder, search strategy document builder, inclusion/exclusion criteria builder, quality assessment builder, evidence grading summary used in systematic review workflows
- `src/lib/medical-skills/index.ts` — Barrel export for all medical skill modules

### Files Enhanced
- `src/lib/research-skills.ts` — Step 3 (Synthesis table) and Step 4 (Literature Review) prompts now embed PRISMA compliance requirements, evidence grading (T1/T2/T3/T4), quality assessment methodology, and thematic synthesis rules from `literature-review` and `literature-deep-research` skills
- `src/lib/database-apis.ts` — Added import for `MEDICAL_SKILLS_REGISTRY`; added `getDatabaseBackendMapping()` and `getOpenClawSkillDatabaseMapping()` to document which OpenClaw skills map to which live API backends
- `src/components/tabs/ProtocolChatTab.tsx` — System prompt now references `clinical-trial-protocol-skill` methodology; welcome message shows skill name and description when loaded; default protocol generator includes regulatory note from the skill's required disclaimers; output annotated with skill attribution
- `src/components/tabs/OmicsBioinformaticsTab.tsx` — Imports `OPENCLAW_OMICS_SKILLS` from registry; omics response generator now shows "Powered by: [skill name] ([source repo])" attribution per topic (single-cell, bulk RNA-seq, pathway, etc.); help message lists integrated OpenClaw skills
- `src/components/tabs/EvidenceSynthesisTab.tsx` — Description paragraph now references both `awesome-evidence-synthesis` and `OpenClaw-Medical-Skills` (literature-review, literature-deep-research, clinical-trials-database)

### Integrated Skills by Category

**Research Pipeline (add-ons)**
| Skill | ID | Description |
|-------|----|-------------|
| Systematc Literature Review | `literature-review` | PRISMA-compliant systematic reviews with multi-database search, citation verification, and PDF export |
| Literature Deep Research | `literature-deep-research` | Target disambiguation, evidence grading (T1–T4), structured theme extraction, biological model synthesis, testable hypotheses |
| Biomedical Semantic Search | `biomedical-search` | Unified search across PubMed, bioRxiv, medRxiv, ClinicalTrials.gov, FDA drug labels via Valyu |
| Clinical Trial Protocol Designer | `clinical-trial-protocol` | Modular waypoint-based protocol generation for medical devices/drugs with FDA guidance |

**Omics & Bioinformatics**
| Skill | ID | Description |
|-------|----|-------------|
| RNA-seq Differential Expression | `rnaseq-deseq2` | PyDESeq2 analysis: normalization, dispersion, Wald/LRT, LFC shrinkage, pathway enrichment |
| Single-cell RNA-seq | `single-cell` | Scanpy/scVI: QC, normalization, PCA, UMAP, Leiden clustering, trajectory, cell type annotation |
| Spatial Transcriptomics | `spatial-transcriptomics` | 10x Visium, MERFISH, seqFISH, Slide-seq tissue architecture mapping |
| Multi-Omics Integration | `multi-omics-integration` | Transcriptomics + proteomics + epigenomics + genomics + metabolomics integration |
| GWAS Study Explorer | `gwas-study-explorer` | Cross-study GWAS meta-analysis using NHGRI-EBI GWAS Catalog and Open Targets Genetics |
| GWAS Trait-to-Gene | `gwas-trait-to-gene` | 500k+ GWAS associations with Open Targets locus-to-gene predictions |
| Gene Set Enrichment | `gene-enrichment` | GO/KEGG via gseapy, PANTHER, STRING, Reactome |
| Proteomics & Mass Spec | `proteomics-analysis` | Protein quantification, DE, PTMs, PPI networks |
| Metabolomics Analysis | `metabolomics-analysis` | LC-MS/GC-MS/NMR metabolite ID, quantification, pathway analysis |
| Epigenomics & Chromatin | `epigenomics` | Methylation arrays, chromatin accessibility, histone modifications |

**Evidence Synthesis & Meta-analysis**
| Skill | ID | Description |
|-------|----|-------------|
| Literature Review | `literature-review` | Full systematic review workflow (see above) |
| Literature Deep Research | `literature-deep-research` | Evidence-graded research reports with completeness checklist (see above) |

**Protocol Generator**
| Skill | ID | Description |
|-------|----|-------------|
| Clinical Trial Protocol | `clinical-trial-protocol` | Research Only (Steps 0–1) or Full Protocol (Steps 0–5) modes; waypoint-based architecture; FDA guidance |

**Databases**
| Skill | ID | Description |
|-------|----|-------------|
| ClinicalTrials.gov | `clinical-trials-database` | API v2 search by condition/drug/location/status/phase |
| ChEMBL | `chembl-search` | Bioactive molecules, assay data, bioactivity |
| GWAS Catalog | `gwas-database` | SNP-trait associations, p-values, summary statistics |

### Validation
- `bun typecheck` ✅ passes
- `bun lint` ✅ passes

## AutoPrognosis Tab Added as Separate Pipeline (2026-07-03)

**Feature**: Added AutoPrognosis as a standalone top-level tab in the navigation bar and as a separate step-by-step pipeline.

### Files Created
- `src/components/tabs/AutoPrognosisTab.tsx` — New 12-step AutoPrognosis pipeline with AI guidance

### Files Modified
- `src/components/TopTabs.tsx` — Added `{ id: "autoprognosis", label: "AutoPrognosis", icon: Sparkles }` tab
- `src/app/page.tsx` — Added `AutoPrognosisTab` dynamic import and routing case

### AutoPrognosis Pipeline Steps
1. Study Protocol & Aims
2. Dataset & Outcome Definition
3. Candidate Predictor Identification
4. Data Loading & Profiling
5. Missing Data Strategy
6. Train/Test Split
7. Forward Stepwise Selection (FSS)
8. AUC & Discrimination
9. Overfitting Detection
10. Predictor Insights Graph (PIG)
11. Final Model Equation
12. Validation & Reporting

### Technical Notes
- Uses existing AI infrastructure (`callGemini` / `callGroq` via `/api/chat`)
- No separate backend dependency; self-contained in the Next.js app
- Supports CSV upload for data profiling
- Word and PDF export for AI guidance output
- Step navigation with Previous/Next buttons

## AutoPrognosis Actual Computations Added (2026-07-03)

**Feature**: Implemented real AutoPrognosis computations directly in the frontend using TypeScript, removing the need for a separate Python backend service.

### Files Created
- `src/lib/autoprognosis-compute.ts` — Pure TypeScript computation library with:
  - Logistic regression via gradient descent
  - Forward Stepwise Selection (FSS)
  - AUC calculation
  - Train/test split with configurable test size and random seed
  - PIG table generation with coefficients, odds ratios, confidence intervals, and importance scores
  - Overfitting detection (train AUC vs test AUC)

### Files Modified
- `src/components/tabs/AutoPrognosisTab.tsx` — Wired actual computations into the UI

### Computation Features
- "Run Analysis" button triggers real FSS, AUC, and PIG computation on uploaded CSV data
- Results panel shows Test AUC, Train AUC, selected predictors count, overfitting status
- PIG table displays coefficients, odds ratios, 95% CI, and importance for each selected predictor
- Download PIG table as CSV
- CSV parsing handles quoted fields and numeric coercion
- Computation is fully client-side with no backend dependency

## Scientific Paper Tab Added (OpenDraft-style) (2026-07-03)

**Feature**: Added a new "Scientific Paper" tab to the navigation bar, positioned next to Protocol Generator. The tab provides an OpenDraft-style academic paper writing assistant with deep reasoning capabilities.

### Files Created
- `src/components/tabs/ScientificPaperTab.tsx` — New Scientific Paper tab component with chat interface, document upload, deep reasoning mode, and paper generation/export functionality

### Files Modified
- `src/components/TopTabs.tsx` — Added `{ id: "scientificpaper", label: "Scientific Paper", icon: BookOpen }` tab
- `src/app/page.tsx` — Added `ScientificPaperTab` dynamic import and routing case `case "scientificpaper": return <ScientificPaperTab />;`

### Features
- Chat-based interface for scientific paper writing assistance
- Deep Reasoning toggle (Long CoT mode)
- Document upload support: `.doc`, `.docx`, `.pdf`, `.txt`, `.md`
- AI-powered paper generation using existing Gemini/Groq/DeepSeek providers
- Word (.doc) export with academic formatting
- Context-aware responses based on uploaded documents
- OpenDraft-style methodology: 19-agent pipeline inspiration, verified citations approach, structured manuscript generation

### Technical Notes
- Uses existing AI infrastructure (`callGemini` / `callGroq` via `/api/chat`)
- Document parsing uses FileReader API for text extraction
- Word export generates HTML-based .doc files with academic formatting
- State managed locally within the component (no global state bloat)
- Follows same UI patterns as ProtocolChatTab for consistency

### Validation
- `bun typecheck` ✅ passes
- `bun lint` ✅ passes

## Scientific Poster Tab Added (Poster_Template-style) (2026-07-03)

**Feature**: Added a new "Scientific Poster" tab to the navigation bar, positioned next to "Scientific Paper". The tab provides a Poster_Template-inspired academic poster designer with PDF/Word upload support and poster generation/export.

### Files Created
- `src/components/tabs/ScientificPosterTab.tsx` — New Scientific Poster tab component with chat interface, document upload, deep reasoning mode, poster generation/export

### Files Modified
- `src/components/TopTabs.tsx` — Added `{ id: "scientificposter", label: "Scientific Poster", icon: Presentation }` tab
- `src/app/page.tsx` — Added `ScientificPosterTab` dynamic import and routing case `case "scientificposter": return <ScientificPosterTab />;`

### Features
- Chat-based interface for scientific poster design assistance
- Deep Reasoning toggle (Long CoT mode)
- Document upload support: `.doc`, `.docx`, `.pdf`, `.txt`, `.md`
- AI-powered poster layout generation using existing Gemini/Groq/DeepSeek providers
- Word (.doc) export with academic poster formatting
- Print / Save PDF via browser print dialog with poster-sized CSS
- 3-column conference poster preview (Title, Authors, Introduction/Methods, Results, Discussion/Conclusion, References)
- Context-aware responses based on uploaded documents
- Poster_Template methodology: conference-style academic poster design, structured sections, visual hierarchy

### Technical Notes
- Uses existing AI infrastructure (`callGemini` / `callGroq` via `/api/chat`)
- Document parsing uses existing `parseUploadedDocument` utility
- Poster sections parsed from markdown into structured layout
- Print CSS optimized for large-format poster printing (48in x 36in)
- State managed locally within the component (no global state bloat)
- Follows same UI patterns as ProtocolChatTab and ScientificPaperTab for consistency

### Validation
- `bun typecheck` ✅ passes
- `bun lint` ✅ passes

## Scientific Paper Tab Added (OpenDraft-style) (2026-07-03)

**Feature**: Added a new "Scientific Paper" tab to the navigation bar, positioned next to "Protocol Generator". The tab provides an OpenDraft-style academic paper writing assistant with deep reasoning capabilities.

### Files Created
- `src/components/tabs/ScientificPaperTab.tsx` — New Scientific Paper tab component with chat interface, document upload, deep reasoning mode, and paper generation/export functionality

### Files Modified
- `src/components/TopTabs.tsx` — Added `{ id: "scientificpaper", label: "Scientific Paper", icon: BookOpen }` tab
- `src/app/page.tsx` — Added `ScientificPaperTab` dynamic import and routing case `case "scientificpaper": return <ScientificPaperTab />;`

### Features
- Chat-based interface for scientific paper writing assistance
- Deep Reasoning toggle (Long CoT mode)
- Document upload support: `.doc`, `.docx`, `.pdf`, `.txt`, `.md`
- AI-powered paper generation using existing Gemini/Groq/DeepSeek providers
- Word (.doc) export with academic formatting
- Context-aware responses based on uploaded documents
- OpenDraft-style methodology: 19-agent pipeline inspiration, verified citations approach, structured manuscript generation

### Technical Notes
- Uses existing AI infrastructure (`callGemini` / `callGroq` via `/api/chat`)
- Document parsing uses FileReader API for text extraction
- Word export generates HTML-based .doc files with academic formatting
- State managed locally within the component (no global state bloat)
- Follows same UI patterns as ProtocolChatTab for consistency

### Validation
- `bun typecheck` ✅ passes
- `bun lint` ✅ passes
