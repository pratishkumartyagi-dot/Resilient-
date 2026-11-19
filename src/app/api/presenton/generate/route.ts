import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface PresentonGenerateRequest {
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PresentonGenerateRequest & {
      presentonBaseUrl?: string;
      presentonApiKey?: string;
    };

    const { presentonBaseUrl, presentonApiKey, ...generateRequest } = body;

    if (!presentonBaseUrl || !presentonApiKey) {
      return NextResponse.json(
        { error: "Presenton base URL and API key are required" },
        { status: 400 }
      );
    }

    if (!generateRequest.content && !generateRequest.slides_markdown?.length) {
      return NextResponse.json(
        { error: "Either content or slides_markdown must be provided" },
        { status: 400 }
      );
    }

    const baseUrl = presentonBaseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/api/v1/ppt/presentation/generate`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${presentonApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(generateRequest),
      signal: AbortSignal.timeout(300000), // 5 min timeout
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Presenton API error (${response.status}): ${errorData.detail || response.statusText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Presenton generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Presenton Generation API",
    usage: "POST with { content, slides_markdown, presentonBaseUrl, presentonApiKey, ...options }",
  });
}