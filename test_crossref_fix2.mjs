import { fetchCrossref } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchCrossref("insulin resistance", "2021", "2026", undefined, 5);
    console.log('done:', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
