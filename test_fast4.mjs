import { fetchOpenAlex } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchOpenAlex("insulin resistance", "2021", "2026", undefined, 5);
    console.log('count:', r.length);
    if (r[0]) console.log(r[0].title);
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
main();
