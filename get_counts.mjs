import { searchDatabases, AVAILABLE_DATABASE_IDS } from './src/lib/database-apis';

async function main() {
  try {
    const result = await searchDatabases(AVAILABLE_DATABASE_IDS, {
      query: "predictors of insulin resistance",
      yearFrom: "2021",
      yearTo: "2026",
      limitPerDatabase: 1000,
      timeoutMs: 180000,
    });
    const out = result.outcomes.map(o => ({
      database: o.database,
      status: o.status,
      count: o.count,
      rawCount: o.rawCount,
      note: o.note,
    }));
    console.log(JSON.stringify(out, null, 2));
    console.log("\n---");
    console.log("totalPapers:", result.papers.length);
    console.log("totalBeforeDedup:", result.totalBeforeDedup);
    console.log("dedupedCount:", result.dedupedCount);
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
main();
