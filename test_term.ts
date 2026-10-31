import { buildDatabaseSearch } from './src/lib/database-apis';
const term = buildDatabaseSearch("Crossref", "CKM AND predictors").term;
console.log(term);
