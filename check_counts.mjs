async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/literature-search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: 'predictors of insulin resistance',
        databases: ['PubMed', 'Europe PMC', 'OpenAlex', 'Crossref', 'bioRxiv', 'medRxiv', 'CORE', 'Semantic Scholar'],
        yearFrom: '2021',
        yearTo: '2026',
        maxResults: 1000
      })
    });
    const data = await res.json();
    console.log(JSON.stringify(data.perDatabaseResults, null, 2));
    console.log('\nTOTAL:', data.total);
  } catch (e) {
    console.error('ERR', e);
  }
}
main();
