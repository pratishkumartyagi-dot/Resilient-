import { fetchSemanticScholarBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchSemanticScholarBrowserless("insulin resistance", "2021", "2026", undefined, 2);
    console.log('done:', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
