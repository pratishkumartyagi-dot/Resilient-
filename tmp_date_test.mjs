import { buildDatabaseSearch } from "./src/lib/database-apis.ts";

async function esearch(term) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=relevance&term=${encodeURIComponent(term)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return { status: r.status, count: j?.esearchresult?.count, ids: (j?.esearchresult?.idlist || []).length };
}

async function main() {
  const t = buildDatabaseSearch("PubMed", "hypertension", { yearFrom: "2020", yearTo: "2024" });
  console.log("TERM:", t.term);
  console.log("RESULT:", await esearch(t.term));
}
main().catch(console.error);