import { searchDatabases, AVAILABLE_DATABASE_IDS } from './src/lib/database-apis';

async function main() {
  const result = await searchDatabases(AVAILABLE_DATABASE_IDS, {
    query: "predictors of insulin resistance",
    yearFrom: "2021",
    yearTo: "2026",
    limitPerDatabase: 1000,
  });
  const out = result.outcomes.map(o => ({
    database: o.database,
    status: o.status,
    count: o.count,
    rawCount: o.rawCount,
    error: o.error,
    note: o.note,
    elapsedMs: o.elapsedMs,
  }));
  console.log(JSON.stringify(out, null, 2));
  console.log("\n---TOTAL---");
  console.log("totalPapers:", result.papers.length);
  console.log("totalBeforeDedup:", result.totalBeforeDedup);
  console.log("dedupedCount:", result.dedupedCount);
}
main().catch(e => { console.error('ERR:', e?.message || e); process.exit(1); });
