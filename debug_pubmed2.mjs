import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    // Try with simple term
    const r = await fetchPubMedBrowserless("insulin resistance", "2021", "2026", undefined, 5);
    console.log('count:', r.length);
  } catch (e) {
    console.error('ERR:', e.message?.substring(0,120));
  }
}
main();
