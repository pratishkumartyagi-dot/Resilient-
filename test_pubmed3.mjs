import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchPubMedBrowserless("insulin resistance", "2021", "2026", undefined, 5);
    console.log('count:', r.length);
    if (r[0]) console.log(r[0].title?.substring(0,50));
  } catch (e) {
    console.error('ERR');
  }
}
main();
