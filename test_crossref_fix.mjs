import { fetchCrossref } from './src/lib/database-apis';

async function main() {
  try {
    console.log('start');
    const r = await fetchCrossref("predictors of insulin resistance", "2021", "2026", undefined, 10);
    console.log('done:', r.length);
  } catch (e) {
    console.log('err:', e.message?.substring(0,60));
  }
}
main();
