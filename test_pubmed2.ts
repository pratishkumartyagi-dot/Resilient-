import { fetchPubMedBrowserless } from './src/lib/database-apis';

const result = await fetchPubMedBrowserless("predictors of CKM stages", "2021", "2026", undefined, 50);
console.log(result.length);
