"""FastAPI researcher service using OpenRouter (DeepSeek R1) and ChromaDB."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import time
from pathlib import Path
from typing import AsyncGenerator, List, Optional

import httpx
from chromadb import Client as ChromaClient
from chromadb.config import Settings as ChromaSettings
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sse_starlette import EventSourceResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("researcher")

# ---------------------------------------------------------------------------
# ChromaDB
# ---------------------------------------------------------------------------
CHROMA_DIR = "/tmp/researcher_chroma.db"

chroma_settings = ChromaSettings(persist_directory=CHROMA_DIR, anonymized_telemetry=False)
chroma_client = ChromaClient(chroma_settings)

# Ensure a default collection exists
try:
    chroma_collection = chroma_client.get_or_create_collection("documents")
except Exception:
    chroma_collection = chroma_client.create_collection("documents")


def chroma_stats() -> dict:
    try:
        all_data = chroma_collection.get(include=["metadatas"])
        total = len(all_data.get("ids", []))
        by_file: dict[str, int] = {}
        for meta in all_data.get("metadatas", []):
            fname = meta.get("filename", "unknown")
            by_file[fname] = by_file.get(fname, 0) + 1
        return {"total_chunks": total, "documents": [{"filename": k, "chunks": v} for k, v in by_file.items()]}
    except Exception as exc:
        logger.exception("chroma_stats failed")
        return {"total_chunks": 0, "documents": []}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    query: str = Field(..., min_length=1)
    openrouter_api_key: str = Field(..., min_length=1)
    report_structure: Optional[str] = None
    max_search_queries: Optional[int] = Field(default=3, ge=1, le=10)
    enable_web_search: Optional[bool] = Field(default=False)
    uploaded_files: Optional[int] = Field(default=0, ge=0)


class ResearchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    final_answer: str
    search_summaries: List[str]


class UploadRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    filename: str = Field(..., min_length=1)
    content_base64: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)


class UploadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: bool
    chunks: int


class StatusResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total_chunks: int
    documents: List[dict]


class PurgeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: bool


class StatusHealthResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str


# ---------------------------------------------------------------------------
# Text splitting (langchain)
# ---------------------------------------------------------------------------
def split_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except ImportError:
        # Fallback splitter
        words = text.split()
        chunks = []
        start = 0
        while start < len(words):
            end = start + chunk_size
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            start = end - chunk_overlap
        return chunks

    splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return splitter.split_text(text)


# ---------------------------------------------------------------------------
# OpenRouter / DeepSeek helpers
# ---------------------------------------------------------------------------
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "deepseek/deepseek-r1"


def strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def call_openrouter(
    api_key: str,
    messages: List[dict],
    *,
    temperature: float = 0.3,
    max_retries: int = 2,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:6082",
        "X-Title": "Researcher",
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature,
    }

    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
                if resp.status_code == 429:
                    wait = min(2 ** attempt, 8)
                    logger.warning("Rate-limited, retrying in %ss (attempt %s/%s)", wait, attempt, max_retries)
                    await asyncio.sleep(wait)
                    continue
                if resp.status_code >= 500:
                    raise httpx.HTTPStatusError(f"Server error {resp.status_code}", request=resp.request, response=resp)
                resp.raise_for_status()
                data = resp.json()
                content = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
                return strip_think_tags(content)
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.RemoteProtocolError) as exc:
            last_exc = exc
            logger.warning("OpenRouter attempt %s failed: %s", attempt, exc)
            await asyncio.sleep(min(2 ** attempt, 8))
        except Exception as exc:
            last_exc = exc
            logger.exception("OpenRouter unexpected error attempt %s", attempt)
            await asyncio.sleep(1)

    raise RuntimeError(f"OpenRouter call failed after {max_retries} retries: {last_exc}")


async def stream_openrouter(
    api_key: str,
    messages: List[dict],
    *,
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:6082",
        "X-Title": "Researcher",
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream("POST", OPENROUTER_URL, json=payload, headers=headers) as stream:
                async for line in stream.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    token = line[len("data:"):].strip()
                    if token == "[DONE]":
                        return
                    try:
                        import json
                        parsed = json.loads(token)
                        delta = parsed.get("choices", [{}])[0].get("delta", {})
                        chunk = delta.get("content") or ""
                        if chunk:
                            yield chunk
                    except Exception:
                        continue
    except Exception as exc:
        logger.exception("stream_openrouter failed")
        yield f"[ERROR] {exc}"


# ---------------------------------------------------------------------------
# Web search (Tavily)
# ---------------------------------------------------------------------------
async def tavily_search(query: str, max_results: int = 3) -> List[str]:
    tavily_key = os.getenv("TAVILY_API_KEY")
    if not tavily_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": tavily_key, "query": query, "max_results": max_results, "search_depth": "basic"},
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            return [str(r.get("content") or r.get("title") or "") for r in results[:max_results]]
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Context retrieval from ChromaDB
# ---------------------------------------------------------------------------
def retrieve_context(query: str, n_results: int = 5) -> str:
    try:
        results = chroma_collection.query(query_texts=[query], n_results=n_results)
        texts = []
        for doc_list in results.get("documents", []):
            texts.extend(doc_list)
        return "\n\n---\n\n".join(texts)
    except Exception as exc:
        logger.warning("ChromaDB retrieval failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="Researcher Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=StatusHealthResponse)
async def health() -> StatusHealthResponse:
    return StatusHealthResponse(status="ok")


@app.post("/research", response_model=ResearchResponse)
async def research(req: ResearchRequest) -> ResearchResponse:
    if not req.openrouter_api_key:
        raise ValueError("openrouter_api_key is required")

    messages: List[dict] = []
    if req.report_structure:
        messages.append({"role": "system", "content": req.report_structure})

    # Collect uploaded context
    stored_context = ""
    if req.uploaded_files and req.uploaded_files > 0:
        stored_context = retrieve_context(req.query)

    if req.enable_web_search:
        search_summaries = await tavily_search(req.query, max_results=req.max_search_queries or 3)
        if search_summaries:
            web_block = "\n\n".join(f"- {s}" for s in search_summaries)
            messages.append({"role": "system", "content": f"Web search results:\n{web_block}"})
    else:
        search_summaries = []

    if stored_context:
        messages.append({"role": "system", "content": f"Uploaded document context:\n{stored_context}"})

    messages.append({"role": "user", "content": req.query})

    try:
        final_answer = await call_openrouter(req.openrouter_api_key, messages)
    except Exception as exc:
        raise ValueError(str(exc))

    return ResearchResponse(final_answer=final_answer, search_summaries=search_summaries)


@app.post("/research/stream")
async def research_stream(req: ResearchRequest):
    if not req.openrouter_api_key:
        raise ValueError("openrouter_api_key is required")

    messages: List[dict] = []
    if req.report_structure:
        messages.append({"role": "system", "content": req.report_structure})

    if req.uploaded_files and req.uploaded_files > 0:
        stored_context = retrieve_context(req.query)
        if stored_context:
            messages.append({"role": "system", "content": f"Uploaded document context:\n{stored_context}"})

    if req.enable_web_search:
        search_summaries = await tavily_search(req.query, max_results=req.max_search_queries or 3)
        if search_summaries:
            web_block = "\n\n".join(f"- {s}" for s in search_summaries)
            messages.append({"role": "system", "content": f"Web search results:\n{web_block}"})

    messages.append({"role": "user", "content": req.query})

    async def event_generator():
        async for chunk in stream_openrouter(req.openrouter_api_key, messages):
            yield chunk

    return EventSourceResponse(event_generator(), media_type="text/event-stream")


@app.post("/chroma/upload", response_model=UploadResponse)
async def chroma_upload(body: UploadRequest) -> UploadResponse:
    try:
        decoded = base64.b64decode(body.content_base64)
        text = decoded.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise ValueError(f"Invalid base64 content: {exc}")

    chunks = split_text(text)
    if not chunks:
        return UploadResponse(ok=True, chunks=0)

    ids = [f"{body.filename}_{i}" for i in range(len(chunks))]
    metadatas = [{"filename": body.filename, "content_type": body.content_type}] * len(chunks)

    try:
        chroma_collection.add(documents=chunks, ids=ids, metadatas=metadatas)
    except Exception as exc:
        logger.exception("Chroma upload failed")
        raise RuntimeError(f"ChromaDB upload failed: {exc}")

    return UploadResponse(ok=True, chunks=len(chunks))


@app.post("/chroma/upload-file", response_model=UploadResponse)
async def chroma_upload_file(file: UploadFile = File(...)) -> UploadResponse:
    content = await file.read()
    try:
        text = content.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise ValueError(f"Cannot decode file: {exc}")

    chunks = split_text(text)
    if not chunks:
        return UploadResponse(ok=True, chunks=0)

    ids = [f"{file.filename}_{i}" for i in range(len(chunks))]
    metadatas = [{"filename": file.filename or "upload", "content_type": file.content_type or "application/octet-stream"}] * len(chunks)

    try:
        chroma_collection.add(documents=chunks, ids=ids, metadatas=metadatas)
    except Exception as exc:
        logger.exception("Chroma upload failed")
        raise RuntimeError(f"ChromaDB upload failed: {exc}")

    return UploadResponse(ok=True, chunks=len(chunks))


@app.get("/chroma/status", response_model=StatusResponse)
async def chroma_status() -> StatusResponse:
    stats = chroma_stats()
    return StatusResponse(total_chunks=stats["total_chunks"], documents=stats["documents"])


@app.delete("/chroma/purge", response_model=PurgeResponse)
async def chroma_purge() -> PurgeResponse:
    try:
        chroma_client.delete_collection("documents")
    except Exception:
        pass
    try:
        new_col = chroma_client.create_collection("documents")
        globals()["chroma_collection"] = new_col
    except Exception as exc:
        logger.exception("Could not recreate collection after purge")
        raise RuntimeError(f"Purge failed: {exc}")
    return PurgeResponse(ok=True)


# ---------------------------------------------------------------------------
# Error handlers (convert exceptions to JSON via HTTPException pattern)
# We use a lightweight wrapper for raise statements in endpoints.
# ---------------------------------------------------------------------------
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_handler(_, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(ValueError)
async def value_error_handler(_, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_, exc: RuntimeError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def generic_exception_handler(_, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
