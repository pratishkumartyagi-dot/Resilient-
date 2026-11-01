import { httpJson, httpText } from './src/lib/database-apis';

async function main() {
  try {
    const toolParams = new URLSearchParams({ db: "pubmed", retmode: "json", sort: "relevance" });
    toolParams.set("tool", "resilient_research_app");
    toolParams.set("email", "test@example.com");
    toolParams.set("term", '(\"insulin resistance\"[Title/Abstract]) AND (\"2021/01/01\"[Date - Publication] : \"2026/12/31\"[Date - Publication])');
    toolParams.set("retstart", "0");
    toolParams.set("retmax", "5");
    const searchable = await httpJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${toolParams.toString()}`, { timeoutMs: 30000, retries: 3 });
    console.log(searchable?.esearchresult?.idlist?.length);
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
main();
