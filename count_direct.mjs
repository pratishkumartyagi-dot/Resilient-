import { searchDatabases } from './src/lib/database-apis';

async function main() {
  try {
    const result = await searchDatabases(['PubMed', 'Europe PMC', 'OpenAlex', 'Crossref', 'bioRxiv', 'medRxiv', 'CORE', 'Semantic Scholar'], {
      query: "predictors of insulin resistance",
      yearFrom: "2021",
      yearTo: "2026",
      limitPerDatabase: 500,
      timeoutMs: 120000,
    });
    const out = result.outcomes.map(o => ({
      database: o.database,
      status: o.status,
      count: o.count,
      rawCount: o.rawCount,
      note: o.note,
      error: o.error ? o.error.substring(0, 100) : undefined,
    }));
    console.log(JSON.stringify(out, null, 2));
    console.log("\n===SUMMARY===");
    console.log("totalPapers:", result.papers.length);
    console.log("totalBeforeDedup:", result.totalBeforeDedup);
    console.log("dedupedCount:", result.dedupedCount);
  } catch (e) {
    console.error('ERR');
    console.error(e.stack);
  }
}
main();
