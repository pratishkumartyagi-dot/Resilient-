#!/usr/bin/env python3
"""
ResearchRadar Integration Script
Ported from https://github.com/diptiman-mohanta/ResearchRadar
Provides paper search, review collection, limitation extraction, and novelty auditing.
"""

from __future__ import annotations

import argparse
import ast
import html
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

UA = "researchradar/1.0 (research skill)"
CACHE = Path(os.environ.get("RADAR_CACHE", Path.home() / ".cache" / "problem-statement-finder"))
NEURIPS = "https://proceedings.neurips.cc"
NEURIPS_REVIEW_YEARS = range(2013, 2021)
SNOR = "https://zenodo.org/api/records/15866613/files/{}.jsonl/content"
SNOR_RECORD = "https://zenodo.org/records/15866613"
_last_request = 0.0


def warn(message: str) -> None:
    print(message, file=sys.stderr)


def fetch(url: str, *, headers: dict[str, str] | None = None, pace: float = 1.0, timeout: int = 40) -> tuple[int, str]:
    global _last_request
    wait = pace - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        warn(f"network failure for {url}: {exc}")
        return 0, ""


def strip_tags(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", markup)
    return html.unescape(re.sub(r"[ \t\r\f\v]+", " ", re.sub(r"<[^>]+>", " ", markup))).strip()


def matches(title: str, queries: list[str]) -> bool:
    text = title.casefold()
    return any(
        all(re.search(rf"\b{re.escape(word)}(s|es)?\b", text) for word in query.casefold().split()) for query in queries
    )


def emit(data: Any) -> None:
    json.dump(data, sys.stdout, indent=1, ensure_ascii=False)
    print()


# --- papers ----------------------------------------------------------------------------------------------
def parse_arxiv(xml: str) -> list[dict[str, Any]]:
    papers = []
    for entry in re.findall(r"(?s)<entry>(.*?)</entry>", xml):
        title = re.search(r"(?s)<title>(.*?)</title>", entry)
        link = re.search(r"<id>(.*?)</id>", entry)
        if not title or not link or "/api/errors" in link.group(1):
            continue
        summary = re.search(r"(?s)<summary>(.*?)</summary>", entry)
        published = re.search(r"<published>(\d{4})", entry)
        arxiv_id = re.sub(r"v\d+$", "", link.group(1).rsplit("/abs/", 1)[-1])
        papers.append(
            {
                "title": " ".join(html.unescape(title.group(1)).split()),
                "year": int(published.group(1)) if published else None,
                "abstract": " ".join(html.unescape(summary.group(1)).split()) if summary else None,
                "url": f"https://arxiv.org/abs/{arxiv_id}",
                "arxiv_id": arxiv_id,
                "source": "arxiv",
                "peer_reviewed": False,
            }
        )
    return papers


def openalex_abstract(index: dict[str, list[int]] | None) -> str | None:
    if not index:
        return None
    positions = sorted((pos, word) for word, places in index.items() for pos in places)
    return " ".join(word for _, word in positions)


def parse_openalex(body: dict[str, Any]) -> list[dict[str, Any]]:
    papers = []
    for work in body.get("results", []):
        if not work.get("title"):
            continue
        location = work.get("primary_location") or {}
        venue = (location.get("source") or {}).get("display_name")
        papers.append(
            {
                "title": " ".join(work["title"].split()),
                "year": work.get("publication_year"),
                "abstract": openalex_abstract(work.get("abstract_inverted_index")),
                "url": work.get("doi") or work.get("id"),
                "openalex_id": (work.get("id") or "").rsplit("/", 1)[-1],
                "venue": venue,
                "cited_by": work.get("cited_by_count"),
                "source": "openalex",
            }
        )
    return papers


_OA_FIELDS = "id,title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index"


def _openalex(params: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    status, text = fetch("https://api.openalex.org/works?" + urllib.parse.urlencode({**params, "select": _OA_FIELDS}))
    if status != 200:
        return f"failed (HTTP {status})", []
    try:
        return "ok", parse_openalex(json.loads(text))
    except ValueError:
        return "failed (unreadable response)", []


def cmd_papers(args: argparse.Namespace) -> None:
    query = " ".join(args.query)
    status: dict[str, str] = {}
    found: list[dict[str, Any]] = []
    terms = " AND ".join(f'all:"{word}"' for word in query.split())
    if args.since:
        terms += f" AND submittedDate:[{args.since}01010000 TO 299912312359]"
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode(
        {"search_query": terms, "start": 0, "max_results": args.limit, "sortBy": "relevance"}
    )
    code, text = fetch(url, pace=3.0)
    status["arxiv"] = "ok" if code == 200 else f"failed (HTTP {code})"
    found += parse_arxiv(text) if code == 200 else []
    search = f"title_and_abstract.search:{query}" + (f",from_publication_date:{args.since}-01-01" if args.since else "")
    status["openalex"], works = _openalex({"filter": search, "per-page": args.limit, "sort": "relevance_score:desc"})
    found += works
    seen: set[str] = set()
    unique = []
    for paper in found:
        key = re.sub(r"[^a-z0-9]", "", paper["title"].casefold())
        if key not in seen:
            seen.add(key)
            unique.append(paper)
    hint = None
    if len(unique) < 5 and len(query.split()) > 4:
        hint = "Every word must appear, so long queries return little. Try 2 to 4 words. This result says nothing about whether the work exists."
    elif not unique:
        hint = "No results for this wording. This says nothing about whether the work exists. Try other words."
    emit({"query": query, "status": status, "count": len(unique), "hint": hint, "papers": unique})


def cmd_citing(args: argparse.Namespace) -> None:
    search = f"cites:{args.openalex_id},from_publication_date:{args.since}-01-01"
    status, works = _openalex({"filter": search, "per-page": args.limit, "sort": "cited_by_count:desc"})
    emit({"cited_paper": args.openalex_id, "since": args.since, "status": status, "count": len(works), "papers": works})


_LIMIT_HEADING = re.compile(r"(?i)limitation|future|conclusion|discussion|threats? to|open (problem|question|challenge)|caveat")
_LIMIT_SENTENCE = re.compile(
    r"(?i)\b(limitation|fails? to|does not (scale|generali[sz]e|hold)|remains? (open|unclear|challenging)|future work|we did not|cannot handle|out of scope)\b"
)


def extract_limits(page: str, max_chars: int = 6000) -> dict[str, Any]:
    page = re.sub(r"(?is)<(script|style|math|figure|table)\b.*?</\1>", " ", page)
    sections = []
    parts = re.split(r"(?is)(<h[23][^>]*>.*?</h[23]>)", page)
    for heading, body in zip(parts[1::2], parts[2::2], strict=False):
        title = " ".join(strip_tags(heading).split())
        if _LIMIT_HEADING.search(title):
            sections.append({"heading": title, "text": " ".join(strip_tags(body).split())[:max_chars]})
    plain = " ".join(strip_tags(page).split())
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", plain) if 40 < len(s) < 400 and _LIMIT_SENTENCE.search(s)]
    return {"sections": sections, "admissions": sentences[:25]}


def cmd_limits(args: argparse.Namespace) -> None:
    arxiv_id = re.sub(r"v\d+$", "", args.arxiv_id.rsplit("/", 1)[-1])
    url = f"https://arxiv.org/html/{arxiv_id}"
    status, page = fetch(url, pace=3.0)
    if status != 200 or "ltx_page_main" not in page and "<article" not in page:
        emit({"arxiv_id": arxiv_id, "url": url, "status": f"no HTML version (HTTP {status}). Read the PDF instead.", "sections": [], "admissions": []})
        return
    emit({"arxiv_id": arxiv_id, "url": url, "status": "ok", **extract_limits(page)})


# --- NeurIPS: accepted papers' reviews, published openly ---------------------------------------------------
def neurips_listing(year: int) -> list[tuple[str, str]]:
    path = CACHE / f"neurips-{year}.html"
    if path.is_file():
        page = path.read_text(encoding="utf-8")
    else:
        status, page = fetch(f"{NEURIPS}/paper_files/paper/{year}", timeout=90)
        if status != 200:
            warn(f"NeurIPS {year}: listing unavailable (HTTP {status})")
            return []
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(page, encoding="utf-8")
    return parse_listing(page)


def parse_listing(page: str) -> list[tuple[str, str]]:
    found = re.findall(r'/hash/([0-9a-f]{16,})-Abstract[^"]*"[^>]*>([^<]+)</a>', page)
    return [(digest, html.unescape(title).strip()) for digest, title in found]


def parse_review_page(page: str, title: str) -> str:
    text = strip_tags(page)
    for marker in ("Reviewer 1", "Review 1"):
        if marker in text:
            text = text[text.index(marker) :]
            break
    return "\n".join(line.strip() for line in text.splitlines() if line.strip()).replace(title, "", 0)


def spread_across_years(by_year: dict[int, list[tuple[str, str]]]) -> list[tuple[int, str, str]]:
    queues = {year: list(items) for year, items in by_year.items()}
    ordered: list[tuple[int, str, str]] = []
    while any(queues.values()):
        for year, queue in queues.items():
            if queue:
                digest, title = queue.pop(0)
                ordered.append((year, digest, title))
    return ordered


def cmd_neurips(args: argparse.Namespace) -> None:
    years = [int(y) for y in args.years.split(",")] if args.years else list(reversed(NEURIPS_REVIEW_YEARS))
    results: list[dict[str, Any]] = []
    missing = 0
    by_year = {year: [(d, t) for d, t in neurips_listing(year) if matches(t, args.query)] for year in years}
    for year, digest, title in spread_across_years(by_year):
        if len(results) >= args.limit:
            break
        base = f"{NEURIPS}/paper_files/paper/{year}/file/{digest}"
        for suffix in ("Reviews", "Review"):
            url = f"{base}-{suffix}.html"
            status, page = fetch(url)
            if status == 200:
                results.append(
                    {
                        "title": title, "venue": f"NeurIPS {year}", "year": year, "outcome": "accepted", "review_url": url,
                        "paper_url": f"{NEURIPS}/paper_files/paper/{year}/hash/{digest}-Abstract.html",
                        "reviews": parse_review_page(page, title)[: args.max_chars],
                    }
                )
                break
        else:
            missing += 1
    emit({"source": "NeurIPS proceedings", "note": "Accepted papers only. NeurIPS published no reviews of rejected papers. Matches on titles.", "queries": args.query, "count": len(results), "matched_without_reviews": missing, "papers": results})


# --- eLife: decision letters with author responses -----------------------------------------------------------
def _flatten(node: Any) -> list[str]:
    if isinstance(node, dict):
        out = [strip_tags(node["text"])] if isinstance(node.get("text"), str) else []
        for key in ("content", "items"):
            if key in node:
                out += _flatten(node[key])
        return out
    if isinstance(node, list):
        return [text for item in node for text in _flatten(item)]
    return [strip_tags(node)] if isinstance(node, str) else []


def cmd_elife(args: argparse.Namespace) -> None:
    query = urllib.parse.urlencode({"for": " ".join(args.query), "per-page": args.limit * 3, "sort": "relevance", "type[]": "research-article"})
    status, text = fetch(f"https://api.elifesciences.org/search?{query}")
    if status != 200:
        emit({"source": "eLife", "status": f"failed (HTTP {status})", "papers": []})
        return
    results: list[dict[str, Any]] = []
    for item in json.loads(text).get("items", []):
        if len(results) >= args.limit:
            break
        code, body = fetch(
            f"https://api.elifesciences.org/articles/{item['id']}", headers={"Accept": "application/vnd.elife.article-vor+json;version=7"}
        )
        if code != 200:
            continue
        article = json.loads(body)
        letter = article.get("decisionLetter")
        if not letter:
            continue
        results.append(
            {
                "title": strip_tags(article.get("title", "")), "venue": "eLife", "year": int(article.get("published", "0000")[:4]) or None,
                "outcome": "accepted", "url": f"https://elifesciences.org/articles/{item['id']}#sa1",
                "reviews": "\n".join(_flatten(letter))[: args.max_chars],
                "author_response": "\n".join(_flatten(article.get("authorResponse")))[: args.max_chars],
            }
        )
    emit({"source": "eLife", "status": "ok", "note": "Published papers only. Life sciences. Newer eLife papers use a different review model and may have no letter.", "count": len(results), "papers": results})


# --- ICLR and NeurIPS 2021-2025 via SNOR: accepted AND rejected ---------------------------------------------
def snor_db() -> Path:
    return CACHE / "snor.sqlite3"


def index_mode() -> str | None:
    try:
        conn = sqlite3.connect(snor_db(), timeout=2)
        try:
            row = conn.execute("SELECT value FROM meta WHERE key = 'mode'").fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    return row[0] if row else None


def review_text(content: Any) -> str:
    if isinstance(content, str):
        try:
            content = ast.literal_eval(content)
        except (ValueError, SyntaxError):
            return content
    if not isinstance(content, dict):
        return ""
    parts = []
    for key, value in content.items():
        if key in ("title", "rating", "confidence", "reviewer", "signature", "pdf", "paperhash"):
            continue
        if isinstance(value, dict) and "value" in value:
            value = value["value"]
        if isinstance(value, str) and len(value.strip()) > 20:
            parts.append(value.strip())
    return "\n\n".join(parts)


def stream_lines(url: str, start: int = 0, max_bytes: int | None = None):
    headers = {"User-Agent": UA}
    if start or max_bytes:
        headers["Range"] = f"bytes={start}-{start + max_bytes - 1 if max_bytes else ''}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as response:
        first = True
        pending = b""
        while chunk := response.read(1 << 20):
            lines = (pending + chunk).split(b"\n")
            pending = lines.pop()
            for line in lines:
                if first and start:
                    first = False
                    continue
                first = False
                yield line


def parse_failed_match(row: dict[str, Any]) -> tuple[tuple[Any, ...], list[tuple[str, str, Any]]] | None:
    if not row.get("id") or not row.get("title"):
        return None
    conference = re.match(r"([a-z]+)(\d{4})", str(row.get("conference") or ""))
    paper = (
        row["id"], row["title"], row.get("abstract"), str(row.get("keywords") or ""), row.get("accepted"), row.get("venueid"),
        conference.group(1) if conference else None, int(conference.group(2)) if conference else None, None,
    )
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
    replies = []
    for reply in details.get("directReplies") or []:
        invitations = " ".join(str(i) for i in (reply.get("invitations") or [reply.get("invitation", "")]))
        kind = "rebuttal" if "Rebuttal" in invitations else "review" if "Review" in invitations and "Meta" not in invitations else None
        text = review_text(reply.get("content")) if kind else ""
        if text:
            rating = (reply.get("content") or {}).get("rating")
            replies.append((kind, text, rating.get("value") if isinstance(rating, dict) else rating))
    return paper, replies


def ingest_failed(conn: sqlite3.Connection, lines: Any) -> tuple[int, int]:
    papers = stored = 0
    for line in lines:
        try:
            parsed = parse_failed_match(json.loads(line))
        except ValueError:
            continue
        if parsed is None:
            continue
        conn.execute("INSERT OR REPLACE INTO papers VALUES (?,?,?,?,?,?,?,?,?)", parsed[0])
        papers += 1
        for kind, text, rating in parsed[1]:
            conn.execute("INSERT INTO reviews VALUES (?,?,?,?)", (parsed[0][0], text, kind == "review", _number(rating)))
            stored += 1
        if papers % 2000 == 0:
            conn.commit()
    conn.commit()
    return papers, stored


def _number(value: Any) -> float | None:
    match = re.match(r"\s*(\d+(\.\d+)?)", str(value)) if value is not None else None
    return float(match.group(1)) if match else None


def ingest(conn: sqlite3.Connection, papers: Any, comments: Any) -> tuple[int, int]:
    kept = 0
    for line in papers:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if not row.get("id") or not row.get("title"):
            continue
        conn.execute(
            "INSERT OR REPLACE INTO papers VALUES (?,?,?,?,?,?,?,?,?)",
            (
                row["id"], row["title"], row.get("abstract"), str(row.get("keywords") or ""), row.get("accepted"), row.get("raw_decision"),
                row.get("conference_name"), row.get("conference_year"), row.get("review_score_avg"),
            ),
        )
        kept += 1
    conn.commit()
    known = {row[0] for row in conn.execute("SELECT id FROM papers")}
    stored = 0
    for line in comments:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("paper_id") not in known:
            continue
        text = review_text(row.get("content"))
        if text:
            conn.execute(
                "INSERT INTO reviews VALUES (?,?,?,?)", (row["paper_id"], text, bool(row.get("is_review")), row.get("numeric_rating"))
            )
            stored += 1
            if stored % 5000 == 0:
                conn.commit()
                warn(f"  {stored} comments stored")
    conn.commit()
    return kept, stored


def open_snor(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(
        """CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, title TEXT, abstract TEXT, keywords TEXT, accepted INTEGER,
               decision TEXT, conference TEXT, year INTEGER, score REAL);
           CREATE TABLE IF NOT EXISTS reviews (paper_id TEXT, text TEXT, is_review INTEGER, rating REAL);
           CREATE INDEX IF NOT EXISTS reviews_paper ON reviews(paper_id);
           CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);"""
    )
    return conn


def cmd_iclr_build(args: argparse.Namespace) -> None:
    if not (args.sample or args.yes_download_2_2gb):
        warn("This downloads about 2.2 GB once and needs about 1.5 GB of disk. Ask the user first, then pass --yes-download-2.2gb.")
        warn("To try it first on about 90 MB of real data, pass --sample.")
        raise SystemExit(2)
    try:
        _build(args)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        emit({"status": f"build failed: {exc}", "hint": "Check your connection and run it again. It restarts from the beginning."})
        raise SystemExit(1) from exc


def _build(args: argparse.Namespace) -> None:
    conn = open_snor(snor_db())
    conn.execute("DELETE FROM papers")
    conn.execute("DELETE FROM reviews")
    conn.execute("DELETE FROM meta")
    conn.commit()
    if args.sample:
        size = 30 * 1024 * 1024
        kept, stored = ingest(
            conn, stream_lines(SNOR.format("normalized_papers"), 200 * 1024 * 1024, size), stream_lines(SNOR.format("normalized_comments"), 600 * 1024 * 1024, size)
        )
        extra_papers, extra_reviews = ingest_failed(conn, stream_lines(SNOR.format("failed_matches"), 200 * 1024 * 1024, size))
    else:
        warn("Streaming papers (450 MB), comments (1.3 GB) and rejected papers (475 MB). Embeddings and signatures are not kept.")
        kept, stored = ingest(conn, stream_lines(SNOR.format("normalized_papers")), stream_lines(SNOR.format("normalized_comments")))
        extra_papers, extra_reviews = ingest_failed(conn, stream_lines(SNOR.format("failed_matches")))
    mode = "sample" if args.sample else "full"
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('mode', ?)", (mode,))
    conn.commit()
    emit({"mode": mode, "papers": kept + extra_papers, "comments": stored + extra_reviews, "path": str(snor_db()), "license": "CC BY 4.0", "source": SNOR_RECORD})


OUTCOME_GROUPS = {
    "accepted": ["accepted"],
    "rejected": ["rejected"],
    "withdrawn": ["withdrawn"],
    "desk_rejected": ["desk_rejected"],
    "unclear": ["unclear"],
    "both": ["accepted", "rejected"],
    "all": ["accepted", "rejected", "withdrawn", "desk_rejected", "unclear"],
}


def paper_outcome(accepted: Any, decision: str | None) -> str:
    if accepted:
        return "accepted"
    text = (decision or "").casefold()
    if "withdraw" in text:
        return "withdrawn"
    if "desk" in text:
        return "desk_rejected"
    if "reject" in text:
        return "rejected"
    return "unclear"


def cmd_iclr(args: argparse.Namespace) -> None:
    path = snor_db()
    if not path.is_file():
        emit({"status": "not built", "hint": "Ask the user, then run: radar.py iclr-build --yes-download-2.2gb (or --sample to try it)", "papers": []})
        return
    mode = index_mode()
    if mode is None:
        emit({"status": "not ready", "hint": "The index is still building, or a build did not finish. Use the other review sources, and say this lens did not run.", "papers": []})
        return
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    results: list[dict[str, Any]] = []
    for outcome in OUTCOME_GROUPS[args.outcome]:
        clauses = ["accepted = ?", "EXISTS (SELECT 1 FROM reviews r WHERE r.paper_id = papers.id AND r.is_review)"]
        values: list[Any] = [outcome == "accepted"]
        alternatives = []
        for query in args.query:
            words = query.split()
            alternatives.append("(" + " AND ".join("(title || ' ' || COALESCE(abstract,'') || ' ' || keywords) LIKE ?" for _ in words) + ")")
            values += [f"%{word}%" for word in words]
        clauses.append("(" + " OR ".join(alternatives) + ")")
        if args.conference:
            clauses.append("conference = ?")
            values.append(args.conference)
        if args.since:
            clauses.append("year >= ?")
            values.append(args.since)
        rows = conn.execute(f"SELECT * FROM papers WHERE {' AND '.join(clauses)} ORDER BY year DESC, id", values)
        taken = 0
        for row in rows:
            if taken >= args.limit:
                break
            if paper_outcome(row["accepted"], row["decision"]) != outcome:
                continue
            if not matches(f"{row['title']} {row['abstract'] or ''} {row['keywords']}", args.query):
                continue
            taken += 1
            reviews = [r["text"] for r in conn.execute("SELECT text FROM reviews WHERE paper_id = ? AND is_review", (row["id"],))]
            results.append(
                {
                    "title": row["title"], "venue": f"{(row['conference'] or '').upper()} {row['year']}", "year": row["year"],
                    "outcome": outcome, "decision": row["decision"], "review_score_avg": row["score"],
                    "url": f"https://openreview.net/forum?id={row['id']}", "abstract": (row["abstract"] or "")[:600],
                    "reviews": "\n---\n".join(reviews)[: args.max_chars],
                }
            )
    emit(
        {
            "source": "SNOR v1 (Zenodo), CC BY 4.0", "dataset": SNOR_RECORD, "snapshot": "July 2025; ICLR 2017 and 2019-2025, NeurIPS 2021-2024", "index_mode": mode,
            "warning": "SAMPLE index: fragments only. Do not draw conclusions from it." if mode == "sample" else None,
            "note": "Readable reviews are not a random sample. Rejected NeurIPS papers are few (about 5% of NeurIPS records), so compare outcomes mainly on ICLR. --outcome both means accepted and rejected; withdrawn papers are a different outcome, so they are left out unless requested.", "count": len(results), "papers": results,
        }
    )


# --- verify -------------------------------------------------------------------------------------------------
def _strings(node: Any) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [text for value in node.values() for text in _strings(value)]
    if isinstance(node, list):
        return [text for value in node for text in _strings(value)]
    return []


def quote_in_source(quote: str, source_text: str) -> bool:
    return " ".join(quote.split()) in " ".join(source_text.split())


def cmd_verify(args: argparse.Namespace) -> None:
    raw = Path(args.file).read_text(encoding="utf-8")
    try:
        texts = _strings(json.loads(raw))
    except ValueError:
        texts = [raw]
    results = {quote: any(quote_in_source(quote, text) for text in texts) for quote in args.quote}
    emit({"all_found": all(results.values()), "quotes": results})
    if not all(results.values()):
        raise SystemExit(1)


# --- check --------------------------------------------------------------------------------------------------
def cmd_check(_args: argparse.Namespace) -> None:
    probes = {
        "arxiv": "https://export.arxiv.org/api/query?search_query=all:attention&max_results=1",
        "openalex": "https://api.openalex.org/works?per-page=1&select=id",
        "neurips_reviews": f"{NEURIPS}/paper_files/paper/2020/file/0004d0b59e19461ff126e3a08a814c33-Review.html",
        "elife": "https://api.elifesciences.org/search?for=attention&per-page=1",
        "semantic_scholar": "https://api.semanticscholar.org/graph/v1/paper/search?query=attention&limit=1&fields=title",
        "snor_dataset": "https://zenodo.org/api/records/15866613",
    }
    status = {}
    for name, url in probes.items():
        code, _ = fetch(url, pace=1.2)
        status[name] = "ok" if code == 200 else ("rate limited" if code == 429 else f"failed (HTTP {code})")
    index = snor_db()
    if index.is_file():
        mode = index_mode()
        if mode is None:
            status["iclr_index"] = "not ready: still building, or a build did not finish"
        else:
            conn = sqlite3.connect(index)
            status["iclr_index"] = f"built ({mode}): {conn.execute('SELECT COUNT(*) FROM papers').fetchone()[0]} papers"
            conn.close()
    else:
        status["iclr_index"] = "not built (rejected-paper reviews unavailable until built)"
    status["openreview_notes"] = "not probed: guests get a human-verification challenge, which this tool never tries to get around"
    emit(status)


def main(argv: list[str] | None = None) -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check").set_defaults(func=cmd_check)

    papers = sub.add_parser("papers")
    papers.add_argument("query", nargs="+")
    papers.add_argument("--limit", type=int, default=25)
    papers.add_argument("--since", type=int)
    papers.set_defaults(func=cmd_papers)

    citing = sub.add_parser("citing")
    citing.add_argument("openalex_id")
    citing.add_argument("--since", type=int, default=2020)
    citing.add_argument("--limit", type=int, default=25)
    citing.set_defaults(func=cmd_citing)

    limits = sub.add_parser("limits")
    limits.add_argument("arxiv_id")
    limits.set_defaults(func=cmd_limits)

    neurips = sub.add_parser("neurips")
    neurips.add_argument("query", nargs="+", help="Each quoted query is an alternative; its words must all appear in the title.")
    neurips.add_argument("--years", help="Comma-separated, within 2013-2020. Default: newest first.")
    neurips.add_argument("--limit", type=int, default=12)
    neurips.add_argument("--max-chars", type=int, default=5000)
    neurips.set_defaults(func=cmd_neurips)

    elife = sub.add_parser("elife")
    elife.add_argument("query", nargs="+")
    elife.add_argument("--limit", type=int, default=8)
    elife.add_argument("--max-chars", type=int, default=5000)
    elife.set_defaults(func=cmd_elife)

    build = sub.add_parser("iclr-build")
    build.add_argument("--sample", action="store_true")
    build.add_argument("--yes-download-2.2gb", dest="yes_download_2_2gb", action="store_true")
    build.set_defaults(func=cmd_iclr_build)

    iclr = sub.add_parser("iclr")
    iclr.add_argument("query", nargs="+", help="Each quoted query is an alternative; its words must all appear in title, abstract or keywords.")
    iclr.add_argument("--outcome", choices=sorted(OUTCOME_GROUPS), default="both", help="both means accepted and rejected. all adds withdrawn, desk_rejected and unclear.")
    iclr.add_argument("--conference", choices=["iclr", "neurips"])
    iclr.add_argument("--since", type=int)
    iclr.add_argument("--limit", type=int, default=10, help="Per outcome.")
    iclr.add_argument("--max-chars", type=int, default=5000)
    iclr.set_defaults(func=cmd_iclr)

    verify = sub.add_parser("verify")
    verify.add_argument("file", help="A saved radar.py result, or any text file.")
    verify.add_argument("quote", nargs="+")
    verify.set_defaults(func=cmd_verify)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()