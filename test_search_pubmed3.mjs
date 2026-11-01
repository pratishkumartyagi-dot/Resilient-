import { searchDatabases } from './src/lib/database-apis';

async function main() {
  try {
    const result = await searchDatabases(['PubMed'], {
      query: "insulin resistance",
      yearFrom: "2021",
      yearTo: "2026",
      limitPerDatabase: 50,
      timeoutMs: 60000,
    });
    const out = result.outcomes.map(o => ({
      database: o.database,
      status: o.status,
      count: o.count,
      rawCount: o.rawCount,
      error: o.error?.substring(0,80),
    }));
    console.log(JSON.stringify(out, null, 2));
    console.log("TOTAL:", result.papers.length);
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
main();
