export function formatVancouverReference(p: {
  authors: string;
  title: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  const authors = p.authors || "Unknown authors";
  const title = p.title || "Untitled";
  const journal = p.journal || "Unknown journal";
  const year = p.year || new Date().getFullYear();
  const doi = p.doi ? ` doi:${p.doi}` : "";
  const volume = p.volume ? ` ${p.volume}` : "";
  const issue = p.issue ? `(${p.issue})` : "";
  const pages = p.pages ? `;${p.pages}` : "";
  return `${authors}. ${title}. ${journal}. ${year}${volume}${issue}${pages}${doi}.`;
}

export function formatVancouverList(papers: { authors: string; title: string; journal?: string; year?: number; doi?: string }[]): string {
  return papers
    .map((p, i) => `${i + 1}. ${formatVancouverReference(p)}`)
    .join("\n");
}

export function extractCitations(text: string): string[] {
  const regex = /\(([^)]+,\s*\d{4})\)/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.push(match[1]);
  }
  return Array.from(new Set(found));
}
