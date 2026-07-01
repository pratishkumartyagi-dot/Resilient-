from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

app = FastAPI(title="AutoPrognosis-Compatible Analysis", version="0.1.0")


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    method: str = "logistic"
    target_column: Optional[str] = None
    max_variables: int = 10
    test_size: float = 0.4


class AutoPrognosisResults(BaseModel):
    model_config = ConfigDict(extra="ignore")


class VariableMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore")

    variable: str
    order: int
    train_auc: float
    test_auc: float
    train_size: int
    test_size: int
    is_selected: bool
    selected_model_score: float


class PIGTableRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    variable: str
    group: str
    incidence: float
    size: int


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    study_name: str
    method: str
    outcome_type: str
    selected_variables: List[str]
    stepwise_metrics: List[dict]
    train_auc: float
    test_auc: float
    overfitting_detected: bool
    overfitting_note: str
    selected_pipeline: str
    autoprognosis_compatible_json: Optional[dict] = None
    forward_stepwise_selection: List[str]
    pig_tables: Dict[str, List[dict]]
    report: str


def _read_upload(upload: UploadFile) -> pd.DataFrame:
    content = upload.file.read()
    name = (upload.filename or "").lower()
    if name.endswith((".csv",)) or "csv" in upload.content_type:
        from io import StringIO
        return pd.read_csv(StringIO(content.decode("utf-8", errors="ignore")), na_values=["", "NA", "NaN", "nan", "null", "None"])
    if name.endswith((".xlsx", ".xls")) or "excel" in upload.content_type:
        from io import BytesIO
        try:
            import openpyxl
            engine = "openpyxl"
        except ImportError:
            engine = None
        return pd.read_excel(BytesIO(content), engine=engine)
    raise ValueError("Unsupported file type. Use CSV or Excel.")


def _infer_target(df: pd.DataFrame, requested: Optional[str]) -> str:
    if requested and requested in df.columns:
        return requested
    binary_candidates = [c for c in df.columns if df[c].dropna().isin([0, 1, True, False]).all() and df[c].nunique() <= 2]
    if binary_candidates:
        return binary_candidates[0]
    raise HTTPException(status_code=422, detail="Could not infer binary target. Specify target_column in request.")


def _auc(variables: List[str], target: str, df: pd.DataFrame) -> float:
    if not variables:
        return 0.0
    x = df[variables].fillna(0)
    y = df[target]
    model = LogisticRegression(max_iter=1000, solver="lbfgs")
    model.fit(x, y)
    prob = model.predict_proba(x)[:, 1]
    return round(float(roc_auc_score(y, prob)), 4)


def _train_test_auc(variables: List[str], target: str, df: pd.DataFrame, test_size: float) -> Dict[str, float]:
    x = df[variables].fillna(0)
    y = df[target]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=test_size, stratify=y, random_state=42)
    model = LogisticRegression(max_iter=1000, solver="lbfgs")
    model.fit(x_train, y_train)
    train_auc = round(float(roc_auc_score(y_train, model.predict_proba(x_train)[:, 1])), 4)
    test_auc = round(float(roc_auc_score(y_test, model.predict_proba(x_test)[:, 1])), 4)
    return {"train_auc": train_auc, "test_auc": test_auc, "train_size": len(x_train), "test_size": len(x_test)}


def _next_best(current: List[str], candidates: List[str], target: str, df: pd.DataFrame) -> tuple[str, float]:
    best_variable = None
    best_auc = -1.0
    for v in candidates:
        auc_v = _auc(current + [v], target, df)
        if auc_v > best_auc:
            best_auc = auc_v
            best_variable = v
    return best_variable or "", best_auc


def create_pig_table(df: pd.DataFrame, target: str, variable: str) -> pd.DataFrame:
    groups = df[[target, variable]].groupby(variable)
    pig: pd.DataFrame = groups[target].agg({"Incidence": "mean", "size": "size"}).reset_index()
    pig["Incidence"] = pig["Incidence"].round(4)
    pig["variable"] = variable
    return pig[["variable", variable, "Incidence", "size"]].rename(columns={variable: "group"})


def run_autoprognosis_style(
    df: pd.DataFrame,
    target: str,
    method: str = "logistic",
    max_variables: int = 10,
    test_size: float = 0.4,
    timeout_seconds: int = 600,
) -> Dict[str, Any]:
    import time
    started = time.time()

    run_study = method == "logistic"

    if run_study:
        numerics = ["int64", "float64", "bool"]
        feature_candidates = [
            c for c in df.columns
            if c != target and (df[c].dtype in numerics or df[c].dtype == "object")
        ]
        max_variables = min(max_variables, len(feature_candidates))
        current_vars: List[str] = []
        candidates = list(feature_candidates)
        stepwise_metrics: List[Dict[str, Any]] = []
        forward_order: List[str] = []

        for order in range(1, max_variables + 1):
            next_var, best_auc = _next_best(current_vars, candidates, target, df)
            if not next_var:
                break
            split = _train_test_auc(current_vars + [next_var], target, df, test_size)
            stepwise_metrics.append({
                "order": order,
                "added_variable": next_var,
                "total_variables": current_vars + [next_var],
                "model_score": best_auc,
                **split,
            })
            current_vars.append(next_var)
            candidates.remove(next_var)
            forward_order.append(next_var)

        best_step = max(stepwise_metrics, key=lambda s: s["test_auc"]) if stepwise_metrics else None
        best_vars = best_step["total_variables"] if best_step else current_vars[:max(1, len(current_vars))]
        final_split = _train_test_auc(best_vars, target, df, test_size)

        overfitting_detected = bool(best_step and (best_step["train_auc"] - best_step["test_auc"]) > 0.05)
        if overfitting_detected:
            gap = best_step["train_auc"] - best_step["test_auc"]
            overfitting_note = (
                f"Potential overfitting detected: train AUC is {gap:.3f} higher than test AUC. "
                "Consider fewer predictors, penalisation, or cross-validation."
            )
        elif best_step and best_step["test_auc"] >= 0.85:
            overfitting_note = "Model discrimination is strong and consistent across train/test splits. Lower overfitting risk."
        else:
            overfitting_note = "AUC curve unstable across iterations. Consider more data or cross-validation."

        selected_variables = list(best_vars)
        selected_score = float(best_step["model_score"]) if best_step else 0.0
        selected_model = (
            f"AutoPrognosis ClassifierStudy-style nearest available: LogisticRegression+{len(selected_variables)}vars AUC={selected_score:.3f}"
        )

        pig_tables: Dict[str, List[dict]] = {}
        for var in selected_variables:
            pig = create_pig_table(df, target, var)
            pig_tables[var] = pig.to_dict(orient="records")

        report_lines = [
            "# AutoPrognosis Compatible Analysis Report",
            "",
            f"Study: {app.title}",
            f"Method: {method}",
            f"Outcome type: binary",
            "",
            "## Selected Variables",
        ] + [f"- {v}" for v in selected_variables] + [
            "",
            "## Train/Test Performance",
            f"- Train AUC: {final_split['train_auc']:.4f}",
            f"- Test AUC: {final_split['test_auc']:.4f}",
            f"- Train size: {final_split['train_size']}, Test size: {final_split['test_size']}",
            "",
            "## Overfitting Assessment",
            f"- Detected: {overfitting_detected}",
            f"- Note: {overfitting_note}",
            "",
            "## Forward Stepwise Selection",
        ]
        for s in stepwise_metrics:
            report_lines.append(f"- Step {s['order']}: added {s['added_variable']} — AUC={s['model_score']:.4f}, test AUC={s['test_auc']:.4f}")
        report_lines += [
            "",
            "## PIG Tables",
            "-- This section shows PIG metrics for selected variables. Each variable's groups include incidence and sample size.",
        ]
        for var, rows in pig_tables.items():
            report_lines += [f"### {var}"] + [f"- {r['group']}: incidence={r['Incidence']}, size={r['size']}" for r in rows]

        autoprognosis_compatible = {
            "study_name": app.title,
            "pipeline": selected_model,
            "performance": {
                "train_auc": final_split["train_auc"],
                "test_auc": final_split["test_auc"],
                "train_size": final_split["train_size"],
                "test_size": final_split["test_size"],
            },
            "selected_features": selected_variables,
            "num_iter": max_variables,
            "timeout": timeout_seconds,
            "forward_stepwise": forward_order,
            "overfitting": overfitting_detected,
        }

        response = {
            "study_name": app.title,
            "method": method,
            "outcome_type": "binary",
            "selected_variables": selected_variables,
            "stepwise_metrics": [
                {
                    "order": s["order"],
                    "added_variable": s["added_variable"],
                    "model_score": s["model_score"],
                    "train_auc": s["train_auc"],
                    "test_auc": s["test_auc"],
                    "train_size": s["train_size"],
                    "test_size": s["test_size"],
                }
                for s in stepwise_metrics
            ],
            "train_auc": final_split["train_auc"],
            "test_auc": final_split["test_auc"],
            "overfitting_detected": overfitting_detected,
            "overfitting_note": overfitting_note,
            "selected_pipeline": selected_model,
            "autoprognosis_compatible_json": autoprognosis_compatible,
            "forward_stepwise_selection": forward_order,
            "pig_tables": pig_tables,
            "report": "\n".join(report_lines),
        }
        return response

    raise ValueError(f"Unsupported method: {method}")


@app.post("/run-autoprognosis", response_model=AnalysisResponse)
async def run_autoprognosis(
    file: UploadFile = File(...),
    method: str = "logistic",
    target_column: Optional[str] = None,
    max_variables: int = 10,
    test_size: float = 0.4,
    timeout_seconds: int = 600,
):
    df = _read_upload(file)
    target = _infer_target(df, target_column)
    try:
        result = run_autoprognosis_style(df, target, method, max_variables, test_size, timeout_seconds)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AnalysisResponse(**result)
