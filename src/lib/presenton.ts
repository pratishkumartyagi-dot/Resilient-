/**
 * Presenton AI Presentation Generator Integration
 *
 * Presenton is an open-source AI presentation generator that can create
 * fully editable PPTX files from prompts, documents, or structured markdown.
 *
 * API Documentation: https://docs.presenton.ai/v3/get-started/api-introduction
 * GitHub: https://github.com/presenton/presenton
 */

export interface PresentonGenerateRequest {
  content: string;
  slides_markdown?: string[] | null;
  instructions?: string | null;
  tone?: "default" | "casual" | "professional" | "funny" | "educational" | "sales_pitch";
  verbosity?: "concise" | "standard" | "text-heavy";
  web_search?: boolean;
  n_slides?: number;
  language?: string;
  template?: string;
  include_table_of_contents?: boolean;
  include_title_slide?: boolean;
  files?: string[] | null;
  export_as?: "pptx" | "pdf";
}

export interface PresentonGenerateResponse {
  presentation_id: string;
  path: string;
  edit_path: string;
}

export interface PresentonJobStatus {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  result?: PresentonGenerateResponse;
  error?: string;
}

/**
 * Test connection to Presenton server
 */
export async function testPresentonConnection(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Short timeout for connection test
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      ok: false,
      error: `HTTP ${response.status}: ${errorData.detail || response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Generate a presentation using Presenton API
 * Uses the standard generation endpoint (not smart mode)
 */
export async function generatePresentation(
  baseUrl: string,
  apiKey: string,
  request: PresentonGenerateRequest
): Promise<PresentonGenerateResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/ppt/presentation/generate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(300000), // 5 min timeout for generation
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Presenton API error (${response.status}): ${errorData.detail || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Poll job status for async generation (smart mode or template generation)
 */
export async function getJobStatus(
  baseUrl: string,
  apiKey: string,
  jobId: string
): Promise<PresentonJobStatus> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/ppt/jobs/${jobId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Presenton job status error (${response.status}): ${errorData.detail || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Download the generated presentation file
 */
export async function downloadPresentation(
  baseUrl: string,
  apiKey: string,
  filePath: string
): Promise<Blob> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/ppt/files/download`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: filePath }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Presenton download error (${response.status}): ${errorData.detail || response.statusText}`
    );
  }

  return response.blob();
}

/**
 * Upload reference files for document-based generation
 */
export async function uploadFiles(
  baseUrl: string,
  apiKey: string,
  files: Array<{ name: string; content: string; mimeType: string }>
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/ppt/files/upload`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Presenton upload error (${response.status}): ${errorData.detail || response.statusText}`
    );
  }

  const data = await response.json();
  return data.paths || [];
}

/**
 * Convert synthesis table and selected papers to slides_markdown format
 * for Presenton generation
 */
export function buildSlidesMarkdownFromSynthesis(
  synthesisRows: Array<{
    reference: string;
    keyFindings: string;
    synopsis: string;
    studyDetails: string;
    researchGaps: string;
  }>,
  selectedPapers: Array<{
    title: string;
    authors: string;
    journal: string;
    year: number;
    doi?: string;
  }>,
  topic: string
): string[] {
  const slides: string[] = [];

  // Title slide
  slides.push(
    `# ${topic}\n\nEvidence Synthesis Presentation\n\nGenerated from ${selectedPapers.length} selected studies`
  );

  // Overview slide
  slides.push(
    `# Study Overview\n\n` +
      `| Study | Design | Key Finding |\n` +
      `|-------|--------|-------------|\n` +
      synthesisRows
        .map((row) => {
          const ref = row.reference.split(".")[0]; // First author et al.
          const finding = row.keyFindings.substring(0, 80) + "...";
          return `| ${ref} | ${row.studyDetails.substring(0, 30)} | ${finding} |`;
        })
        .slice(0, 10)
        .join("\n")
  );

  // Key findings per study
  synthesisRows.forEach((row, idx) => {
    slides.push(
      `# ${row.reference}\n\n` +
        `## Key Findings\n${row.keyFindings}\n\n` +
        `## Synopsis\n${row.synopsis}\n\n` +
        `## Study Details\n${row.studyDetails}\n\n` +
        `## Research Gaps\n${row.researchGaps}`
    );
  });

  // Research gaps summary
  const allGaps = synthesisRows.flatMap((r) => r.researchGaps.split("\n")).filter(Boolean);
  if (allGaps.length > 0) {
    slides.push(
      `# Research Gaps Identified\n\n` + allGaps.slice(0, 15).map((g) => `- ${g}`).join("\n")
    );
  }

  // References slide
  const refs = selectedPapers
    .map((p, i) => `${i + 1}. ${p.authors}. ${p.title}. ${p.journal} (${p.year}).${p.doi ? ` DOI: ${p.doi}` : ""}`)
    .join("\n\n");
  slides.push(`# References\n\n${refs}`);

  return slides;
}