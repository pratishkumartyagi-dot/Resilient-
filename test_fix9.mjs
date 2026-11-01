import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    // Try with a query that might trigger different path
    const r = await fetchPubMedBrowserless("insulin AND resistance", "2021", "2026", undefined, 2);
    console.log('done:', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
