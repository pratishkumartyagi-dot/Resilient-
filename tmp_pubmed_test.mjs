import { buildDatabaseSearch } from "./src/lib/database-apis.ts";

async function esearch(term) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&sort=relevance&term=${encodeURIComponent(term)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const ids = j?.esearchresult?.idlist || [];
    const count = j?.esearchresult?.count;
    return { ok: r.ok, status: r.status, count, ids: ids.length };
  } catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

async function main() {
  const cases = [
    ["simple", "diabetes treatment", {}],
    ["natural", "effect of diabetes on kidney function in patients", {}],
    ["with studyType", "diabetes treatment", { studyType: "Randomized Controlled Trial (RCT)" }],
    ["with year", "hypertension", { yearFrom: "2020", yearTo: "2024" }],
    ["all filters", "latent tuberculosis infection in healthcare workers", { yearFrom: "2020", yearTo: "2026", studyType: "Cohort Study" }],
    ["bare query", "diabetes", {}],
    ["mesh query", "aspirin", {}],
  ];
  for (const [label, q, opts] of cases) {
    const t = buildDatabaseSearch("PubMed", q, opts);
    const res = await esearch(t.term);
    console.log(label.padEnd(18), JSON.stringify(res), "TERM:", t.term.slice(0, 110));
  }
}
main().catch(console.error);