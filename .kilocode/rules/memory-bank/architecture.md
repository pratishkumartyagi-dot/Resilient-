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
    ├── database-apis.ts        # Live scholarly DB fetchers
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
