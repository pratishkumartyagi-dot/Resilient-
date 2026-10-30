import { buildDatabaseSearch } from "./src/lib/database-apis.ts";

async function esearch(term) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=relevance&term=${encodeURIComponent(term)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return { status: r.status, count: j?.esearchresult?.count, ids: (j?.esearchresult?.idlist || []).length };
}

async function main() {
  const cases = [
    ["natural", "effect of diabetes on kidney function in patients", {}],
    ["all filters", "latent tuberculosis infection in healthcare workers", { yearFrom: "2020", yearTo: "2026", studyType: "Cohort Study" }],
    ["with year", "hypertension", { yearFrom: "2020", yearTo: "2024" }],
    ["simple", "diabetes treatment", {}],
  ];
  for (const [label, q, opts] of cases) {
    const t = buildDatabaseSearch("PubMed", q, opts);
    const res = await esearch(t.term);
    console.log(label.padEnd(16), JSON.stringify(res), "TERM:", t.term.slice(0, 100));
  }
}
main().catch(console.error);