/**
 * EditorPage — Editor de documentos estilo PDFFiller
 * Suporta: PDF, imagens, DOCX
 * Ferramentas: texto, highlight, sublinhar, tachado, retângulo, círculo,
 *              linha, seta, assinatura, desenho livre, borracha
 * OCR: chama o serviço Flask em localhost:5000/ocr
 * Exportação: PDF com anotações via pdf-lib
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  MousePointer2, Type, Highlighter, Underline, Strikethrough,
  Square, Circle, Minus, ArrowRight, PenLine, Eraser,
  ZoomIn, ZoomOut, Download, X, Upload, FileText,
  ScanText, RotateCcw,
  Pen, Eye, EyeOff, AlignLeft,
} from "lucide-react";
import { sanitizeHtml, sanitizeText } from "../utils/security/sanitizer";
import { validateFile } from "../utils/security/fileValidator";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool =
  | "cursor" | "text" | "highlight" | "underline" | "strikethrough"
  | "rect" | "circle" | "line" | "arrow" | "signature" | "freehand" | "eraser";

interface Annotation {
  id: string;
  type: Tool;
  pageIndex: number;
  /** 0-1 fractions of page dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string;
  fontSize?: number;
  opacity?: number;
  strokeWidth?: number;
  signatureDataUrl?: string;
  points?: { x: number; y: number }[];
}

type DocType = "none" | "pdf" | "image" | "docx";

const genId = () => crypto.randomUUID();

// ─── Worker URL for pdf.js ────────────────────────────────────────────────────

let pdfWorkerConfigured = false;

async function ensurePdfWorker() {
  if (pdfWorkerConfigured) return;
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  pdfWorkerConfigured = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgbFloat(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function getCursor(tool: Tool, pendingSig: boolean) {
  if (tool === "cursor") return "default";
  if (tool === "text") return "text";
  if (tool === "eraser") return "cell";
  if (tool === "signature" && pendingSig) return "crosshair";
  return "crosshair";
}

// ─── Signature Modal ──────────────────────────────────────────────────────────

function SignatureModal({
  onSave,
  onClose,
}: {
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [isEmpty, setIsEmpty] = useState(true);
  const [sigColor, setSigColor] = useState("#1e293b");

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPos(e);
  };

  const drawMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    last.current = pos;
    setIsEmpty(false);
  };

  const endDraw = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const save = () => {
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-[520px] max-w-[95vw]"
        style={{ background: "#1a1d35", border: "1px solid #2a2f55" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem" }}>✒ Assinatura Digital</h2>
          <button onClick={onClose} style={{ color: "#94a3b8" }}><X size={18} /></button>
        </div>

        <p style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: "12px" }}>
          Desenhe sua assinatura abaixo com o mouse ou o dedo:
        </p>

        <div
          style={{
            border: "2px dashed #2a2f55",
            borderRadius: "10px",
            background: "#fff",
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            width={470}
            height={180}
            style={{ display: "block", cursor: "crosshair", width: "100%", height: "180px" }}
            onMouseDown={startDraw}
            onMouseMove={drawMove}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={drawMove}
            onTouchEnd={endDraw}
          />
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-3 mt-3">
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Cor:</span>
          {["#1e293b", "#1e40af", "#15803d", "#b91c1c"].map((c) => (
            <button
              key={c}
              onClick={() => setSigColor(c)}
              style={{
                width: 22, height: 22, borderRadius: "50%", background: c,
                border: sigColor === c ? "2px solid #818cf8" : "2px solid transparent",
              }}
            />
          ))}
          <input
            type="color"
            value={sigColor}
            onChange={(e) => setSigColor(e.target.value)}
            style={{ width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer" }}
          />
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={clear}
            style={{
              flex: 1, padding: "8px", borderRadius: "8px",
              background: "#1e293b", color: "#94a3b8",
              border: "1px solid #2a2f55", cursor: "pointer", fontSize: "0.85rem",
            }}
          >
            Limpar
          </button>
          <button
            onClick={save}
            disabled={isEmpty}
            style={{
              flex: 2, padding: "8px", borderRadius: "8px",
              background: isEmpty ? "#2a2f55" : "#4f46e5",
              color: isEmpty ? "#475569" : "#fff",
              border: "none", cursor: isEmpty ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
            }}
          >
            Aplicar Assinatura
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OCR Panel ────────────────────────────────────────────────────────────────

function OCRPanel({
  text,
  loading,
  confidence,
  onClose,
  onCopyToDoc,
}: {
  text: string | null;
  loading: boolean;
  confidence: number | null;
  onClose: () => void;
  onCopyToDoc: (text: string) => void;
}) {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: "#12152b",
        borderLeft: "1px solid #1e2347",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: "1px solid #1e2347" }}
      >
        <span style={{ color: "#e2e8f0", fontSize: "0.85rem" }}>
          <ScanText size={14} style={{ display: "inline", marginRight: 6 }} />
          Texto OCR Extraído
        </span>
        <button onClick={onClose} style={{ color: "#64748b" }}><X size={16} /></button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "3px solid #1e2347",
              borderTop: "3px solid #4f46e5",
              animation: "spin 1s linear infinite",
            }}
          />
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Extraindo texto…</span>
        </div>
      )}

      {!loading && text && (
        <>
          {confidence !== null && (
            <div className="px-3 py-2" style={{ borderBottom: "1px solid #1e2347" }}>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Confiança: {confidence.toFixed(1)}%
              </span>
            </div>
          )}
          <textarea
            readOnly
            value={text}
            style={{
              flex: 1, padding: "12px", background: "transparent",
              color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.6,
              border: "none", resize: "none", outline: "none",
              fontFamily: "monospace",
            }}
          />
          <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #1e2347" }}>
            <button
              onClick={() => navigator.clipboard.writeText(text)}
              style={{
                flex: 1, padding: "7px", borderRadius: "7px",
                background: "#1e2347", color: "#94a3b8",
                border: "1px solid #2a2f55", cursor: "pointer", fontSize: "0.75rem",
              }}
            >
              Copiar
            </button>
            <button
              onClick={() => onCopyToDoc(text)}
              style={{
                flex: 1, padding: "7px", borderRadius: "7px",
                background: "#4f46e5", color: "#fff",
                border: "none", cursor: "pointer", fontSize: "0.75rem",
              }}
            >
              Inserir no Doc
            </button>
          </div>
        </>
      )}

      {!loading && !text && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-4">
          <ScanText size={32} style={{ color: "#2a2f55" }} />
          <p style={{ color: "#475569", fontSize: "0.8rem", textAlign: "center" }}>
            Clique em "OCR" na barra lateral para extrair texto do documento.
          </p>
          <p style={{ color: "#334155", fontSize: "0.7rem", textAlign: "center", marginTop: 4 }}>
            Para imagens: usa o serviço Flask em localhost:5000<br />
            Para PDFs: usa pdf.js interno
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 38, height: 38, borderRadius: 8, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: active ? "#4f46e5" : "transparent",
        color: active ? "#fff" : "#94a3b8",
        border: "none", cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#1e2347";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

// ─── Preview while drawing ────────────────────────────────────────────────────

function DrawPreview({
  tool, start, current, color, strokeWidth, points,
}: {
  tool: Tool;
  start: { x: number; y: number };
  current: { x: number; y: number };
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
}) {
  const x = Math.min(start.x, current.x) * 1000;
  const y = Math.min(start.y, current.y) * 1000;
  const w = Math.abs(current.x - start.x) * 1000;
  const h = Math.abs(current.y - start.y) * 1000;
  const x1 = start.x * 1000, y1 = start.y * 1000;
  const x2 = current.x * 1000, y2 = current.y * 1000;
  const sw = strokeWidth;
  const opacity = 0.7;

  switch (tool) {
    case "highlight":
      return <rect x={x} y={y} width={w} height={h} fill={color} opacity={0.35} />;
    case "underline":
      return <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={color} strokeWidth={sw} opacity={opacity} />;
    case "strikethrough":
      return <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={color} strokeWidth={sw} opacity={opacity} />;
    case "rect":
      return <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={sw} opacity={opacity} />;
    case "circle":
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={color} strokeWidth={sw} opacity={opacity} />;
    case "line":
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} opacity={opacity} />;
    case "arrow":
      return (
        <>
          <defs>
            <marker id="prev-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={color} />
            </marker>
          </defs>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} markerEnd="url(#prev-arrow)" opacity={opacity} />
        </>
      );
    case "freehand":
      return points.length > 1 ? (
        <polyline
          points={points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
          fill="none" stroke={color} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round" opacity={opacity}
        />
      ) : null;
    default:
      return null;
  }
}

// ─── Render a single annotation in SVG ───────────────────────────────────────

function AnnotationShape({ a }: { a: Annotation }) {
  const x = a.x * 1000, y = a.y * 1000;
  const w = (a.width || 0) * 1000, h = (a.height || 0) * 1000;
  const x1 = a.x * 1000, y1 = a.y * 1000;
  const x2 = (a.x + (a.width || 0)) * 1000, y2 = (a.y + (a.height || 0)) * 1000;
  const sw = a.strokeWidth || 3;

  switch (a.type) {
    case "highlight":
      return <rect x={x} y={y} width={w} height={h} fill={a.color || "#FFD700"} opacity={a.opacity ?? 0.35} />;
    case "underline":
      return <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={a.color} strokeWidth={sw} />;
    case "strikethrough":
      return <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={a.color} strokeWidth={sw} />;
    case "rect":
      return <rect x={x} y={y} width={w} height={h} fill="none" stroke={a.color} strokeWidth={sw} />;
    case "circle":
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={a.color} strokeWidth={sw} />;
    case "line":
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.color} strokeWidth={sw} />;
    case "arrow":
      return (
        <>
          <defs>
            <marker id={`arr-${a.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={a.color || "#e11d48"} />
            </marker>
          </defs>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.color} strokeWidth={sw} markerEnd={`url(#arr-${a.id})`} />
        </>
      );
    case "freehand":
      return a.points && a.points.length > 1 ? (
        <polyline
          points={a.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
          fill="none" stroke={a.color} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round"
        />
      ) : null;
    default:
      return null;
  }
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ padding: 40 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? "#4f46e5" : "#1e2347"}`,
          borderRadius: 16,
          padding: "60px 80px",
          textAlign: "center",
          cursor: "pointer",
          background: drag ? "rgba(79,70,229,0.05)" : "transparent",
          transition: "all 0.2s",
          maxWidth: 480,
        }}
      >
        <Upload size={48} style={{ color: "#4f46e5", marginBottom: 16, opacity: 0.8 }} />
        <p style={{ color: "#e2e8f0", fontSize: "1.1rem", marginBottom: 8 }}>
          Arraste um documento aqui
        </p>
        <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 20 }}>
          PDF, DOCX, PNG, JPG, WEBP, BMP, GIF, TIFF
        </p>
        <div
          style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 8,
            background: "#4f46e5",
            color: "#fff",
            fontSize: "0.9rem",
          }}
        >
          Escolher arquivo
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,.tif"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>

      <p style={{ color: "#334155", fontSize: "0.75rem", marginTop: 24, textAlign: "center" }}>
        Processamento 100% local no navegador — nenhum arquivo é enviado para servidores externos
      </p>
    </div>
  );
}

// ─── Main EditorPage ──────────────────────────────────────────────────────────

export function EditorPage() {
  const navigate = useNavigate();

  // ── Document state ──
  const [docType, setDocType] = useState<DocType>("none");
  const [fileName, setFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);

  // ── PDF state ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // ── Annotations ──
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Active tool ──
  const [tool, setTool] = useState<Tool>("cursor");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#FFD700");
  const [strokeColor, setStrokeColor] = useState("#e11d48");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // ── Drawing state ──
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drawCurrent = useRef<{ x: number; y: number } | null>(null);
  const [drawPreviewState, setDrawPreviewState] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
    page: number;
  } | null>(null);
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);
  const activePageRef = useRef<number | null>(null);
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ── Signature ──
  const [showSignaturModal, setShowSignatureModal] = useState(false);
  const [pendingSig, setPendingSig] = useState<string | null>(null);
  const pendingSigPage = useRef<number>(0);
  const pendingSigPos = useRef<{ x: number; y: number }>({ x: 0.1, y: 0.1 });

  // ── OCR ──
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [showOcr, setShowOcr] = useState(false);

  // ── UI ──
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // ─── Load file ──────────────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File) => {
    // ── Validação de segurança antes de processar ──────────────────────────
    const validation = await validateFile(file);
    if (!validation.valid) {
      alert(`Arquivo bloqueado: ${validation.error}`);
      return;
    }
    if (validation.warnings.length > 0) {
      console.warn("[Editor] Avisos de validação:", validation.warnings);
    }

    setFileName(sanitizeText(file.name, 255));
    setOriginalFile(file);
    setAnnotations([]);
    setSelectedId(null);
    setPendingSig(null);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const mime = file.type.toLowerCase();

    if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "svg"].includes(ext)) {
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(file);
      });
      setImageDataUrl(dataUrl);
      setDocType("image");
      setPageCount(1);
      setPageDims([{ width: 800, height: 600 }]); // will be updated on img load

    } else if (ext === "docx" || ext === "doc" || mime.includes("wordprocessingml") || mime === "application/msword") {
      const mammothMod = await import("mammoth");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mammoth = (mammothMod as any).default ?? mammothMod;
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      // Sanitize DOCX HTML output to prevent XSS
      setDocxHtml(sanitizeHtml(result.value, "docx"));
      setDocType("docx");
      setPageCount(1);
      setPageDims([{ width: 794, height: 1123 }]);

    } else if (ext === "pdf" || mime === "application/pdf") {
      await ensurePdfWorker();
      const pdfjsLib = await import("pdfjs-dist");
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDocument(pdf);
      setPageCount(pdf.numPages);
      setDocType("pdf");

      // Get dimensions of all pages
      const dims: { width: number; height: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        dims.push({ width: vp.width, height: vp.height });
      }
      setPageDims(dims);
    }
  }, []);

  // ─── Render PDF pages ────────────────────────────────────────────────────────

  useEffect(() => {
    if (docType !== "pdf" || !pdfDocument) return;
    const renderAll = async () => {
      for (let i = 0; i < pageCount; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        const page = await pdfDocument.getPage(i + 1);
        const vp = page.getViewport({ scale });
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      }
    };
    renderAll();
  }, [pdfDocument, pageCount, scale, docType]);

  // ─── Mouse helpers ────────────────────────────────────────────────────────────

  const getRelativePos = (e: React.MouseEvent, pageIndex: number) => {
    const el = pageContainerRefs.current.get(pageIndex);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent, pageIndex: number) => {
    if (tool === "cursor") {
      setSelectedId(null);
      return;
    }
    const pos = getRelativePos(e, pageIndex);
    if (!pos) return;

    if (tool === "text") {
      const id = genId();
      setAnnotations((prev) => [
        ...prev,
        {
          id, type: "text", pageIndex,
          x: pos.x, y: pos.y, width: 0.25, height: 0.05,
          text: "Texto aqui", color: textColor, fontSize,
        },
      ]);
      setSelectedId(id);
      return;
    }

    if (tool === "signature") {
      if (pendingSig) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: genId(), type: "signature", pageIndex,
            x: pos.x - 0.1, y: pos.y - 0.04,
            width: 0.22, height: 0.1,
            signatureDataUrl: pendingSig,
          },
        ]);
        setPendingSig(null);
      } else {
        pendingSigPage.current = pageIndex;
        pendingSigPos.current = pos;
        setShowSignatureModal(true);
      }
      return;
    }

    if (tool === "eraser") {
      // Find annotation near click and delete
      const closest = annotations
        .filter((a) => a.pageIndex === pageIndex)
        .find((a) => {
          const cx = a.x + (a.width || 0) / 2;
          const cy = a.y + (a.height || 0) / 2;
          return Math.abs(pos.x - cx) < 0.1 && Math.abs(pos.y - cy) < 0.1;
        });
      if (closest) setAnnotations((prev) => prev.filter((a) => a.id !== closest.id));
      return;
    }

    // Drawing tools
    setIsDrawing(true);
    drawStart.current = pos;
    drawCurrent.current = pos;
    activePageRef.current = pageIndex;
    if (tool === "freehand") {
      freehandPointsRef.current = [pos];
      setFreehandPoints([pos]);
    }
    setDrawPreviewState({ start: pos, current: pos, page: pageIndex });
  };

  const handleMouseMove = (e: React.MouseEvent, pageIndex: number) => {
    if (!isDrawing || activePageRef.current !== pageIndex) return;
    const pos = getRelativePos(e, pageIndex);
    if (!pos) return;
    drawCurrent.current = pos;
    if (tool === "freehand") {
      freehandPointsRef.current.push(pos);
      // Update state periodically for preview (not every point to avoid perf issues)
      if (freehandPointsRef.current.length % 3 === 0) {
        setFreehandPoints([...freehandPointsRef.current]);
      }
    }
    setDrawPreviewState({ start: drawStart.current!, current: pos, page: pageIndex });
  };

  const handleMouseUp = (e: React.MouseEvent, pageIndex: number) => {
    if (!isDrawing || !drawStart.current || !drawCurrent.current) return;

    const start = drawStart.current;
    const end = drawCurrent.current;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    if (tool === "freehand") {
      const pts = [...freehandPointsRef.current];
      if (pts.length > 3) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: genId(), type: "freehand", pageIndex,
            x, y, width: w, height: h,
            color: strokeColor, strokeWidth,
            points: pts,
          },
        ]);
      }
      freehandPointsRef.current = [];
      setFreehandPoints([]);
    } else if (w > 0.005 || h > 0.005) {
      const isLine = tool === "line" || tool === "arrow";
      setAnnotations((prev) => [
        ...prev,
        {
          id: genId(), type: tool, pageIndex,
          x: isLine ? start.x : x,
          y: isLine ? start.y : y,
          width: isLine ? end.x - start.x : w,
          height: isLine ? end.y - start.y : h,
          color: tool === "highlight" ? highlightColor : strokeColor,
          opacity: tool === "highlight" ? 0.35 : 1,
          strokeWidth,
        },
      ]);
    }

    setIsDrawing(false);
    drawStart.current = null;
    drawCurrent.current = null;
    activePageRef.current = null;
    setDrawPreviewState(null);
  };

  // ─── OCR ─────────────────────────────────────────────────────────────────────

  const runOCR = async () => {
    setShowOcr(true);
    setOcrLoading(true);
    setOcrText(null);
    setOcrConfidence(null);

    try {
      if (docType === "image" && originalFile) {
        // Call Flask OCR service
        const formData = new FormData();
        formData.append("file", originalFile);
        formData.append("lang", "por+eng");

        const res = await fetch("http://localhost:5000/ocr", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`Serviço OCR retornou ${res.status}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        // Sanitize OCR output (plain text, no HTML)
        const text = sanitizeText(
          data.pages.map((p: { text: string }) => p.text).join("\n\n---\n\n"),
          500_000
        );
        setOcrText(text);
        setOcrConfidence(data.pages[0]?.confidence ?? null);

      } else if (docType === "pdf" && pdfDocument) {
        // Extract text via pdf.js built-in
        let full = "";
        for (let i = 1; i <= pageCount; i++) {
          const pg = await pdfDocument.getPage(i);
          const tc = await pg.getTextContent();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txt = tc.items.map((it: any) => it.str).join(" ");
          full += `[Página ${i}]\n${txt}\n\n`;
        }
        setOcrText(full.trim() || "(Nenhum texto extraível — pode ser PDF escaneado)");

      } else if (docType === "docx" && docxHtml) {
        const d = document.createElement("div");
        d.innerHTML = docxHtml;
        setOcrText(d.innerText || d.textContent || "(Sem texto)");

      } else {
        setOcrText("Carregue um documento primeiro.");
      }
    } catch (err) {
      setOcrText(
        `❌ Erro: ${err instanceof Error ? err.message : "desconhecido"}\n\n` +
        `Para imagens, certifique-se de que o serviço OCR está rodando:\n` +
        `  cd ocr-service && python main.py\n\n` +
        `O serviço Flask precisa de CORS habilitado:\n` +
        `  pip install flask-cors\n` +
        `  from flask_cors import CORS; CORS(app)`
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const insertOcrText = (text: string) => {
    const id = genId();
    setAnnotations((prev) => [
      ...prev,
      {
        id, type: "text", pageIndex: 0,
        x: 0.05, y: 0.05, width: 0.9, height: 0.15,
        text, color: "#1e293b", fontSize: 12,
      },
    ]);
    setShowOcr(false);
  };

  // ─── Export PDF ───────────────────────────────────────────────────────────────

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pdfDoc: any;

      if (docType === "pdf" && originalFile) {
        const bytes = await originalFile.arrayBuffer();
        pdfDoc = await PDFDocument.load(bytes);
      } else {
        // Create new PDF
        pdfDoc = await PDFDocument.create();
        const pages_count = pageCount || 1;

        if (docType === "image" && imageDataUrl) {
          const base64 = imageDataUrl.split(",")[1];
          const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const isMime = (m: string) => imageDataUrl.startsWith(`data:${m}`);
          let embedImg;
          if (isMime("image/png")) embedImg = await pdfDoc.embedPng(imgBytes);
          else embedImg = await pdfDoc.embedJpg(imgBytes);
          const pg = pdfDoc.addPage([embedImg.width, embedImg.height]);
          pg.drawImage(embedImg, { x: 0, y: 0, width: embedImg.width, height: embedImg.height });
        } else {
          for (let i = 0; i < pages_count; i++) pdfDoc.addPage([595, 842]);
        }
      }

      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const allPages = pdfDoc.getPages();

      for (const ann of annotations) {
        if (!showAnnotations) continue;
        const pg = allPages[ann.pageIndex];
        if (!pg) continue;
        const { width: PW, height: PH } = pg.getSize();

        // Flip Y (PDF coords start bottom-left)
        const pdfX = ann.x * PW;
        const pdfH = (ann.height || 0) * PH;
        const pdfY = PH - (ann.y + (ann.height || 0)) * PH;
        const pdfW = (ann.width || 0) * PW;

        const c = hexToRgbFloat(ann.color || "#000000");
        const color = rgb(c.r, c.g, c.b);

        switch (ann.type) {
          case "text":
            try {
              pg.drawText(ann.text || "", {
                x: pdfX + 2,
                y: pdfY + pdfH / 2,
                font: helvetica,
                size: ann.fontSize || 14,
                color,
              });
            } catch { /* font encoding issues */ }
            break;

          case "highlight": {
            const hc = hexToRgbFloat(ann.color || "#FFD700");
            pg.drawRectangle({
              x: pdfX, y: pdfY, width: pdfW, height: pdfH,
              color: rgb(hc.r, hc.g, hc.b),
              opacity: ann.opacity ?? 0.35,
            });
            break;
          }

          case "rect":
            pg.drawRectangle({
              x: pdfX, y: pdfY, width: pdfW, height: pdfH,
              borderColor: color, borderWidth: ann.strokeWidth || 2,
            });
            break;

          case "circle":
            pg.drawEllipse({
              x: pdfX + pdfW / 2, y: pdfY + pdfH / 2,
              xScale: pdfW / 2, yScale: pdfH / 2,
              borderColor: color, borderWidth: ann.strokeWidth || 2,
            });
            break;

          case "line":
          case "arrow":
          case "underline":
          case "strikethrough": {
            // Start and end in PDF coordinates (Y flipped)
            const sx = ann.x * PW;
            const sy = PH - ann.y * PH;
            const ex = (ann.x + (ann.width || 0)) * PW;
            const ey = PH - (ann.y + (ann.height || 0)) * PH;
            const midY = (sy + ey) / 2;
            pg.drawLine({
              start: { x: sx, y: ann.type === "underline" ? ey : ann.type === "strikethrough" ? midY : sy },
              end: { x: ex, y: ann.type === "underline" ? ey : ann.type === "strikethrough" ? midY : ey },
              color,
              thickness: ann.strokeWidth || 2,
            });
            break;
          }

          case "signature":
            if (ann.signatureDataUrl) {
              try {
                const b64 = ann.signatureDataUrl.split(",")[1];
                const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const sigImg = await pdfDoc.embedPng(imgBytes);
                pg.drawImage(sigImg, {
                  x: pdfX, y: pdfY, width: pdfW, height: pdfH,
                });
              } catch { /* embed failed */ }
            }
            break;

          case "freehand":
            if (ann.points && ann.points.length > 1) {
              for (let i = 0; i < ann.points.length - 1; i++) {
                pg.drawLine({
                  start: { x: ann.points[i].x * PW, y: PH - ann.points[i].y * PH },
                  end: { x: ann.points[i + 1].x * PW, y: PH - ann.points[i + 1].y * PH },
                  color, thickness: ann.strokeWidth || 2,
                });
              }
            }
            break;
        }
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.[^.]+$/, "") + "_editado.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro ao exportar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  };

  // ─── Update annotation text (inline editing) ──────────────────────────────────

  const updateAnnotationText = (id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  };

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
          setSelectedId(null);
        }
      }
      if (e.key === "Escape") { setSelectedId(null); setPendingSig(null); setTool("cursor"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // ─── Active color (depends on tool) ──────────────────────────────────────────

  const activeColor =
    tool === "highlight" ? highlightColor :
    tool === "text" ? textColor :
    strokeColor;

  const setActiveColor = (c: string) => {
    if (tool === "highlight") setHighlightColor(c);
    else if (tool === "text") setTextColor(c);
    else setStrokeColor(c);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0b0c1b",
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Top Bar ── */}
      <div
        style={{
          height: 52,
          background: "#12152b",
          borderBottom: "1px solid #1e2347",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "#4f46e5", background: "none", border: "none",
            cursor: "pointer", fontSize: "0.9rem",
          }}
        >
          <span style={{ fontSize: "1.1rem" }}>⚡</span>
          <span style={{ color: "#e2e8f0" }}>Transforma</span>
          <span style={{ color: "#334155" }}>/ Editor</span>
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          {fileName && (
            <span style={{ color: "#64748b", fontSize: "0.82rem", marginLeft: 8 }}>
              <FileText size={13} style={{ display: "inline", marginRight: 4 }} />
              {fileName}
            </span>
          )}
        </div>

        {/* Zoom */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} style={iconBtnStyle}>
            <ZoomOut size={16} />
          </button>
          <span style={{ color: "#64748b", fontSize: "0.78rem", minWidth: 44, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.2))} style={iconBtnStyle}>
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Toggle annotations */}
        <button
          onClick={() => setShowAnnotations((v) => !v)}
          title={showAnnotations ? "Ocultar anotações" : "Mostrar anotações"}
          style={iconBtnStyle}
        >
          {showAnnotations ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        {/* Undo last */}
        <button
          onClick={() => setAnnotations((prev) => prev.slice(0, -1))}
          title="Desfazer última anotação"
          style={iconBtnStyle}
        >
          <RotateCcw size={16} />
        </button>

        {/* OCR button */}
        <button
          onClick={() => { setShowOcr(true); if (!ocrText && !ocrLoading) runOCR(); }}
          style={{
            ...iconBtnStyle,
            background: showOcr ? "#1e2347" : "transparent",
            color: showOcr ? "#818cf8" : "#64748b",
          }}
          title="OCR — Extrair texto"
        >
          <ScanText size={16} />
        </button>

        {/* Export */}
        <button
          onClick={exportPdf}
          disabled={exporting || docType === "none"}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            background: exporting ? "#1e2347" : "#4f46e5",
            color: exporting ? "#475569" : "#fff",
            border: "none", cursor: exporting ? "not-allowed" : "pointer",
            fontSize: "0.82rem",
          }}
        >
          <Download size={14} />
          {exporting ? "Exportando…" : "Exportar PDF"}
        </button>

        <button onClick={() => navigate("/")} style={iconBtnStyle} title="Fechar editor">
          <X size={18} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Left Toolbar ── */}
        {docType !== "none" && (
          <div
            style={{
              width: 54,
              background: "#12152b",
              borderRight: "1px solid #1e2347",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "8px 0",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <ToolBtn active={tool === "cursor"} onClick={() => setTool("cursor")} title="Cursor (Esc)">
              <MousePointer2 size={17} />
            </ToolBtn>

            <div style={{ width: 30, height: 1, background: "#1e2347", margin: "2px 0" }} />

            <ToolBtn active={tool === "text"} onClick={() => setTool("text")} title="Texto">
              <Type size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "highlight"} onClick={() => setTool("highlight")} title="Marcador">
              <Highlighter size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "underline"} onClick={() => setTool("underline")} title="Sublinhar">
              <Underline size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "strikethrough"} onClick={() => setTool("strikethrough")} title="Tachado">
              <Strikethrough size={17} />
            </ToolBtn>

            <div style={{ width: 30, height: 1, background: "#1e2347", margin: "2px 0" }} />

            <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} title="Retângulo">
              <Square size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "circle"} onClick={() => setTool("circle")} title="Elipse">
              <Circle size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "line"} onClick={() => setTool("line")} title="Linha">
              <Minus size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} title="Seta">
              <ArrowRight size={17} />
            </ToolBtn>
            <ToolBtn active={tool === "freehand"} onClick={() => setTool("freehand")} title="Desenho livre">
              <PenLine size={17} />
            </ToolBtn>

            <div style={{ width: 30, height: 1, background: "#1e2347", margin: "2px 0" }} />

            <ToolBtn
              active={tool === "signature"}
              onClick={() => {
                setTool("signature");
                if (!pendingSig) setShowSignatureModal(true);
              }}
              title="Assinatura"
            >
              <Pen size={17} />
            </ToolBtn>

            <div style={{ width: 30, height: 1, background: "#1e2347", margin: "2px 0" }} />

            <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} title="Borracha">
              <Eraser size={17} />
            </ToolBtn>

            <div style={{ flex: 1 }} />

            {/* Color swatch */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowColorPicker((v) => !v)}
                title="Cor"
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: activeColor,
                  border: "2px solid #2a2f55",
                  cursor: "pointer",
                }}
              />
              {showColorPicker && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 40,
                    left: 40,
                    background: "#12152b",
                    border: "1px solid #1e2347",
                    borderRadius: 10,
                    padding: 12,
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  }}
                >
                  <span style={{ color: "#64748b", fontSize: "0.72rem" }}>Cor ativa</span>
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => setActiveColor(e.target.value)}
                    style={{ width: 80, height: 32, borderRadius: 6, border: "none", cursor: "pointer" }}
                  />
                  {/* Presets */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 120 }}>
                    {["#000000", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#7c3aed", "#db2777", "#ffffff", "#FFD700"].map((c) => (
                      <button
                        key={c}
                        onClick={() => { setActiveColor(c); setShowColorPicker(false); }}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          background: c, border: activeColor === c ? "2px solid #818cf8" : "2px solid #1e2347",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                  {/* Stroke width */}
                  {tool !== "text" && tool !== "highlight" && (
                    <>
                      <span style={{ color: "#64748b", fontSize: "0.72rem", marginTop: 4 }}>Espessura</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[1, 2, 3, 5, 8].map((w) => (
                          <button
                            key={w}
                            onClick={() => setStrokeWidth(w)}
                            style={{
                              width: 24, height: 24, borderRadius: 4,
                              background: strokeWidth === w ? "#4f46e5" : "#1e2347",
                              color: "#fff", fontSize: "0.7rem",
                              border: "1px solid #2a2f55", cursor: "pointer",
                            }}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {/* Font size */}
                  {tool === "text" && (
                    <>
                      <span style={{ color: "#64748b", fontSize: "0.72rem", marginTop: 4 }}>Tamanho</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[10, 12, 14, 16, 20, 24].map((s) => (
                          <button
                            key={s}
                            onClick={() => setFontSize(s)}
                            style={{
                              padding: "2px 5px", borderRadius: 4,
                              background: fontSize === s ? "#4f46e5" : "#1e2347",
                              color: "#fff", fontSize: "0.65rem",
                              border: "1px solid #2a2f55", cursor: "pointer",
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* OCR shortcut */}
            <ToolBtn
              active={showOcr}
              onClick={() => { setShowOcr((v) => !v); if (!ocrText && !ocrLoading) runOCR(); }}
              title="OCR"
            >
              <AlignLeft size={16} />
            </ToolBtn>
          </div>
        )}

        {/* ── Center canvas area ── */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: "#0e1122",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "24px 0",
            gap: 24,
          }}
          onClick={() => { setShowColorPicker(false); }}
        >
          {docType === "none" ? (
            <UploadZone onFile={loadFile} />
          ) : (
            Array.from({ length: pageCount }).map((_, i) => {
              const dims = pageDims[i] || { width: 800, height: 1000 };
              const scaledW = dims.width * scale;
              const scaledH = dims.height * scale;

              const pageAnns = annotations.filter((a) => a.pageIndex === i);
              const isActivePreview = drawPreviewState?.page === i;

              return (
                <div key={i} style={{ position: "relative" }}>
                  {/* Page label */}
                  {pageCount > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: -24,
                        left: 0,
                        color: "#334155",
                        fontSize: "0.72rem",
                      }}
                    >
                      Página {i + 1}
                    </div>
                  )}

                  {/* Page container */}
                  <div
                    ref={(el) => { if (el) pageContainerRefs.current.set(i, el); }}
                    style={{
                      position: "relative",
                      width: scaledW,
                      height: docType === "pdf" ? scaledH : "auto",
                      boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    {/* PDF canvas */}
                    {docType === "pdf" && (
                      <canvas
                        ref={(el) => { canvasRefs.current[i] = el; }}
                        style={{ display: "block", borderRadius: 4 }}
                      />
                    )}

                    {/* Image */}
                    {docType === "image" && imageDataUrl && (
                      <img
                        src={imageDataUrl}
                        alt="Document"
                        style={{
                          display: "block",
                          width: scaledW,
                          height: "auto",
                          borderRadius: 4,
                        }}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setPageDims([{ width: img.naturalWidth, height: img.naturalHeight }]);
                        }}
                      />
                    )}

                    {/* DOCX HTML */}
                    {docType === "docx" && docxHtml && (
                      <div
                        style={{
                          background: "#fff",
                          padding: `${40 * scale}px`,
                          width: scaledW,
                          minHeight: scaledH,
                          boxSizing: "border-box",
                        }}
                        dangerouslySetInnerHTML={{ __html: docxHtml }}
                      />
                    )}

                    {/* SVG annotation layer */}
                    {showAnnotations && (
                      <svg
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="none"
                        style={{
                          position: "absolute",
                          top: 0, left: 0,
                          width: "100%", height: "100%",
                          pointerEvents: "none",
                          overflow: "visible",
                        }}
                      >
                        {pageAnns
                          .filter((a) => a.type !== "text" && a.type !== "signature")
                          .map((a) => (
                            <AnnotationShape key={a.id} a={a} />
                          ))}

                        {/* Draw preview */}
                        {isActivePreview && drawPreviewState && (
                          <DrawPreview
                            tool={tool}
                            start={drawPreviewState.start}
                            current={drawPreviewState.current}
                            color={tool === "highlight" ? highlightColor : strokeColor}
                            strokeWidth={strokeWidth}
                            points={freehandPoints}
                          />
                        )}
                      </svg>
                    )}

                    {/* Text & signature annotation layer */}
                    {showAnnotations && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0, left: 0,
                          width: "100%", height: "100%",
                          pointerEvents: "none",
                        }}
                      >
                        {pageAnns
                          .filter((a) => a.type === "text" || a.type === "signature")
                          .map((a) => {
                            if (a.type === "text") {
                              return (
                                <div
                                  key={a.id}
                                  contentEditable={tool === "cursor" && selectedId === a.id}
                                  suppressContentEditableWarning
                                  onClick={(e) => {
                                    if (tool === "cursor") {
                                      e.stopPropagation();
                                      setSelectedId(a.id);
                                    } else if (tool === "eraser") {
                                      setAnnotations((prev) => prev.filter((x) => x.id !== a.id));
                                    }
                                  }}
                                  onBlur={(e) => updateAnnotationText(a.id, e.currentTarget.textContent || "")}
                                  style={{
                                    position: "absolute",
                                    left: `${a.x * 100}%`,
                                    top: `${a.y * 100}%`,
                                    color: a.color || "#000",
                                    fontSize: `${(a.fontSize || 16) * scale}px`,
                                    fontFamily: "Arial, sans-serif",
                                    cursor: tool === "cursor" ? "text" : "default",
                                    outline: selectedId === a.id ? "1px dashed #818cf8" : "none",
                                    padding: "1px 3px",
                                    background: selectedId === a.id ? "rgba(129,140,248,0.08)" : "transparent",
                                    borderRadius: 2,
                                    pointerEvents: "auto",
                                    userSelect: "text",
                                    minWidth: "60px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {a.text}
                                </div>
                              );
                            }

                            if (a.type === "signature" && a.signatureDataUrl) {
                              return (
                                <img
                                  key={a.id}
                                  src={a.signatureDataUrl}
                                  alt="Signature"
                                  onClick={(e) => {
                                    if (tool === "cursor") {
                                      e.stopPropagation();
                                      setSelectedId(a.id);
                                    } else if (tool === "eraser") {
                                      setAnnotations((prev) => prev.filter((x) => x.id !== a.id));
                                    }
                                  }}
                                  style={{
                                    position: "absolute",
                                    left: `${a.x * 100}%`,
                                    top: `${a.y * 100}%`,
                                    width: `${(a.width || 0.2) * 100}%`,
                                    height: "auto",
                                    cursor: tool === "cursor" ? "move" : "default",
                                    outline: selectedId === a.id ? "2px dashed #818cf8" : "none",
                                    pointerEvents: "auto",
                                  }}
                                />
                              );
                            }

                            return null;
                          })}
                      </div>
                    )}

                    {/* Interaction layer (captures mouse for drawing tools) */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0, left: 0,
                        width: "100%", height: "100%",
                        pointerEvents: tool === "cursor" ? "none" : "all",
                        cursor: getCursor(tool, !!pendingSig),
                        zIndex: 20,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, i)}
                      onMouseMove={(e) => handleMouseMove(e, i)}
                      onMouseUp={(e) => handleMouseUp(e, i)}
                      onMouseLeave={(e) => {
                        if (isDrawing) handleMouseUp(e, i);
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── OCR Panel ── */}
        {showOcr && (
          <OCRPanel
            text={ocrText}
            loading={ocrLoading}
            confidence={ocrConfidence}
            onClose={() => setShowOcr(false)}
            onCopyToDoc={insertOcrText}
          />
        )}
      </div>

      {/* ── Bottom status bar ── */}
      {docType !== "none" && (
        <div
          style={{
            height: 32,
            background: "#12152b",
            borderTop: "1px solid #1e2347",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#475569", fontSize: "0.72rem" }}>
            {pageCount > 1 ? `${pageCount} páginas` : "1 página"}
          </span>
          <span style={{ color: "#475569", fontSize: "0.72rem" }}>
            {annotations.length} anotaç{annotations.length === 1 ? "ão" : "ões"}
          </span>
          <span style={{ color: "#475569", fontSize: "0.72rem" }}>
            Zoom: {Math.round(scale * 100)}%
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "#334155", fontSize: "0.7rem" }}>
            Delete/Backspace: remover selecionado · Esc: cursor
          </span>
        </div>
      )}

      {/* ── Signature Modal ── */}
      {showSignaturModal && (
        <SignatureModal
          onSave={(dataUrl) => {
            setPendingSig(dataUrl);
            setTool("signature");
          }}
          onClose={() => {
            setShowSignatureModal(false);
            if (!pendingSig) setTool("cursor");
          }}
        />
      )}

      {/* ── Pending signature indicator ── */}
      {pendingSig && tool === "signature" && (
        <div
          style={{
            position: "fixed",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#4f46e5",
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 20,
            fontSize: "0.82rem",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 4px 24px rgba(79,70,229,0.4)",
            zIndex: 40,
          }}
        >
          <Pen size={14} />
          Clique no documento para colocar a assinatura
          <button
            onClick={() => { setPendingSig(null); setTool("cursor"); }}
            style={{ background: "none", border: "none", color: "#a5b4fc", cursor: "pointer", marginLeft: 4 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", color: "#64748b",
  border: "none", cursor: "pointer",
};
