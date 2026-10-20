// DedupEndNote-style duplicate detection for systematic review workflows.
//
// Matching cascade — each level is only evaluated when the previous one misses:
//
//   1. Exact DOI        — normalised full DOI string
//   2. DOI prefix       — DOI without its last path segment (preprint vs journal)
//   3. Normalised title — punctuation/case stripped, whitespace collapsed
//   4. Fuzzy title      — Jaccard token overlap >= 0.82 within +/- 1 year
//
// A merged record keeps every source it was found in, so the UI can show
// "also found in PubMed, Crossref" while still presenting one unique article.

export interface DedupPaper {
  id: string;
  title: string;
  authors?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  journal?: string;
  database?: string;
  studyType?: string;
  selected?: boolean;
  url?: string;
  pmid?: string;
  sourceBackend?: string;
  sources?: string[];
  citationStatus?: string;
  citationMessage?: string;
  memberIds?: string[];
}

export type DedupMatchType = "doi" | "doiPrefix" | "title" | "fuzzyTitle";

export interface DedupMatchBreakdown {
  doi: number;
  doiPrefix: number;
  title: number;
  fuzzyTitle: number;
}

export interface DedupResult {
  unique: DedupPaper[];
  duplicatesRemoved: number;
  totalRecords: number;
  matchBreakdown: DedupMatchBreakdown;
}

const FUZZY_TITLE_THRESHOLD = 0.82;
const YEAR_TOLERANCE = 1;

/** Strip URL / prefix noise from a DOI and lowercase it. */
export function normalizeDoi(doi?: string): string {
  if (!doi) return "";
  let d = String(doi).trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  d = d.replace(/^info:doi\//, "");
  d = d.replace(/^doi:\s*/, "");
  return d.trim();
}

/**
 * Proper bases of a DOI, cut at "." or "/" boundaries.
 *
 * "10.2000/doi.prefix.extra" yields ["10.2000/doi.prefix"]. The bare
 * publisher prefix ("10.2000") is dropped because it is shared by unrelated
 * articles and must never be treated as a match.
 */
function doiBases(doi: string): string[] {
  const out: string[] = [];
  let current = doi;
  while (current.length > 0) {
    const slash = current.lastIndexOf("/");
    const dot = current.lastIndexOf(".");
    let cut = -1;
    if (dot > slash && dot > 0) cut = dot;
    else if (slash > 0) cut = slash;
    if (cut <= 0) break;
    current = current.slice(0, cut);
    if (current.includes("/")) out.push(current);
  }
  return out;
}

/** Lowercase, strip markup and punctuation, collapse whitespace. */
export function normalizeTitle(title?: string): string {
  if (!title) return "";
  return String(title)
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the record carries usable free text for screening. */
export function hasAbstract(paper: { abstract?: string } | undefined | null): boolean {
  const a = (paper?.abstract || "").trim();
  if (!a) return false;
  if (/^no abstract/i.test(a)) return false;
  if (/^no full[- ]?text/i.test(a)) return false;
  return a.length >= 20;
}

function significantTokens(normalizedTitle: string): string[] {
  return normalizedTitle.split(" ").filter((w) => w.length > 2);
}

/** Jaccard overlap of the significant tokens of two normalised titles. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface DedupGroup {
  primary: DedupPaper;
  memberIds: string[];
  sources: string[];
  doi: string;
  titleKey: string;
  year?: number;
}

/**
 * Collapse a list of raw records into unique papers.
 *
 * The first occurrence of an article becomes the primary record; later
 * matches contribute their source database, DOI, abstract and selection
 * state to it.
 */
export function deduplicatePapers(papers: DedupPaper[]): DedupResult {
  const totalRecords = papers.length;
  const matchBreakdown: DedupMatchBreakdown = { doi: 0, doiPrefix: 0, title: 0, fuzzyTitle: 0 };

  const groups: DedupGroup[] = [];
  const doiIndex = new Map<string, number>();
  /** Maps a base DOI to the group of a record whose DOI extends that base. */
  const doiChildIndex = new Map<string, number>();
  const titleIndex = new Map<string, number>();
  const tokenIndex = new Map<string, number[]>();

  const merge = (groupIndex: number, paper: DedupPaper, match: DedupMatchType) => {
    const group = groups[groupIndex];
    if (!group.memberIds.includes(paper.id)) group.memberIds.push(paper.id);

    const source = paper.database || paper.sourceBackend;
    if (source && !group.sources.includes(source)) group.sources.push(source);
    for (const s of paper.sources || []) {
      if (s && !group.sources.includes(s)) group.sources.push(s);
    }

    if (!group.primary.doi && paper.doi) group.primary.doi = paper.doi;
    if (!group.primary.abstract && paper.abstract) group.primary.abstract = paper.abstract;
    if (!group.primary.pmid && paper.pmid) group.primary.pmid = paper.pmid;
    if (!group.primary.url && paper.url) group.primary.url = paper.url;
    if (!group.primary.journal && paper.journal) group.primary.journal = paper.journal;
    if (!group.primary.studyType && paper.studyType) group.primary.studyType = paper.studyType;
    if (group.primary.selected !== true && paper.selected === true) group.primary.selected = true;

    matchBreakdown[match]++;
  };

  for (const paper of papers) {
    const doi = normalizeDoi(paper.doi);
    const bases = doi ? doiBases(doi) : [];
    const titleKey = normalizeTitle(paper.title);
    const tokens = significantTokens(titleKey);

    let groupIndex = -1;
    let match: DedupMatchType | null = null;

    if (doi && doiIndex.has(doi)) {
      groupIndex = doiIndex.get(doi)!;
      match = "doi";
    } else if (bases.length > 0) {
      // The record's DOI extends a DOI that is already known — a preprint and
      // its journal version share a base DOI.
      for (const base of bases) {
        if (doiIndex.has(base)) {
          groupIndex = doiIndex.get(base)!;
          match = "doiPrefix";
          break;
        }
      }
    }

    if (groupIndex < 0 && doi && doiChildIndex.has(doi)) {
      // A DOI that extends the current one is already known.
      groupIndex = doiChildIndex.get(doi)!;
      match = "doiPrefix";
    }

    if (groupIndex < 0 && titleKey && titleIndex.has(titleKey)) {
      groupIndex = titleIndex.get(titleKey)!;
      match = "title";
    }

    if (groupIndex < 0) {
      // Fuzzy title fallback — only compare against groups sharing a token.
      const candidates = new Set<number>();
      for (const token of tokens) {
        const indices = tokenIndex.get(token);
        if (indices) indices.forEach((i) => candidates.add(i));
      }
      let best = -1;
      let bestScore = 0;
      for (const candidate of candidates) {
        const group = groups[candidate];
        if (
          group.year != null &&
          paper.year != null &&
          Math.abs(group.year - paper.year) > YEAR_TOLERANCE
        ) {
          continue;
        }
        const score = titleSimilarity(titleKey, group.titleKey);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (best >= 0 && bestScore >= FUZZY_TITLE_THRESHOLD) {
        groupIndex = best;
        match = "fuzzyTitle";
      }
    }

    if (groupIndex >= 0 && match) {
      merge(groupIndex, paper, match);
      continue;
    }

    const sources = paper.sources?.length ? [...paper.sources] : paper.database ? [paper.database] : [];
    const newIndex = groups.length;
    groups.push({
      primary: { ...paper, memberIds: [paper.id], sources: [...sources] },
      memberIds: [paper.id],
      sources: [...sources],
      doi,
      titleKey,
      year: paper.year,
    });

    if (doi) {
      doiIndex.set(doi, newIndex);
      for (const base of doiBases(doi)) {
        if (!doiChildIndex.has(base)) doiChildIndex.set(base, newIndex);
      }
    }
    if (titleKey) titleIndex.set(titleKey, newIndex);
    for (const token of tokens) {
      const indices = tokenIndex.get(token) || [];
      indices.push(newIndex);
      tokenIndex.set(token, indices);
    }
  }

  const unique: DedupPaper[] = groups.map((group) => ({
    ...group.primary,
    sources: group.sources.length ? group.sources : group.primary.sources,
    memberIds: group.memberIds,
  }));

  return {
    unique,
    duplicatesRemoved: totalRecords - unique.length,
    totalRecords,
    matchBreakdown,
  };
}
