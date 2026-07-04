export interface CitationVerificationResult {
  doi: string;
  valid: boolean;
  title?: string;
  message: string;
  source: "crossref" | "openalex" | "pubmed" | "none";
  formattedCitation?: string;
}

export async function verifyCitationViaCrossref(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `Crossref lookup failed: HTTP ${res.status}`, source: "crossref" };
    const data = await res.json();
    const work = data.message;
    const title = work.title?.[0] || "";
    return {
      doi,
      valid: true,
      title,
      message: "DOI verified via Crossref",
      source: "crossref",
      formattedCitation: formatCitation(work, "apa"),
    };
  } catch (err: any) {
    return { doi, valid: false, message: `Crossref lookup failed: ${err.message}`, source: "crossref" };
  }
}

export async function verifyCitationViaOpenAlex(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `OpenAlex lookup failed: HTTP ${res.status}`, source: "openalex" };
    const data = await res.json();
    const title = data.title || "";
    return {
      doi,
      valid: true,
      title,
      message: "DOI verified via OpenAlex",
      source: "openalex",
      formattedCitation: formatOpenAlexCitation(data),
    };
  } catch (err: any) {
    return { doi, valid: false, message: `OpenAlex lookup failed: ${err.message}`, source: "openalex" };
  }
}

export async function verifyCitationViaPubMed(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}&retmode=json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `PubMed lookup failed: HTTP ${res.status}`, source: "pubmed" };
    const data = await res.json();
    const pmids = data.esearchresult?.idlist || [];
    if (pmids.length === 0) return { doi, valid: false, message: "DOI not found in PubMed", source: "pubmed" };
    return {
      doi,
      valid: true,
      message: `DOI found in PubMed (PMID: ${pmids[0]})`,
      source: "pubmed",
    };
  } catch (err: any) {
    return { doi, valid: false, message: `PubMed lookup failed: ${err.message}`, source: "pubmed" };
  }
}

export async function verifyCitationWithFallback(doi: string): Promise<CitationVerificationResult> {
  const crossref = await verifyCitationViaCrossref(doi);
  if (crossref.valid) return crossref;

  const openalex = await verifyCitationViaOpenAlex(doi);
  if (openalex.valid) return openalex;

  const pubmed = await verifyCitationViaPubMed(doi);
  return pubmed;
}

export async function batchVerifyCitations(dois: string[]): Promise<CitationVerificationResult[]> {
  const uniqueDois = Array.from(new Set(dois.filter((d) => d && d.length > 4)));
  const results = await Promise.allSettled(uniqueDois.map((doi) => verifyCitationWithFallback(doi)));
  return results.map((r, idx) => (r.status === "fulfilled" ? r.value : { doi: uniqueDois[idx], valid: false, message: "Verification failed", source: "none" as const }));
}

function formatCitation(work: any, style: "apa" | "ieee"): string {
  const authors = work.author || [];
  const authorStr = authors.length > 0
    ? authors.slice(0, 3).map((a: any) => `${a.family || ""}, ${a.given?.[0] || ""}.`).join(", ") + (authors.length > 3 ? " et al." : "")
    : "Unknown";
  const year = work.published?.["date-parts"]?.[0]?.[0] || work.published || "n.d.";
  const title = work.title?.[0] || "";
  const journal = work["container-title"]?.[0] || "";
  const volume = work.volume || "";
  const issue = work.issue ? `(${work.issue})` : "";
  const page = work.page || "";

  if (style === "apa") {
    return `${authorStr} (${year}). ${title}. <em>${journal}</em>, ${volume}${issue}, ${page}. ${work.DOI ? `https://doi.org/${work.DOI}` : ""}`;
  }
  return `${authorStr}, "${title}," <em>${journal}</em>, vol. ${volume}, no. ${issue}, p. ${page}, ${year}.`;
}

function formatOpenAlexCitation(work: any): string {
  const authors = work.authorships || [];
  const authorStr = authors.length > 0
    ? authors.slice(0, 3).map((a: any) => `${a.author?.display_name?.split(" ").slice(-1)[0] || ""}, ${(a.author?.display_name?.split(" ").slice(0, -1) || []).map((n: string) => n[0]).join(".")}.`).join(", ") + (authors.length > 3 ? " et al." : "")
    : "Unknown";
  const year = work.publication_year || "n.d.";
  const title = work.title || "";
  const journal = work.host_venue?.display_name || "";
  const doi = work.doi || "";

  return `${authorStr} (${year}). ${title}. <em>${journal}</em>. ${doi ? `https://doi.org/${doi}` : ""}`;
}

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
