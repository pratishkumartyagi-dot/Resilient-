# Researcher Service

A FastAPI service that performs AI research using **OpenRouter** with **DeepSeek R1**, optional **Tavily** web search, and **ChromaDB** for document memory.

## Requirements

- Python 3.9+
- [OpenRouter](https://openrouter.ai) API key (default model: `deepseek/deepseek-r1`)
- Optional: Tavily API key for web search

No local LLM (Ollama) required — the service calls OpenRouter's API directly.

## Quick Start

```bash
cd services/researcher
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY and optional TAVILY_API_KEY
bash run.sh
```

Once running:

- **Docs / Swagger:** http://127.0.0.1:6082/docs
- **Health:** http://127.0.0.1:6082/health
- **SSE stream:** http://127.0.0.1:6082/research/stream

## Endpoints

| Method | Path                | Purpose                                  |
|--------|---------------------|------------------------------------------|
| POST   | /research           | Run a research query (JSON)              |
| POST   | /research/stream    | Stream answer via Server-Sent Events     |
| POST   | /chroma/upload      | Upload document text via JSON (base64)   |
| POST   | /chroma/upload-file | Upload document text as multipart file   |
| GET    | /chroma/status      | List indexed chunks & filenames          |
| DELETE | /chroma/purge       | Clear all indexed documents              |
| GET    | /health             | Health check                             |

## Environment Variables

See `.env.example`. Load them into the shell before running, or copy to `.env`.

| Variable              | Required | Default     | Description                            |
|-----------------------|----------|-------------|----------------------------------------|
| OPENROUTER_API_KEY    | Yes      | —           | OpenRouter API key for DeepSeek R1     |
| TAVILY_API_KEY        | No       | —           | Tavily web search key                  |

## Local ChromaDB

Documents are persisted at `/tmp/researcher_chroma.db` (all files share this path).

## Chat with Doc Context

When you call `/research` or `/research/stream`, set `uploaded_files` to the count of documents you previously indexed via `/chroma/upload` (or `/chroma/upload-file`). The service will retrieve the top relevant chunks from ChromaDB and include them in the prompt context.

## Notes

- DeepSeek R1 responses may include `<think>...</think>` blocks — these are stripped before the final answer is returned.
- Transient API failures are retried automatically (up to 2 retries with exponential backoff).
- CORS is enabled for all origins (suitable for local UI integrations).
