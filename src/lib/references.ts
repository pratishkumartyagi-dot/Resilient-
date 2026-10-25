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

export type CitationStyle = "vancouver" | "apa" | "ieee" | "mla" | "harvard";

function initials(authors: string): string {
  return authors
    .split(",")
    .map((a) => {
      const parts = a.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return "";
      const family = parts[0];
      const givenInitials = parts.slice(1).map((p) => p.charAt(0).toUpperCase()).join("");
      return `${family} ${givenInitials}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

export function formatApaReference(p: {
  authors: string;
  title: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  const year = p.year || new Date().getFullYear();
  const authorList = p.authors || "Unknown authors";
  const title = p.title || "Untitled";
  const journal = p.journal ? ` <em>${p.journal}</em>` : "";
  const volume = p.volume ? `<em>${p.volume}</em>` : "";
  const issue = p.issue ? `(${p.issue})` : "";
  const pages = p.pages ? `, ${p.pages}` : "";
  const doi = p.doi ? ` https://doi.org/${p.doi}` : "";
  return `${authorList} (${year}). ${title}.${journal}${volume}${issue}${pages}${doi}.`;
}

export function formatIeeeReference(p: {
  authors: string;
  title: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  const authorList = p.authors || "Unknown authors";
  const title = p.title || "Untitled";
  const journal = p.journal ? `, ${p.journal}` : "";
  const year = p.year || new Date().getFullYear();
  const volume = p.volume ? `, vol. ${p.volume}` : "";
  const issue = p.issue ? `, no. ${p.issue}` : "";
  const pages = p.pages ? `, pp. ${p.pages}` : "";
  const doi = p.doi ? `, doi: ${p.doi}` : "";
  return `${authorList}, "${title}"${journal}${volume}${issue}${pages}${doi}, ${year}.`;
}

export function formatMlaReference(p: {
  authors: string;
  title: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  const authorList = p.authors || "Unknown authors";
  const title = p.title || "Untitled";
  const journal = p.journal ? ` <em>${p.journal}</em>` : "";
  const year = p.year || new Date().getFullYear();
  const volume = p.volume ? `, vol. ${p.volume}` : "";
  const issue = p.issue ? `, no. ${p.issue}` : "";
  const pages = p.pages ? `, pp. ${p.pages}` : "";
  const doi = p.doi ? `, doi:${p.doi}` : "";
  return `${authorList}. "${title}"${journal}${volume}${issue}${pages} (${year})${doi}.`;
}

export function formatHarvardReference(p: {
  authors: string;
  title: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  issue?: string;
  pages?: string;
}): string {
  const year = p.year || new Date().getFullYear();
  const authorList = p.authors || "Unknown authors";
  const title = p.title || "Untitled";
  const journal = p.journal ? `, ${p.journal}` : "";
  const volume = p.volume ? `, vol. ${p.volume}` : "";
  const issue = p.issue ? `, no. ${p.issue}` : "";
  const pages = p.pages ? `, pp. ${p.pages}` : "";
  const doi = p.doi ? ` Available at: https://doi.org/${p.doi}` : "";
  return `${authorList} (${year}) '${title}'${journal}${volume}${issue}${pages}${doi}.`;
}

export function formatReferenceByStyle(
  style: CitationStyle,
  p: {
    authors: string;
    title: string;
    journal?: string;
    year?: number;
    doi?: string;
    volume?: string;
    issue?: string;
    pages?: string;
  }
): string {
  switch (style) {
    case "apa":
      return formatApaReference(p);
    case "ieee":
      return formatIeeeReference(p);
    case "mla":
      return formatMlaReference(p);
    case "harvard":
      return formatHarvardReference(p);
    case "vancouver":
    default:
      return formatVancouverReference(p);
  }
}

export function formatReferenceListByStyle(
  style: CitationStyle,
  papers: { authors: string; title: string; journal?: string; year?: number; doi?: string }[]
): string {
  return papers
    .map((p, i) => {
      const formatted = formatReferenceByStyle(style, p);
      return style === "vancouver" || style === "ieee" ? `${i + 1}. ${formatted}` : formatted;
    })
    .join("\n");
}
