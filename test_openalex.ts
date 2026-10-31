import { fetchOpenAlex } from './src/lib/database-apis';

const result = await fetchOpenAlex("CKM AND predictors", "2021", "2026");
console.log(result.length);
if (result.length > 0) {
  console.log(result[0].title);
}
