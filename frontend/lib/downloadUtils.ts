// All download helpers use dynamic imports so heavy libs don't affect initial bundle size.

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Markdown ──────────────────────────────────────────────────

export function downloadMarkdown(content: string, filename = "response.md") {
  triggerDownload(new Blob([content], { type: "text/markdown" }), filename);
}

// ── PDF ───────────────────────────────────────────────────────

export async function downloadPDF(element: HTMLElement, filename = "response.pdf") {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margin = 12;
  const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
  const imgH = (canvas.height * pageW) / canvas.width;

  let remaining = imgH;
  let yOffset = 0;

  while (remaining > 0) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, margin - yOffset, pageW, imgH);
    yOffset += pageH;
    remaining -= pageH;
  }

  pdf.save(filename);
}

// ── Word (.docx) ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBoldRuns(text: string, TextRun: new (opts: any) => any): any[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return new TextRun({ text: part.slice(2, -2), bold: true });
      }
      return new TextRun({ text: part });
    });
}

export async function downloadDocx(content: string, filename = "response.docx") {
  const {
    Document, Packer, Paragraph, TextRun,
    HeadingLevel, Table, TableRow, TableCell,
    WidthType, AlignmentType,
  } = await import("docx");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line.slice(2), bold: true })], heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line.slice(3), bold: true })], heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line.slice(4), bold: true })], heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      children.push(new Paragraph({ children: parseBoldRuns(line.slice(2), TextRun), bullet: { level: 0 } }));
    } else if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({ children: parseBoldRuns(line.replace(/^\d+\.\s/, ""), TextRun) }));
    } else if (line.startsWith("```")) {
      // Collect code block lines until closing ```
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      children.push(new Paragraph({
        children: [new TextRun({ text: codeLines.join("\n"), font: "Courier New", size: 18 })],
        shading: { fill: "F5F5F5" },
      }));
    } else if (line.startsWith("|")) {
      // Collect table rows
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]?.startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter((l) => !l.match(/^\|[\s\-:|]+\|$/));
      if (rows.length > 0) {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((row, ri) =>
            new TableRow({
              children: row
                .split("|")
                .slice(1, -1)
                .map((cell) =>
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: cell.trim(), bold: ri === 0 })],
                      alignment: AlignmentType.LEFT,
                    })],
                  })
                ),
            })
          ),
        }));
      }
      continue;
    } else if (line.trim() === "") {
      children.push(new Paragraph(""));
    } else {
      children.push(new Paragraph({ children: parseBoldRuns(line, TextRun) }));
    }

    i++;
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}

// ── Excel (.xlsx) ─────────────────────────────────────────────

export function extractMarkdownTables(content: string): string[][][] {
  const tables: string[][][] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (lines[i]?.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]?.startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[\s\-:|]+\|$/))
        .map((l) =>
          l.split("|")
            .slice(1, -1)
            .map((c) => c.trim())
        );
      if (rows.length > 0) tables.push(rows);
    } else {
      i++;
    }
  }

  return tables;
}

export function hasTables(content: string): boolean {
  return /^\|.+\|$/m.test(content);
}

export async function downloadExcel(content: string, filename = "response.xlsx") {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const tables = extractMarkdownTables(content);

  if (tables.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet(content.split("\n").map((l) => [l]));
    XLSX.utils.book_append_sheet(wb, ws, "Response");
  } else {
    tables.forEach((table, idx) => {
      const ws = XLSX.utils.aoa_to_sheet(table);
      XLSX.utils.book_append_sheet(wb, ws, `Table ${idx + 1}`);
    });
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(new Blob([buf], { type: "application/octet-stream" }), filename);
}

// ── Mermaid PNG ───────────────────────────────────────────────

export async function downloadMermaidPNG(svgElement: SVGElement, filename = "diagram.png") {
  const bbox = svgElement.getBoundingClientRect();
  const scale = 2;
  const w = Math.max(bbox.width, 200);
  const h = Math.max(bbox.height, 100);

  // Serialize and ensure explicit dimensions so the browser img element loads correctly
  const clone = svgElement.cloneNode(true) as SVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const svgStr = new XMLSerializer().serializeToString(clone);

  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    img.src = url;
  });
}
