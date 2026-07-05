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

export interface DuplicateMatch {
  paper1: PaperForDedup;
  paper2: PaperForDedup;
  confidence: number;
  reason: "doi" | "title" | "journal" | "author";
  merged?: boolean;
}

function normalizeDoi(doi: string): string {
  return doi
    .replace(/https?:\/\/(?:doi\.org|dx\.doi\.org)\//, "")
    .toLowerCase()
    .trim();
}

function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthor(author: string): string {
  if (!author) return "";
  return author
    .toLowerCase()
    .replace(/[^a-z\s,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function deduplicatePapers(papers: PaperForDedup[]): DedupResult {
  const total = papers.length;
  const seen = new Map<string, PaperForDedup>();
  const duplicateGroups: any[][] = [];
  const byDatabase: Record<string, number> = {};
  const uncertainPairs: DuplicateMatch[] = [];

  const HIGH_CONFIDENCE_TITLE = 0.92;
  const MEDIUM_CONFIDENCE_TITLE = 0.85;
  const AUTHOR_THRESHOLD = 0.75;
  const JOURNAL_THRESHOLD = 0.85;

  const isDuplicate = (p1: PaperForDedup, p2: PaperForDedup): { dup: boolean; confidence: number; reason: DuplicateMatch["reason"] } => {
    const doi1 = p1.doi ? normalizeDoi(p1.doi) : "";
    const doi2 = p2.doi ? normalizeDoi(p2.doi) : "";

    if (doi1 && doi2 && doi1 === doi2) {
      return { dup: true, confidence: 1.0, reason: "doi" };
    }
    if ((doi1 && !doi2) || (!doi1 && doi2)) {
      return { dup: false, confidence: 0, reason: "doi" };
    }

    const year1 = p1.year;
    const year2 = p2.year;
    const yearDiff = year1 && year2 ? Math.abs(year1 - year2) : Infinity;
    if (yearDiff > 3) return { dup: false, confidence: 0, reason: "title" };

    const title1 = normalizeTitle(p1.title);
    const title2 = normalizeTitle(p2.title);
    const titleSim = jaroWinkler(title1, title2);
    const titleSimRev = jaroWinkler(title1.split("").reverse().join(""), title2.split("").reverse().join(""));
    const bestTitleSim = Math.max(titleSim, titleSimRev);

    if (bestTitleSim >= HIGH_CONFIDENCE_TITLE) {
      const authorSim = jaroWinkler(normalizeAuthor(p1.authors), normalizeAuthor(p2.authors));
      if (authorSim >= AUTHOR_THRESHOLD) {
        return { dup: true, confidence: bestTitleSim * authorSim, reason: "title" };
      }
      if (p1.journal && p2.journal) {
        const journalSim = jaroWinkler(normalizeTitle(p1.journal), normalizeTitle(p2.journal));
        if (journalSim >= JOURNAL_THRESHOLD) {
          return { dup: true, confidence: bestTitleSim * journalSim, reason: "journal" };
        }
      }
    }

    if (bestTitleSim >= MEDIUM_CONFIDENCE_TITLE) {
      const authorSim = jaroWinkler(normalizeAuthor(p1.authors), normalizeAuthor(p2.authors));
      if (authorSim >= AUTHOR_THRESHOLD) {
        uncertainPairs.push({ paper1: p1, paper2: p2, confidence: bestTitleSim * authorSim, reason: "title" });
      }
    }

    return { dup: false, confidence: bestTitleSim, reason: "title" };
  };

  for (const paper of papers) {
    let isDup = false;
    let bestMatch: { key: string; confidence: number } | null = null;

    for (const [key, existing] of seen.entries()) {
      const result = isDuplicate(paper, existing);
      if (result.dup) {
        isDup = true;
        const existingGroup = duplicateGroups.find((g) => g.includes(existing));
        if (existingGroup) {
          existingGroup.push(paper);
        } else {
          duplicateGroups.push([existing, paper]);
        }
        break;
      }
      if (result.confidence > (bestMatch?.confidence || 0)) {
        bestMatch = { key, confidence: result.confidence };
      }
    }

    if (!isDup) {
      const paperKey = `${paper.doi ? normalizeDoi(paper.doi) : normalizeTitle(paper.title)}-${paper.year || ""}`;
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
