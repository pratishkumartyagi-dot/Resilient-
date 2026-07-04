import { marked } from "marked";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import markdownDocx from "markdown-docx";

function extractText(tokens: any[]): string {
  return tokens.map((t) => t.text || "").join("");
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

async function buildLiteratureReviewDocx(sections: Record<string, string>, title: string): Promise<any> {
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
    problemGlobal: "Problem Statement — Global",
    problemSEA: "Problem Statement — South-East Asia",
    problemIndia: "Problem Statement — India",
    gaps: "Research Gaps",
    future: "Future Studies to Be Carried Out",
    conclusion: "Conclusion",
    references: "References",
  };

  let md = `# ${title}\n\n`;
  for (const key of sectionOrder) {
    const content = sections[key] || "";
    if (!content.trim()) continue;
    md += `## ${sectionLabels[key]}\n\n${content}\n\n`;
  }

  return markdownDocx(md, {
    theme: {
      bodySize: 12,
      lineSpacing: 1.5,
      margin: "2cm",
    },
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
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download PDF.");
    return;
  }
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
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 100);
          };
        <\/script>
      </body>
    </html>
  `;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
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

  const buffer = await Packer.toBuffer(doc);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8;",
  });
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
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download PDF.");
    return;
  }
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
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 100);
          };
        <\/script>
      </body>
    </html>
  `;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export async function downloadLiteratureReviewWord(sections: Record<string, string>, fileName = "literature-review.docx") {
  const doc = await buildLiteratureReviewDocx(sections, "Literature Review");
  const buffer = await Packer.toBuffer(doc);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8;",
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

export async function downloadMarkdownAsWord(markdown: string, filename = "document.docx") {
  const doc = await markdownDocx(markdown, {
    theme: {
      bodySize: 12,
      lineSpacing: 1.5,
      margin: "2cm",
    },
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

export function downloadMarkdownAsPDF(markdown: string, filename = "document.pdf") {
  const htmlContent = marked.parse(markdown) as string;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download PDF.");
    return;
  }

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
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 100);
          };
        <\/script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlDoc);
  printWindow.document.close();
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
