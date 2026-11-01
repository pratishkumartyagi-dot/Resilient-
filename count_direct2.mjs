import { fetchPubMedBrowserless, fetchEuropePMC, fetchOpenAlex, fetchCrossref, fetchBioRxiv, fetchMedRxiv } from './src/lib/database-apis';

async function main() {
  try {
    const results = [];
    try { const r = await fetchPubMedBrowserless("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'PubMed', count: r.length}); } catch(e) { results.push({db:'PubMed', err: e.message?.substring(0,80)}); }
    try { const r = await fetchEuropePMC("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'EuropePMC', count: r.length}); } catch(e) { results.push({db:'EuropePMC', err: e.message?.substring(0,80)}); }
    try { const r = await fetchOpenAlex("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'OpenAlex', count: r.length}); } catch(e) { results.push({db:'OpenAlex', err: e.message?.substring(0,80)}); }
    try { const r = await fetchCrossref("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'Crossref', count: r.length}); } catch(e) { results.push({db:'Crossref', err: e.message?.substring(0,80)}); }
    try { const r = await fetchBioRxiv("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'bioRxiv', count: r.length}); } catch(e) { results.push({db:'bioRxiv', err: e.message?.substring(0,80)}); }
    try { const r = await fetchMedRxiv("predictors of insulin resistance", "2021", "2026", undefined, 100); results.push({db:'medRxiv', count: r.length}); } catch(e) { results.push({db:'medRxiv', err: e.message?.substring(0,80)}); }
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('ERR');
  }
}
main();
