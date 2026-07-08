import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface WebSearchResult {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  abstract: string;
  url: string;
  database: string;
  studyType: string;
  citationCount: number;
  source: string;
}

function extractYear(text: string): number {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : new Date().getFullYear();
}

function classifyStudyType(title: string, abstract: string): string {
  const text = `${title} ${abstract}`.toLowerCase();
  if (/\bsystematic review\b|\bmeta.analysis\b|\bmeta analysis\b/.test(text)) return "Systematic Review";
  if (/\brandomized controlled trial\b|\brct\b/.test(text)) return "Randomized Controlled Trial (RCT)";
  if (/\bcohort study\b|\bprospective cohort\b|\bretrospective cohort\b/.test(text)) return "Cohort Study";
  if (/\bcase.control\b/.test(text)) return "Case-Control Study";
  if (/\bcross.sectional\b/.test(text)) return "Cross-Sectional Study";
  if (/\bclinical trial\b/.test(text)) return "Clinical Trial";
  if (/\bqualitative\b|\binterview\b|\bfocus group\b/.test(text)) return "Qualitative Study";
  if (/\bcase report\b|\bcase series\b/.test(text)) return "Case Report / Case Series";
  if (/\breview article\b|\bnarrative review\b|\bliterature review\b/.test(text)) return "Review Article";
  if (/\bguideline\b|\bconsensus\b|\brecommendation\b/.test(text)) return "Guideline / Consensus Statement";
  if (/\bdissertation\b|\bthesis\b/.test(text)) return "Dissertation / Thesis";
  return "Observational Study";
}

function buildTavilyPapers(results: any[], maxResults: number): WebSearchResult[] {
  return results.slice(0, maxResults).map((r: any, i: number) => {
    const url = r.url || "";
    const title = r.title || "";
    const abstract = (r.content || r.snippet || "").substring(0, 3000);
    const year = extractYear(`${title} ${abstract} ${url}`);
    const authors = r.authors?.join(", ") || "Unknown authors";
    const doiMatch = url.match(/10\.\d{4,}\/[^?#]+/) || (r.title || "").match(/10\.\d{4,}\/[^?#]+/);
    const doi = doiMatch ? doiMatch[0] : "";

    return {
      id: `web-${Date.now()}-${i}`,
      title,
      authors,
      year,
      journal: r.domain || "Web Search",
      doi,
      abstract,
      url,
      database: "Web Search",
      studyType: classifyStudyType(title, abstract),
      citationCount: 0,
      source: "web-search",
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query: string = body.query || "";
    const maxResults: number = Math.min(body.maxResults || 10, 20);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    const tavilyKey = process.env.TAVILY_API_KEY;

    if (tavilyKey) {
      try {
        const searchQuery = `${query} academic paper research study`;
        const resp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: searchQuery,
            max_results: maxResults,
            search_depth: "basic",
            include_domains: [
              "pubmed.ncbi.nlm.nih.gov",
              "scholar.google.com",
              "doi.org",
              "springer.com",
              "sciencedirect.com",
              "wiley.com",
              "nature.com",
              "science.org",
              "ncbi.nlm.nih.gov",
              "pmc.ncbi.nlm.nih.gov",
              "arxiv.org",
              "bioRxiv",
              "medRxiv",
              "core.ac.uk",
              "semanticscholar.org",
            ],
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const papers = buildTavilyPapers(data.results || [], maxResults);
          if (papers.length > 0) {
            return NextResponse.json({
              query,
              total: papers.length,
              papers,
              sourceBreakdown: { "Web Search": papers.length },
              sourcesUsed: ["tavily"],
              errors: {},
            });
          }
        }
      } catch {
        // ignore Tavily failure and fall through to arXiv
      }
    }

    const arxivQuery = encodeURIComponent(`all:${query}`);
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=${arxivQuery}&start=0&max_results=${Math.min(maxResults, 20)}`;
    const arxivResp = await fetch(arxivUrl, { headers: { Accept: "application/xml" } });
    if (!arxivResp.ok) {
      return NextResponse.json({ error: `arXiv search failed: ${arxivResp.status}` }, { status: 502 });
    }
    const arxivText = await arxivResp.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(arxivText, "application/xml");
    const entries = xmlDoc.querySelectorAll("entry");
    const papers: WebSearchResult[] = Array.from(entries)
      .slice(0, maxResults)
      .map((entry, i) => {
        const title = entry.querySelector("title")?.textContent?.trim() || "";
        const summary = entry.querySelector("summary")?.textContent?.trim() || "";
        const authors = Array.from(entry.querySelectorAll("author name"))
          .map((n) => n.textContent?.trim() || "")
          .filter(Boolean)
          .join(", ");
        const year = extractYear(summary);
        const id = entry.querySelector("id")?.textContent?.trim() || `arxiv-${Date.now()}-${i}`;
        const doiMatch = summary.match(/10\.\d{4,}\/[^?#\s]+/) || title.match(/10\.\d{4,}\/[^?#\s]+/);
        const doi = doiMatch ? doiMatch[0] : "";
        const link = entry.querySelector("link[href]")?.getAttribute("href") || id;

        return {
          id: `arxiv-${id.split("/").pop() || i}`,
          title,
          authors: authors || "Unknown authors",
          year,
          journal: "arXiv",
          doi,
          abstract: summary.substring(0, 3000),
          url: link,
          database: "arXiv",
          studyType: classifyStudyType(title, summary),
          citationCount: 0,
          source: "arxiv",
        };
      });

    return NextResponse.json({
      query,
      total: papers.length,
      papers,
      sourceBreakdown: { arXiv: papers.length },
      sourcesUsed: ["arxiv"],
      errors: {},
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
