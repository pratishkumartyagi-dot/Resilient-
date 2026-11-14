"""SLR-Engine wrapper for Automated Systematic Literature Review.

This module provides a Python interface to the SLR-Engine functionality,
following the structure from https://github.com/tuirk/SLR-Engine
"""

import json
import os
import sys
import sqlite3
import argparse
import hashlib
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Literal
from pathlib import Path
from enum import Enum


class SLRStage(str, Enum):
    """Stages of the SLR pipeline."""
    PROTOCOL = "protocol"
    SEARCH = "search"
    SCREENING = "screening"
    EXTRACTION = "extraction"
    SYNTHESIS = "synthesis"
    EXPORT = "export"
    COMPLETE = "complete"


@dataclass
class SearchQuery:
    """Represents a search query for databases."""
    database: str  # e.g., "pubmed", "ieee", "acm", "scopus", "web_of_science"
    query_string: str
    id: str = field(default_factory=lambda: hashlib.md5(str(datetime.now()).encode()).hexdigest()[:16])
    filters: Dict[str, Any] = field(default_factory=dict)
    date_range: Optional[Dict[str, str]] = None  # {"start": "2020-01-01", "end": "2024-12-31"}


@dataclass
class Paper:
    """Represents a paper in the SLR."""
    id: str
    title: str
    authors: List[str]
    year: int
    venue: str
    doi: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    database: str = ""
    search_query_id: Optional[str] = None
    # Screening fields
    title_abstract_screen: Optional[Literal["include", "exclude", "maybe"]] = None
    full_text_screen: Optional[Literal["include", "exclude", "maybe"]] = None
    screen_notes: str = ""
    # Extraction fields
    extraction_data: Dict[str, Any] = field(default_factory=dict)
    extraction_notes: str = ""
    # Quality assessment
    quality_score: Optional[float] = None
    quality_notes: str = ""


@dataclass
class SLRProtocol:
    """SLR Protocol definition following PRISMA guidelines."""
    id: str
    title: str
    research_questions: List[str]
    inclusion_criteria: List[str]
    exclusion_criteria: List[str]
    search_queries: List[SearchQuery]
    databases: List[str]
    quality_criteria: List[str] = field(default_factory=list)
    extraction_fields: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    version: str = "1.0"
    status: str = "draft"


@dataclass
class SLRResult:
    """Result of an SLR execution."""
    protocol_id: str
    stage: SLRStage
    papers_found: int = 0
    papers_after_dedup: int = 0
    papers_screened_title_abstract: int = 0
    papers_included_full_text: int = 0
    papers_final: int = 0
    prisma_data: Dict[str, int] = field(default_factory=dict)
    extraction_summary: Dict[str, Any] = field(default_factory=dict)
    synthesis_results: Optional[str] = None
    export_files: List[str] = field(default_factory=list)
    completed_at: Optional[str] = None
    error: Optional[str] = None


class SLREngine:
    """Main SLR Engine class for executing systematic literature reviews."""
    
    def __init__(self, db_path: str = "slr.db"):
        """Initialize the SLR Engine with a SQLite database."""
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Initialize the database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Protocols table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS protocols (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                research_questions TEXT NOT NULL,
                inclusion_criteria TEXT NOT NULL,
                exclusion_criteria TEXT NOT NULL,
                search_queries TEXT NOT NULL,
                databases TEXT NOT NULL,
                quality_criteria TEXT,
                extraction_fields TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                version TEXT DEFAULT '1.0',
                status TEXT DEFAULT 'draft'
            )
        """)
        
        # Papers table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS papers (
                id TEXT PRIMARY KEY,
                protocol_id TEXT NOT NULL,
                title TEXT NOT NULL,
                authors TEXT NOT NULL,
                year INTEGER,
                venue TEXT,
                doi TEXT,
                url TEXT,
                abstract TEXT,
                keywords TEXT,
                database TEXT,
                search_query_id TEXT,
                title_abstract_screen TEXT,
                full_text_screen TEXT,
                screen_notes TEXT,
                extraction_data TEXT,
                extraction_notes TEXT,
                quality_score REAL,
                quality_notes TEXT,
                FOREIGN KEY (protocol_id) REFERENCES protocols(id)
            )
        """)
        
        # Search queries table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_queries (
                id TEXT PRIMARY KEY,
                protocol_id TEXT NOT NULL,
                database TEXT NOT NULL,
                query_string TEXT NOT NULL,
                filters TEXT,
                date_range TEXT,
                executed_at TEXT,
                results_count INTEGER DEFAULT 0,
                FOREIGN KEY (protocol_id) REFERENCES protocols(id)
            )
        """)
        
        # Extraction data table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS extractions (
                id TEXT PRIMARY KEY,
                protocol_id TEXT NOT NULL,
                paper_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                field_value TEXT,
                extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (protocol_id) REFERENCES protocols(id),
                FOREIGN KEY (paper_id) REFERENCES papers(id)
            )
        """)
        
        # PRISMA flow data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS prisma_flow (
                id TEXT PRIMARY KEY,
                protocol_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                count INTEGER NOT NULL,
                details TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (protocol_id) REFERENCES protocols(id)
            )
        """)
        
        conn.commit()
        conn.close()
    
    def create_protocol(self, protocol: SLRProtocol) -> str:
        """Create a new SLR protocol."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO protocols (id, title, research_questions, inclusion_criteria,
                                   exclusion_criteria, search_queries, databases,
                                   quality_criteria, extraction_fields, created_at,
                                   updated_at, version, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            protocol.id, protocol.title,
            json.dumps(protocol.research_questions),
            json.dumps(protocol.inclusion_criteria),
            json.dumps(protocol.exclusion_criteria),
            json.dumps([asdict(q) for q in protocol.search_queries]),
            json.dumps(protocol.databases),
            json.dumps(protocol.quality_criteria),
            json.dumps(protocol.extraction_fields),
            protocol.created_at, protocol.updated_at,
            protocol.version, protocol.status
        ))
        
        # Save search queries
        for query in protocol.search_queries:
            query_id = hashlib.md5(f"{protocol.id}{query.database}{query.query_string}".encode()).hexdigest()[:16]
            cursor.execute("""
                INSERT INTO search_queries (id, protocol_id, database, query_string, filters, date_range)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                query_id, protocol.id, query.database, query.query_string,
                json.dumps(query.filters), json.dumps(query.date_range) if query.date_range else None
            ))
        
        conn.commit()
        conn.close()
        return protocol.id
    
    def get_protocol(self, protocol_id: str) -> Optional[SLRProtocol]:
        """Get a protocol by ID."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        return SLRProtocol(
            id=row[0], title=row[1],
            research_questions=json.loads(row[2]),
            inclusion_criteria=json.loads(row[3]),
            exclusion_criteria=json.loads(row[4]),
            search_queries=[SearchQuery(**q) for q in json.loads(row[5])],
            databases=json.loads(row[6]),
            quality_criteria=json.loads(row[7]) if row[7] else [],
            extraction_fields=json.loads(row[8]) if row[8] else [],
            created_at=row[9], updated_at=row[10],
            version=row[11], status=row[12]
        )
    
    def list_protocols(self) -> List[Dict[str, Any]]:
        """List all protocols."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, title, created_at, status FROM protocols ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {"id": r[0], "title": r[1], "created_at": r[2], "status": r[3]}
            for r in rows
        ]
    
    def add_papers(self, protocol_id: str, papers: List[Paper]) -> int:
        """Add papers to the SLR."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        added = 0
        for paper in papers:
            # Check for duplicates by DOI or title
            cursor.execute("""
                SELECT id FROM papers WHERE protocol_id = ? AND (doi = ? OR title = ?)
            """, (protocol_id, paper.doi or "", paper.title))
            
            if cursor.fetchone():
                continue  # Skip duplicate
            
            paper_id = paper.id or hashlib.md5(f"{protocol_id}{paper.title}{paper.year}".encode()).hexdigest()[:16]
            
            cursor.execute("""
                INSERT INTO papers (id, protocol_id, title, authors, year, venue, doi, url,
                                    abstract, keywords, database, search_query_id,
                                    title_abstract_screen, full_text_screen, screen_notes,
                                    extraction_data, extraction_notes, quality_score, quality_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                paper_id, protocol_id, paper.title, json.dumps(paper.authors),
                paper.year, paper.venue, paper.doi, paper.url, paper.abstract,
                json.dumps(paper.keywords), paper.database, paper.search_query_id,
                paper.title_abstract_screen, paper.full_text_screen, paper.screen_notes,
                json.dumps(paper.extraction_data), paper.extraction_notes,
                paper.quality_score, paper.quality_notes
            ))
            added += 1
        
        conn.commit()
        conn.close()
        return added
    
    def get_papers(self, protocol_id: str, stage: Optional[str] = None) -> List[Paper]:
        """Get papers for a protocol, optionally filtered by screening stage."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT * FROM papers WHERE protocol_id = ?"
        params = [protocol_id]
        
        if stage == "title_abstract":
            query += " AND title_abstract_screen = 'include'"
        elif stage == "full_text":
            query += " AND full_text_screen = 'include'"
        elif stage == "final":
            query += " AND full_text_screen = 'include' AND extraction_data != '{}'"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        papers = []
        for row in rows:
            papers.append(Paper(
                id=row[0], title=row[2], authors=json.loads(row[3]), year=row[4],
                venue=row[5], doi=row[6], url=row[7], abstract=row[8],
                keywords=json.loads(row[9]), database=row[10], search_query_id=row[11],
                title_abstract_screen=row[12], full_text_screen=row[13],
                screen_notes=row[14], extraction_data=json.loads(row[15]),
                extraction_notes=row[16], quality_score=row[17], quality_notes=row[18]
            ))
        return papers
    
    def screen_paper(self, paper_id: str, stage: str, decision: str, notes: str = "") -> bool:
        """Screen a paper at title/abstract or full-text stage."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get protocol_id for this paper
        cursor.execute("SELECT protocol_id FROM papers WHERE id = ?", (paper_id,))
        row = cursor.fetchone()
        protocol_id = row[0] if row else None
        
        if stage == "title_abstract":
            cursor.execute("""
                UPDATE papers SET title_abstract_screen = ?, screen_notes = ?
                WHERE id = ?
            """, (decision, notes, paper_id))
            
            # Update PRISMA flow
            if protocol_id:
                # Count screened papers
                cursor.execute("""
                    SELECT COUNT(*) FROM papers WHERE protocol_id = ? AND title_abstract_screen IS NOT NULL
                """, (protocol_id,))
                screened_count = cursor.fetchone()[0]
                
                cursor.execute("""
                    SELECT COUNT(*) FROM papers WHERE protocol_id = ? AND title_abstract_screen = 'include'
                """, (protocol_id,))
                included_count = cursor.fetchone()[0]
                
                cursor.execute("""
                    SELECT COUNT(*) FROM papers WHERE protocol_id = ? AND title_abstract_screen = 'exclude'
                """, (protocol_id,))
                excluded_count = cursor.fetchone()[0]
                
                # Update PRISMA flow directly
                for stage_name, count in [
                    ("records_screened", screened_count),
                    ("records_excluded", excluded_count),
                    ("reports_sought", included_count)
                ]:
                    flow_id = hashlib.md5(f"{protocol_id}{stage_name}".encode()).hexdigest()[:16]
                    cursor.execute("""
                        INSERT OR REPLACE INTO prisma_flow (id, protocol_id, stage, count, details)
                        VALUES (?, ?, ?, ?, ?)
                    """, (flow_id, protocol_id, stage_name, count, ""))
        
        elif stage == "full_text":
            cursor.execute("""
                UPDATE papers SET full_text_screen = ?, screen_notes = ?
                WHERE id = ?
            """, (decision, notes, paper_id))
            
            # Update PRISMA flow for full text
            if protocol_id:
                cursor.execute("""
                    SELECT COUNT(*) FROM papers WHERE protocol_id = ? AND full_text_screen = 'include'
                """, (protocol_id,))
                included_count = cursor.fetchone()[0]
                
                cursor.execute("""
                    SELECT COUNT(*) FROM papers WHERE protocol_id = ? AND full_text_screen = 'exclude'
                """, (protocol_id,))
                excluded_count = cursor.fetchone()[0]
                
                # Update PRISMA flow directly
                for stage_name, count in [
                    ("reports_assessed", included_count + excluded_count),
                    ("reports_excluded_eligibility", excluded_count),
                    ("studies_included", included_count)
                ]:
                    flow_id = hashlib.md5(f"{protocol_id}{stage_name}".encode()).hexdigest()[:16]
                    cursor.execute("""
                        INSERT OR REPLACE INTO prisma_flow (id, protocol_id, stage, count, details)
                        VALUES (?, ?, ?, ?, ?)
                    """, (flow_id, protocol_id, stage_name, count, ""))
        
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0
    
    def extract_data(self, protocol_id: str, paper_id: str, field_name: str, field_value: str) -> bool:
        """Extract data for a specific field from a paper."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        extraction_id = hashlib.md5(f"{protocol_id}{paper_id}{field_name}".encode()).hexdigest()[:16]
        
        cursor.execute("""
            INSERT OR REPLACE INTO extractions (id, protocol_id, paper_id, field_name, field_value)
            VALUES (?, ?, ?, ?, ?)
        """, (extraction_id, protocol_id, paper_id, field_name, field_value))
        
        # Also update paper's extraction_data JSON
        cursor.execute("SELECT extraction_data FROM papers WHERE id = ?", (paper_id,))
        row = cursor.fetchone()
        if row:
            extraction_data = json.loads(row[0]) if row[0] else {}
            extraction_data[field_name] = field_value
            cursor.execute("UPDATE papers SET extraction_data = ? WHERE id = ?", 
                         (json.dumps(extraction_data), paper_id))
        
        conn.commit()
        conn.close()
        return True
    
    def get_extractions(self, protocol_id: str, paper_id: Optional[str] = None) -> Dict[str, Any]:
        """Get extraction data for a protocol or specific paper."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if paper_id:
            cursor.execute("""
                SELECT field_name, field_value FROM extractions 
                WHERE protocol_id = ? AND paper_id = ?
            """, (protocol_id, paper_id))
        else:
            cursor.execute("""
                SELECT paper_id, field_name, field_value FROM extractions 
                WHERE protocol_id = ?
            """, (protocol_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        if paper_id:
            return {row[0]: row[1] for row in rows}
        else:
            result = {}
            for row in rows:
                if row[0] not in result:
                    result[row[0]] = {}
                result[row[0]][row[1]] = row[1]
            return result
    
    def update_prisma_flow(self, protocol_id: str, stage: str, count: int, details: str = "") -> bool:
        """Update PRISMA flow data for a stage."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        flow_id = hashlib.md5(f"{protocol_id}{stage}".encode()).hexdigest()[:16]
        
        cursor.execute("""
            INSERT OR REPLACE INTO prisma_flow (id, protocol_id, stage, count, details)
            VALUES (?, ?, ?, ?, ?)
        """, (flow_id, protocol_id, stage, count, details))
        
        conn.commit()
        conn.close()
        return True
    
    def get_prisma_flow(self, protocol_id: str) -> Dict[str, int]:
        """Get PRISMA flow data for a protocol."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT stage, count FROM prisma_flow WHERE protocol_id = ?", (protocol_id,))
        rows = cursor.fetchall()
        conn.close()
        
        return {row[0]: row[1] for row in rows}
    
    def run_search(self, protocol_id: str, mock: bool = True) -> SLRResult:
        """Execute search phase for a protocol."""
        protocol = self.get_protocol(protocol_id)
        if not protocol:
            return SLRResult(protocol_id=protocol_id, stage=SLRStage.SEARCH, error="Protocol not found")
        
        if mock:
            # Generate mock papers for demonstration
            mock_papers = self._generate_mock_papers(protocol)
            added = self.add_papers(protocol_id, mock_papers)
            
            # Update PRISMA flow
            self.update_prisma_flow(protocol_id, "records_identified", added)
            self.update_prisma_flow(protocol_id, "records_after_dedup", added)
        else:
            # Real search implementation would go here
            # Connect to PubMed, IEEE, ACM, Scopus, Web of Science APIs
            pass
        
        papers = self.get_papers(protocol_id)
        prisma = self.get_prisma_flow(protocol_id)
        
        return SLRResult(
            protocol_id=protocol_id,
            stage=SLRStage.SEARCH,
            papers_found=prisma.get("records_identified", 0),
            papers_after_dedup=prisma.get("records_after_dedup", 0),
            prisma_data=prisma
        )
    
    def _generate_mock_papers(self, protocol: SLRProtocol) -> List[Paper]:
        """Generate mock papers for testing."""
        topics = [
            "Machine Learning", "Deep Learning", "Neural Networks", "Transformers",
            "Computer Vision", "Natural Language Processing", "Reinforcement Learning",
            "Generative AI", "Large Language Models", "Foundation Models"
        ]
        
        venues = ["NeurIPS", "ICML", "ICLR", "CVPR", "ACL", "EMNLP", "ICCV", "AAAI", "IJCAI"]
        
        papers = []
        for i in range(50):
            topic = topics[i % len(topics)]
            venue = venues[i % len(venues)]
            year = 2020 + (i % 5)
            
            paper = Paper(
                id=f"paper_{i:04d}",
                title=f"{topic} Approaches for {protocol.title}: A {venue} {year} Study",
                authors=[f"Author {j+1}" for j in range(3 + (i % 3))],
                year=year,
                venue=venue,
                doi=f"10.1000/{venue.lower()}.2024.{i:04d}",
                url=f"https://doi.org/10.1000/{venue.lower()}.2024.{i:04d}",
                abstract=f"This paper presents novel {topic.lower()} methods for {protocol.title.lower()}. "
                        f"We evaluate our approach on standard benchmarks and show significant improvements.",
                keywords=[topic, "systematic review", "machine learning"],
                database=protocol.databases[0] if protocol.databases else "mock",
                search_query_id=protocol.search_queries[0].id if protocol.search_queries else "mock_query"
            )
            papers.append(paper)
        
        return papers
    
    def export_results(self, protocol_id: str, format: str = "json") -> SLRResult:
        """Export SLR results in various formats."""
        protocol = self.get_protocol(protocol_id)
        if not protocol:
            return SLRResult(protocol_id=protocol_id, stage=SLRStage.EXPORT, error="Protocol not found")
        
        papers = self.get_papers(protocol_id, stage="final")
        prisma = self.get_prisma_flow(protocol_id)
        extractions = self.get_extractions(protocol_id)
        
        export_data = {
            "protocol": asdict(protocol),
            "prisma_flow": prisma,
            "papers_included": len(papers),
            "papers": [asdict(p) for p in papers],
            "extractions": extractions,
            "exported_at": datetime.now().isoformat()
        }
        
        export_files = []
        
        if format in ["json", "all"]:
            filepath = f"slr_{protocol_id}_export.json"
            with open(filepath, "w") as f:
                json.dump(export_data, f, indent=2)
            export_files.append(filepath)
        
        if format in ["csv", "all"]:
            filepath = f"slr_{protocol_id}_papers.csv"
            import csv
            with open(filepath, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["ID", "Title", "Authors", "Year", "Venue", "DOI", "Database"])
                for p in papers:
                    writer.writerow([p.id, p.title, "; ".join(p.authors), p.year, p.venue, p.doi or "", p.database])
            export_files.append(filepath)
        
        if format in ["prisma", "all"]:
            # Generate PRISMA flow diagram data
            filepath = f"slr_{protocol_id}_prisma.json"
            prisma_data = {
                "identification": {
                    "records_identified": prisma.get("records_identified", 0),
                    "records_removed_before_screening": prisma.get("records_removed_before_screening", 0)
                },
                "screening": {
                    "records_screened": prisma.get("records_screened", 0),
                    "records_excluded": prisma.get("records_excluded", 0),
                    "reports_sought": prisma.get("reports_sought", 0),
                    "reports_not_retrieved": prisma.get("reports_not_retrieved", 0)
                },
                "eligibility": {
                    "reports_assessed": prisma.get("reports_assessed", 0),
                    "reports_excluded": prisma.get("reports_excluded_eligibility", 0)
                },
                "included": {
                    "studies_included": prisma.get("studies_included", 0)
                }
            }
            with open(filepath, "w") as f:
                json.dump(prisma_data, f, indent=2)
            export_files.append(filepath)
        
        return SLRResult(
            protocol_id=protocol_id,
            stage=SLRStage.EXPORT,
            papers_final=len(papers),
            prisma_data=prisma,
            export_files=export_files
        )


def main():
    """Command-line interface for SLR Engine."""
    parser = argparse.ArgumentParser(description="SLR-Engine CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Create protocol
    create_parser = subparsers.add_parser("create-protocol", help="Create a new SLR protocol")
    create_parser.add_argument("--id", required=True, help="Protocol ID")
    create_parser.add_argument("--title", required=True, help="Protocol title")
    create_parser.add_argument("--questions", nargs="+", required=True, help="Research questions")
    create_parser.add_argument("--inclusion", nargs="+", required=True, help="Inclusion criteria")
    create_parser.add_argument("--exclusion", nargs="+", required=True, help="Exclusion criteria")
    create_parser.add_argument("--databases", nargs="+", default=["pubmed", "ieee", "acm"], help="Databases to search")
    
    # List protocols
    subparsers.add_parser("list-protocols", help="List all protocols")
    
    # Run search
    search_parser = subparsers.add_parser("search", help="Run search phase")
    search_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    search_parser.add_argument("--mock", action="store_true", default=True, help="Use mock data")
    
    # Screen papers
    screen_parser = subparsers.add_parser("screen", help="Screen papers")
    screen_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    screen_parser.add_argument("--stage", choices=["title_abstract", "full_text"], required=True)
    screen_parser.add_argument("--paper-id", required=True, help="Paper ID")
    screen_parser.add_argument("--decision", choices=["include", "exclude", "maybe"], required=True)
    screen_parser.add_argument("--notes", default="", help="Screening notes")
    
    # Extract data
    extract_parser = subparsers.add_parser("extract", help="Extract data from paper")
    extract_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    extract_parser.add_argument("--paper-id", required=True, help="Paper ID")
    extract_parser.add_argument("--field", required=True, help="Field name")
    extract_parser.add_argument("--value", required=True, help="Field value")
    
    # Export results
    export_parser = subparsers.add_parser("export", help="Export results")
    export_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    export_parser.add_argument("--format", choices=["json", "csv", "prisma", "all"], default="all")
    
    # Get status
    status_parser = subparsers.add_parser("status", help="Get SLR status")
    status_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    
    # Get papers
    papers_parser = subparsers.add_parser("get-papers", help="Get papers for a protocol")
    papers_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    papers_parser.add_argument("--stage", choices=["", "title_abstract", "full_text", "final"], default="", help="Filter by stage")
    
    # Get PRISMA flow
    prisma_parser = subparsers.add_parser("get-prisma", help="Get PRISMA flow data")
    prisma_parser.add_argument("--protocol-id", required=True, help="Protocol ID")
    
    args = parser.parse_args()
    
    engine = SLREngine()
    
    if args.command == "create-protocol":
        protocol = SLRProtocol(
            id=args.id,
            title=args.title,
            research_questions=args.questions,
            inclusion_criteria=args.inclusion,
            exclusion_criteria=args.exclusion,
            search_queries=[
                SearchQuery(database=db, query_string=f"{args.title} AND {db}")
                for db in args.databases
            ],
            databases=args.databases
        )
        engine.create_protocol(protocol)
        print(f"Created protocol: {args.id}")
    
    elif args.command == "list-protocols":
        protocols = engine.list_protocols()
        for p in protocols:
            print(f"{p['id']}: {p['title']} ({p['status']})")
    
    elif args.command == "search":
        result = engine.run_search(args.protocol_id, mock=args.mock)
        print(f"Search completed: {result.papers_found} papers found, {result.papers_after_dedup} after dedup")
    
    elif args.command == "screen":
        success = engine.screen_paper(args.paper_id, args.stage, args.decision, args.notes)
        print(f"Screening {'successful' if success else 'failed'}")
    
    elif args.command == "extract":
        success = engine.extract_data(args.protocol_id, args.paper_id, args.field, args.value)
        print(f"Extraction {'successful' if success else 'failed'}")
    
    elif args.command == "export":
        result = engine.export_results(args.protocol_id, args.format)
        print(f"Export completed: {result.export_files}")
    
    elif args.command == "status":
        protocol = engine.get_protocol(args.protocol_id)
        if not protocol:
            print("Protocol not found")
            return
        papers = engine.get_papers(args.protocol_id)
        prisma = engine.get_prisma_flow(args.protocol_id)
        print(f"Protocol: {protocol.title}")
        print(f"Status: {protocol.status}")
        print(f"Total papers: {len(papers)}")
        print(f"PRISMA flow: {prisma}")
    
    elif args.command == "get-papers":
        papers = engine.get_papers(args.protocol_id, args.stage if args.stage else None)
        import json
        print(json.dumps([{
            "id": p.id, "title": p.title, "authors": p.authors, "year": p.year,
            "venue": p.venue, "doi": p.doi, "url": p.url, "abstract": p.abstract,
            "keywords": p.keywords, "database": p.database,
            "title_abstract_screen": p.title_abstract_screen,
            "full_text_screen": p.full_text_screen,
            "screen_notes": p.screen_notes,
            "extraction_data": p.extraction_data
        } for p in papers]))
    
    elif args.command == "get-prisma":
        prisma = engine.get_prisma_flow(args.protocol_id)
        import json
        print(json.dumps(prisma))
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()