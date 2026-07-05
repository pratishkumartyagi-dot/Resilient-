export interface CitationVerificationResult {
  doi: string;
  valid: boolean;
  title?: string;
  message: string;
  source: "doi-org" | "crossref" | "openalex" | "pubmed" | "osti" | "arxiv" | "none";
  formattedCitation?: string;
}

export async function verifyCitationViaDoiOrg(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const cleanDoi = doi.replace(/https?:\/\/(?:doi\.org|dx\.doi\.org)\//, "").trim();
    const url = `https://doi.org/api/handles/${encodeURIComponent(cleanDoi)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `DOI resolution failed: HTTP ${res.status}`, source: "doi-org" };
    const data = await res.json();
    if (data.responseCode === 1) {
      return { doi, valid: true, message: "DOI exists (verified via doi.org)", source: "doi-org" };
    }
    if (data.responseCode === 100) {
      return { doi, valid: false, message: "DOI does not exist", source: "doi-org" };
    }
    return { doi, valid: false, message: `DOI resolution error: ${data.message || "unknown"}`, source: "doi-org" };
  } catch (err: any) {
    return { doi, valid: false, message: `DOI resolution failed: ${err.message}`, source: "doi-org" };
  }
}

export async function verifyCitationViaCrossref(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const url = `https://api.crossref.org/v1/works/${encodeURIComponent(doi)}`;
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

export async function verifyCitationViaCrossrefBibliographic(query: string): Promise<CitationVerificationResult> {
  if (!query || query.length < 5) return { doi: query, valid: false, message: "Query too short for Crossref search", source: "none" };

  try {
    const url = `https://api.crossref.org/v1/works?query.bibliographic=${encodeURIComponent(query)}&rows=2`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi: query, valid: false, message: `Crossref bibliographic search failed: HTTP ${res.status}`, source: "crossref" };
    const data = await res.json();
    const items = data.message?.items || [];
    if (items.length === 0) return { doi: query, valid: false, message: "No Crossref results", source: "crossref" };

    const best = items[0];
    const second = items[1];
    const bestScore = best.score || 0;
    const secondScore = second?.score || 0;

    if (bestScore >= 80 && bestScore - secondScore >= 20) {
      const title = best.title?.[0] || "";
      return {
        doi: best.DOI || query,
        valid: true,
        title,
        message: `Crossref match (score: ${bestScore.toFixed(1)})`,
        source: "crossref",
        formattedCitation: formatCitation(best, "apa"),
      };
    }

    return { doi: query, valid: false, message: `Crossref inconclusive (best score: ${bestScore.toFixed(1)}, gap: ${(bestScore - secondScore).toFixed(1)})`, source: "crossref" };
  } catch (err: any) {
    return { doi: query, valid: false, message: `Crossref bibliographic search failed: ${err.message}`, source: "crossref" };
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

export async function verifyCitationViaOsti(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const url = `https://www.osti.gov/api/v1/records?doi=${encodeURIComponent(doi)}&per_page=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `OSTI lookup failed: HTTP ${res.status}`, source: "osti" };
    const data = await res.json();
    const records = data.records || [];
    if (records.length === 0) return { doi, valid: false, message: "DOI not found in OSTI", source: "osti" };
    const record = records[0];
    return {
      doi,
      valid: true,
      title: record.title || undefined,
      message: `DOI verified via OSTI (ID: ${record.osti_id})`,
      source: "osti",
    };
  } catch (err: any) {
    return { doi, valid: false, message: `OSTI lookup failed: ${err.message}`, source: "osti" };
  }
}

export async function verifyCitationViaArxiv(doi: string): Promise<CitationVerificationResult> {
  if (!doi || doi.length < 5) return { doi, valid: false, message: "Missing or invalid DOI", source: "none" };

  try {
    const cleanDoi = doi.replace(/https?:\/\/(?:doi\.org|dx\.doi\.org)\//, "").trim();
    const url = `https://export.arxiv.org/api/query?search_query=doi:${encodeURIComponent(cleanDoi)}&max_results=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { doi, valid: false, message: `arXiv lookup failed: HTTP ${res.status}`, source: "arxiv" };
    const text = await res.text();
    const entryMatch = text.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return { doi, valid: false, message: "DOI not found in arXiv", source: "arxiv" };
    const titleMatch = entryMatch[1].match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    return {
      doi,
      valid: true,
      title: title || undefined,
      message: "DOI verified via arXiv",
      source: "arxiv",
    };
  } catch (err: any) {
    return { doi, valid: false, message: `arXiv lookup failed: ${err.message}`, source: "arxiv" };
  }
}

export async function verifyCitationWithFallback(doi: string): Promise<CitationVerificationResult> {
  const doiOrg = await verifyCitationViaDoiOrg(doi);
  if (doiOrg.valid) return doiOrg;

  const crossref = await verifyCitationViaCrossref(doi);
  if (crossref.valid) return crossref;

  const openalex = await verifyCitationViaOpenAlex(doi);
  if (openalex.valid) return openalex;

  const pubmed = await verifyCitationViaPubMed(doi);
  if (pubmed.valid) return pubmed;

  const osti = await verifyCitationViaOsti(doi);
  if (osti.valid) return osti;

  const arxiv = await verifyCitationViaArxiv(doi);
  if (arxiv.valid) return arxiv;

  const fallbackQuery = `${doi} paper research`;
  const crossrefBib = await verifyCitationViaCrossrefBibliographic(fallbackQuery);
  if (crossrefBib.valid) return crossrefBib;

  return { doi, valid: false, message: "DOI could not be verified via any source", source: "none" };
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
