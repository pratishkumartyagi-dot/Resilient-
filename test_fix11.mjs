import { buildConceptAwareTerm } from './src/lib/database-apis';

async function main() {
  try {
    const term = buildConceptAwareTerm("predictors of insulin resistance", { yearFrom: "2021", yearTo: "2026" });
    console.log(term);
  } catch (e) {
    console.log('err');
  }
}
main();
