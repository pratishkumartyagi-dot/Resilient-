import { searchDatabases } from './src/lib/database-apis';

const result = await searchDatabases(["PubMed", "Europe PMC", "Crossref", "OpenAlex", "bioRxiv", "medRxiv", "arXiv", "OpenAIRE", "Zenodo", "ClinicalTrials.gov"], {
  query: "CKM AND predictors",
  yearFrom: "2021",
  yearTo: "2026",
  timeoutMs: 60000
});

console.log(JSON.stringify({
  total: result.papers.length,
  totalBeforeDedup: result.totalBeforeDedup,
  dedupedCount: result.dedupedCount,
  outcomes: result.outcomes.map(o => ({ db: o.database, status: o.status, count: o.count, rawCount: o.rawCount, error: o.error }))
}, null, 2));
