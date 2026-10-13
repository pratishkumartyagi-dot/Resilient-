# Resilient Research App

AI-powered research intelligence platform for systematic reviews, evidence synthesis, and academic writing. Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS 4.

The app ships with an 11-step research pipeline plus dedicated tabs for omics/bioinformatics, evidence synthesis & meta-analysis, statistical analysis, sample-size calculation, predictive analysis, paper writing, protocol generation, and grant writing.

---

## Requirements

- **Node.js 20+**
- One package manager:
  - **Bun** (recommended) — install from https://bun.sh
  - or **npm** (bundled with Node.js)

No API keys are required to start the app. All AI features have a local, in-browser fallback.

---

## Quick start

```bash
# 1. Clone the repository
git clone https://github.com/pratishkumartyagi-dot/Resilient-.git
cd Resilient-

# 2. Install dependencies
bun install
#   …or, with npm:
# npm install

# 3. Start the dev server
bun dev
#   …or, with npm:
# npm run dev
```

Then open **http://localhost:3000** in your browser.

### Production build

```bash
bun run build     # build for production
bun start         # serve the production build
# npm run build && npm start
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start the development server at http://localhost:3000 |
| `bun run build` | Create an optimized production build |
| `bun start` | Serve the production build |
| `bun lint` | Run ESLint |
| `bun typecheck` | Run the TypeScript compiler (`tsc --noEmit`) |

The `npm` equivalents (`npm run dev`, `npm run build`, etc.) work the same way.

---

## Configuration (optional)

All settings are optional. The app works out of the box with no configuration.

### AI providers (recommended for best results)

Open the app, click the **settings gear** in the header, and paste API keys. Keys are stored only in your browser's `localStorage` and are sent to the provider through the app's own `/api/chat` server route — never committed anywhere.

| Provider | Role | Where to get a key |
|----------|------|--------------------|
| **Google Gemini** | Primary | https://aistudio.google.com/app/apikey |
| **Groq** | Secondary fallback | https://console.groq.com/keys |

If no key is set, the app falls back to a **local model** (`Qwen2.5 0.5B Instruct`) that runs entirely in your browser via WebGPU/WASM. It downloads once (~350 MB) on first use and is then cached. This is slower than an API key.

### Environment variables

Copy the example file and edit as needed:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `TAVILY_API_KEY` | No | Enables supplementary web search in server-side AI/search routes. Without it, the app falls back to arXiv and the built-in academic databases. |
| `PORT` | No | Port for the dev/production server (default `3000`). |
| `PAPER_SEARCH_MCP_BIN` | No | Path to the optional `paper-search-mcp` binary. |
| `PAPER_SEARCH_BIN` | No | Path to the optional `paper-search` CLI binary. |

See `.env.example` for details. `.env*` files are git-ignored, so your keys are never committed.

### Optional: paper-search CLI binaries

Two API routes (`/api/paper-search`, `/api/paper-search-mcp`) can use external CLI tools if installed. They are **not required** — Step 1 search falls back to direct scholarly APIs (PubMed, OpenAlex, Europe PMC, Crossref, arXiv, etc.). If you want to enable them, install the corresponding tool and point `PAPER_SEARCH_BIN` / `PAPER_SEARCH_MCP_BIN` at the executable.

---

## Project structure

```
src/
├── app/                 # Next.js App Router (pages + API routes)
│   ├── page.tsx         # Main app shell
│   └── api/             # Server routes (chat, search, DOI verification)
├── components/          # UI: header, tabs, 11-step pipeline, tab views
├── context/             # Global state (React Context + useReducer)
└── lib/                 # AI wrappers, database APIs, exporters, parsers
```

A full description of the current state and features is maintained in `.kilocode/rules/memory-bank/`.

---

## Troubleshooting

- **Blank page / module not found** — re-run the install step (`bun install` or `npm install`) and make sure dependencies finished installing.
- **Port 3000 already in use** — start on another port, e.g. `bun dev --port 3001`, or set `PORT`.
- **AI generation is slow** — you are using the in-browser local model. Add a Gemini or Groq key in Settings for much faster, higher-quality output.
- **Search returns few results** — a free `TAVILY_API_KEY` and/or `paper-search` binary extend coverage; otherwise the app uses public scholarly APIs only.

---

## License

AGPL-3.0. See [LICENSE](./LICENSE).
