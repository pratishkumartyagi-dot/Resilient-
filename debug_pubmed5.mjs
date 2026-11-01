import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    console.log("start");
    const r = await fetchPubMedBrowserless("predictors of insulin resistance", "2021", "2026", undefined, 2);
    console.log('count:', r.length);
  } catch (e) {
    console.error('ERR:', e.toString());
  }
}
main();
