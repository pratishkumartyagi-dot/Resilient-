import { searchDatabases } from './src/lib/database-apis';

const result = await searchDatabases(["OpenAlex"], {
  query: "CKM AND predictors",
  yearFrom: "2021",
  yearTo: "2026",
  timeoutMs: 300000
});

console.log(JSON.stringify({
  total: result.papers.length,
  outcomes: result.outcomes.map(o => ({ db: o.database, status: o.status, count: o.count, error: o.error }))
}, null, 2));
