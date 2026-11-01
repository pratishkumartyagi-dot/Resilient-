import { fetchPubMedBrowserless } from './src/lib/database-apis';

async function main() {
  try {
    // Try direct boolean
    const r = await fetchPubMedBrowserless("insulin[Title/Abstract] AND resistance[Title/Abstract]", "2021", "2026", undefined, 1);
    console.log('done:', r.length);
  } catch (e) {
    console.log('err');
  }
}
main();
