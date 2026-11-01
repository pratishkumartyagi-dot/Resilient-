import { fetchCrossref } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchCrossref("predictors of insulin resistance", "2021", "2026", undefined, 1000);
    console.log('Crossref:', r.length);
  } catch (e) {
    console.error('Crossref err:', e.message?.substring(0,60));
  }
}
main();
