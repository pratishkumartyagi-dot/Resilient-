import https from 'https';

const term = '"insulin resistance"[Title/Abstract] AND 2021:2026[dp]';
const url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&tool=resilient_research_app&email=research@example.com&term=' + encodeURIComponent(term) + '&retstart=0&retmax=2';

https.get(url, { headers: {'User-Agent': 'ResilientResearchApp/1.0'} }, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log(j.esearchresult?.count);
    } catch(e) { console.log('err'); }
  });
}).on('error', (e) => { console.log('err2'); });
