#!/usr/bin/env python3
"""
Citation validation script using refchecker's approach.
Validates papers against multiple academic databases.
"""

import sys
import json
import requests
from typing import List, Dict, Any, Optional
import time

def validate_doi(doi: str) -> Dict[str, Any]:
    """Validate a DOI using Crossref API."""
    if not doi or len(doi) < 5:
        return {"valid": False, "message": "Missing or invalid DOI"}
    
    try:
        url = f"https://api.crossref.org/works/{doi}"
        res = requests.get(url, timeout=10)
        if not res.ok:
            return {"valid": False, "message": f"DOI not found (HTTP {res.status_code})"}
        
        data = res.json()
        work = data.get("message", {})
        title = work.get("title", [""])[0] if work.get("title") else ""
        return {"valid": True, "title": title, "message": "DOI verified via Crossref"}
    except Exception as e:
        return {"valid": False, "message": f"Crossref lookup failed: {str(e)}"}

def search_semantic_scholar(title: str, authors: str = "") -> Dict[str, Any]:
    """Search for a paper in Semantic Scholar."""
    try:
        query = title
        if authors:
            first_author = authors.split(",")[0].split(" ")[-1]
            query = f"{title} {first_author}"
        
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query,
            "fields": "title,authors,year,externalIds,venue",
            "limit": 5
        }
        res = requests.get(url, params=params, timeout=10)
        if not res.ok:
            return {"found": False, "message": f"Semantic Scholar search failed (HTTP {res.status_code})"}
        
        data = res.json()
        papers = data.get("data", [])
        
        for paper in papers:
            paper_title = paper.get("title", "")
            if paper_title.lower() == title.lower():
                doi = paper.get("externalIds", {}).get("DOI", "")
                return {
                    "found": True,
                    "doi": doi,
                    "title": paper_title,
                    "year": paper.get("year"),
                    "venue": paper.get("venue"),
                    "message": "Paper found in Semantic Scholar"
                }
        
        return {"found": False, "message": "Paper not found in Semantic Scholar"}
    except Exception as e:
        return {"found": False, "message": f"Semantic Scholar search failed: {str(e)}"}

def search_openalex(title: str, authors: str = "") -> Dict[str, Any]:
    """Search for a paper in OpenAlex."""
    try:
        url = "https://api.openalex.org/works"
        params = {
            "search": title,
            "per_page": 5
        }
        res = requests.get(url, params=params, timeout=10)
        if not res.ok:
            return {"found": False, "message": f"OpenAlex search failed (HTTP {res.status_code})"}
        
        data = res.json()
        works = data.get("results", [])
        
        for work in works:
            work_title = work.get("title", "")
            if work_title and work_title.lower() == title.lower():
                doi = work.get("doi", "").replace("https://doi.org/", "")
                return {
                    "found": True,
                    "doi": doi,
                    "title": work_title,
                    "year": work.get("publication_year"),
                    "venue": work.get("host_venue", {}).get("display_name"),
                    "message": "Paper found in OpenAlex"
                }
        
        return {"found": False, "message": "Paper not found in OpenAlex"}
    except Exception as e:
        return {"found": False, "message": f"OpenAlex search failed: {str(e)}"}

def validate_paper(paper: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a paper using multiple sources."""
    doi = paper.get("doi", "")
    title = paper.get("title", "")
    authors = paper.get("authors", "")
    
    result = {
        "doi": doi,
        "title": title,
        "valid": False,
        "sources_checked": [],
        "message": ""
    }
    
    # If DOI exists, validate it directly
    if doi:
        doi_result = validate_doi(doi)
        result["sources_checked"].append("Crossref")
        if doi_result["valid"]:
            result["valid"] = True
            result["message"] = doi_result["message"]
            result["verified_title"] = doi_result.get("title", "")
            return result
    
    # If no DOI or DOI validation failed, search in Semantic Scholar
    if title:
        ss_result = search_semantic_scholar(title, authors)
        result["sources_checked"].append("Semantic Scholar")
        if ss_result["found"]:
            result["valid"] = True
            result["message"] = ss_result["message"]
            if ss_result.get("doi"):
                result["doi"] = ss_result["doi"]
            result["verified_title"] = ss_result.get("title", "")
            return result
        
        # Try OpenAlex
        time.sleep(0.5)  # Rate limiting
        oa_result = search_openalex(title, authors)
        result["sources_checked"].append("OpenAlex")
        if oa_result["found"]:
            result["valid"] = True
            result["message"] = oa_result["message"]
            if oa_result.get("doi"):
                result["doi"] = oa_result["doi"]
            result["verified_title"] = oa_result.get("title", "")
            return result
    
    result["message"] = "Paper not found in any database"
    return result

def main():
    """Main entry point."""
    try:
        input_data = json.load(sys.stdin)
        papers = input_data.get("papers", [])
        
        results = []
        for paper in papers:
            try:
                result = validate_paper(paper)
                results.append(result)
                time.sleep(0.2)  # Rate limiting between papers
            except Exception as e:
                results.append({
                    "doi": paper.get("doi", ""),
                    "title": paper.get("title", ""),
                    "valid": False,
                    "message": f"Validation error: {str(e)}"
                })
        
        output = {
            "success": True,
            "results": results,
            "total": len(results),
            "valid_count": sum(1 for r in results if r["valid"])
        }
        
        print(json.dumps(output))
        sys.exit(0)
        
    except Exception as e:
        error_output = {
            "success": False,
            "error": str(e),
            "results": []
        }
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    main()
