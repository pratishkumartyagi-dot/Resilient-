"""FastAPI researcher service using OpenRouter (DeepSeek R1) and ChromaDB."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx
import pandas as pd
from chromadb import Client as ChromaClient
from chromadb.config import Settings as ChromaSettings
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
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
# Predictive Analysis endpoints (PyHealth-guided clinical prediction models)
# ---------------------------------------------------------------------------
class PredictiveAssistRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    step: int = Field(..., ge=1, le=13)
    population: Optional[str] = None
    outcome: Optional[str] = None
    outcome_type: Optional[str] = "binary"
    predictors: Optional[str] = None
    model_type: Optional[str] = None
    missing_strategy: Optional[str] = None
    events: Optional[int] = None
    n_predictors: Optional[int] = None


class PredictiveAssistResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    step: int
    guidance: str
    pyhealth_hint: str


PYHEALTH_STEP_GUIDANCE: dict[int, dict[str, str]] = {
    1: {
        "guidance": "Define target population, outcome, setting, users, and clinical decisions. Write a protocol following TRIPOD.",
        "pyhealth_hint": "Use pyhealth.datasets to select a dataset (MIMIC-IV, eICU, OMOP) aligned with your population.",
    },
    2: {
        "guidance": "Decide between developing a new model or updating an existing one via recalibration, revision, or extension.",
        "pyhealth_hint": "If updating, use pyhealth to load the original model architecture and fine-tune on new data.",
    },
    3: {
        "guidance": "Define the outcome. Prefer time-to-event over binary when follow-up varies.",
        "pyhealth_hint": "PyHealth tasks support binary, multilabel, and time-to-event (survival) outcomes.",
    },
    4: {
        "guidance": "Identify baseline predictors available at the time of prediction. Avoid categorising continuous predictors.",
        "pyhealth_hint": "Use pyhealth.medcode.InnerMap and CrossMap to standardise medical codes (ICD, ATC, NDC, RxNorm).",
    },
    5: {
        "guidance": "Collect and examine data. Check distribution, outliers, and measurement errors.",
        "pyhealth_hint": "PyHealth dataset objects (e.g., MIMIC4Dataset) handle common EHR table formats. Use sample() to inspect.",
    },
    6: {
        "guidance": "Calculate minimum sample size using Riley formulas. Ensure EPV >= 10-20; ML models need larger samples.",
        "pyhealth_hint": "Use pyhealth.trainer.Trainer with early stopping and penalisation to mitigate overfitting on small datasets.",
    },
    7: {
        "guidance": "Handle missing data. Multiple imputation is preferred; complete case risks bias.",
        "pyhealth_hint": "PyHealth does not include built-in MICE; pre-process with sklearn.impute.IterativeImputer or use model-based handling.",
    },
    8: {
        "guidance": "Fit models. Start with standard models (logistic/Cox), then try ML (RF, XGBoost, Transformer).",
        "pyhealth_hint": "PyHealth provides 33+ models. Example: from pyhealth.models import Transformer; model = Transformer(dataset=sample).",
    },
    9: {
        "guidance": "Assess discrimination (AUC, C-index) and calibration (slope, Brier, calibration curve). Use bootstrap for optimism correction.",
        "pyhealth_hint": "Use pyhealth.metrics for binary_metrics_fn or survival_metrics_fn. Compute AUC, PR-AUC, and calibration.",
    },
    10: {
        "guidance": "Select the final model using internal validation. Prefer simpler models if performance is comparable (Occam's razor).",
        "pyhealth_hint": "Compare PyHealth Trainer outputs across models; choose the one with highest validation metric and lowest complexity.",
    },
    11: {
        "guidance": "Perform decision curve analysis to evaluate clinical utility across threshold probabilities.",
        "pyhealth_hint": "PyHealth does not include DCA; use the net-benefit formula or Python packages like dcurves after PyHealth inference.",
    },
    12: {
        "guidance": "Assess individual predictor importance using SHAP or permutation importance.",
        "pyhealth_hint": "Extract predictions from pyhealth.models with predict_proba(), then apply shap.TreeExplainer or sklearn permutation_importance.",
    },
    13: {
        "guidance": "Write up following TRIPOD. Share model equation, code, and an interactive web calculator.",
        "pyhealth_hint": "Export the trained PyHealth model and scaler; deploy with FastAPI + a simple HTML form for bedside use.",
    },
}


@app.post("/predictive/assist", response_model=PredictiveAssistResponse)
async def predictive_assist(req: PredictiveAssistRequest) -> PredictiveAssistResponse:
    step = req.step
    hint = PYHEALTH_STEP_GUIDANCE.get(step, {"guidance": "Proceed to the next step.", "pyhealth_hint": "No specific PyHealth hint for this step."})
    guidance = hint["guidance"]
    pyhealth_hint = hint["pyhealth_hint"]

    if req.population:
        guidance += f" Population: {req.population}."
    if req.outcome:
        guidance += f" Outcome: {req.outcome} ({req.outcome_type or 'binary'})."
    if req.predictors:
        guidance += f" Predictors: {req.predictors[:200]}."
    if req.model_type:
        guidance += f" Model: {req.model_type}."
    if req.missing_strategy:
        guidance += f" Missing data strategy: {req.missing_strategy}."
    if req.events and req.n_predictors:
        epv = round(req.events / max(1, req.n_predictors), 1)
        guidance += f" EPV={epv}."
        if epv < 10:
            guidance += " WARNING: EPV < 10 increases overfitting risk. Consider fewer predictors or penalisation."

    return PredictiveAssistResponse(step=step, guidance=guidance, pyhealth_hint=pyhealth_hint)


@app.get("/predictive/health")
async def predictive_health():
    return {"status": "ok", "service": "predictive-analysis", "pyhealth_available": True}


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


# ---------------------------------------------------------------------------
# AutoPrognosis-compatible analysis
# Embeds AutoPrognosis-style predictor selection and Naikshubham-style
# Forward Stepwise Selection (FSS) + PIG table metrics.
# ---------------------------------------------------------------------------

class AutoprognosisRunRequest(BaseModel):
    study_name: str = "predictive-analysis"
    method: str = "auto_classifier"
    target_column: Optional[str] = None
    max_variables: int = 10
    test_size: float = 0.4
    num_iter: int = 50


class AutoprognosisStepMetric(BaseModel):
    order: int
    added_variable: str
    model_score: float
    train_auc: float
    test_auc: float
    train_size: int
    test_size: int


class PigRow(BaseModel):
    variable: str
    group: str
    incidence: float
    size: int


class AutoprognosisRunResponse(BaseModel):
    study_name: str
    method: str
    selected_pipeline: str
    outcome_type: str
    selected_variables: List[str]
    optimal_predictors: List[str]
    stepwise_metrics: List[AutoprognosisStepMetric]
    train_auc: float
    test_auc: float
    overfitting_detected: bool
    overfitting_note: str
    pig_tables: Dict[str, List[PigRow]]
    report_html: str
    report_text: str


def _read_upload(upload: UploadFile) -> pd.DataFrame:
    content = upload.file.read()
    name = (upload.filename or "").lower()
    try:
        if name.endswith(".csv") or "csv" in (upload.content_type or ""):
            return pd.read_csv(io.BytesIO(content), na_values=["", "NA", "NaN", "nan", "null", "None"])
        return pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as exc:
        raise ValueError(f"Failed to parse dataset: {exc}") from exc


def _infer_target(df: pd.DataFrame, requested: Optional[str]) -> str:
    if requested and requested in df.columns:
        return requested
    binary_candidates = [c for c in df.columns if set(df[c].dropna().isin([0, 1, True, False]).unique()).issubset({0, 1, True, False})]
    if binary_candidates:
        return binary_candidates[0]
    raise ValueError("Could not infer binary target. Specify target_column explicitly.")


def _auc_score(variables: List[str], target: str, df: pd.DataFrame, test_size: float) -> Dict[str, Any]:
    x = df[variables].fillna(0)
    y = df[target]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=test_size, stratify=y, random_state=42)
    model = LogisticRegression(max_iter=1000, solver="lbfgs")
    model.fit(x_train, y_train)
    train_auc = round(float(roc_auc_score(y_train, model.predict_proba(x_train)[:, 1])), 4)
    test_auc = round(float(roc_auc_score(y_test, model.predict_proba(x_test)[:, 1])), 4)
    return {"train_auc": train_auc, "test_auc": test_auc, "train_size": len(x_train), "test_size": len(x_test)}


def _next_best(current: List[str], candidates: List[str], target: str, df: pd.DataFrame) -> Tuple[str, float]:
    best_variable: Optional[str] = None
    best_auc = -1.0
    for v in candidates:
        metric = _auc_score(current + [v], target, df, 0.0)
        auc_val = metric["train_auc"]
        if auc_val > best_auc:
            best_auc = auc_val
            best_variable = v
    return best_variable or "", best_auc


def _create_pig_table(df: pd.DataFrame, target: str, variable: str) -> List[dict]:
    groups = df[[target, variable]].groupby(variable, dropna=False)
    pig = groups[target].agg(Incidence="mean", size="size").reset_index()
    pig["Incidence"] = pig["Incidence"].round(4)
    pig = pig.rename(columns={variable: "group", "size": "size"})
    pig["variable"] = variable
    return pig[["variable", "group", "Incidence", "size"]].to_dict(orient="records")


def _run_fss(df: pd.DataFrame, target: str, max_variables: int, test_size: float) -> Tuple[List[str], List[dict], float, float]:
    feature_candidates = [c for c in df.columns if c != target and pd.api.types.is_numeric_dtype(df[c])]
    max_variables = min(max_variables, len(feature_candidates))
    current_vars: List[str] = []
    candidates = list(feature_candidates)
    metrics: List[dict] = []
    forward_order: List[str] = []

    for order in range(1, max_variables + 1):
        next_var, _ = _next_best(current_vars, candidates, target, df)
        if not next_var:
            break
        metric = _auc_score(current_vars + [next_var], target, df, test_size)
        metrics.append({
            "order": order,
            "added_variable": next_var,
            "total_variables": current_vars + [next_var],
            "model_score": _auc_score(current_vars + [next_var], target, df, 0.0)["train_auc"],
            **metric,
        })
        current_vars.append(next_var)
        candidates.remove(next_var)
        forward_order.append(next_var)

    best_split = _auc_score(current_vars, target, df, test_size) if current_vars else {"train_auc": 0.0, "test_auc": 0.0, "train_size": len(df), "test_size": 0}
    return forward_order, metrics, best_split["train_auc"], best_split["test_auc"]


def _generate_report_html(body: Dict[str, Any]) -> str:
    def esc(value: Any) -> str:
        return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    rows = []
    for step in body.get("stepwise_metrics", []):
        rows.append(
            "<tr>"
            f"<td>{esc(step.get('order'))}</td>"
            f"<td>{esc(step.get('added_variable'))}</td>"
            f"<td>{esc(step.get('model_score'))}</td>"
            f"<td>{esc(step.get('train_auc'))}</td>"
            f"<td>{esc(step.get('test_auc'))}</td>"
            f"<td>{esc(step.get('train_size'))}</td>"
            f"<td>{esc(step.get('test_size'))}</td>"
            "</tr>"
        )

    pig_sections = ""
    for variable, rows_pig in (body.get("pig_tables") or {}).items():
        pig_sections += f"<h3>{esc(variable)}</h3>"
        pig_sections += "<table><thead><tr><th>group</th><th>Incidence</th><th>size</th></tr></thead><tbody>"
        for r in rows_pig:
            pig_sections += (
                "<tr>"
                f"<td>{esc(r.get('group'))}</td>"
                f"<td>{esc(r.get('Incidence'))}</td>"
                f"<td>{esc(r.get('size'))}</td>"
                "</tr>"
            )
        pig_sections += "</tbody></table>"

    return f"""
    <html>
    <head>
      <style>
        body {{ font-family: Arial, sans-serif; color: #0f172a; padding: 24px; background: #ffffff; }}
        h1 {{ font-size: 20px; margin-bottom: 8px; }}
        h2 {{ font-size: 16px; margin-top: 24px; margin-bottom: 12px; color: #1e3a8a; }}
        .meta {{ color: #475569; margin-bottom: 16px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 13px; }}
        th {{ background: #1e3a8a; color: #ffffff; }}
        tr:nth-child(even) {{ background: #f8fafc; }}
        .callout {{ padding: 12px; border-radius: 8px; margin-top: 12px; border: 1px solid #e2e8f0; background: #f8fafc; }}
        .badge {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }}
        .badge-ok {{ background: #bbf7d0; color: #166534; }}
        .badge-warn {{ background: #fde68a; color: #78350f; }}
      </style>
    </head>
    <body>
      <h1>{esc(body.get('study_name', 'AutoPrognosis Analysis'))} — {esc(body.get('method', 'logistic'))}</h1>
      <div class="meta">
        <div>Selected pipeline: {esc(body.get('selected_pipeline'))}</div>
        <div>Outcome: {esc(body.get('outcome_type'))}</div>
        <div>Selected variables: {esc(", ".join(body.get('selected_variables') or []))}</div>
      </div>
      <div class="callout">
        <div>Train AUC: <strong>{esc(body.get('train_auc'))}</strong></div>
        <div>Test AUC: <strong>{esc(body.get('test_auc'))}</strong></div>
        <div>Overfitting: <span class="badge {'badge-ok' if not body.get('overfitting_detected') else 'badge-warn'}">{esc(body.get('overfitting_detected'))}</span></div>
        <div style="margin-top:8px;">{esc(body.get('overfitting_note'))}</div>
      </div>
      <h2>Forward Stepwise Selection</h2>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Added Variable</th>
            <th>Model Score</th>
            <th>Train AUC</th>
            <th>Test AUC</th>
            <th>Train Size</th>
            <th>Test Size</th>
          </tr>
        </thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
      <h2>PIG Tables</h2>
      {pig_sections or '<p>No PIG tables available.</p>'}
    </body>
    </html>
    """


def _autoprognosis_style_run(df: pd.DataFrame, request: AutoprognosisRunRequest) -> Dict[str, Any]:
    target = _infer_target(df, request.target_column)
    outcome_type = "binary"
    optimal_predictors, stepwise_metrics, train_auc, test_auc = _run_fss(df, target, request.max_variables, request.test_size)
    selected_variables = list(optimal_predictors)
    overfitting_detected = train_auc - test_auc > 0.05
    overfitting_note = (
        f"Train AUC exceeds test AUC by {train_auc - test_auc:.3f}. Consider penalisation or fewer predictors."
        if overfitting_detected
        else "Train/test performance is consistent. Lower overfitting risk."
    )
    selected_pipeline = f"AutoPrognosis-style LogisticRegression-based {request.method} pipeline with {len(selected_variables)} predictors"
    pig_tables = {variable: _create_pig_table(df, target, variable) for variable in selected_variables}

    report_text = "\n".join([
        f"Study: {request.study_name}",
        f"Method: {request.method}",
        f"Outcome: {outcome_type}",
        f"Selected Pipeline: {selected_pipeline}",
        f"Selected Variables: {', '.join(selected_variables)}",
        f"Train AUC: {train_auc}",
        f"Test AUC: {test_auc}",
        f"Overfitting detected: {overfitting_detected} — {overfitting_note}",
        "",
        "Forward Stepwise Selection:",
    ] + [f"Step {m['order']}: added {m['added_variable']} — model_score={m['model_score']}, train AUC={m['train_auc']}, test AUC={m['test_auc']}" for m in stepwise_metrics] + [
        "",
        "PIG Table Metrics:",
    ] + [f"{var}: {rows}" for var, rows in pig_tables.items()])

    payload = {
        "study_name": request.study_name,
        "method": request.method,
        "selected_pipeline": selected_pipeline,
        "outcome_type": outcome_type,
        "selected_variables": selected_variables,
        "optimal_predictors": optimal_predictors,
        "stepwise_metrics": [
            AutoprognosisStepMetric(
                order=m["order"],
                added_variable=m["added_variable"],
                model_score=m["model_score"],
                train_auc=m["train_auc"],
                test_auc=m["test_auc"],
                train_size=m["train_size"],
                test_size=m["test_size"],
            ).model_dump()
            for m in stepwise_metrics
        ],
        "train_auc": train_auc,
        "test_auc": test_auc,
        "overfitting_detected": overfitting_detected,
        "overfitting_note": overfitting_note,
        "pig_tables": pig_tables,
    }
    payload["report_html"] = _generate_report_html(payload)
    payload["report_text"] = report_text
    return payload


@app.post("/run-autoprognosis", response_model=AutoprognosisRunResponse)
async def run_autoprognosis_endpoint(
    file: UploadFile = File(...),
    study_name: str = "predictive-analysis",
    method: str = "auto_classifier",
    target_column: Optional[str] = None,
    max_variables: int = 10,
    test_size: float = 0.4,
    num_iter: int = 50,
):
    df = _read_upload(file)
    request = AutoprognosisRunRequest(
        study_name=study_name,
        method=method,
        target_column=target_column,
        max_variables=max_variables,
        test_size=test_size,
        num_iter=num_iter,
    )
    try:
        result = _autoprognosis_style_run(df, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AutoprognosisRunResponse(**result)
