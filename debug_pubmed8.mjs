import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    console.log("calling");
    const r = await fetchPubMedBrowserless("diabetes", "2021", "2026", undefined, 2);
    console.log('COUNT:', r.length);
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
main();
