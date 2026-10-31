import { fetchCrossrefSearchApi } from './src/lib/database-apis';
const cross = await fetchCrossrefSearchApi('CKM AND predictors', '2021', '2026', undefined, 50);
console.log(cross.length);
if (cross.length > 0) {
  console.log(cross[0].title);
  console.log(cross[0].doi);
}
