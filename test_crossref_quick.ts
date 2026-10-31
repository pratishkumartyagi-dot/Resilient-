import { fetchCrossrefSearchApi } from './src/lib/database-apis';
const cross = await fetchCrossrefSearchApi('CKM', '2021', '2026', undefined, 200);
console.log(cross.length);
