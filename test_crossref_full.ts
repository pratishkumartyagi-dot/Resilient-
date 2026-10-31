import { fetchCrossrefSearchApi } from './src/lib/database-apis';
const cross = await fetchCrossrefSearchApi('CKM AND predictors', '2021', '2026', undefined);
console.log(cross.length);
