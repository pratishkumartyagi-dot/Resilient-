import { searchDatabases } from './src/lib/database-apis';

const result = await searchDatabases(["Crossref"], {
  query: "CKM AND predictors",
  yearFrom: "2021",
  yearTo: "2026",
  timeoutMs: 240000
});

console.log(JSON.stringify({
  total: result.papers.length,
  outcomes: result.outcomes.map(o => ({ db: o.database, status: o.status, count: o.count, error: o.error }))
}, null, 2));
