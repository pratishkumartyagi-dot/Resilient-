export interface DedupResult {
  uniquePapers: any[];
  duplicateGroups: any[][];
  stats: {
    total: number;
    unique: number;
    duplicatesRemoved: number;
    byDatabase: Record<string, number>;
  };
}

export interface PaperForDedup {
  id: string;
  title: string;
  authors: string;
  year?: number;
  doi?: string;
  journal?: string;
  database: string;
  abstract?: string;
  url?: string;
  selected?: boolean;
}

export function deduplicatePapers(papers: PaperForDedup[]): DedupResult {
  const total = papers.length;
  const seen = new Map<string, PaperForDedup>();
  const duplicateGroups: any[][] = [];
  const byDatabase: Record<string, number> = {};

  const normalizeTitle = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizeAuthor = (author: string): string => {
    return author
      .toLowerCase()
      .replace(/[^a-z\s,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const jaroWinkler = (s1: string, s2: string): number => {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

    const prefix = Math.min(4, Math.min(s1.length, s2.length));
    let commonPrefix = 0;
    for (let i = 0; i < prefix; i++) {
      if (s1[i] === s2[i]) commonPrefix++;
      else break;
    }

    return jaro + commonPrefix * 0.1 * (1 - jaro);
  };

  const isDuplicate = (p1: PaperForDedup, p2: PaperForDedup): boolean => {
    if (p1.doi && p2.doi) {
      const doi1 = p1.doi.replace(/https?:\/\/doi\.org\//, "").toLowerCase().trim();
      const doi2 = p2.doi.replace(/https?:\/\/doi\.org\//, "").toLowerCase().trim();
      if (doi1 && doi2 && doi1 === doi2) return true;
    }

    const yearDiff = p1.year && p2.year ? Math.abs(p1.year - p2.year) : Infinity;
    if (yearDiff > 1) return false;

    const title1 = normalizeTitle(p1.title);
    const title2 = normalizeTitle(p2.title);
    const titleSimilarity = jaroWinkler(title1, title2);
    const titleSimilarityReversed = jaroWinkler(title1.split("").reverse().join(""), title2.split("").reverse().join(""));

    if (titleSimilarity > 0.89 || titleSimilarityReversed > 0.89) {
      const author1 = normalizeAuthor(p1.authors);
      const author2 = normalizeAuthor(p2.authors);
      const authorSimilarity = jaroWinkler(author1, author2);

      if (authorSimilarity > 0.67) return true;

      if (p1.journal && p2.journal) {
        const journal1 = normalizeTitle(p1.journal);
        const journal2 = normalizeTitle(p2.journal);
        if (jaroWinkler(journal1, journal2) > 0.8) return true;
      }
    }

    return false;
  };

  for (const paper of papers) {
    let isDup = false;
    const paperKey = `${paper.doi || normalizeTitle(paper.title)}`;

    for (const [key, existing] of seen.entries()) {
      if (isDuplicate(paper, existing)) {
        isDup = true;
        const existingGroup = duplicateGroups.find((g) => g.includes(existing));
        if (existingGroup) {
          existingGroup.push(paper);
        } else {
          duplicateGroups.push([existing, paper]);
        }
        break;
      }
    }

    if (!isDup) {
      seen.set(paperKey + Date.now() + Math.random(), paper);
    }
  }

  const uniquePapers = Array.from(seen.values());
  for (const p of uniquePapers) {
    byDatabase[p.database] = (byDatabase[p.database] || 0) + 1;
  }

  return {
    uniquePapers,
    duplicateGroups,
    stats: {
      total,
      unique: uniquePapers.length,
      duplicatesRemoved: total - uniquePapers.length,
      byDatabase,
    },
  };
}

export function selectAllFromDatabase(papers: PaperForDedup[], database: string, selected: boolean): PaperForDedup[] {
  return papers.map((p) => (p.database === database ? { ...p, selected } : p));
}

export function getDatabaseGroups(papers: PaperForDedup[]): Record<string, PaperForDedup[]> {
  return papers.reduce((acc, paper) => {
    if (!acc[paper.database]) acc[paper.database] = [];
    acc[paper.database].push(paper);
    return acc;
  }, {} as Record<string, PaperForDedup[]>);
}
