import { searchDatabases, AVAILABLE_DATABASE_IDS } from './src/lib/database-apis';

async function main() {
  console.log("START");
  const result = await searchDatabases(AVAILABLE_DATABASE_IDS, {
    query: "predictors of insulin resistance",
    yearFrom: "2021",
    yearTo: "2026",
    limitPerDatabase: 50,
  });
  console.log("DONE");
  const out = result.outcomes.map(o => ({
    database: o.database,
    status: o.status,
    count: o.count,
    rawCount: o.rawCount,
    error: o.error,
    note: o.note,
  }));
  console.log(JSON.stringify(out, null, 2));
  console.log("TOTAL:", result.papers.length, result.totalBeforeDedup, result.dedupedCount);
}
main().catch(e => { console.error('ERR'); console.error(e.toString()); process.exit(1); });
