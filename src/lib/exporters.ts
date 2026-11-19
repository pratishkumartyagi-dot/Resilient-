import { marked } from "marked";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { generatePresentationPlan, getBestProvider, type PresentationOptions } from "./presentation-generator";

function extractText(tokens: any[]): string {
  return tokens.map((t) => t.text || "").join("");
}

/**
 * Render printable HTML in a hidden, same-origin iframe and trigger the
 * browser's native print dialog (which offers "Save as PDF"). Using an
 * iframe instead of `window.open("", "_blank")` avoids popup blockers and,
 * in the Electron build, avoids the window-open handler that denies every
 * new window.
 */
function printHtml(html: string): void {
  const existing = document.getElementById("__resilient_print_iframe");
  if (existing) existing.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__resilient_print_iframe";
  iframe.setAttribute(
    "style",
    "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;border:0;overflow:hidden;"
  );
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    // Last resort: open a same-origin tab (may still be blocked by the browser).
    const w = window.open("about:blank", "_blank");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.print();
      setTimeout(() => w.close(), 2000);
    } else {
      alert("Unable to open a print window. Please enable popups or use the Word export instead.");
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (win) {
    win.focus();
    win.print();
  }
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch { /* ignore */ }
  }, 1500);
}

function textRunsFromTokens(tokens: any[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const t of tokens) {
    if (t.type === "text") {
      runs.push(new TextRun(t.text));
    } else if (t.type === "strong") {
      runs.push(new TextRun({ text: t.text, bold: true }));
    } else if (t.type === "em") {
      runs.push(new TextRun({ text: t.text, italics: true }));
    } else if (t.type === "codespan") {
      runs.push(new TextRun({ text: t.text, font: "Courier New", size: 20, color: "333333" }));
    } else if (t.type === "link") {
      runs.push(new TextRun({ text: t.text, style: "Hyperlink", color: "0563C1" }));
    } else if (t.type === "image") {
      runs.push(new TextRun({ text: `[Image: ${t.text || ""}]`, italics: true, color: "666666" }));
    } else if (t.type === "br") {
      runs.push(new TextRun({ break: 1 }));
    } else if (t.tokens) {
      runs.push(...textRunsFromTokens(t.tokens));
    }
  }
  return runs;
}

function tokensToElement(token: any, index: number): any {
  if (token.type === "heading") {
    const level = Math.min(token.depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
    const runs = token.tokens ? textRunsFromTokens(token.tokens) : [new TextRun(token.text)];
    return new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(token.text || "")],
      heading: HeadingLevel[`HEADING_${level}`],
      spacing: { before: 300, after: 150 },
    });
  }
  if (token.type === "paragraph") {
    const runs = textRunsFromTokens(token.tokens || [{ type: "text", text: token.text }]);
    return new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(token.text || "")],
      spacing: { after: 100, line: 360 },
    });
  }
  if (token.type === "list") {
    const items: any[] = [];
    for (const item of token.items) {
      const runs = textRunsFromTokens(item.tokens || [{ type: "text", text: item.text }]);
      const text = runs.length > 0 ? runs : [new TextRun(item.text || "")];
      if (token.ordered) {
        items.push(
          new Paragraph({
            children: text,
            numbering: { reference: "default-numbering", level: item.level || 0 },
            spacing: { after: 60, line: 360 },
          })
        );
      } else {
        items.push(
          new Paragraph({
            children: text,
            bullet: { level: item.level || 0 },
            spacing: { after: 60, line: 360 },
          })
        );
      }
    }
    return items;
  }
  if (token.type === "code") {
    return new Paragraph({
      text: token.text || "",
      style: "Code",
      spacing: { after: 100 },
    });
  }
  if (token.type === "table") {
    const headerCells = token.header.map((cell: any) => {
      const cellRuns = textRunsFromTokens(cell.tokens || [{ type: "text", text: cell.text }]);
      return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: extractText(cell.tokens || [{ type: "text", text: cell.text }]), bold: true, color: "FFFFFF" })] })],
        shading: { type: ShadingType.SOLID, fill: "1e3a8a" },
        width: { size: 100 / token.header.length, type: WidthType.PERCENTAGE },
      });
    });
    const rows = [
      new TableRow({
        children: headerCells,
        tableHeader: true,
      }),
    ];
    for (const row of token.rows) {
      const cells = row.map((cell: any) => {
        const cellRuns = textRunsFromTokens(cell.tokens || [{ type: "text", text: cell.text }]);
        return new TableCell({
          children: [new Paragraph(cellRuns.length > 0 ? { children: cellRuns } : { text: cell.text || "" })],
          width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        });
      });
      rows.push(new TableRow({ children: cells }));
    }
    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }
  if (token.type === "blockquote") {
    const text = token.text || "";
    const runs = token.tokens ? textRunsFromTokens(token.tokens) : [new TextRun(text)];
    return new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(text)],
      indent: { left: 360 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: "1e3a8a" } },
      spacing: { after: 100 },
    });
  }
  if (token.type === "hr") {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "d9d9d9" } },
      spacing: { after: 100 },
    });
  }
  return null;
}

function tokensToDocxElements(tokens: any[]): any[] {
  const elements: any[] = [];
  for (const token of tokens) {
    if (token.type === "space") continue;
    const el = tokensToElement(token, elements.length);
    if (Array.isArray(el)) {
      elements.push(...el);
    } else if (el) {
      elements.push(el);
    }
  }
  return elements;
}

function buildLiteratureReviewDocx(sections: Record<string, string>, title: string) {
  const sectionOrder = [
    "introduction",
    "problemGlobal",
    "problemSEA",
    "problemIndia",
    "gaps",
    "future",
    "conclusion",
    "references",
  ];
  const sectionLabels: Record<string, string> = {
    introduction: "Introduction / Background",
    problemGlobal: "Problem Statement \u2014 Global",
    problemSEA: "Problem Statement \u2014 South-East Asia",
    problemIndia: "Problem Statement \u2014 India",
    gaps: "Research Gaps",
    future: "Future Studies to Be Carried Out",
    conclusion: "Conclusion",
    references: "References",
  };

  const children: any[] = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  ];

  for (const key of sectionOrder) {
    const content = sections[key] || "";
    if (!content.trim()) continue;
    const tokens = marked.lexer(content);
    children.push(
      new Paragraph({
        children: [new TextRun({ text: sectionLabels[key], bold: true })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );
    children.push(...tokensToDocxElements(tokens));
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { after: 120, line: 360 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
}

export function downloadCSV(synthesis: any[], fileName = "synthesis-table.csv") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, ""),
    row.keyFindings,
    row.synopsis,
    row.studyDetails,
    row.researchGaps,
  ]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell: string) => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadExcel(synthesis: any[], fileName = "synthesis-table.xlsx") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, "") || "",
    row.keyFindings || "",
    row.synopsis || "",
    row.studyDetails || "",
    row.researchGaps || "",
  ]);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Evidence Synthesis");

  worksheet.columns = headers.map((header) => ({
    header,
    key: header.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    width: 30,
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1e3a8a" } };
  headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  for (let i = 0; i < rows.length; i++) {
    const row = worksheet.addRow({
      reference_vancouver: rows[i][0],
      key_findings: rows[i][1],
      synopsis_takeaway: rows[i][2],
      study_conducted: rows[i][3],
      research_gaps: rows[i][4],
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  const lastRow = worksheet.lastRow;
  if (lastRow) {
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPDF(synthesis: any[], fileName = "synthesis-table.pdf") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, ""),
    row.keyFindings,
    row.synopsis,
    row.studyDetails,
    row.researchGaps,
  ]);
  const html = `
    <html>
      <head>
        <title>Synthesis Table</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
          h1 { font-size: 18pt; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 15px; }
          th { background: #1e3a8a; color: #fff; padding: 8px; border: 1px solid #1e3a8a; text-align: left; }
          td { padding: 8px; border: 1px solid #ccc; vertical-align: top; }
          tr:nth-child(even) { background: #f3f4f6; }
          @media print { body { padding: 0; } table { font-size: 8pt; } }
        </style>
      </head>
      <body>
        <h1>Evidence Synthesis Table</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              ${headers.map((h) => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr>${row.map((cell: string) => `<td>${cell.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`).join("")}</tr>`
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;
  printHtml(html);
}

export async function downloadWord(synthesis: any[], fileName = "synthesis-table.docx") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, "") || "",
    row.keyFindings || "",
    row.synopsis || "",
    row.studyDetails || "",
    row.researchGaps || "",
  ]);

  const headerCells = headers.map(
    (header) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: header, bold: true, color: "FFFFFF" })],
          }),
        ],
        shading: { type: ShadingType.SOLID, fill: "1e3a8a" },
        width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
      })
  );

  const docRows = [
    new TableRow({
      children: headerCells,
      tableHeader: true,
    }),
  ];

  for (const row of rows) {
    const cells = row.map(
      (cell: string) =>
        new TableCell({
          children: [new Paragraph(cell)],
          width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        })
    );
    docRows.push(new TableRow({ children: cells }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Evidence Synthesis Table", bold: true, size: 32 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
          }),
          new Table({
            rows: docRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.replace(/\.doc$/, ".docx");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCSVText(text: string): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let currentField = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        current.push(currentField);
        currentField = "";
      } else if (char === "\n" || char === "\r") {
        current.push(currentField);
        if (current.length > 0 || currentField.length > 0) {
          lines.push(current);
        }
        current = [];
        currentField = "";
        if (char === "\r" && next === "\n") i++;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || current.length) {
    current.push(currentField);
    lines.push(current);
  }
  return lines;
}

export function downloadLiteratureReviewPDF(sections: Record<string, string>, title = "Literature Review") {
  const sectionOrder = [
    "introduction",
    "problemGlobal",
    "problemSEA",
    "problemIndia",
    "gaps",
    "future",
    "conclusion",
    "references",
  ];
  const sectionLabels: Record<string, string> = {
    introduction: "Introduction / Background",
    problemGlobal: "Problem Statement \u2014 Global",
    problemSEA: "Problem Statement \u2014 South-East Asia",
    problemIndia: "Problem Statement \u2014 India",
    gaps: "Research Gaps",
    future: "Future Studies to Be Carried Out",
    conclusion: "Conclusion",
    references: "References",
  };
  const body = sectionOrder
    .map((key) => {
      const content = sections[key] || "";
      if (!content.trim()) return "";
      const escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
      return `<h2>${sectionLabels[key]}</h2><div class="section">${escaped}</div>`;
    })
    .filter(Boolean)
    .join("");

  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; padding: 40px; color: #000; line-height: 1.6; }
          h1 { font-size: 16pt; margin-bottom: 6px; text-align: center; }
          h2 { font-size: 12pt; margin-top: 18px; margin-bottom: 6px; }
          .section { font-size: 11pt; }
          @media print {
            body { padding: 20mm; }
            h1 { page-break-after: avoid; }
            h2 { page-break-after: avoid; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${body}
      </body>
    </html>
  `;
  printHtml(html);
}

export async function downloadLiteratureReviewWord(sections: Record<string, string>, fileName = "literature-review.docx") {
  const doc = buildLiteratureReviewDocx(sections, "Literature Review");
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadMarkdownAsWord(markdown: string, filename = "document.docx") {
  const tokens = marked.lexer(markdown);
  const elements = tokensToDocxElements(tokens);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { after: 120, line: 360 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: elements,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadMarkdownAsLaTeX(markdown: string, filename = "document.tex") {
  const lines = markdown.split("\n");
  const latex: string[] = [];
  latex.push("\\documentclass[11pt,a4paper]{article}");
  latex.push("\\usepackage[utf8]{inputenc}");
  latex.push("\\usepackage[T1]{fontenc}");
  latex.push("\\usepackage{geometry}");
  latex.push("\\geometry{margin=2.5cm}");
  latex.push("\\usepackage{booktabs}");
  latex.push("\\usepackage{hyperref}");
  latex.push("\\hypersetup{colorlinks=true, linkcolor=blue, urlcolor=blue}");
  latex.push("");
  latex.push("\\begin{document}");
  latex.push("");
  let inList = false;
  let listType: "itemize" | "enumerate" | null = null;
  let inTable = false;
  let tableRows: string[][] = [];
  const closeList = () => {
    if (inList && listType) {
      latex.push(`\\end{${listType}}`);
      latex.push("");
      inList = false;
      listType = null;
    }
  };
  const closeTable = () => {
    if (!inTable) return;
    const cols = tableRows[0]?.length || 1;
    latex.push("\\begin{table}[h]");
    latex.push("\\centering");
    latex.push("\\begin{tabular}{" + Array.from({ length: cols }, () => "l").join("") + "}");
    latex.push("\\toprule");
    tableRows.forEach((cells, idx) => {
      latex.push(cells.map((c) => escapeLatex(c)).join(" & ") + " \\\\");
      if (idx === 0 && tableRows.length > 1) latex.push("\\midrule");
    });
    latex.push("\\bottomrule");
    latex.push("\\end{tabular}");
    latex.push("");
    inTable = false;
    tableRows = [];
  };
  const escapeLatex = (text: string): string => {
    return text
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/[&%$#_{}~^]/g, (m) => "\\" + m)
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}")
      .replace(/\n/g, " ");
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (inTable && !line.startsWith("|")) {
      closeTable();
    }
    if (line.startsWith("# ")) {
      closeList();
      latex.push(`\\title{${escapeLatex(line.slice(2))}}`);
      latex.push("\\maketitle");
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      latex.push(`\\section*{${escapeLatex(line.slice(3))}}`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      latex.push(`\\subsection*{${escapeLatex(line.slice(4))}}`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList || listType !== "itemize") {
        closeList();
        inList = true;
        listType = "itemize";
      }
      latex.push(`\\item ${escapeLatex(line.slice(2).trim())}`);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (!inList || listType !== "enumerate") {
        closeList();
        inList = true;
        listType = "enumerate";
      }
      latex.push(`\\item ${escapeLatex(line.replace(/^\d+\.\s/, ""))}`);
      continue;
    }
    if (line.startsWith("|")) {
      closeList();
      const cells = line.split("|").filter((c, i, arr) => i !== 0 && i !== arr.length - 1).map((c) => c.trim());
      if (cells.length === 0) continue;
      if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
      inTable = true;
      tableRows.push(cells);
      continue;
    }
    if (line === "") {
      closeList();
      latex.push("");
      continue;
    }
    closeList();
    latex.push(escapeLatex(line));
  }
  closeTable();
  closeList();
  latex.push("");
  latex.push("\\end{document}");
  const blob = new Blob([latex.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadMarkdownAsPDF(markdown: string, filename = "document.pdf") {
  const htmlContent = marked.parse(markdown) as string;

  const htmlDoc = `
    <html>
      <head>
        <title>${filename.replace(".pdf", "")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #000; line-height: 1.6; }
          h1 { font-size: 18pt; margin-bottom: 10px; text-align: center; }
          h2 { font-size: 14pt; margin-top: 20px; margin-bottom: 8px; }
          h3 { font-size: 12pt; margin-top: 16px; margin-bottom: 6px; }
          p { font-size: 11pt; margin-bottom: 10px; }
          ul, ol { font-size: 11pt; margin-bottom: 10px; padding-left: 25px; }
          li { margin-bottom: 4px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #333; padding: 8px; text-align: left; }
          th { background: #1e3a8a; color: #fff; }
          blockquote { border-left: 4px solid #1e3a8a; padding-left: 15px; color: #333; margin: 15px 0; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          pre { background: #f3f4f6; padding: 15px; border-radius: 5px; overflow-x: auto; }
          @media print {
            body { padding: 20mm; }
            h1 { page-break-after: avoid; }
            h2 { page-break-after: avoid; }
            h3 { page-break-after: avoid; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `;

  printHtml(htmlDoc);
}

export async function downloadPPTX(markdown: string, filename = "presentation.pptx") {
  const pptx = new PptxGenJS();
  pptx.author = "Research App";
  pptx.title = filename.replace(/\.pptx$/, "");

  const tokens = marked.lexer(markdown);
  let currentSlide: any = null;
  let bulletBuffer: string[] = [];

  function flushBullets() {
    if (bulletBuffer.length > 0 && currentSlide) {
      currentSlide.addText(bulletBuffer, {
        x: 0.5,
        y: 1.5,
        w: "90%",
        h: "75%",
        fontSize: 18,
        color: "333333",
        bullet: true,
        valign: "top",
      });
      bulletBuffer = [];
    }
  }

  for (const token of tokens) {
    if (token.type === "heading") {
      flushBullets();
      if (!currentSlide || currentSlide.titleText !== token.text) {
        currentSlide = pptx.addSlide();
        currentSlide.background = { color: "FFFFFF" };
        if (token.depth === 1) {
          currentSlide.addText(token.text, {
            x: 0.5,
            y: 2.5,
            w: "90%",
            h: 2,
            fontSize: 36,
            bold: true,
            color: "1e3a8a",
            align: "center",
            valign: "middle",
          });
        } else if (token.depth === 2) {
          currentSlide.addText(token.text, {
            x: 0.5,
            y: 0.4,
            w: "90%",
            h: 0.8,
            fontSize: 28,
            bold: true,
            color: "1e3a8a",
          });
        } else {
          currentSlide.addText(token.text, {
            x: 0.5,
            y: 0.4,
            w: "90%",
            h: 0.8,
            fontSize: 22,
            bold: true,
            color: "333333",
          });
        }
        currentSlide.titleText = token.text;
      }
    } else if (token.type === "paragraph") {
      if (!currentSlide) {
        currentSlide = pptx.addSlide();
        currentSlide.addText("", {
          x: 0.5,
          y: 0.4,
          w: "90%",
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: "1e3a8a",
        });
      }
      const text = token.tokens
        ? token.tokens.map((t: any) => t.text || "").join("")
        : token.text;
      bulletBuffer.push(text);
    } else if (token.type === "list") {
      for (const item of token.items) {
        const text = item.text || "";
        bulletBuffer.push(text);
      }
    } else if (token.type === "code") {
      flushBullets();
      if (!currentSlide) {
        currentSlide = pptx.addSlide();
        currentSlide.titleText = "";
      }
      currentSlide.addText(token.text, {
        x: 0.5,
        y: 1.5,
        w: "90%",
        h: "60%",
        fontSize: 16,
        fontFace: "Courier New",
        color: "333333",
        valign: "top",
        wrap: true,
      });
    } else if (token.type === "table") {
      flushBullets();
      if (!currentSlide) {
        currentSlide = pptx.addSlide();
        currentSlide.addText("", {
          x: 0.5,
          y: 0.4,
          w: "90%",
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: "1e3a8a",
        });
        currentSlide.titleText = "";
      }
      const header = token.header.map((cell: any) => (typeof cell === "string" ? cell : cell.text));
      const rows = token.rows.map((row: any[]) => row.map((cell: any) => (typeof cell === "string" ? cell : cell.text)));

      currentSlide.addTable([header, ...rows], {
        x: 0.5,
        y: 1.3,
        w: "90%",
        h: "80%",
        fontSize: 14,
        border: { type: "solid", pt: 0.5, color: "cccccc" },
        colW: Array.from({ length: header.length }, () => "auto"),
        rowH: Array.from({ length: rows.length + 1 }, () => "auto"),
        autoPage: false,
      });
    } else if (token.type === "blockquote") {
      if (!currentSlide) {
        currentSlide = pptx.addSlide();
        currentSlide.addText("", {
          x: 0.5,
          y: 0.4,
          w: "90%",
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: "1e3a8a",
        });
        currentSlide.titleText = "";
      }
      const text = token.tokens
        ? token.tokens.map((t: any) => t.text || "").join("")
        : token.text;
      bulletBuffer.push(`\u201C${text}\u201D`);
    }
  }

  flushBullets();
  pptx.writeFile();
}

/**
 * Generate PPTX using native AI Presentation Generator
 * Uses the app's existing LLM providers (Gemini, Groq, local) to create
 * professional presentations with pptxgenjs. No external API required.
 */
export interface NativePPTXOptions {
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
  // Provider and API key are auto-detected from app state if not provided
  provider?: "gemini" | "groq" | "local";
  apiKey?: string;
}

export async function downloadPPTXWithAI(options: NativePPTXOptions): Promise<void> {
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
    provider,
    apiKey,
  } = options;

  // Generate presentation plan using AI
  const plan = await generatePresentationPlan({
    topic,
    synthesisRows,
    selectedPapers,
    template,
    tone,
    language,
    includeTitleSlide,
    includeTableOfContents,
    includeReferences,
    maxSlides,
    provider: provider || "gemini",
    apiKey: apiKey || "",
    customSlidesMarkdown,
    instructions,
  });

  // Build PPTX from plan using pptxgenjs
  const pptx = new PptxGenJS();
  pptx.author = "Research App";
  pptx.title = plan.title;

  // Apply template styling
  const templateStyles = getTemplateStyles(template);

  for (const slidePlan of plan.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: templateStyles.backgroundColor };

    switch (slidePlan.layout) {
      case "title":
        addTitleSlide(slide, slidePlan, templateStyles);
        break;
      case "section":
        addSectionSlide(slide, slidePlan, templateStyles);
        break;
      case "content":
        addContentSlide(slide, slidePlan, templateStyles);
        break;
      case "two-column":
        addTwoColumnSlide(slide, slidePlan, templateStyles);
        break;
      case "table":
        addTableSlide(slide, slidePlan, templateStyles);
        break;
      case "chart":
        addChartSlide(slide, slidePlan, templateStyles);
        break;
      case "references":
        addReferencesSlide(slide, slidePlan, templateStyles);
        break;
      default:
        addContentSlide(slide, slidePlan, templateStyles);
    }

    if (slidePlan.notes) {
      slide.addNotes(slidePlan.notes);
    }
  }

  // Trigger download
  const filename = `presentation_${topic.replace(/[^a-z0-9]/gi, "_")}.pptx`;
  pptx.writeFile({ fileName: filename });
}

// Template style configurations
function getTemplateStyles(template: string) {
  const styles: Record<string, {
    backgroundColor: string;
    titleColor: string;
    headingColor: string;
    bodyColor: string;
    accentColor: string;
    fontFamily: string;
  }> = {
    academic: {
      backgroundColor: "FFFFFF",
      titleColor: "1e3a8a",
      headingColor: "1e40af",
      bodyColor: "333333",
      accentColor: "3b82f6",
      fontFamily: "Calibri",
    },
    business: {
      backgroundColor: "FFFFFF",
      titleColor: "111827",
      headingColor: "374151",
      bodyColor: "374151",
      accentColor: "059669",
      fontFamily: "Calibri",
    },
    minimal: {
      backgroundColor: "FAFAFA",
      titleColor: "18181b",
      headingColor: "3f3f46",
      bodyColor: "52525b",
      accentColor: "a855f7",
      fontFamily: "Inter, Calibri",
    },
    conference: {
      backgroundColor: "0f172a",
      titleColor: "f8fafc",
      headingColor: "e2e8f0",
      bodyColor: "cbd5e1",
      accentColor: "f59e0b",
      fontFamily: "Calibri",
    },
  };
  return styles[template] || styles.academic;
}

function addTitleSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  if (plan.subtitle) {
    slide.addText(plan.subtitle, {
      x: 0.5, y: 2.0, w: "90%", h: 1,
      fontSize: 24, color: styles.headingColor, bold: false,
      align: "center", valign: "middle", fontFace: styles.fontFamily,
    });
  }
  slide.addText(plan.title, {
    x: 0.5, y: 2.8, w: "90%", h: 2,
    fontSize: 40, color: styles.titleColor, bold: true,
    align: "center", valign: "middle", fontFace: styles.fontFamily,
  });
  slide.addText("Evidence Synthesis Presentation", {
    x: 0.5, y: 5.0, w: "90%", h: 0.8,
    fontSize: 18, color: styles.accentColor, bold: false,
    align: "center", valign: "middle", fontFace: styles.fontFamily,
  });
}

function addSectionSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  slide.addText(plan.title, {
    x: 0.5, y: 2.5, w: "90%", h: 2,
    fontSize: 36, color: styles.titleColor, bold: true,
    align: "center", valign: "middle", fontFace: styles.fontFamily,
  });
  if (plan.content) {
    slide.addText(plan.content, {
      x: 0.5, y: 4.5, w: "90%", h: 1.5,
      fontSize: 18, color: styles.bodyColor,
      align: "center", valign: "middle", fontFace: styles.fontFamily,
    });
  }
}

function addContentSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  // Title
  slide.addText(plan.title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 28, color: styles.headingColor, bold: true,
    align: "left", fontFace: styles.fontFamily,
  });

  // Content - parse markdown-like content
  const lines = plan.content.split("\n").filter((l: string) => l.trim());
  let yPos = 1.3;
  const bulletItems: string[] = [];

  for (const line of lines) {
    if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
      bulletItems.push(line.replace(/^[•\-*]\s*/, ""));
    } else if (line.startsWith("**") && line.endsWith("**")) {
      // Bold heading within content
      if (bulletItems.length > 0) {
        slide.addText(bulletItems, {
          x: 0.5, y: yPos, w: "90%", h: Math.min(bulletItems.length * 0.5 + 0.5, 5),
          fontSize: 16, color: styles.bodyColor, bullet: true,
          valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.15,
        });
        yPos += bulletItems.length * 0.5 + 0.5;
        bulletItems.length = 0;
      }
      slide.addText(line.replace(/\*\*/g, ""), {
        x: 0.5, y: yPos, w: "90%", h: 0.5,
        fontSize: 18, color: styles.accentColor, bold: true,
        fontFace: styles.fontFamily,
      });
      yPos += 0.5;
    } else {
      if (bulletItems.length > 0) {
        slide.addText(bulletItems, {
          x: 0.5, y: yPos, w: "90%", h: Math.min(bulletItems.length * 0.5 + 0.5, 5),
          fontSize: 16, color: styles.bodyColor, bullet: true,
          valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.15,
        });
        yPos += bulletItems.length * 0.5 + 0.5;
        bulletItems.length = 0;
      }
      slide.addText(line, {
        x: 0.5, y: yPos, w: "90%", h: 0.5,
        fontSize: 16, color: styles.bodyColor,
        fontFace: styles.fontFamily,
      });
      yPos += 0.5;
    }
  }

  if (bulletItems.length > 0) {
    slide.addText(bulletItems, {
      x: 0.5, y: yPos, w: "90%", h: Math.min(bulletItems.length * 0.5 + 0.5, 5),
      fontSize: 16, color: styles.bodyColor, bullet: true,
      valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.15,
    });
  }
}

function addTwoColumnSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  slide.addText(plan.title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 28, color: styles.headingColor, bold: true,
    fontFace: styles.fontFamily,
  });

  const parts = plan.content.split("|").map((p: string) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    slide.addText(parts[0], {
      x: 0.5, y: 1.3, w: "45%", h: "80%",
      fontSize: 15, color: styles.bodyColor, bullet: true,
      valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.15,
    });
    slide.addText(parts[1], {
      x: "50%", y: 1.3, w: "45%", h: "80%",
      fontSize: 15, color: styles.bodyColor, bullet: true,
      valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.15,
    });
  } else {
    addContentSlide(slide, plan, styles);
  }
}

function addTableSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  slide.addText(plan.title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 28, color: styles.headingColor, bold: true,
    fontFace: styles.fontFamily,
  });

  // Parse table from content (pipe-separated)
  const rows = plan.content.split("\n").map((r: string) =>
    r.split("|").map((c: string) => c.trim()).filter(Boolean)
  ).filter((r: string[]) => r.length > 0);

  if (rows.length > 0) {
    slide.addTable(rows, {
      x: 0.5, y: 1.3, w: "90%", h: "75%",
      fontSize: 12, color: styles.bodyColor,
      fontFace: styles.fontFamily,
      border: { type: "solid", pt: 0.5, color: styles.accentColor },
      fill: { color: styles.backgroundColor },
      rowH: Array.from({ length: rows.length }, () => "auto"),
    });
  }
}

function addChartSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  slide.addText(plan.title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 28, color: styles.headingColor, bold: true,
    fontFace: styles.fontFamily,
  });

  slide.addText(`[Chart: ${plan.content}]`, {
    x: 0.5, y: 2.5, w: "90%", h: 3,
    fontSize: 16, color: styles.bodyColor, italic: true,
    align: "center", valign: "middle", fontFace: styles.fontFamily,
  });
}

function addReferencesSlide(slide: any, plan: any, styles: ReturnType<typeof getTemplateStyles>) {
  slide.addText(plan.title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 28, color: styles.headingColor, bold: true,
    fontFace: styles.fontFamily,
  });

  const refs = plan.content.split("\n\n").filter(Boolean);
  const refText = refs.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n\n");

  slide.addText(refText, {
    x: 0.5, y: 1.3, w: "90%", h: "80%",
    fontSize: 11, color: styles.bodyColor,
    valign: "top", fontFace: styles.fontFamily, lineSpacing: 1.2,
  });
}
