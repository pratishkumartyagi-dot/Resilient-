# System Patterns: Next.js Starter Template

## Architecture Overview

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── Header.tsx
│   ├── TopTabs.tsx
│   ├── StepNavigator.tsx
│   ├── SettingsModal.tsx
│   ├── steps/                  # 11-step pipeline
│   │   ├── Step1Search.tsx
│   │   ├── Step2Results.tsx
│   │   ├── Step3Synthesis.tsx
│   │   ├── Step4LiteratureReview.tsx
│   │   ├── Step5Themes.tsx
│   │   ├── Step6ResearchQuestions.tsx
│   │   ├── Step7ResearchTitles.tsx
│   │   ├── Step8AimObjectives.tsx
│   │   ├── Step9Methodology.tsx
│   │   ├── Step10Protocol.tsx
│   │   └── Step11Impact.tsx
│   └── tabs/                   # Tab-level views
│       ├── ResilientChatTab.tsx
│       ├── ProtocolChatTab.tsx   # <-- NEW: Perplexity-style protocol generator
│       ├── StatisticalAnalysisTab.tsx
│       ├── SampleSizeTab.tsx
│       ├── EvidenceSynthesisTab.tsx
│       ├── PaperWriterTab.tsx
│       └── GrantWritingTab.tsx
├── context/
│   └── AppContext.tsx           # Global state
└── lib/
    ├── ai.ts                   # Gemini / OpenRouter wrappers
    ├── database-apis.ts        # Live scholarly DB registry + fetchers (no mock data path)
    ├── document-parser.ts      # <-- NEW: Word/PDF/text parsing
    ├── local-synthesis.ts      # Local evidence-synthesis engine
    ├── research-skills.ts      # AIPOCH Long-CoT prompt builders
    └── exporters.ts            # CSV/Excel/PDF/Word generators
```

## Key Design Patterns

### 1. App Router Pattern

Uses Next.js App Router with file-based routing:
```
src/app/
├── page.tsx           # Route: /
├── about/page.tsx     # Route: /about
├── blog/
│   ├── page.tsx       # Route: /blog
│   └── [slug]/page.tsx # Route: /blog/:slug
└── api/
    └── route.ts       # API Route: /api
```

### 2. Component Organization Pattern (When Expanding)

```
src/components/
├── ui/                # Reusable UI components (Button, Card, etc.)
├── layout/            # Layout components (Header, Footer)
├── sections/          # Page sections (Hero, Features, etc.)
└── forms/             # Form components
```

### 3. Server Components by Default

All components are Server Components unless marked with `"use client"`:
```tsx
// Server Component (default) - can fetch data, access DB
export default function Page() {
  return <div>Server rendered</div>;
}

// Client Component - for interactivity
"use client";
export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### 4. Layout Pattern

Layouts wrap pages and can be nested:
```tsx
// src/app/layout.tsx - Root layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// src/app/dashboard/layout.tsx - Nested layout
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

## Scholarly Search Architecture (Step 1)

```
src/lib/database-apis.ts
├── httpRequest/httpJson/httpText   # timeout + backoff (Retry-After capped) + UA
├── DATABASE_DEFINITIONS[]          # one entry per live source (id, url, keys, hints)
├── searchDatabases(databases, opts) # concurrent fan-out → { papers, outcomes, errors }
├── applyFilters()                  # central year + study-type filtering
└── per-database fetchers           # one function per source, real API only
```

`/api/literature-search` is the only server entry point for Step 1. It returns HTTP 502 with
per-database failure reasons when no source could be reached, 200 with an empty `papers` array
for a genuine zero-hit search, and never substitutes simulated records.

## Styling Conventions

### Tailwind CSS Usage
- Utility classes directly on elements
- Component composition for repeated patterns
- Responsive: `sm:`, `md:`, `lg:`, `xl:`

### Common Patterns
```tsx
// Container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Flexbox centering
<div className="flex items-center justify-center">
```

## File Naming Conventions

- Components: PascalCase (`Button.tsx`, `Header.tsx`)
- Utilities: camelCase (`utils.ts`, `helpers.ts`)
- Pages/Routes: lowercase (`page.tsx`, `layout.tsx`)
- Directories: kebab-case (`api-routes/`) or lowercase (`components/`)

## State Management

For simple needs:
- `useState` for local component state
- `useContext` for shared state
- Server Components for data fetching

For complex needs (add when necessary):
- Zustand for client state
- React Query for server state

## Systematic Review Search Architecture (2026-10-20)

Steps 1 and 2 of the Research Pipeline follow a systematic-review pipeline. The
flow is deliberately separated so each stage can be tested in isolation:

```
Step 1 UI
  └─ extractConcepts()            src/lib/concept-extraction.ts
       └─ enrichConcepts()        MeSH + synonyms (mesh-expansion.lookupConceptExpansion)
  └─ compileQueryPlan()           src/lib/query-compiler.ts   (preview only, client-side)
  └─ POST /api/literature-search  src/app/api/literature-search/route.ts
       ├─ compileQueryPlan()      server-side, authoritative
       ├─ per-database fetch       database-apis.ts (Track 1 / 2 / 3 dispatch)
       ├─ filterByStudyTypes()    local OR filter, non-native databases only
       ├─ filterNegatedConcepts() local NOT filter, non-Track-1 databases
       ├─ medspacy + keyword filter  (skipped when medspacyFilter === false)
       └─ response: rawRecordCount, rawRecordsPerDatabase,
                    relevanceFilteredCount, compiledPlan, planSummary
  └─ dispatch SET_RAW_COUNTS / SET_CONCEPT_BLOCKS / SET_STUDY_TYPES / SET_PAPERS

Step 2 UI
  └─ deduplicatePapers()           src/lib/dedup-endnote.ts
  └─ hasAbstract()                 abstract / full-text screening filter
  └─ POST /api/citation-validator src/app/api/citation-validator/route.ts
  └─ <Prisma2020Diagram />         src/components/Prisma2020Diagram.tsx
  └─ dispatch SET_PAPERS (unique set) before advancing to Step 3
```

Conventions:

- **Track 1** databases (PubMed, ClinicalTrials.gov) express the study-type
  filter and NOT clauses inside the query, so no local filter is applied to
  them; **Track 2/3** databases get both filters applied locally with OR
  semantics.
- PubMed field tags must sit **outside** the quotes: `"term"[pt]`, never
  `("term"[pt])`.
- `rawRecordCount` (records identified) → relevance filter →
  `relevanceFilteredCount` → dedup → `duplicatesRemoved` → unique records
  screened. PRISMA counts are derived from these three numbers, so they must
  stay consistent with what the route actually did.
- Step 1 requests `deduplicate: false` on purpose: duplicates are collapsed
  once, in Step 2, by the DedupEndNote pass.
