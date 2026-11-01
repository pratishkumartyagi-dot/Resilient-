import { fetchCrossref } from './src/lib/database-apis';

async function main() {
  try {
    console.log('start');
    const r = await fetchCrossref("diabetes", "2021", "2026", undefined, 3);
    console.log('done', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
