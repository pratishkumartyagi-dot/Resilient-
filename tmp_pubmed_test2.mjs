import { buildDatabaseSearch } from "./src/lib/database-apis.ts";

const cases = [
  ["natural", "effect of diabetes on kidney function in patients", {}],
  ["all filters", "latent tuberculosis infection in healthcare workers", { yearFrom: "2020", yearTo: "2026", studyType: "Cohort Study" }],
];
for (const [label, q, opts] of cases) {
  const t = buildDatabaseSearch("PubMed", q, opts);
  console.log(`\n=== ${label} ===`);
  console.log(t.term);
}