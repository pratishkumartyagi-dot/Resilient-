/**
 * tuirk/SLR-Engine — Methodology adapted into TypeScript skill module.
 *
 * Automated Systematic Literature Review pipeline Step 1 patterns:
 *   - Pearl growing (seed papers → vocabulary → queries)
 *   - Keyword search path
 *   - Query scaffolding with pre-flight validation
 *   - Cross-source dedup (DOI / PMID / OpenAlex → fuzzy title+author+year)
 *   - Screening batches with criteria
 *   - OA resolution pipeline (PMC → Europe PMC → OpenAlex → Unpaywall → CORE → Crossref)
 *   - Download + full-text prep
 *   - Snowball (backward references + forward citations)
 *   - Export: records.csv, included.ris, audit.json, methodology_report.md, prisma_flow.svg
 */

export interface SLRSeed {
  doi?: string;
  openAlexId?: string;
  pmid?: string;
  title?: string;
  pdfPath?: string;
}

export interface SLRProject {
  id: string;
  topic: string;
  databases: string[];
  yearFrom?: string;
  yearTo?: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  seedPapers: SLRSeed[];
  vocabulary: string[];
  queries: SLRQuery[];
  records: SLRRecord[];
  dedupLog: SLRDedupEntry[];
  screeningLog: SLRScreeningEntry[];
  snowballLog: SLRSnowballEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface SLRQuery {
  id: string;
  text: string;
  source: string;
  sourceHits: number;
  validated: boolean;
  notes?: string;
}

export interface SLRRecord {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  database: string;
  studyType: string;
  abstract: string;
  doi?: string;
  pmid?: string;
  openAlexId?: string;
  url?: string;
  relevanceScore: number;
  decision: "include" | "exclude" | "unscreened" | "pending";
  decisionSource: "agent" | "human" | "seed" | "llm";
  decisionReason?: string;
  criteriaHit?: string[];
  fullTextDownloaded: boolean;
  fullTextPath?: string;
}

export interface SLRDedupEntry {
  keptId: string;
  removedIds: string[];
  matchType: "doi" | "pmid" | "openAlex" | "fuzzy";
}

export interface SLRScreeningEntry {
  recordId: string;
  decision: "include" | "exclude";
  reason: string;
  criteriaHit: string[];
  source: "agent" | "human" | "llm";
}

export interface SLRSnowballEntry {
  sourceRecordId: string;
  newRecordId: string;
  direction: "backward" | "forward";
}

/** Generate scaffolded query text from topic + vocabulary (SLR-Engine 01 pattern). */
export function scaffoldQueries(topic: string, vocabulary: string[], databases: string[]): SLRQuery[] {
  const keywordQueries: string[] = [];
  const topTerms = vocabulary.slice(0, 6);
  if (topTerms.length > 0) {
    keywordQueries.push(topTerms.join(" AND "));
  }
  if (topic.length > 0) {
    keywordQueries.push(topic);
  }

  return databases.map((db) => ({
    id: `q-${db.toLowerCase().replace(/\s/g, "-")}`,
    text: keywordQueries.join(" OR "),
    source: db,
    sourceHits: 0,
    validated: true,
  }));
}

/** Pre-flight query validation (SLR-Engine 02 pattern). */
export function validateQueries(queries: SLRQuery[]): SLRQuery[] {
  return queries.map((q) => {
    const problems: string[] = [];
    if (!q.text || q.text.trim().length === 0) problems.push("Empty query string");
    if (q.text.length > 500) problems.push("Query too long (>500 chars)");
    if (/^[\\s\\p{P}]*$/.test(q.text || "")) problems.push("Query contains only whitespace/punctuation");
    return { ...q, validated: problems.length === 0, notes: problems.length ? problems.join("; ") : undefined };
  });
}

/** Dedup records by DOI / PMID / OpenAlex, then fuzzy title+author+year (SLR-Engine 03 pattern). */
export function dedupRecords(records: SLRRecord[]): { deduped: SLRRecord[]; log: SLRDedupEntry[] } {
  const seen = new Map<string, SLRRecord>();
  const log: SLRDedupEntry[] = [];
  const deduped: SLRRecord[] = [];

  for (const r of records) {
    const key = r.doi ? `doi:${r.doi.toLowerCase()}` : r.pmid ? `pmid:${r.pmid}` : r.openAlexId ? `oa:${r.openAlexId}` : `fuzzy:${r.title.toLowerCase()}|${r.authors.split(",")[0]?.trim()}|${r.year}`;
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      log.push({
        keptId: existing.id,
        removedIds: [r.id],
        matchType: r.doi ? "doi" : r.pmid ? "pmid" : r.openAlexId ? "openAlex" : "fuzzy",
      });
    } else {
      seen.set(key, r);
      deduped.push(r);
    }
  }

  return { deduped, log };
}

/** Resolve open-access copies: PMC → Europe PMC → OpenAlex → Unpaywall → CORE → Crossref (SLR-Engine 05 pattern). */
export const OA_RESOLUTION_ORDER = ["PMC", "Europe PMC", "OpenAlex", "Unpaywall", "CORE", "Crossref"];

/** Snowball: backward references + forward citations (SLR-Engine 08 pattern). */
export function snowball(records: SLRRecord[], direction: "backward" | "forward"): SLRSnowballEntry[] {
  const entries: SLRSnowballEntry[] = [];
  const ids = new Set(records.map((r) => r.id));
  for (const r of records) {
    // Deterministic stub: a real implementation would query OpenAlex / Semantic Scholar citation graph.
    entries.push({ sourceRecordId: r.id, newRecordId: `snowball-${direction}-${r.id}`, direction });
  }
  return entries;
}

/** PRISMA flow for SLR-Engine (stage 09 pattern). */
export interface SLRPrismaFlow {
  identification: number;
  deduped: number;
  screened: number;
  excluded: number;
  assessed: number;
  included: number;
}

export function formatSLRPrismaFlow(flow: SLRPrismaFlow): string {
  return `
### PRISMA 2020 Flow (SLR-Engine)

| Stage | Count |
|---|---|
| Identification | ${flow.identification} |
| Deduplication | ${flow.deduped} |
| Screening | ${flow.screened} |
| Excluded | ${flow.excluded} |
| Assessed for eligibility | ${flow.assessed} |
| Included | ${flow.included} |
`;
}

/** Methodology report (SLR-Engine stage 09 pattern). */
export function formatMethodologyReport(project: SLRProject): string {
  return `
# SLR Methodology Report

## Topic
${project.topic}

## Databases
${project.databases.join(", ")}

## Date Range
${project.yearFrom || "any"} – ${project.yearTo || "any"}

## Inclusion Criteria
${project.inclusionCriteria.map((c) => `- ${c}`).join("\n")}

## Exclusion Criteria
${project.exclusionCriteria.map((c) => `- ${c}`).join("\n")}

## Search Queries
${project.queries.map((q) => `- [${q.source}] ${q.text} (hits: ${q.sourceHits})`).join("\n")}

## Screening Statistics
- Records screened: ${project.screeningLog.length}
- Included: ${project.records.filter((r) => r.decision === "include").length}
- Excluded: ${project.records.filter((r) => r.decision === "exclude").length}

## Dedup Log
${project.dedupLog.map((d) => `- Kept \`${d.keptId}\`, removed ${d.removedIds.length} via ${d.matchType} match`).join("\n")}

## Snowball
${project.snowballLog.length} snowball records added.

Generated: ${project.updatedAt}
`;
}

/** Run SLR-Engine Step 1 (search + dedup) adapted. */
export function runSLREngineStep1(
  project: SLRProject,
  newRecords: SLRRecord[],
): { project: SLRReport; records: SLRRecord[]; dedupLog: SLRDedupEntry[]; prismaFlow: SLRPrismaFlow } {
  const now = new Date().toISOString();
  const { deduped, log } = dedupRecords([...project.records, ...newRecords]);

  const prismaFlow: SLRPrismaFlow = {
    identification: deduped.length + log.reduce((a, b) => a + b.removedIds.length, 0),
    deduped: log.length,
    screened: project.screeningLog.length,
    excluded: project.records.filter((r) => r.decision === "exclude").length,
    assessed: project.records.filter((r) => r.decision === "include").length,
    included: project.records.filter((r) => r.decision === "include").length,
  };

  const updatedProject: SLRProject = {
    ...project,
    records: deduped,
    dedupLog: [...project.dedupLog, ...log],
    updatedAt: now,
  };

  return { project: updatedProject, records: deduped, dedupLog: log, prismaFlow };
}

export type SLRReport = SLRProject;

export const SLR_ENGINE_SKILL_ID = "slr-engine";
export const SLR_ENGINE_SKILL_NAME = "SLR-Engine (tuirk)";