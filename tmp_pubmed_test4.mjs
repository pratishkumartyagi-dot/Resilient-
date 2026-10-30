import { buildDatabaseSearch } from "./src/lib/database-apis.ts";

async function esearch(term) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=relevance&term=${encodeURIComponent(term)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return { status: r.status, count: j?.esearchresult?.count, ids: (j?.esearchresult?.idlist || []).length };
}

async function main() {
  const t1 = buildDatabaseSearch("PubMed", "latent tuberculosis infection in healthcare workers", { yearFrom: "2020", yearTo: "2026" });
  console.log("no studyType:", await esearch(t1.term), "TERM:", t1.term.slice(0, 120));
  const t2 = buildDatabaseSearch("PubMed", "latent tuberculosis infection in healthcare workers", { studyType: "Cohort Study" });
  console.log("no year     :", await esearch(t2.term), "TERM:", t2.term.slice(0, 120));
}
main().catch(console.error);