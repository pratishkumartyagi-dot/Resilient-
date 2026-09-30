export async function parseWordDocument(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Lazy-load mammoth only when a Word file is actually parsed, so the
    // initial preview bundle stays lean.
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.error("Failed to parse Word document:", err);
    throw new Error(`Failed to parse Word document: ${file.name}`);
  }
}

export async function parsePDFDocument(file: File): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      fullText += pageText + "\n\n";
    }

    return fullText.trim();
  } catch (err) {
    console.error("Failed to parse PDF document:", err);
    throw new Error(`Failed to parse PDF document: ${file.name}`);
  }
}

export async function parseTextDocument(file: File): Promise<string> {
  try {
    return await file.text();
  } catch (err) {
    console.error("Failed to parse text document:", err);
    throw new Error(`Failed to parse text document: ${file.name}`);
  }
}

export async function parseUploadedDocument(file: File): Promise<{ name: string; content: string; type: string }> {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    return {
      name: file.name,
      content: await parseWordDocument(file),
      type: "word",
    };
  }
  
  if (fileName.endsWith(".pdf")) {
    return {
      name: file.name,
      content: await parsePDFDocument(file),
      type: "pdf",
    };
  }
  
  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return {
      name: file.name,
      content: await parseTextDocument(file),
      type: "text",
    };
  }
  
  throw new Error(`Unsupported file type: ${file.name}. Please upload Word (.docx), PDF (.pdf), or text (.txt) files.`);
}

export async function parseOmicsDataFile(file: File): Promise<{ name: string; content: string; type: string; format: string }> {
  const fileName = file.name.toLowerCase();
  const text = await file.text();
  const ext = fileName.split(".").pop() || "";

  if (["csv", "tsv", "txt", "md"].includes(ext)) {
    const delimiter = ext === "tsv" ? "\t" : ",";
    return {
      name: file.name,
      content: text,
      type: ext === "tsv" ? "tsv" : "csv",
      format: ext === "tsv" ? "TSV" : "CSV",
    };
  }

  if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    const content = await parseWordDocument(file);
    return { name: file.name, content, type: "word", format: "Word" };
  }

  if (fileName.endsWith(".pdf")) {
    const content = await parsePDFDocument(file);
    return { name: file.name, content, type: "pdf", format: "PDF" };
  }

  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return { name: file.name, content: text, type: "text", format: "Text" };
  }

  throw new Error(
    `Unsupported file type: ${file.name}. Supported: .csv .tsv .txt .md .docx .pdf`
  );
}

export const ALLOWED_DOCUMENT_TYPES = [".docx", ".doc", ".pdf", ".txt", ".md"];
export const ALLOWED_OMICS_TYPES = [".csv", ".tsv", ".txt", ".md", ".docx", ".doc", ".pdf"];
