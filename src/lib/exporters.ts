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

export function downloadExcel(synthesis: any[], fileName = "synthesis-table.xls") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, ""),
    row.keyFindings,
    row.synopsis,
    row.studyDetails,
    row.researchGaps,
  ]);
  const table = [
    headers.join("\t"),
    ...rows.map((row) => row.map((cell: string) => cell.replace(/\t/g, " ")).join("\t")),
  ].join("\n");
  const blob = new Blob([table], { type: "application/vnd.ms-excel;charset=utf-8;" });
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

export function downloadWord(synthesis: any[], fileName = "synthesis-table.doc") {
  const headers = ["Reference (Vancouver)", "Key Findings", "Synopsis / Takeaway", "Study Conducted", "Research Gaps"];
  const rows = synthesis.map((row) => [
    row.reference.replace(/<[^>]*>/g, ""),
    row.keyFindings,
    row.synopsis,
    row.studyDetails,
    row.researchGaps,
  ]);
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>Synthesis Table</title>
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #1e3a8a; color: #fff; padding: 8px; border: 1px solid #000; text-align: left; }
          td { padding: 8px; border: 1px solid #000; vertical-align: top; }
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
  const blob = new Blob([html], { type: "application/msword;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
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
    problemGlobal: "Problem Statement — Global",
    problemSEA: "Problem Statement — South-East Asia",
    problemIndia: "Problem Statement — India",
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

export function downloadLiteratureReviewWord(sections: Record<string, string>, title = "Literature Review") {
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
  const body = sectionOrder
    .map((key) => {
      const content = sections[key] || "";
      if (!content.trim()) return "";
      const escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
      return `<h2>${sectionLabels[key]}</h2><div>${escaped}</div>`;
    })
    .filter(Boolean)
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; }
          h1 { font-size: 16pt; text-align: center; margin-bottom: 6px; }
          h2 { font-size: 12pt; margin-top: 14px; margin-bottom: 4px; }
          div { font-size: 11pt; line-height: 1.5; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${body}
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.toLowerCase().replace(/\s+/g, "-")}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
