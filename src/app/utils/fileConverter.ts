/**
 * fileConverter.ts — conversor 100% local (sem uploads para servidores)
 *
 * Bibliotecas reais utilizadas:
 *  • docx     → gera Word (.docx) válido
 *  • jspdf    → gera PDF válido
 *  • xlsx     → lê/gera Excel (.xlsx) e CSV
 *  • mammoth  → lê .docx / .doc e extrai texto / HTML
 *  • Canvas   → converte entre formatos de imagem
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

type InputKind =
  | "image"
  | "docx"
  | "xlsx"
  | "csv"
  | "json"
  | "html"
  | "xml"
  | "pdf"
  | "text";  // txt, md, rtf, log…

/** Conteúdo extraído do arquivo de entrada */
interface Extracted {
  kind: InputKind;
  /** Texto plano */
  text?: string;
  /** HTML semântico (extraído de DOCX ou HTML original) */
  html?: string;
  /** Rows de uma planilha: string[][] */
  rows?: string[][];
  /** ArrayBuffer original (para imagens) */
  imageBuffer?: ArrayBuffer;
  /** Data‑URL da imagem para jsPDF */
  imageDataUrl?: string;
  /** Tipo MIME da imagem */
  imageMime?: string;
  /** Dimensões da imagem (px) */
  imageDims?: { width: number; height: number };
  /** Nome base do arquivo sem extensão */
  baseName: string;
}

// ─── Helpers de leitura ───────────────────────────────────────────────────────

function readText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsText(file, "UTF-8");
  });
}

function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

function readDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function getImageDims(
  src: string
): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 520,
        MAX_H = 420;
      const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
      res({ width: Math.round(img.width * ratio), height: Math.round(img.height * ratio) });
    };
    img.onerror = () => res({ width: 480, height: 360 });
    img.src = src;
  });
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function htmlToText(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.innerText || d.textContent || "";
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── Detecção do tipo de entrada ──────────────────────────────────────────────

function detectKind(file: File): InputKind {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const m = file.type.toLowerCase();
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "tiff", "tif"].includes(ext))
    return "image";
  if (ext === "docx" || m.includes("wordprocessingml") || ext === "doc" || m === "application/msword")
    return "docx";
  if (ext === "xlsx" || m.includes("spreadsheetml") || ext === "xls" || m.includes("ms-excel"))
    return "xlsx";
  if (ext === "csv" || m === "text/csv") return "csv";
  if (ext === "json" || m === "application/json") return "json";
  if (ext === "html" || ext === "htm" || m === "text/html") return "html";
  if (ext === "xml" || m.includes("xml")) return "xml";
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  return "text"; // txt, md, rtf, odt, epub, log, etc.
}

// ─── Extração de conteúdo ────────────────────────────────────────────────────

async function extract(file: File): Promise<Extracted> {
  const kind = detectKind(file);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const base: Pick<Extracted, "kind" | "baseName"> = { kind, baseName };

  if (kind === "image") {
    const [buf, dataUrl] = await Promise.all([
      readArrayBuffer(file),
      readDataURL(file),
    ]);
    const dims = await getImageDims(dataUrl);
    return {
      ...base,
      imageBuffer: buf,
      imageDataUrl: dataUrl,
      imageMime: file.type || "image/png",
      imageDims: dims,
    };
  }

  if (kind === "docx") {
    try {
      const mammothModule = await import("mammoth");
      // Suporta tanto default export quanto named exports (CJS/ESM compat)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mammoth = (mammothModule as any).default ?? mammothModule;
      const arrayBuffer = await readArrayBuffer(file);
      const [rawResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ arrayBuffer }),
        mammoth.convertToHtml({ arrayBuffer }),
      ]);
      return { ...base, text: rawResult.value, html: htmlResult.value };
    } catch (err) {
      console.warn("mammoth falhou, usando fallback texto:", err);
      const text = await readText(file).catch(() => "(não foi possível ler o DOCX)");
      return { ...base, text };
    }
  }

  if (kind === "xlsx" || kind === "csv") {
    try {
      const XLSXModule = await import("xlsx");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (XLSXModule as any).default ?? XLSXModule;
      const arrayBuffer = await readArrayBuffer(file);
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
      const csv: string = XLSX.utils.sheet_to_csv(ws);
      return { ...base, rows, text: csv };
    } catch (err) {
      console.warn("xlsx falhou, usando fallback texto:", err);
      const text = await readText(file).catch(() => "(não foi possível ler a planilha)");
      return { ...base, text };
    }
  }

  if (kind === "json") {
    const text = await readText(file);
    let rows: string[][] | undefined;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
        const keys = Object.keys(parsed[0]);
        rows = [keys, ...parsed.map((obj: Record<string, unknown>) => keys.map((k) => String(obj[k] ?? "")))];
      }
    } catch {/* not an array */}
    return { ...base, text, rows };
  }

  if (kind === "html") {
    const text = await readText(file);
    return { ...base, text: htmlToText(text), html: text };
  }

  // pdf / xml / text → just read as text
  const text = await readText(file).catch(() => `(não foi possível ler: ${file.name})`);
  return { ...base, text };
}

// ─── Geradores de saída ───────────────────────────────────────────────────────

// ── DOCX ──────────────────────────────────────────────────────────────────────

async function toDocx(e: Extracted): Promise<Blob> {
  const docxLib = await import("docx");
  const {
    Document, Packer, Paragraph, ImageRun, TextRun,
    Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType,
  } = docxLib;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  if (e.kind === "image" && e.imageBuffer && e.imageDims) {
    children.push(
      new Paragraph({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        children: [new (ImageRun as any)({
          data: e.imageBuffer,
          transformation: { width: e.imageDims.width, height: e.imageDims.height },
        })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [] }),
      new Paragraph({
        children: [new TextRun({ text: e.baseName, color: "888888", size: 18, italics: true })],
        alignment: AlignmentType.CENTER,
      })
    );
  } else if (e.rows && e.rows.length > 0) {
    children.push(new Paragraph({ text: e.baseName, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [] }));

    const tableRows = e.rows.slice(0, 200).map((row, ri) =>
      new TableRow({
        children: row.map((cell) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(cell ?? ""), bold: ri === 0, size: ri === 0 ? 22 : 20 })],
              }),
            ],
          })
        ),
      })
    );
    children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  } else {
    const raw = e.html ? htmlToText(e.html) : (e.text || "");
    children.push(new Paragraph({ text: e.baseName, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [] }));
    for (const line of raw.split("\n").slice(0, 1000)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line || " " })] }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

async function toPdf(e: Extracted): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const PW = 210, PH = 297, MARGIN = 15;

  if (e.kind === "image" && e.imageDataUrl && e.imageDims) {
    const maxW = PW - MARGIN * 2;
    const maxH = PH - MARGIN * 2;
    const ratio = Math.min(maxW / e.imageDims.width, maxH / e.imageDims.height);
    const w = e.imageDims.width * ratio;
    const h = e.imageDims.height * ratio;
    const x = (PW - w) / 2;
    const mimeUpper = (e.imageMime || "image/png").split("/")[1].toUpperCase();
    const fmt = mimeUpper === "JPEG" || mimeUpper === "JPG" ? "JPEG" : "PNG";
    pdf.addImage(e.imageDataUrl, fmt, x, MARGIN, w, h);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(e.baseName, PW / 2, MARGIN + h + 8, { align: "center" });
  } else if (e.rows && e.rows.length > 0) {
    // Table output
    pdf.setFontSize(14);
    pdf.setTextColor(30, 30, 30);
    pdf.text(e.baseName, MARGIN, MARGIN + 4);
    let y = MARGIN + 14;
    const colW = Math.min(40, (PW - MARGIN * 2) / (e.rows[0]?.length || 1));
    for (let ri = 0; ri < Math.min(e.rows.length, 60); ri++) {
      if (y > PH - MARGIN) { pdf.addPage(); y = MARGIN; }
      const row = e.rows[ri];
      pdf.setFontSize(ri === 0 ? 8 : 7);
      pdf.setFont("helvetica", ri === 0 ? "bold" : "normal");
      pdf.setTextColor(ri === 0 ? 50 : 80, ri === 0 ? 50 : 80, ri === 0 ? 50 : 80);
      row.forEach((cell, ci) => {
        const truncated = String(cell).substring(0, 14);
        pdf.text(truncated, MARGIN + ci * colW, y);
      });
      y += 6;
    }
  } else {
    const raw = e.html ? htmlToText(e.html) : (e.text || "");
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    pdf.setFont("helvetica", "bold");
    pdf.text(e.baseName, MARGIN, MARGIN + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let y = MARGIN + 12;
    const lines = pdf.splitTextToSize(raw, PW - MARGIN * 2) as string[];
    for (const line of lines.slice(0, 2000)) {
      if (y > PH - MARGIN) { pdf.addPage(); y = MARGIN; }
      pdf.text(line, MARGIN, y);
      y += 5;
    }
  }

  return pdf.output("blob");
}

// ── HTML ──────────────────────────────────────────────────────────────────────

async function toHtml(e: Extracted): Promise<Blob> {
  let body = "";

  if (e.kind === "image" && e.imageDataUrl) {
    body = `<div style="text-align:center"><img src="${e.imageDataUrl}" alt="${e.baseName}" style="max-width:100%;height:auto;border-radius:8px"/></div>`;
  } else if (e.html) {
    body = e.html;
  } else if (e.rows && e.rows.length > 0) {
    const header = e.rows[0].map((h) => `<th>${escapeXml(String(h))}</th>`).join("");
    const bodyRows = e.rows
      .slice(1)
      .map((r) => `<tr>${r.map((c) => `<td>${escapeXml(String(c))}</td>`).join("")}</tr>`)
      .join("\n");
    body = `<table border="1" cellpadding="6" cellspacing="0">\n<thead><tr>${header}</tr></thead>\n<tbody>${bodyRows}</tbody></table>`;
  } else {
    const safe = escapeXml(e.text || "");
    body = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:.9rem">${safe}</pre>`;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e.baseName}</title>
<style>
  *{box-sizing:border-box}body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6}
  h1{font-size:1.3rem;margin-bottom:1.2rem}table{border-collapse:collapse;width:100%}th{background:#f0f0f0;text-align:left}th,td{padding:6px 10px;border:1px solid #ddd}tr:nth-child(even){background:#fafafa}
  footer{margin-top:3rem;color:#aaa;font-size:.75rem;border-top:1px solid #eee;padding-top:.8rem}
</style>
</head>
<body>
<h1>${e.baseName}</h1>
${body}
<footer>Convertido em ${new Date().toLocaleString("pt-BR")} · DocTransforma</footer>
</body></html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}

// ── TXT ───────────────────────────────────────────────────────────────────────

async function toTxt(e: Extracted): Promise<Blob> {
  let content = "";
  if (e.kind === "image") {
    content = `[Imagem: ${e.baseName}]\nDimensões: ${e.imageDims?.width ?? "?"}×${e.imageDims?.height ?? "?"} px\nMIME: ${e.imageMime}\nData: ${new Date().toLocaleString("pt-BR")}`;
  } else if (e.rows && e.rows.length > 0) {
    content = e.rows.map((r) => r.join("\t")).join("\n");
  } else {
    content = e.html ? htmlToText(e.html) : (e.text || "");
  }
  return new Blob([content], { type: "text/plain;charset=utf-8" });
}

// ── Markdown ──────────────────────────────────────────────────────────────────

async function toMarkdown(e: Extracted): Promise<Blob> {
  let content = `# ${e.baseName}\n\n`;

  if (e.kind === "image" && e.imageDataUrl) {
    content += `![${e.baseName}](${e.imageDataUrl})\n`;
  } else if (e.rows && e.rows.length > 0) {
    const header = `| ${e.rows[0].join(" | ")} |`;
    const sep = `| ${e.rows[0].map(() => "---").join(" | ")} |`;
    const rows = e.rows.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n");
    content += `${header}\n${sep}\n${rows}\n`;
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    content += text;
  }

  content += `\n\n---\n*Convertido em ${new Date().toLocaleString("pt-BR")}*`;
  return new Blob([content], { type: "text/markdown;charset=utf-8" });
}

// ── CSV ───────────────────────────────────────────────────────────────────────

async function toCsv(e: Extracted): Promise<Blob> {
  let csv = "";
  if (e.rows && e.rows.length > 0) {
    csv = e.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  } else if (e.kind === "image") {
    csv = `"campo","valor"\n"arquivo","${e.baseName}"\n"mime","${e.imageMime}"\n"largura","${e.imageDims?.width}"\n"altura","${e.imageDims?.height}"`;
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    const lines = text.split("\n");
    csv = `"linha","conteudo"\n` + lines.map((l, i) => `"${i + 1}","${l.replace(/"/g, '""')}"`).join("\n");
  }
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

// ── JSON ──────────────────────────────────────────────────────────────────────

async function toJson(e: Extracted): Promise<Blob> {
  let obj: unknown;
  if (e.kind === "image") {
    obj = { arquivo: e.baseName, mime: e.imageMime, dimensoes: e.imageDims, convertido: new Date().toISOString() };
  } else if (e.rows && e.rows.length > 0) {
    const [headers, ...dataRows] = e.rows;
    obj = dataRows.map((row) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { o[h] = row[i] ?? ""; });
      return o;
    });
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    // Try to parse if already JSON
    try { obj = JSON.parse(text); } catch { obj = { arquivo: e.baseName, conteudo: text }; }
  }
  return new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
}

// ── XML ───────────────────────────────────────────────────────────────────────

async function toXml(e: Extracted): Promise<Blob> {
  let inner = "";
  if (e.kind === "image") {
    inner = `  <arquivo>${escapeXml(e.baseName)}</arquivo>\n  <mime>${escapeXml(e.imageMime || "")}</mime>\n  <largura>${e.imageDims?.width}</largura>\n  <altura>${e.imageDims?.height}</altura>`;
  } else if (e.rows && e.rows.length > 0) {
    const [headers, ...dataRows] = e.rows;
    inner = dataRows.map((row) =>
      `  <registro>\n${headers.map((h, i) => `    <${escapeXml(String(h).replace(/\s+/g, "_") || "col")}>${escapeXml(String(row[i] ?? ""))}</${escapeXml(String(h).replace(/\s+/g, "_") || "col")}>`).join("\n")}\n  </registro>`
    ).join("\n");
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    inner = `  <conteudo><![CDATA[${text.substring(0, 50000)}]]></conteudo>`;
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<documento arquivo="${escapeXml(e.baseName)}" convertido="${new Date().toISOString()}">\n${inner}\n</documento>`;
  return new Blob([xml], { type: "application/xml;charset=utf-8" });
}

// ── RTF ───────────────────────────────────────────────────────────────────────

async function toRtf(e: Extracted): Promise<Blob> {
  let bodyText = "";
  if (e.kind === "image") {
    bodyText = `[Imagem: ${e.baseName}]\\par Dimensoes: ${e.imageDims?.width}x${e.imageDims?.height} px`;
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    bodyText = text
      .replace(/\\/g, "\\\\")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\n/g, "\\par\r\n")
      .substring(0, 100000);
  }
  const rtf = `{\\rtf1\\ansi\\deff0\n{\\fonttbl {\\f0 Arial;}}\n\\f0\\fs22\n{\\b ${e.baseName}}\\par\\par\n${bodyText}\n\\par\\par\n{\\i\\fs18 Convertido em ${new Date().toLocaleString("pt-BR")}}\n}`;
  return new Blob([rtf], { type: "application/rtf" });
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

async function toXlsx(e: Extracted): Promise<Blob> {
  const XLSXModule = await import("xlsx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = (XLSXModule as any).default ?? XLSXModule;
  let rows: string[][] = [];

  if (e.kind === "image") {
    rows = [
      ["Campo", "Valor"],
      ["Arquivo", e.baseName],
      ["MIME", e.imageMime || ""],
      ["Largura (px)", String(e.imageDims?.width ?? "")],
      ["Altura (px)", String(e.imageDims?.height ?? "")],
      ["Convertido em", new Date().toLocaleString("pt-BR")],
    ];
  } else if (e.rows && e.rows.length > 0) {
    rows = e.rows;
  } else {
    const text = e.html ? htmlToText(e.html) : (e.text || "");
    rows = [["Linha", "Conteúdo"], ...text.split("\n").map((l, i) => [String(i + 1), l])];
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Conversão de imagem ───────────────────────────────────────────────────────

async function imageToImageBlob(e: Extracted, mimeOut: string, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!e.imageDataUrl) return reject(new Error("Sem dados de imagem"));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      if (mimeOut === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha no canvas"))),
        mimeOut,
        quality
      );
    };
    img.onerror = reject;
    img.src = e.imageDataUrl!;
  });
}

// ─── Dispatcher principal ─────────────────────────────────────────────────────

/** Exporta o helper de download para uso explícito pelo usuário */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Converte o arquivo e retorna { blob, filename } — SEM download automático */
export async function convert(
  file: File,
  targetExt: string,
  _label: string
): Promise<{ blob: Blob; filename: string }> {
  const e = await extract(file);
  const outName = `${e.baseName}.${targetExt}`;
  let blob: Blob;

  switch (targetExt) {
    case "docx":
    case "doc":
      blob = await toDocx(e); break;
    case "pdf":
      blob = await toPdf(e); break;
    case "rtf":
      blob = await toRtf(e); break;
    case "odt":
      blob = await toDocx(e); break;
    case "txt":
    case "log":
      blob = await toTxt(e); break;
    case "md":
    case "markdown":
      blob = await toMarkdown(e); break;
    case "html":
    case "htm":
      blob = await toHtml(e); break;
    case "csv":
      blob = await toCsv(e); break;
    case "json":
      blob = await toJson(e); break;
    case "xml":
      blob = await toXml(e); break;
    case "xlsx":
    case "xls":
      blob = await toXlsx(e); break;
    case "png":
      blob = e.kind === "image" ? await imageToImageBlob(e, "image/png") : await toPdf(e); break;
    case "jpg":
    case "jpeg":
      blob = e.kind === "image" ? await imageToImageBlob(e, "image/jpeg", 0.92) : await toPdf(e); break;
    case "webp":
      blob = e.kind === "image" ? await imageToImageBlob(e, "image/webp", 0.92) : await toPdf(e); break;
    case "gif":
      blob = e.kind === "image" ? await imageToImageBlob(e, "image/png") : await toPdf(e); break;
    case "bmp":
      blob = e.kind === "image" ? await imageToImageBlob(e, "image/bmp") : await toPdf(e); break;
    default:
      blob = await toTxt(e);
  }

  return { blob, filename: outName };
}

/** Compat: converte E baixa imediatamente (mantido para o Editor) */
export async function convertAndDownload(
  file: File,
  targetExt: string,
  label: string
): Promise<void> {
  const { blob, filename } = await convert(file, targetExt, label);
  downloadBlob(blob, filename);
}