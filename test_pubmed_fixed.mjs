import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchPubMedBrowserless("predictors of insulin resistance", "2021", "2026", undefined, 10);
    console.log('done:', r.length);
    if (r[0]) console.log(r[0].title?.substring(0,40));
  } catch (e) {
    console.log('err');
  }
}
main();
