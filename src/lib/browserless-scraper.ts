import * as cheerio from "cheerio";

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "https://chrome.browserless.io/content";
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";

export interface BrowserlessContentResponse {
  data?: {
    html?: string;
  };
  html?: string;
}

export async function scrapeUrl(url: string): Promise<string> {
  const target = `${BROWSERLESS_URL}?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle2", timeout: 45000 },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Browserless fetch failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as BrowserlessContentResponse;
  return data.data?.html || data.html || "";
}

export function extractText(html: string, selector: string): string {
  const $ = cheerio.load(html);
  const el = $(selector).first();
  return el.text().trim();
}

export function extractAllText(html: string, selector: string): string[] {
  const $ = cheerio.load(html);
  const items: string[] = [];
  $(selector).each((_, el) => {
    const text = $(el).text().trim();
    if (text) items.push(text);
  });
  return items;
}

export function extractAttribute(html: string, selector: string, attr: string): string[] {
  const $ = cheerio.load(html);
  const values: string[] = [];
  $(selector).each((_, el) => {
    const val = $(el).attr(attr);
    if (val) values.push(val);
  });
  return values;
}
