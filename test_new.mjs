import { fetchPubMedBrowserless, fetchOpenAlex, fetchSemanticScholarBrowserless, fetchCore } from './src/lib/database-apis';

async function main() {
  try {
    const r1 = await fetchPubMedBrowserless("insulin resistance", "2021", "2026", undefined, 3);
    console.log('PubMed:', r1.length);
  } catch(e) { console.log('PubMed err'); }
  try {
    const r2 = await fetchOpenAlex("insulin resistance", "2021", "2026", undefined, {limit:3});
    console.log('OpenAlex:', r2.length);
  } catch(e) { console.log('OpenAlex err'); }
  try {
    const r3 = await fetchSemanticScholarBrowserless("insulin resistance", "2021", "2026", undefined, 3);
    console.log('S2:', r3.length);
  } catch(e) { console.log('S2 err'); }
  try {
    const r4 = await fetchCore("insulin resistance", "2021", "2026", undefined, 3);
    console.log('CORE:', r4.length);
  } catch(e) { console.log('CORE err'); }
}
main();
