// Autonomous AI Researcher agent.
//
// Modelled on the multi-agent loop in https://github.com/hkuds/ai-researcher
// (literature survey -> idea generation -> research plan -> critical appraisal
// -> manuscript drafting). Runs server-side and calls the LLM providers directly
// with absolute URLs so it works from Next.js API routes (no client-only local
// model, no relative "/api/chat" fetch on the server).
//
// The agent is driven by the app's configured Gemini API key (Groq fallback),
// the same key the user configures in Settings.

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GROQ_MODEL = "openai/gpt-oss-120b";
const REQUEST_TIMEOUT_MS = 60_000;

export interface ResearchAgentInput {
  query: string;
  references: string;
  apiKey: string;
  /** Preferred provider; the other provider is used as fallback. */
  provider?: "gemini" | "groq";
}

export interface ResearchAgentStage {
  name: string;
  content: string;
  durationMs: number;
}

export interface ResearchAgentOutput {
  query: string;
  references: string;
  literatureSurvey: string;
  researchIdea: string;
  researchPlan: string;
  critique: string;
  manuscript: string;
  stages: ResearchAgentStage[];
  createdAt: number;
}

const SYSTEM = `You are an autonomous AI research agent. Ground every claim in the provided references. Grade evidence strength as T1 (Mechanistic), T2 (Functional), T3 (Associational), T4 (Mention). If evidence is insufficient, say so explicitly rather than speculating. Be rigorous, concise, and actionable. Output in markdown.`;

function geminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout(geminiUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${SYSTEM}\n\n${prompt}` }] }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: `${SYSTEM}\n\n${prompt}` }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty content");
  return text;
}

/** Call the LLM with the preferred provider first, then fallback. No local model on the server. */
async function generateText(prompt: string, input: ResearchAgentInput): Promise<string> {
  const order: Array<"gemini" | "groq"> = input.provider
    ? [input.provider, ...(["gemini", "groq"] as const).filter((p) => p !== input.provider)]
    : ["gemini", "groq"];

  let lastError: unknown;
  for (const provider of order) {
    try {
      if (provider === "gemini") return await callGemini(input.apiKey, prompt);
      return await callGroq(input.apiKey, prompt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("All AI providers failed");
}

function timed<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, durationMs: Date.now() - start }));
}

// ---------------------------------------------------------------------------
// Stage prompts (each builds on the previous stage outputs)
// ---------------------------------------------------------------------------

function literatureSurveyPrompt(query: string, references: string): string {
  return `Stage 1 — Literature Survey.

Research query:
${query}

Reference papers / literature:
${references || "(no references provided)"}

Task: Produce a structured literature survey.
1. Evidence inventory — for each reference: authors/year, core claim, evidence grade (T1–T4), relevance to the query.
2. Synthesis — what is established, where sources agree or conflict.
3. Evidence gaps — what is missing or under-studied relative to the query.
4. Limitations of the provided references.

Ground every claim in the references above. Grade every claim T1–T4. If the references do not support a claim, mark it [EVIDENCE MISSING]. Output in markdown.`;
}

function researchIdeaPrompt(query: string, survey: string): string {
  return `Stage 2 — Research Idea Generation.

Research query:
${query}

Literature survey:
${survey}

Task: Propose ONE novel research idea that addresses an evidence gap identified above.
- Title of the proposed study
- Research question / hypothesis
- Innovation — what is new versus the references
- Gap addressed (cite the survey gap)
- Expected contribution and significance
- Feasibility considerations

Output in markdown.`;
}

function researchPlanPrompt(query: string, survey: string, idea: string): string {
  return `Stage 3 — Research Plan.

Research query:
${query}

Literature survey:
${survey}

Proposed idea:
${idea}

Task: Create a concrete research plan.
- Aims and objectives
- Study design
- Participants / data / setting
- Inclusion and exclusion criteria
- Primary and secondary outcomes
- Methods and procedures
- Analysis plan
- Timeline and milestones
- Expected outputs

Output in markdown.`;
}

function critiquePrompt(query: string, survey: string, idea: string, plan: string): string {
  return `Stage 4 — Critical Appraisal (Judge).

Research query:
${query}

Literature survey:
${survey}

Proposed idea:
${idea}

Research plan:
${plan}

Task: Act as a skeptical reviewer. Critique the idea and plan.
- Strengths
- Weaknesses and risks
- Feasibility concerns
- Remaining evidence gaps
- Recommended refinements
- Verdict: proceed / revise / reject, with rationale

Output in markdown.`;
}

function manuscriptPrompt(query: string, survey: string, idea: string, plan: string, critique: string): string {
  return `Stage 5 — Manuscript Draft.

Research query:
${query}

Literature survey:
${survey}

Proposed idea:
${idea}

Research plan:
${plan}

Critique and refinements:
${critique}

Task: Draft a complete research manuscript.
- Title
- Abstract (background, aim, methods, expected results, conclusion)
- Introduction (problem, gap, rationale)
- Methods (design, participants, procedures, analysis)
- Anticipated results / discussion
- Conclusion
- References (list the provided references)

Output in markdown.`;
}

/** Run the full autonomous research loop and return every stage output. */
export async function runResearchAgent(input: ResearchAgentInput): Promise<ResearchAgentOutput> {
  if (!input.query.trim()) throw new Error("Research query is required");
  if (!input.apiKey.trim()) throw new Error("API key is required");

  const { result: literatureSurvey, durationMs: d1 } = await timed(
    "Literature Survey",
    () => generateText(literatureSurveyPrompt(input.query, input.references), input),
  );

  const { result: researchIdea, durationMs: d2 } = await timed(
    "Research Idea",
    () => generateText(researchIdeaPrompt(input.query, literatureSurvey), input),
  );

  const { result: researchPlan, durationMs: d3 } = await timed(
    "Research Plan",
    () => generateText(researchPlanPrompt(input.query, literatureSurvey, researchIdea), input),
  );

  const { result: critique, durationMs: d4 } = await timed(
    "Critical Appraisal",
    () => generateText(critiquePrompt(input.query, literatureSurvey, researchIdea, researchPlan), input),
  );

  const { result: manuscript, durationMs: d5 } = await timed(
    "Manuscript Draft",
    () => generateText(manuscriptPrompt(input.query, literatureSurvey, researchIdea, researchPlan, critique), input),
  );

  return {
    query: input.query,
    references: input.references,
    literatureSurvey,
    researchIdea,
    researchPlan,
    critique,
    manuscript,
    stages: [
      { name: "Literature Survey", content: literatureSurvey, durationMs: d1 },
      { name: "Research Idea", content: researchIdea, durationMs: d2 },
      { name: "Research Plan", content: researchPlan, durationMs: d3 },
      { name: "Critical Appraisal", content: critique, durationMs: d4 },
      { name: "Manuscript Draft", content: manuscript, durationMs: d5 },
    ],
    createdAt: Date.now(),
  };
}
