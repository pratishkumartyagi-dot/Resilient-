import { NextResponse } from "next/server";
import { runThesisPipeline, buildDefaultConfig } from "@/lib/thesis-pipeline";
import { buildThesisAiFn, searchThesisPapers, toThesisPaper } from "@/lib/thesis-ai";
import type { ThesisGeneratorConfig } from "@/lib/thesis-types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      topic,
      level,
      style,
      lang,
      author,
      institution,
      apiKey,
      provider,
      yearFrom,
      yearTo,
      studyDesign,
      targetWordCount,
      maxReferences,
    } = body || {};

    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }
    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }

    const config: ThesisGeneratorConfig = buildDefaultConfig({
      topic,
      level: level || "master",
      style: style || "vancouver",
      language: lang || "en",
      author,
      institution,
      apiKey,
      provider: provider || "gemini",
      yearFrom: yearFrom ? Number(yearFrom) : undefined,
      yearTo: yearTo ? Number(yearTo) : undefined,
      studyDesign: studyDesign || "other",
      targetWordCount: targetWordCount ? Number(targetWordCount) : undefined,
      maxReferences: maxReferences ? Number(maxReferences) : 150,
    });

    const aiFn = buildThesisAiFn(config.provider, config.apiKey);

    const result = await runThesisPipeline(config, {
      aiFn,
      searchFn: async (query, opts) => {
        const papers = await searchThesisPapers({
          query,
          databases: ["PubMed", "OpenAlex", "Europe PMC", "DOAJ", "bioRxiv", "medRxiv", "Crossref", "arXiv", "OpenAIRE", "Semantic Scholar"],
          yearFrom: opts?.yearFrom ? Number(opts.yearFrom) : undefined,
          yearTo: opts?.yearTo ? Number(opts.yearTo) : undefined,
          studyDesign: opts?.studyDesign,
        });
        return papers.map(toThesisPaper);
      },
      onProgress: (stage, message) => {
        console.log(`[thesis-generate][${stage}] ${message}`);
      },
    });

    return NextResponse.json({
      success: true,
      content: result.fullThesis,
      outline: result.outline,
      chapters: result.chapters,
      stages: result.stages,
      stats: result.stats,
      references: result.references,
      papers: result.papers,
      subResults: result.subResults,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Thesis generation failed" },
      { status: 500 },
    );
  }
}
