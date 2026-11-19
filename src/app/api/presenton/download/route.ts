import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      presentonBaseUrl?: string;
      presentonApiKey?: string;
      path: string;
    };

    const { presentonBaseUrl, presentonApiKey, path } = body;

    if (!presentonBaseUrl || !presentonApiKey || !path) {
      return NextResponse.json(
        { error: "Presenton base URL, API key, and file path are required" },
        { status: 400 }
      );
    }

    const baseUrl = presentonBaseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/api/v1/ppt/files/download`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${presentonApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Presenton download error (${response.status}): ${errorData.detail || response.statusText}`,
        },
        { status: response.status }
      );
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="presentation.pptx"`,
      },
    });
  } catch (error) {
    console.error("Presenton download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}