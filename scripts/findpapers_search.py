#!/usr/bin/env python3
"""
findpapers_search.py - Wrapper for findpapers library search functionality.
Usage:
    python3 findpapers_search.py --query "search terms" [--max-results 50] [--since YYYY-MM-DD] [--until YYYY-MM-DD]

Outputs JSON to stdout with structure:
{
  "papers": [
    {
      "id": "...",
      "title": "...",
      "authors": [...],
      "year": 2024,
      "abstract": "...",
      "doi": "...",
      "url": "...",
      "database": "...",
      "studyType": "..."
    }
  ],
  "total": 100,
  "sourcesUsed": ["openalex", "pubmed", ...],
  "errors": {}
}
"""

import argparse
import json
import sys
import datetime
import os

def main():
    parser = argparse.ArgumentParser(description="Search papers using findpapers")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--max-results", type=int, default=100, help="Maximum number of results")
    parser.add_argument("--since", default="", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--until", default="", help="End date (YYYY-MM-DD)")
    parser.add_argument("--sources", default="", help="Comma-separated list of sources to search")
    args = parser.parse_args()

    try:
        import findpapers
    except ImportError:
        print(json.dumps({
            "error": "findpapers library not installed. Install with: pip install git+https://github.com/jonatasgrosman/findpapers.git",
            "papers": [],
            "total": 0,
            "sourcesUsed": [],
            "errors": {"findpapers": "Library not installed"}
        }))
        sys.exit(1)

    try:
        engine = findpapers.Engine()

        since_date = None
        if args.since:
            try:
                since_date = datetime.datetime.strptime(args.since, "%Y-%m-%d").date()
            except ValueError:
                print(json.dumps({
                    "error": f"Invalid --since date: {args.since}. Use YYYY-MM-DD.",
                    "papers": [],
                    "total": 0,
                    "sourcesUsed": [],
                    "errors": {"input": "Invalid date format"}
                }))
                sys.exit(1)

        until_date = None
        if args.until:
            try:
                until_date = datetime.datetime.strptime(args.until, "%Y-%m-%d").date()
            except ValueError:
                print(json.dumps({
                    "error": f"Invalid --until date: {args.until}. Use YYYY-MM-DD.",
                    "papers": [],
                    "total": 0,
                    "sourcesUsed": [],
                    "errors": {"input": "Invalid date format"}
                }))
                sys.exit(1)

        sources = [s.strip() for s in args.sources.split(",") if s.strip()] if args.sources else None

        result = engine.search(
            args.query,
            since=since_date,
            until=until_date,
            sources=sources,
            limit=args.max_results,
        )

        papers = []
        sources_used = set()
        errors = {}

        for paper in result.papers:
            try:
                paper_dict = paper.to_dict() if hasattr(paper, "to_dict") else vars(paper)
                source = paper_dict.get("source", {}).get("source_type", "unknown") if isinstance(paper_dict.get("source"), dict) else paper_dict.get("source", "unknown")
                found_in = paper_dict.get("found_in", [])
                if found_in:
                    sources_used.update(found_in)
                elif source != "unknown":
                    sources_used.add(source)

                authors = []
                raw_authors = paper_dict.get("authors", [])
                if isinstance(raw_authors, list):
                    for a in raw_authors:
                        if isinstance(a, dict):
                            authors.append(a.get("name", ""))
                        elif isinstance(a, str):
                            authors.append(a)
                elif isinstance(raw_authors, str):
                    authors = [raw_authors]

                pub_date = paper_dict.get("publication_date", "")
                year = None
                if pub_date:
                    try:
                        year = int(str(pub_date)[:4])
                    except (ValueError, TypeError):
                        year = None
                if not year:
                    year = datetime.date.today().year

                papers.append({
                    "id": paper_dict.get("doi") or paper_dict.get("url") or f"findpapers-{len(papers)}",
                    "title": paper_dict.get("title", ""),
                    "authors": ", ".join(filter(None, authors)) or "Unknown authors",
                    "year": year,
                    "abstract": paper_dict.get("abstract", "") or "",
                    "doi": paper_dict.get("doi", "") or "",
                    "url": paper_dict.get("url") or paper_dict.get("pdf_url") or "",
                    "database": ", ".join(sorted(found_in)) if found_in else (source or "findpapers"),
                    "studyType": paper_dict.get("paper_type", "") or "Journal Article",
                    "citationCount": paper_dict.get("citations", 0) or 0,
                    "keywords": paper_dict.get("keywords", []) or [],
                    "source": source,
                })
            except Exception as e:
                errors[str(len(papers))] = f"Failed to parse paper: {str(e)}"

        output = {
            "papers": papers,
            "total": len(papers),
            "sourcesUsed": sorted(list(sources_used)),
            "errors": errors,
            "query": args.query,
        }

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "papers": [],
            "total": 0,
            "sourcesUsed": [],
            "errors": {"findpapers": str(e)}
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
