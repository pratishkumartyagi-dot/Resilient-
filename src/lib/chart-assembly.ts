import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle } from "docx";

export interface ChartSpec {
  type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  values: number[];
}

export interface ThesisDocumentInput {
  title: string;
  author?: string;
  institution?: string;
  markdown: string;
  charts?: ChartSpec[];
}

function parseMarkdownTables(md: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headers = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        if (row.length) rows.push(row);
        i++;
      }
      tables.push({ headers, rows });
    } else {
      i++;
    }
  }
  return tables;
}

function inlineRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.filter(Boolean).map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) return new TextRun({ text: p.slice(2, -2), bold: true });
    if (p.startsWith("*") && p.endsWith("*")) return new TextRun({ text: p.slice(1, -1), italics: true });
    return new TextRun({ text: p });
  });
}

function markdownToDocxChildren(md: string): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith("# ")) { children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 })); i++; continue; }
    if (trimmed.startsWith("## ")) { children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 })); i++; continue; }
    if (trimmed.startsWith("### ")) { children.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 })); i++; continue; }
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headers = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        if (row.length) rows.push(row);
        i++;
      }
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
          ...rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ children: inlineRuns(c) })] })) })),
        ],
      }));
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      children.push(new Paragraph({ children: inlineRuns(trimmed.slice(2)), bullet: { level: 0 } }));
      i++; continue;
    }
    children.push(new Paragraph({ children: inlineRuns(trimmed) }));
    i++;
  }
  return children;
}

export function renderChartSvg(spec: ChartSpec, width = 600, height = 300): string {
  const { type, title, labels, values } = spec;
  const max = Math.max(...values, 1);
  const pad = 40;
  const barW = (width - pad * 2) / Math.max(labels.length, 1);
  let body = "";
  if (type === "bar") {
    body = values.map((v, i) => {
      const h = (v / max) * (height - pad * 2);
      const x = pad + i * barW + barW * 0.1;
      const y = height - pad - h;
      return `<rect x="${x}" y="${y}" width="${barW * 0.8}" height="${h}" fill="#2563eb"/><text x="${x + barW * 0.4}" y="${height - pad + 14}" font-size="10" text-anchor="middle">${labels[i] ?? ""}</text>`;
    }).join("");
  } else if (type === "line") {
    const pts = values.map((v, i) => `${pad + i * barW + barW / 2},${height - pad - (v / max) * (height - pad * 2)}`).join(" ");
    body = `<polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="2"/>` +
      values.map((v, i) => `<circle cx="${pad + i * barW + barW / 2}" cy="${height - pad - (v / max) * (height - pad * 2)}" r="3" fill="#2563eb"/>`).join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${width / 2}" y="20" font-size="14" text-anchor="middle" font-weight="bold">${title}</text>${body}</svg>`;
}

export async function assembleThesisDocx(input: ThesisDocumentInput): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ text: input.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
  if (input.author) children.push(new Paragraph({ text: input.author, alignment: AlignmentType.CENTER }));
  if (input.institution) children.push(new Paragraph({ text: input.institution, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ text: "" }));
  children.push(...markdownToDocxChildren(input.markdown));
  if (input.charts && input.charts.length) {
    children.push(new Paragraph({ text: "Figures", heading: HeadingLevel.HEADING_1 }));
    for (const c of input.charts) {
      children.push(new Paragraph({ children: [new TextRun({ text: c.title, bold: true })] }));
      children.push(new Paragraph({ text: renderChartSvg(c) }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
