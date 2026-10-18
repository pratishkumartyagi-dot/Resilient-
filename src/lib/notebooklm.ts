/**
 * NotebookLM integration (https://notebooklm.google.com/).
 *
 * NotebookLM has no public API, so this module produces a "Notebook Kit" that
 * mirrors NotebookLM's output formats (source pack, briefing doc, study guide,
 * FAQ, timeline, audio-overview script) from an evidence-synthesis report.
 * The source pack can be uploaded directly as NotebookLM sources; the derived
 * documents can be pasted into a notebook or used offline.
 */

export const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

export interface NotebookLMSource {
  id?: string;
  title: string;
  authors?: string;
  year?: number;
  doi?: string;
  url?: string;
  content?: string;
}

export interface NotebookLMKitOptions {
  reviewTitle: string;
  reviewType: string;
  query: string;
  reportMarkdown: string;
  sources: NotebookLMSource[];
  metaSummary?: string;
}

export interface NotebookLMKit {
  sourcePack: string;
  briefingDoc: string;
  studyGuide: string;
  faq: string;
  timeline: string;
  audioOverviewScript: string;
  prompts: string[];
}

export function notebookLMUrl(): string {
  return NOTEBOOKLM_URL;
}

export function openNotebookLM(): void {
  if (typeof window !== "undefined") {
    window.open(NOTEBOOKLM_URL, "_blank", "noopener,noreferrer");
  }
}

function citationFor(source: NotebookLMSource, index: number): string {
  const authors = source.authors || "Unknown authors";
  const year = source.year ? ` (${source.year})` : "";
  const doi = source.doi ? ` https://doi.org/${source.doi.replace(/^https?:\/\/doi\.org\//, "")}` : source.url ? ` ${source.url}` : "";
  return `[S${index + 1}] ${authors}${year}. ${source.title}.${doi}`;
}

export function buildNotebookLMSourcePack(opts: NotebookLMKitOptions): string {
  const { reviewTitle, reviewType, query, reportMarkdown, sources, metaSummary } = opts;

  const header = [
    `# NotebookLM Source Pack — ${reviewTitle}`,
    "",
    `- **Review type:** ${reviewType}`,
    `- **Research question:** ${query || "Not specified"}`,
    `- **Sources:** ${sources.length}`,
    `- **Generated:** ${new Date().toISOString().split("T")[0]}`,
    "",
    "> Upload this file to NotebookLM as a source. Citations use the [S#] keys listed below so answers remain grounded.",
    "",
  ].join("\n");

  const sourceList = sources.length
    ? ["## Source Bibliography", "", ...sources.map((s, i) => citationFor(s, i)), ""].join("\n")
    : "## Source Bibliography\n\nNo sources attached.\n";

  const summaryBlock = metaSummary ? ["## Quantitative Summary", "", metaSummary, ""].join("\n") : "";

  return [header, summaryBlock, sourceList, "## Full Report", "", reportMarkdown].join("\n");
}

function extractSections(markdown: string): { heading: string; body: string }[] {
  const sections: { heading: string; body: string }[] = [];
  const lines = markdown.split("\n");
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: m[2].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections.filter((s) => s.body.length > 0);
}

function keyBullets(markdown: string, limit = 12): string[] {
  const bullets: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
      if (bullets.length >= limit) break;
    }
  }
  return bullets;
}

export function buildNotebookLMBriefingDoc(opts: NotebookLMKitOptions): string {
  const sections = extractSections(opts.reportMarkdown);
  const bullets = keyBullets(opts.reportMarkdown, 10);
  const stats = opts.metaSummary ? [opts.metaSummary] : [];
  return [
    `# Briefing Doc — ${opts.reviewTitle}`,
    "",
    `**Review type:** ${opts.reviewType}`,
    `**Research question:** ${opts.query || "Not specified"}`,
    "",
    "## Executive Summary",
    "",
    ...stats.map((s) => `- ${s}`),
    ...bullets.map((b) => `- ${b}`),
    "",
    "## Section Highlights",
    "",
    ...sections
      .slice(0, 8)
      .map((s) => `### ${s.heading}\n\n${s.body.split("\n").slice(0, 6).join("\n")}`),
    "",
    "*Generated in the NotebookLM briefing-document format.*",
  ].join("\n");
}

export function buildNotebookLMStudyGuide(opts: NotebookLMKitOptions): string {
  const sections = extractSections(opts.reportMarkdown);
  const questions = sections.slice(0, 8).map((s, i) => {
    const firstLine = s.body.split("\n").find((l) => l.trim().length > 0) || "";
    return `${i + 1}. **${s.heading}:** ${firstLine.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").slice(0, 220)}`;
  });

  const glossaryTerms = [
    ["Effect size", "A quantitative measure of the strength of a phenomenon or association."],
    ["Heterogeneity", "Variation in effect estimates beyond chance across studies."],
    ["I²", "Percentage of variability in effect estimates attributable to heterogeneity."],
    ["τ²", "Estimated between-study variance in a random-effects model."],
    ["Prediction interval", "Range of effects expected in a future study."],
    ["Risk of bias", "Systematic error introduced by study design or conduct."],
    ["GRADE", "Framework for rating certainty of a body of evidence."],
    ["PRISMA", "Preferred Reporting Items for Systematic Reviews and Meta-Analyses."],
  ];

  return [
    `# Study Guide — ${opts.reviewTitle}`,
    "",
    "## Key Questions and Answers",
    "",
    ...questions,
    "",
    "## Glossary",
    "",
    "| Term | Definition |",
    "| --- | --- |",
    ...glossaryTerms.map(([t, d]) => `| ${t} | ${d} |`),
    "",
    "## Review Checklist",
    "",
    "- [ ] Verify the study selection flow against PRISMA 2020.",
    "- [ ] Confirm risk-of-bias judgments for each included study.",
    "- [ ] Check the pooled estimate, confidence interval, and heterogeneity statistics.",
    "- [ ] Reconcile the certainty-of-evidence rating with the GRADE domains.",
    "",
    "*Generated in the NotebookLM study-guide format.*",
  ].join("\n");
}

export function buildNotebookLMFaq(opts: NotebookLMKitOptions): string {
  const sections = extractSections(opts.reportMarkdown);
  const faqs: string[] = [];
  for (const s of sections.slice(0, 8)) {
    const firstLine = s.body.split("\n").find((l) => l.trim().length > 0) || "";
    faqs.push(`**Q: What does the "${s.heading}" section report?**`);
    faqs.push(`A: ${firstLine.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").slice(0, 320)}`);
    faqs.push("");
  }
  return [
    `# Frequently Asked Questions — ${opts.reviewTitle}`,
    "",
    `**Research question:** ${opts.query || "Not specified"}`,
    "",
    ...(faqs.length > 0 ? faqs : ["No section content available to derive FAQs."]),
    "",
    "*Generated in the NotebookLM FAQ format.*",
  ].join("\n");
}

export function buildNotebookLMTimeline(opts: NotebookLMKitOptions): string {
  const years = opts.sources
    .filter((s) => typeof s.year === "number")
    .sort((a, b) => (a.year || 0) - (b.year || 0));
  if (years.length === 0) {
    return `# Timeline — ${opts.reviewTitle}\n\nNo dated sources were available to build a timeline.\n`;
  }
  return [
    `# Timeline — ${opts.reviewTitle}`,
    "",
    ...years.map((s) => `- **${s.year}** — ${s.authors || "Unknown authors"}. ${s.title}.`),
    "",
    "*Generated in the NotebookLM timeline format.*",
  ].join("\n");
}

export function buildNotebookLMAudioOverviewScript(opts: NotebookLMKitOptions): string {
  const sections = extractSections(opts.reportMarkdown);
  const key = keyBullets(opts.reportMarkdown, 6);
  const lines = [
    `# Audio Overview Script — ${opts.reviewTitle}`,
    "",
    "**Host A:** Welcome. Today we're discussing a systematic review on " + (opts.query || opts.reviewTitle) + ".",
    "**Host B:** Let's start with the scope. This is a " + opts.reviewType.toLowerCase() + ".",
    opts.metaSummary ? `**Host A:** The headline statistic: ${opts.metaSummary}` : "",
    ...sections.slice(0, 5).flatMap((s) => [
      `**Host B:** Moving to ${s.heading}.`,
      `**Host A:** ${s.body.split("\n").find((l) => l.trim().length > 0)?.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").slice(0, 260) || ""}`,
    ]),
    ...key.slice(0, 4).map((k) => `**Host B:** One key point: ${k}`),
    "**Host A:** That's a useful summary of the evidence base.",
    "**Host B:** Thanks for listening.",
    "",
    "*Generated as a NotebookLM audio-overview outline.*",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function buildNotebookLMKit(opts: NotebookLMKitOptions): NotebookLMKit {
  return {
    sourcePack: buildNotebookLMSourcePack(opts),
    briefingDoc: buildNotebookLMBriefingDoc(opts),
    studyGuide: buildNotebookLMStudyGuide(opts),
    faq: buildNotebookLMFaq(opts),
    timeline: buildNotebookLMTimeline(opts),
    audioOverviewScript: buildNotebookLMAudioOverviewScript(opts),
    prompts: [
      "Summarize the pooled effect and interpret it in plain language for a clinician.",
      "List the three most important limitations and their implications for practice.",
      "Compare the risk-of-bias findings across studies and identify the highest-risk domains.",
      "Draft a 150-word abstract grounded strictly in the uploaded sources.",
      "Identify evidence gaps and propose two future research questions.",
    ],
  };
}

export function renderNotebookLMKitMarkdown(kit: NotebookLMKit): string {
  return [
    "## NotebookLM Research Notebook",
    "",
    "NotebookLM has no public API; this Notebook Kit mirrors its output formats. Upload the Source Pack as a source, then use the prompts below.",
    "",
    "### NotebookLM Source Pack",
    "",
    "```markdown",
    kit.sourcePack,
    "```",
    "",
    "### Briefing Doc",
    "",
    kit.briefingDoc,
    "",
    "### Study Guide",
    "",
    kit.studyGuide,
    "",
    "### FAQ",
    "",
    kit.faq,
    "",
    "### Timeline",
    "",
    kit.timeline,
    "",
    "### Audio Overview Script",
    "",
    kit.audioOverviewScript,
    "",
    "### Suggested NotebookLM Prompts",
    "",
    ...kit.prompts.map((p) => `- ${p}`),
    "",
    `*Open NotebookLM: ${NOTEBOOKLM_URL}*`,
  ].join("\n");
}
