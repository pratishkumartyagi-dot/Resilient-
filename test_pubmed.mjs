import { fetchPubMedBrowserless } from './src/lib/database-apis.ts';

const result = await fetchPubMedBrowserless("predictors of CKM stages", "2021", "2026", undefined, 50);
console.log(result.length);
if (result.length > 0) {
  console.log(result[0].title);
}
