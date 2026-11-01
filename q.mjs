import { fetchEuropePMC } from './src/lib/database-apis';

async function main() {
  try {
    const r = await fetchEuropePMC("predictors of insulin resistance", "2021", "2026", undefined, 1000);
    console.log('EuropePMC:', r.length);
  } catch (e) {
    console.error('EuropePMC err');
  }
}
main();
