import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    console.log('start');
    const r = await fetchPubMedBrowserless("insulin resistance", "2021", "2026", undefined, 5);
    console.log('done', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
