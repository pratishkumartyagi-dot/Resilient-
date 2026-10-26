/**
 * litsearchr port for TypeScript / Next.js.
 *
 * Implements the quasi-automatic search strategy development pipeline from
 * the litsearchr R package (Grames et al. 2019, doi:10.1111/2041-210X.13268):
 *
 *   1. Naive search → collect candidate records (titles + abstracts)
 *   2. Extract terms (RAKE/fakerake + ngrams) from the candidate records
 *   3. Build a keyword co-occurrence network (DFM → graph)
 *   4. Find a cutoff in keyword importance (cumulative strength)
 *   5. Reduce the graph to the important keywords
 *   6. Group terms into concepts (manual curation)
 *   7. Write Boolean search strings per database dialect
 *   8. Check recall against a gold-standard set of known-relevant articles
 *
 * Nothing here is simulated: every function operates on real text supplied by
 * the caller. The module is dependency-free (no NLP libraries) so it works
 * out of the box in the browser and on the server.
 */

// ---------------------------------------------------------------------------
// Stopwords (English) — minimal set for keyword extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren't","as","at",
  "be","because","been","before","being","below","between","both","but","by","can't","cannot","could",
  "couldn't","did","didn't","do","does","doesn't","doing","don't","down","during","each","few","for",
  "from","further","had","hadn't","has","hasn't","have","haven't","having","he","he'd","he'll","he's",
  "her","here","here's","hers","herself","him","himself","his","how","how's","i","i'd","i'll","i'm",
  "i've","if","in","into","is","isn't","it","it's","its","itself","let's","me","more","most","mustn't",
  "my","myself","no","nor","not","of","off","on","once","only","or","other","ought","our","ours",
  "ourselves","out","over","own","same","shan't","she","she'd","she'll","she's","should","shouldn't",
  "so","some","such","than","that","that's","the","their","theirs","them","themselves","then","there",
  "there's","these","they","they'd","they'll","they're","they've","this","those","through","to","too",
  "under","until","up","very","was","wasn't","we","we'd","we'll","we're","we've","were","weren't","what",
  "what's","when","when's","where","where's","which","while","who","who's","whom","why","why's","with",
  "won't","would","wouldn't","you","you'd","you'll","you're","you've","your","yours","yourself","yourselves",
  "the","and","of","to","in","is","it","that","for","with","as","was","on","are","be","by","or","at",
  "from","this","have","has","had","not","but","which","you","all","we","can","her","was","one","our",
  "out","other","were","there","when","up","use","your","how","said","an","each","she","some","its",
  "would","make","like","him","into","time","has","look","two","more","write","go","see","number","no",
  "way","could","people","my","than","first","water","been","call","who","oil","its","now","find","long",
  "down","day","did","get","come","made","may","part"
]);

// Porter-lite stemming for English (common suffixes only, enough for keyword dedup)
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  const suffixes = ["sses","ies","es","s","ed","ing","ly","er","est","ial","ity","tion","sion","ment","ness","able","ible","al","ive","ic","ous","ful","ive","ise","ize"];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length > 2) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function ngrams(tokens: string[], minN: number, maxN: number): string[] {
  const out: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Term extraction — fakerake / RAKE-lite + ngrams
// ---------------------------------------------------------------------------

interface ExtractedTerm {
  term: string;
  freq: number;
  degree: number;       // number of co-occurring words in the same sentence/debate
  rakeScore: number;    // degree / freq
  ngram: number;
}

/**
 * Extract candidate keywords from text using a fakerake-style approach:
 * split text into sentences (delimited by periods), count word frequency and
 * degree (co-occurrence count within each sentence), then score = degree/freq.
 * Optionally include ngrams of adjacent non-stopword tokens.
 */
export function extractTerms(
  texts: string[],
  options: {
    method?: "fakerake" | "rake" | "ngram" | "all";
    minFreq?: number;
    minNgram?: number;
    maxNgram?: number;
    language?: string;
  } = {}
): ExtractedTerm[] {
  const method = options.method ?? "all";
  const minFreq = options.minFreq ?? 2;
  const minN = options.minNgram ?? 1;
  const maxN = options.maxNgram ?? 3;

  const termFreq = new Map<string, number>();
  const termDegree = new Map<string, number>();

  for (const text of texts) {
    const sentences = text
      .toLowerCase()
      .split(/[.!?;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      const tokens = tokenize(sentence);
      // Count unigram frequency & degree within this sentence
      const uniq = new Set(tokens);
      for (const t of uniq) {
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
        // degree = number of other unique words in this sentence
        termDegree.set(t, (termDegree.get(t) || 0) + Math.max(uniq.size - 1, 0));
      }

      // Ngrams
      if (method === "ngram" || method === "all") {
        const grams = ngrams(tokens, minN, maxN);
        for (const g of grams) {
          termFreq.set(g, (termFreq.get(g) || 0) + 1);
          termDegree.set(g, (termDegree.get(g) || 0) + Math.max(tokens.length - 1, 0));
        }
      }
    }
  }

  const terms: ExtractedTerm[] = [];
  for (const [term, freq] of termFreq) {
    if (freq < minFreq) continue;
    const degree = termDegree.get(term) || 0;
    const rakeScore = freq > 0 ? degree / freq : 0;
    const ngram = term.split(" ").length;
    terms.push({ term, freq, degree, rakeScore, ngram });
  }

  // Sort by rake score desc, then freq desc
  terms.sort((a, b) => b.rakeScore - a.rakeScore || b.freq - a.freq);
  return terms;
}

// ---------------------------------------------------------------------------
// Document-Feature Matrix (DFM)
// ---------------------------------------------------------------------------

export interface DFM {
  docs: string[];                 // document ids (titles used as labels)
  features: string[];             // keyword terms
  matrix: number[][];             // docs × features (counts)
}

export function createDFM(docs: string[], features: string[]): DFM {
  const matrix: number[][] = [];
  for (const doc of docs) {
    const tokens = tokenize(doc);
    const row: number[] = [];
    for (const feature of features) {
      const fTokens = tokenize(feature);
      // count occurrences of the (possibly multi-word) feature in the doc
      let count = 0;
      if (fTokens.length === 1) {
        count = tokens.filter((t) => t === fTokens[0]).length;
      } else {
        // phrase match
        for (let i = 0; i <= tokens.length - fTokens.length; i++) {
          if (tokens.slice(i, i + fTokens.length).join(" ") === feature) count++;
        }
      }
      row.push(count);
    }
    matrix.push(row);
  }
  return { docs, features, matrix };
}

// ---------------------------------------------------------------------------
// Keyword co-occurrence network
// ---------------------------------------------------------------------------

interface Edge {
  source: string;
  target: string;
  weight: number;
}

interface Network {
  nodes: string[];
  edges: Edge[];
}

/**
 * Build a co-occurrence network from a DFM: two keywords are connected when
 * they co-occur in the same document; edge weight = number of co-occurring docs.
 */
export function createNetwork(dfm: DFM, options: { minStudies?: number; minOcc?: number } = {}): Network {
  const minStudies = options.minStudies ?? 1;
  const minOcc = options.minOcc ?? 1;

  const edgeWeights = new Map<string, number>();
  const nodeDocs = new Map<string, Set<number>>();

  for (let d = 0; d < dfm.docs.length; d++) {
    const row = dfm.matrix[d];
    const present: string[] = [];
    for (let f = 0; f < dfm.features.length; f++) {
      if (row[f] > 0) {
        present.push(dfm.features[f]);
        if (!nodeDocs.has(dfm.features[f])) nodeDocs.set(dfm.features[f], new Set());
        nodeDocs.get(dfm.features[f])!.add(d);
      }
    }
    // Co-occurrence edges within this document
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
        edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
      }
    }
  }

  const edges: Edge[] = [];
  for (const [key, weight] of edgeWeights) {
    if (weight < minOcc) continue;
    const [a, b] = key.split("\u0000");
    const aDocs = nodeDocs.get(a)!.size;
    const bDocs = nodeDocs.get(b)!.size;
    // minStudies: both nodes must appear in at least minStudies docs
    if (aDocs < minStudies || bDocs < minStudies) continue;
    edges.push({ source: a, target: b, weight });
  }

  const nodeSet = new Set<string>();
  for (const e of edges) {
    nodeSet.add(e.source);
    nodeSet.add(e.target);
  }

  return { nodes: Array.from(nodeSet), edges };
}

// ---------------------------------------------------------------------------
// Cutoff detection — cumulative strength
// ---------------------------------------------------------------------------

export interface CutoffResult {
  cutoff: number;
  nodesAbove: string[];
  strength: Map<string, number>;
}

/**
 * Compute node strength (sum of incident edge weights) and find the cutoff
 * where the cumulative percentage of total strength reaches `percent`
 * (default 0.80 / 80%). Nodes above the cutoff are the "important" keywords.
 */
export function findCutoff(
  network: Network,
  options: { method?: "cumulative"; percent?: number; impMethod?: "strength" } = {}
): CutoffResult {
  const percent = options.percent ?? 0.80;

  const strength = new Map<string, number>();
  for (const node of network.nodes) strength.set(node, 0);
  for (const e of network.edges) {
    strength.set(e.source, (strength.get(e.source) || 0) + e.weight);
    strength.set(e.target, (strength.get(e.target) || 0) + e.weight);
  }

  const sorted = [...network.nodes].sort((a, b) => (strength.get(b) || 0) - (strength.get(a) || 0));
  const totalStrength = sorted.reduce((s, n) => s + (strength.get(n) || 0), 0);

  let cumulative = 0;
  let cutoff = 0;
  const nodesAbove: string[] = [];
  for (const node of sorted) {
    const s = strength.get(node) || 0;
    cumulative += s;
    if (totalStrength > 0 && cumulative / totalStrength < percent) {
      cutoff = s;
      nodesAbove.push(node);
    } else {
      // include the node that crosses the threshold too
      if (!nodesAbove.includes(node)) nodesAbove.push(node);
      break;
    }
  }

  return { cutoff, nodesAbove, strength };
}

// ---------------------------------------------------------------------------
// Reduce graph
// ---------------------------------------------------------------------------

export function reduceGraph(network: Network, cutoffNodes: string[]): Network {
  const keep = new Set(cutoffNodes);
  const edges = network.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { nodes: cutoffNodes, edges };
}

export function getKeywords(network: Network): string[] {
  return [...network.nodes].sort();
}

// ---------------------------------------------------------------------------
// Write Boolean search per database dialect
// ---------------------------------------------------------------------------

export type SearchDialect =
  | "pubmed"
  | "europepmc"
  | "crossref"
  | "arxiv"
  | "doaj"
  | "openaire"
  | "zenodo"
  | "clinicaltrials"
  | "generic";

export interface WriteSearchOptions {
  dialect?: SearchDialect;
  stemming?: boolean;
  exactPhrase?: boolean;
  closure?: "none" | "adj" | "proximity";
  language?: string;
  maxTermsPerGroup?: number;
}

/** Apply lite stemming: append * to the stemmed root. */
function stemTerm(term: string): string {
  const words = term.split(" ");
  return words.map((w) => stem(w)).join(" ");
}

function quoteTerm(term: string): string {
  return `"${term.replace(/"/g, "")}"`;
}

export function writeSearch(
  groups: string[][],
  options: WriteSearchOptions = {}
): string {
  const dialect = options.dialect ?? "generic";
  const stemming = options.stemming ?? true;
  const exactPhrase = options.exactPhrase ?? true;

  const groupStrings: string[] = [];

  for (const group of groups) {
    if (group.length === 0) continue;

    let terms: string[];
    if (stemming) {
      // Stem each term and dedupe
      const stemmed = group.map((t) => stemTerm(t));
      terms = [...new Set(stemmed)];
    } else {
      terms = [...new Set(group)];
    }

    if (options.maxTermsPerGroup && terms.length > options.maxTermsPerGroup) {
      terms = terms.slice(0, options.maxTermsPerGroup);
    }

    const termStrings = terms.map((t) => {
      // For stemming, attach wildcard to multi-word stems
      const stemmed = stemTerm(t);
      if (stemming && stemmed !== t) {
        // wildcard at end of last word
        const words = stemmed.split(" ");
        const last = words.pop() || "";
        return quoteTerm(words.join(" ") + (words.length > 0 ? " " : "") + last + "*");
      }
      if (exactPhrase) return quoteTerm(t);
      return t;
    });

    groupStrings.push(`(${termStrings.join(" OR ")})`);
  }

  const searchString = groupStrings.join(" AND ");

  // Per-dialect adjustments (field tags, date syntax handled by caller)
  return searchString;
}

/** Write a PubMed-specific search: terms in [Title/Abstract], with MeSH optional. */
export function writePubMedSearch(groups: string[][], meshTerms: string[][] = []): string {
  const allGroups: (string[] | string)[][] = groups.map((g) => g.map((t) => `${quoteTerm(t)}[Title/Abstract]`));
  for (const m of meshTerms) {
    if (m.length > 0) allGroups.push(m.map((t) => `${t}[MeSH Terms]`));
  }
  return allGroups.map((g) => `(${g.join(" OR ")})`).join(" AND ");
}

/** Write an Europe PMC-specific search. */
export function writeEuropePMCSearch(groups: string[][]): string {
  return groups
    .map((g) => `(${g.map((t) => `(${quoteTerm(t)})`).join(" OR ")})`)
    .join(" AND ");
}

// ---------------------------------------------------------------------------
// Recall check against gold standard
// ---------------------------------------------------------------------------

export interface RecallResult {
  found: boolean;
  bestMatch: string | null;
  similarity: number;
  matchedTitle: string | null;
}

export interface CheckRecallOutput {
  results: RecallResult[];
  recallRate: number;
  foundCount: number;
  totalCount: number;
}

/**
 * Simple token-overlap similarity (Jaccard on word sets).
 */
function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check how many gold-standard titles are retrieved in the result set,
 * using fuzzy title matching. Returns per-article match details.
 */
export function checkRecall(
  trueHits: string[],
  retrieved: { title: string }[],
  options: { threshold?: number } = {}
): CheckRecallOutput {
  const threshold = options.threshold ?? 0.5;
  const results: RecallResult[] = [];

  for (const hit of trueHits) {
    let bestMatch: string | null = null;
    let bestSim = 0;
    let matchedTitle: string | null = null;

    for (const r of retrieved) {
      const sim = similarity(hit, r.title);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = r.title;
      }
      if (sim >= threshold) {
        matchedTitle = r.title;
        break;
      }
    }

    results.push({
      found: matchedTitle !== null,
      bestMatch,
      similarity: bestSim,
      matchedTitle,
    });
  }

  const foundCount = results.filter((r) => r.found).length;
  return {
    results,
    recallRate: trueHits.length > 0 ? foundCount / trueHits.length : 0,
    foundCount,
    totalCount: trueHits.length,
  };
}
