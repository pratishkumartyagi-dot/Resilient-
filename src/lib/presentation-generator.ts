/**
 * Native AI Presentation Generator
 *
 * Generates professional presentations using the app's existing LLM providers
 * (Gemini, Groq, local) without requiring a separate Presenton server.
 * Uses pptxgenjs with professional templates for fully editable PPTX output.
 */

import { callGemini } from "./ai";
import { callGroq } from "./ai";
import { generateLocal } from "./local-llm";

export type LLMProvider = "gemini" | "groq" | "local";

export interface SlideContent {
  title: string;
  content: string;
  layout: "title" | "section" | "content" | "two-column" | "table" | "chart" | "references";
  notes?: string;
}

export interface PresentationPlan {
  title: string;
  subtitle?: string;
  slides: SlideContent[];
}

export interface PresentationOptions {
  topic: string;
  synthesisRows?: Array<{
    reference: string;
    keyFindings: string;
    synopsis: string;
    studyDetails: string;
    researchGaps: string;
  }>;
  selectedPapers?: Array<{
    title: string;
    authors: string;
    journal: string;
    year: number;
    doi?: string;
  }>;
  template?: "academic" | "business" | "minimal" | "conference";
  tone?: "professional" | "educational" | "concise" | "detailed";
  language?: string;
  includeTitleSlide?: boolean;
  includeTableOfContents?: boolean;
  includeReferences?: boolean;
  maxSlides?: number;
  // Optional: pre-built slides as markdown (bypasses AI generation)
  customSlidesMarkdown?: string[];
  // Optional: custom instructions for AI generation
  instructions?: string;
  provider?: LLMProvider;
  apiKey?: string;
}

/**
 * Generate a presentation plan using the configured LLM
 */
export async function generatePresentationPlan(
  options: PresentationOptions
): Promise<PresentationPlan> {
  const {
    topic,
    synthesisRows = [],
    selectedPapers = [],
    template = "academic",
    tone = "professional",
    language = "English",
    includeTitleSlide = true,
    includeTableOfContents = true,
    includeReferences = true,
    maxSlides = 20,
    customSlidesMarkdown,
    instructions,
    provider = "gemini",
    apiKey,
  } = options;

  // If custom slides markdown provided, parse it directly (bypass AI)
  if (customSlidesMarkdown && customSlidesMarkdown.length > 0) {
    return parseCustomSlidesMarkdown(customSlidesMarkdown, topic, includeTitleSlide, includeTableOfContents, includeReferences);
  }

  // Build context from synthesis data
  const context = buildSynthesisContext(synthesisRows, selectedPapers, topic);

  const prompt = buildPresentationPrompt({
    topic,
    context,
    template,
    tone,
    language,
    includeTitleSlide,
    includeTableOfContents,
    includeReferences,
    maxSlides,
    customInstructions: instructions,
  });

  try {
    let response: string;
    if (provider === "gemini" && apiKey) {
      response = await callGemini(apiKey, prompt);
    } else if (provider === "groq" && apiKey) {
      response = await callGroq(apiKey, prompt);
    } else {
      // Use local model
      response = await generateLocal(prompt);
    }
    return parsePresentationResponse(response, topic, includeTitleSlide, includeTableOfContents, includeReferences);
  } catch (error) {
    console.error("LLM generation failed, using fallback:", error);
    return generateFallbackPlan(topic, synthesisRows, selectedPapers, maxSlides);
  }
}

/**
 * Build context string from synthesis data
 */
function buildSynthesisContext(
  synthesisRows: PresentationOptions["synthesisRows"],
  selectedPapers: PresentationOptions["selectedPapers"],
  topic: string
): string {
  let context = `Topic: ${topic}\n\n`;

  if (synthesisRows && synthesisRows.length > 0) {
    context += `Synthesis Data (${synthesisRows.length} studies):\n`;
    synthesisRows.forEach((row, idx) => {
      context += `\nStudy ${idx + 1}: ${row.reference}\n`;
      context += `  Key Findings: ${row.keyFindings.substring(0, 300)}\n`;
      context += `  Synopsis: ${row.synopsis.substring(0, 300)}\n`;
      context += `  Study Details: ${row.studyDetails.substring(0, 200)}\n`;
      context += `  Research Gaps: ${row.researchGaps.substring(0, 200)}\n`;
    });
  }

  if (selectedPapers && selectedPapers.length > 0) {
    context += `\n\nSelected Papers (${selectedPapers.length}):\n`;
    selectedPapers.forEach((paper, idx) => {
      context += `${idx + 1}. ${paper.authors}. "${paper.title}". ${paper.journal} (${paper.year})${paper.doi ? `. DOI: ${paper.doi}` : ""}\n`;
    });
  }

  return context;
}

/**
 * Build the prompt for presentation generation
 */
function buildPresentationPrompt(params: {
  topic: string;
  context: string;
  template: string;
  tone: string;
  language: string;
  includeTitleSlide: boolean;
  includeTableOfContents: boolean;
  includeReferences: boolean;
  maxSlides: number;
  customInstructions?: string;
}): string {
  const { topic, context, template, tone, language, includeTitleSlide, includeTableOfContents, includeReferences, maxSlides, customInstructions } = params;

  return `You are an expert presentation designer creating a professional ${template} presentation on "${topic}".

CONTEXT:
${context}

REQUIREMENTS:
- Language: ${language}
- Tone: ${tone}
- Template style: ${template}
- Maximum slides: ${maxSlides}
- Include title slide: ${includeTitleSlide ? "Yes" : "No"}
- Include table of contents: ${includeTableOfContents ? "Yes" : "No"}
- Include references slide: ${includeReferences ? "Yes" : "No"}
${customInstructions ? `- Custom Instructions: ${customInstructions}` : ""}

SLIDE LAYOUTS AVAILABLE:
1. "title" - Title slide with main title and subtitle
2. "section" - Section divider with large heading
3. "content" - Standard content slide with title and bullet points
4. "two-column" - Two-column layout for comparisons
5. "table" - Data table slide
6. "chart" - Chart/visualization slide (describe what chart to create)
7. "references" - References/bibliography slide

OUTPUT FORMAT (JSON only, no markdown):
{
  "title": "Presentation Title",
  "subtitle": "Optional subtitle",
  "slides": [
    {
      "title": "Slide Title",
      "content": "Slide content as markdown (bullets, paragraphs, tables)",
      "layout": "content",
      "notes": "Optional speaker notes"
    }
  ]
}

GUIDELINES:
- Create a logical flow: Introduction → Background → Methods/Studies → Findings → Discussion → Conclusions → References
- Each slide should have focused, digestible content (max 6-8 bullets)
- Use tables for study comparisons, data summaries
- Include specific data points from the context
- For "chart" layout, describe the chart type and data in content
- Professional academic tone for "academic" template
- Concise executive summary style for "business" template
- Clean, minimal text for "minimal" template
- Conference-ready with clear visual hierarchy for "conference" template`;
}

/**
 * Parse LLM response into PresentationPlan
 */
function parsePresentationResponse(
  response: string,
  topic: string,
  includeTitleSlide: boolean,
  includeTableOfContents: boolean,
  includeReferences: boolean
): PresentationPlan {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.slides && Array.isArray(parsed.slides)) {
        return {
          title: parsed.title || topic,
          subtitle: parsed.subtitle,
          slides: parsed.slides.map((s: any) => ({
            title: s.title || "Untitled",
            content: s.content || "",
            layout: s.layout || "content",
            notes: s.notes,
          })),
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  return generateFallbackPlan(topic, [], [], 15);
}

/**
 * Parse custom slides markdown into PresentationPlan
 * Each markdown string becomes one slide, with # heading as title
 */
function parseCustomSlidesMarkdown(
  slidesMarkdown: string[],
  topic: string,
  includeTitleSlide: boolean,
  includeTableOfContents: boolean,
  includeReferences: boolean
): PresentationPlan {
  const slides: SlideContent[] = [];

  // Title slide
  if (includeTitleSlide) {
    slides.push({
      title: topic,
      content: `Evidence Synthesis Presentation\n${slidesMarkdown.length} slides`,
      layout: "title",
    });
  }

  // Table of Contents
  if (includeTableOfContents) {
    const toc = slidesMarkdown
      .map((s, i) => {
        const titleMatch = s.match(/^#\s+(.+)/);
        return `${i + 1}. ${titleMatch ? titleMatch[1] : `Slide ${i + 1}`}`;
      })
      .join("\n");
    slides.push({
      title: "Table of Contents",
      content: toc,
      layout: "content",
    });
  }

  // Content slides
  slidesMarkdown.forEach((markdown) => {
    const lines = markdown.split("\n");
    const title = lines[0].replace(/^#+\s*/, "") || "Untitled";
    const content = lines.slice(1).join("\n").trim();

    slides.push({
      title,
      content: content || " ",
      layout: "content",
    });
  });

  // References slide placeholder if requested
  if (includeReferences) {
    slides.push({
      title: "References",
      content: "References will be populated from selected papers",
      layout: "references",
    });
  }

  return {
    title: topic,
    subtitle: `Custom Presentation • ${slidesMarkdown.length} Slides`,
    slides,
  };
}

/**
 * Generate fallback presentation plan without LLM
 */
function generateFallbackPlan(
  topic: string,
  synthesisRows: PresentationOptions["synthesisRows"],
  selectedPapers: PresentationOptions["selectedPapers"],
  maxSlides: number
): PresentationPlan {
  const slides: SlideContent[] = [];
  let slideCount = 0;

  // Title slide
  if (slideCount < maxSlides) {
    slides.push({
      title: topic,
      content: `Evidence Synthesis Presentation\n${synthesisRows?.length || 0} studies analyzed\n${selectedPapers?.length || 0} papers selected`,
      layout: "title",
    });
    slideCount++;
  }

  // Table of Contents
  if (slideCount < maxSlides) {
    slides.push({
      title: "Table of Contents",
      content: [
        "1. Introduction & Objectives",
        "2. Search Strategy & Study Selection",
        "3. Study Characteristics",
        "4. Key Findings by Study",
        "5. Synthesis & Meta-Analysis",
        "6. Research Gaps",
        "7. Conclusions & Recommendations",
        "8. References",
      ].map((item, i) => `${i + 1}. ${item}`).join("\n"),
      layout: "content",
    });
    slideCount++;
  }

  // Introduction
  if (slideCount < maxSlides) {
    slides.push({
      title: "Introduction & Objectives",
      content: [
        `Research Topic: ${topic}`,
        "Objective: Synthesize evidence from selected studies",
        `Studies Included: ${synthesisRows?.length || 0}`,
        `Papers Selected: ${selectedPapers?.length || 0}`,
        "Method: Systematic evidence synthesis",
      ].map((b) => `• ${b}`).join("\n"),
      layout: "content",
    });
    slideCount++;
  }

  // Study Characteristics Table
  if (synthesisRows && synthesisRows.length > 0 && slideCount < maxSlides) {
    slides.push({
      title: "Study Characteristics",
      content: synthesisRows.slice(0, 8).map((row, i) => {
        const ref = row.reference.split(".")[0];
        return `| ${i + 1} | ${ref} | ${row.studyDetails.substring(0, 40)} | ${row.keyFindings.substring(0, 50)} |`;
      }).join("\n"),
      layout: "table",
    });
    slideCount++;
  }

  // Key Findings per study (limit to fit maxSlides)
  if (synthesisRows && synthesisRows.length > 0) {
    const maxStudySlides = Math.min(synthesisRows.length, maxSlides - slideCount - 2); // Leave room for gaps/conclusions/refs
    synthesisRows.slice(0, maxStudySlides).forEach((row, idx) => {
      if (slideCount >= maxSlides) return;
      slides.push({
        title: `Study ${idx + 1}: ${row.reference.split(".")[0]}`,
        content: [
          `**Key Findings:** ${row.keyFindings.substring(0, 400)}`,
          `**Synopsis:** ${row.synopsis.substring(0, 300)}`,
          `**Study Details:** ${row.studyDetails.substring(0, 200)}`,
        ].join("\n\n"),
        layout: "content",
      });
      slideCount++;
    });
  }

  // Research Gaps
  if (synthesisRows && synthesisRows.length > 0 && slideCount < maxSlides) {
    const allGaps = synthesisRows.flatMap((r) => r.researchGaps.split("\n")).filter(Boolean).slice(0, 10);
    if (allGaps.length > 0) {
      slides.push({
        title: "Research Gaps Identified",
        content: allGaps.map((g) => `• ${g}`).join("\n"),
        layout: "content",
      });
      slideCount++;
    }
  }

  // Conclusions
  if (slideCount < maxSlides) {
    slides.push({
      title: "Conclusions & Recommendations",
      content: [
        `Evidence synthesized from ${synthesisRows?.length || 0} studies on ${topic}`,
        "Key patterns identified across studies",
        "Methodological limitations noted",
        "Future research priorities established",
        "Clinical/policy implications discussed",
      ].map((b) => `• ${b}`).join("\n"),
      layout: "content",
    });
    slideCount++;
  }

  // References
  if (selectedPapers && selectedPapers.length > 0 && slideCount < maxSlides) {
    slides.push({
      title: "References",
      content: selectedPapers.slice(0, 15).map((p, i) =>
        `${i + 1}. ${p.authors}. ${p.title}. ${p.journal} (${p.year})${p.doi ? `. DOI: ${p.doi}` : ""}`
      ).join("\n\n"),
      layout: "references",
    });
  }

  return {
    title: topic,
    subtitle: `Evidence Synthesis • ${synthesisRows?.length || 0} Studies • ${selectedPapers?.length || 0} Papers`,
    slides,
  };
}

/**
 * Get the best available provider based on configured keys
 */
export function getBestProvider(state: { geminiApiKey: string; groqApiKey: string }): { provider: LLMProvider; apiKey: string } {
  if (state.geminiApiKey) return { provider: "gemini", apiKey: state.geminiApiKey };
  if (state.groqApiKey) return { provider: "groq", apiKey: state.groqApiKey };
  return { provider: "local", apiKey: "" };
}