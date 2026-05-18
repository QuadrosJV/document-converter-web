import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Camera, Upload, SwitchCamera, RotateCcw, RefreshCw,
  Download, Send, ChevronLeft, Loader2, Scan, CheckCircle,
} from "lucide-react";
import {
  loadImageToCanvas,
  detectDocumentCorners,
  processScan,
  applyFilter,
  removeShadows,
  perspectiveCorrect,
  autoEnhance,
  type Point,
  type FilterType,
} from "../../utils/scanner/imageProcessor";
import {
  generateScannedPDF,
  canvasToPngBlob,
  canvasToJpegBlob,
} from "../../utils/scanner/pdfGenerator";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "source" | "capture" | "adjust" | "filter" | "export";

interface Props {
  onComplete: (file: File) => void;
  onClose: () => void;
}

const FILTERS: { key: FilterType; label: string; desc: string }[] = [
  { key: "original", label: "Original", desc: "Cores naturais" },
  { key: "grayscale", label: "Cinza", desc: "Escala de cinza" },
  { key: "hd", label: "Scanner HD", desc: "Alto contraste" },
  { key: "bw", label: "P&B", desc: "Preto e branco" },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function defer<T>(fn: () => T): Promise<T> {
  return new Promise((res) => setTimeout(() => res(fn()), 30));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SmartScannerModal({ onComplete, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("source");

  // Source image
  const [srcCanvas, setSrcCanvas] = useState<HTMLCanvasElement | null>(null);
  const [srcDataUrl, setSrcDataUrl] = useState<string | null>(null);

  // Corners (TL, TR, BR, BL) in source image coordinates
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null);

  // Filter & preview
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("hd");
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null); // corrected+shadow-free, 800px
  const [filterPreviews, setFilterPreviews] = useState<Partial<Record<FilterType, string>>>({});
  const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null);

  // Final export canvas (full resolution)
  const [exportCanvas, setExportCanvas] = useState<HTMLCanvasElement | null>(null);
  const [exportDataUrl, setExportDataUrl] = useState<string | null>(null);

  // Processing flags
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  // Camera state
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  // Dragging corner index
  const [dragging, setDragging] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Camera ─────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    stopCamera();
    setCameraReady(false);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch {
      setCameraError("Câmera não disponível. Verifique as permissões do navegador.");
    }
  }, [stopCamera]);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    const cv = document.createElement("canvas");
    cv.width = video.videoWidth;
    cv.height = video.videoHeight;
    cv.getContext("2d")!.drawImage(video, 0, 0);
    stopCamera();
    loadFromCanvas(cv);
  };

  // ── Image loading ──────────────────────────────────────────────────────────

  const loadFromCanvas = useCallback((cv: HTMLCanvasElement) => {
    setSrcCanvas(cv);
    setSrcDataUrl(cv.toDataURL("image/jpeg", 0.85));
    const detected = detectDocumentCorners(cv);
    setCorners(detected);
    setPhase("adjust");
  }, []);

  const handleFileInput = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const cv = await loadImageToCanvas(file);
      loadFromCanvas(cv);
    } catch {
      // silently ignore
    }
  }, [loadFromCanvas]);

  // ── Corner adjustment ──────────────────────────────────────────────────────

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging === null || !corners || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const newCorners = [...corners] as [Point, Point, Point, Point];
    newCorners[dragging] = {
      x: Math.max(0, Math.min(srcCanvas!.width, svgPt.x)),
      y: Math.max(0, Math.min(srcCanvas!.height, svgPt.y)),
    };
    setCorners(newCorners);
  };

  const handleSvgPointerUp = () => setDragging(null);

  const reDetect = () => {
    if (!srcCanvas) return;
    setCorners(detectDocumentCorners(srcCanvas));
  };

  // ── Filter phase ───────────────────────────────────────────────────────────

  const enterFilterPhase = useCallback(async () => {
    if (!srcCanvas || !corners) return;
    setPhase("filter");
    setProcessing(true);
    setFilterPreviews({});
    setMainPreviewUrl(null);

    const base = await defer(() => {
      const corrected = perspectiveCorrect(srcCanvas, corners, 900);
      const noShadow = removeShadows(corrected);
      return autoEnhance(noShadow);
    });
    setBaseCanvas(base);

    // Thumbnails (200px wide max)
    const thumbScale = Math.min(1, 200 / base.width);
    const thumbW = Math.round(base.width * thumbScale);
    const thumbH = Math.round(base.height * thumbScale);
    const thumb = document.createElement("canvas");
    thumb.width = thumbW; thumb.height = thumbH;
    thumb.getContext("2d")!.drawImage(base, 0, 0, thumbW, thumbH);

    const previews: Partial<Record<FilterType, string>> = {};
    for (const { key } of FILTERS) {
      const filtered = await defer(() => applyFilter(thumb, key));
      previews[key] = filtered.toDataURL("image/jpeg", 0.75);
    }
    setFilterPreviews(previews);

    const main = await defer(() => applyFilter(base, "hd"));
    setMainPreviewUrl(main.toDataURL("image/jpeg", 0.88));
    setSelectedFilter("hd");
    setProcessing(false);
  }, [srcCanvas, corners]);

  const handleFilterChange = useCallback(
    async (f: FilterType) => {
      if (!baseCanvas) return;
      setSelectedFilter(f);
      const result = await defer(() => applyFilter(baseCanvas, f));
      setMainPreviewUrl(result.toDataURL("image/jpeg", 0.88));
    },
    [baseCanvas]
  );

  // ── Export phase ───────────────────────────────────────────────────────────

  const enterExportPhase = useCallback(async () => {
    if (!srcCanvas || !corners) return;
    setPhase("export");
    setProcessing(true);
    setExportCanvas(null);
    setExportDataUrl(null);

    const cv = await defer(() => processScan(srcCanvas, corners, selectedFilter, 3000));
    setExportCanvas(cv);
    setExportDataUrl(cv.toDataURL("image/jpeg", 0.92));
    setProcessing(false);
  }, [srcCanvas, corners, selectedFilter]);

  const handleDownloadPDF = useCallback(async () => {
    if (!exportCanvas || exporting) return;
    setExporting(true);
    try {
      const blob = await generateScannedPDF(exportCanvas, { quality: 0.92 });
      downloadBlob(blob, `documento_escaneado_${Date.now()}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [exportCanvas, exporting]);

  const handleDownloadPNG = useCallback(async () => {
    if (!exportCanvas || exporting) return;
    setExporting(true);
    try {
      const blob = await canvasToPngBlob(exportCanvas);
      downloadBlob(blob, `documento_escaneado_${Date.now()}.png`);
    } finally {
      setExporting(false);
    }
  }, [exportCanvas, exporting]);

  const handleSendToConverter = useCallback(async () => {
    if (!exportCanvas || exporting) return;
    setExporting(true);
    try {
      const blob = await canvasToJpegBlob(exportCanvas, 0.92);
      const file = new File([blob], `scanner_${Date.now()}.jpg`, { type: "image/jpeg" });
      setDone(true);
      setTimeout(() => { onComplete(file); onClose(); }, 700);
    } finally {
      setExporting(false);
    }
  }, [exportCanvas, exporting, onComplete, onClose]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (phase === "capture") { stopCamera(); setPhase("source"); }
    else if (phase === "adjust") { setSrcCanvas(null); setSrcDataUrl(null); setPhase("source"); }
    else if (phase === "filter") { setPhase("adjust"); }
    else if (phase === "export") { setPhase("filter"); }
  };

  const handleClose = () => { stopCamera(); onClose(); };

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // Start camera when entering capture phase
  useEffect(() => {
    if (phase === "capture") startCamera(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const canGoBack = phase !== "source";
  const title =
    phase === "source" ? "Escanear Documento"
    : phase === "capture" ? "Capturar"
    : phase === "adjust" ? "Ajustar Bordas"
    : phase === "filter" ? "Escolher Filtro"
    : "Exportar";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col select-none"
      style={{ background: "#090a18" }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
        style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 flex-1">
          {canGoBack ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors cursor-pointer"
              style={{ fontSize: "0.85rem" }}
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Voltar</span>
            </button>
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              <Scan size={16} className="text-white" />
            </div>
          )}
          <span style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>{title}</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mx-4">
          {(["source", "adjust", "filter", "export"] as Phase[]).map((p, i) => (
            <div
              key={p}
              className="rounded-full transition-all duration-300"
              style={{
                width: phase === p ? 20 : 6,
                height: 6,
                background: phase === p
                  ? "linear-gradient(90deg,#6366f1,#8b5cf6)"
                  : ["source","adjust","filter","export"].indexOf(phase) > i
                    ? "rgba(99,102,241,0.5)"
                    : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>

        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 transition-colors cursor-pointer shrink-0"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Phase content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* ── SOURCE ── */}
        {phase === "source" && (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 gap-6">
            <div className="text-center mb-2">
              <p className="text-white/40 text-xs tracking-widest uppercase mb-1">Modo de entrada</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.9rem" }}>
                Fotografe ou envie uma imagem do documento
              </p>
            </div>

            <div className="w-full max-w-sm flex flex-col gap-4">
              <button
                onClick={() => setPhase("capture")}
                className="w-full flex items-center gap-4 px-5 py-5 rounded-2xl border cursor-pointer transition-all duration-200 hover:border-indigo-500/40 active:scale-[0.98]"
                style={{
                  background: "rgba(99,102,241,0.05)",
                  borderColor: "rgba(99,102,241,0.2)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                >
                  <Camera size={22} className="text-white" />
                </div>
                <div className="text-left">
                  <p style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>Usar Câmera</p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>
                    Fotografar documento em tempo real
                  </p>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-4 px-5 py-5 rounded-2xl border cursor-pointer transition-all duration-200 hover:border-white/20 active:scale-[0.98]"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <Upload size={22} style={{ color: "rgba(255,255,255,0.6)" }} />
                </div>
                <div className="text-left">
                  <p style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600 }}>
                    Upload de Imagem
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>
                    PNG, JPG, WEBP, HEIC e mais
                  </p>
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileInput(f); }}
              />
            </div>

            {/* Feature chips */}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {["Detecção automática", "Correção de perspectiva", "Remoção de sombras", "Filtros profissionais"].map((f) => (
                <span
                  key={f}
                  className="px-3 py-1 rounded-full text-xs border"
                  style={{
                    borderColor: "rgba(99,102,241,0.25)",
                    color: "rgba(129,140,248,0.8)",
                    background: "rgba(99,102,241,0.07)",
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── CAPTURE ── */}
        {phase === "capture" && (
          <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 57px)" }}>
            <div className="flex-1 relative overflow-hidden bg-black">
              <video
                ref={videoRef}
                playsInline muted
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />

              {/* Document guide frame */}
              {cameraReady && (
                <div
                  style={{
                    position: "absolute",
                    inset: "8%",
                    border: "2px solid rgba(255,255,255,0.25)",
                    borderRadius: 12,
                    pointerEvents: "none",
                  }}
                >
                  {[
                    { top: -3, left: -3, borderTopWidth: 3, borderLeftWidth: 3 },
                    { top: -3, right: -3, borderTopWidth: 3, borderRightWidth: 3 },
                    { bottom: -3, left: -3, borderBottomWidth: 3, borderLeftWidth: 3 },
                    { bottom: -3, right: -3, borderBottomWidth: 3, borderRightWidth: 3 },
                  ].map((style, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        width: 28, height: 28,
                        borderColor: "#818cf8",
                        borderStyle: "solid",
                        borderWidth: 0,
                        ...style,
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%", left: 12, right: 12,
                      height: 1,
                      background: "rgba(129,140,248,0.3)",
                      transform: "translateY(-50%)",
                    }}
                  />
                  <p
                    style={{
                      position: "absolute",
                      bottom: -28, left: 0, right: 0,
                      textAlign: "center",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "0.75rem",
                    }}
                  >
                    Posicione o documento dentro da moldura
                  </p>
                </div>
              )}

              {flash && (
                <div
                  style={{
                    position: "absolute", inset: 0,
                    background: "#fff", opacity: 0.75, pointerEvents: "none",
                  }}
                />
              )}

              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: "50%",
                      border: "3px solid rgba(255,255,255,0.15)",
                      borderTop: "3px solid #818cf8",
                      animation: "sspin 1s linear infinite",
                    }}
                  />
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <Camera size={48} style={{ color: "#4b5563" }} />
                  <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>{cameraError}</p>
                  <button
                    onClick={() => startCamera(facingMode)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl cursor-pointer text-sm"
                    style={{ background: "#4f46e5", color: "#fff" }}
                  >
                    <RotateCcw size={14} /> Tentar novamente
                  </button>
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div
              className="flex items-center justify-between px-8 py-5 shrink-0"
              style={{ background: "rgba(0,0,0,0.85)" }}
            >
              <button
                onClick={switchCamera}
                className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <SwitchCamera size={20} style={{ color: "#fff" }} />
              </button>

              <button
                onClick={capturePhoto}
                disabled={!cameraReady}
                style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: cameraReady ? "#fff" : "rgba(255,255,255,0.3)",
                  border: "4px solid rgba(255,255,255,0.4)",
                  cursor: cameraReady ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: cameraReady ? "0 0 0 6px rgba(255,255,255,0.1)" : "none",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: cameraReady ? "#fff" : "rgba(255,255,255,0.2)",
                    border: "3px solid #1a1b2e",
                  }}
                />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                title="Usar galeria"
              >
                <Upload size={18} style={{ color: "#fff" }} />
              </button>
            </div>
          </div>
        )}

        {/* ── ADJUST ── */}
        {phase === "adjust" && srcCanvas && corners && (
          <div className="flex flex-col min-h-full">
            {/* Info */}
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
                Arraste os cantos para ajustar o recorte do documento
              </p>
              <button
                onClick={reDetect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-xs shrink-0 transition-colors hover:opacity-80"
                style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)" }}
              >
                <RefreshCw size={11} /> Detectar
              </button>
            </div>

            {/* Image + SVG overlay */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center p-2">
              <div className="relative w-full max-h-[65vh]" style={{ maxWidth: "min(100%, 700px)" }}>
                <img
                  src={srcDataUrl!}
                  alt="documento"
                  style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }}
                />

                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${srcCanvas.width} ${srcCanvas.height}`}
                  preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
                  onPointerMove={handleSvgPointerMove}
                  onPointerUp={handleSvgPointerUp}
                  onPointerLeave={handleSvgPointerUp}
                >
                  {/* Dimming outside doc */}
                  <defs>
                    <mask id="scan-mask">
                      <rect width="100%" height="100%" fill="white" />
                      <polygon
                        points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect
                    width="100%" height="100%"
                    fill="rgba(0,0,0,0.45)"
                    mask="url(#scan-mask)"
                  />

                  {/* Document outline */}
                  <polygon
                    points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                    fill="rgba(99,102,241,0.08)"
                    stroke="rgba(129,140,248,0.85)"
                    strokeWidth={Math.max(srcCanvas.width, srcCanvas.height) * 0.004}
                    strokeDasharray={`${Math.max(srcCanvas.width, srcCanvas.height) * 0.018} ${Math.max(srcCanvas.width, srcCanvas.height) * 0.009}`}
                  />

                  {/* Edge lines */}
                  {corners.map((c, i) => {
                    const next = corners[(i + 1) % 4]
                    return (
                      <line
                        key={`line-${i}`}
                        x1={c.x} y1={c.y} x2={next.x} y2={next.y}
                        stroke="rgba(129,140,248,0.5)"
                        strokeWidth={Math.max(srcCanvas.width, srcCanvas.height) * 0.002}
                      />
                    )
                  })}

                  {/* Corner handles */}
                  {corners.map((c, i) => {
                    const r = Math.max(srcCanvas.width, srcCanvas.height) * 0.028
                    const labels = ["TL", "TR", "BR", "BL"]
                    return (
                      <g key={`corner-${i}`}>
                        <circle
                          cx={c.x} cy={c.y} r={r * 1.6}
                          fill="transparent"
                          style={{ cursor: "grab", touchAction: "none" }}
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId)
                            setDragging(i)
                          }}
                        />
                        <circle
                          cx={c.x} cy={c.y} r={r}
                          fill="rgba(99,102,241,0.9)"
                          stroke="white"
                          strokeWidth={r * 0.25}
                          style={{ pointerEvents: "none" }}
                        />
                        <text
                          x={c.x} y={c.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={r * 0.8}
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {labels[i]}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>

            {/* Continue button */}
            <div className="px-4 py-4 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <button
                onClick={enterFilterPhase}
                className="w-full py-4 rounded-xl text-white cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  boxShadow: "0 4px 24px rgba(99,102,241,0.3)",
                  fontSize: "0.95rem", fontWeight: 600,
                }}
              >
                Continuar — Escolher Filtro
              </button>
            </div>
          </div>
        )}

        {/* ── FILTER ── */}
        {phase === "filter" && (
          <div className="flex flex-col min-h-full">
            {processing ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="relative w-16 h-16">
                  <div
                    style={{
                      width: 64, height: 64, borderRadius: "50%",
                      border: "3px solid rgba(99,102,241,0.15)",
                      borderTop: "3px solid #6366f1",
                      animation: "sspin 0.9s linear infinite",
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Scan size={20} style={{ color: "#6366f1" }} />
                  </div>
                </div>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
                  Processando imagem...
                </p>
              </div>
            ) : (
              <>
                {/* Main preview */}
                <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
                  {mainPreviewUrl && (
                    <img
                      src={mainPreviewUrl}
                      alt="preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "55vh",
                        objectFit: "contain",
                        borderRadius: 10,
                        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    />
                  )}
                </div>

                {/* Filter selector */}
                <div className="px-4 pt-3 pb-2 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem", marginBottom: 10 }}>
                    FILTROS
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {FILTERS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => handleFilterChange(key)}
                        className="flex flex-col items-center gap-1.5 rounded-xl p-1.5 cursor-pointer transition-all active:scale-95 border"
                        style={
                          selectedFilter === key
                            ? { borderColor: "rgba(99,102,241,0.5)", background: "rgba(99,102,241,0.12)" }
                            : { borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }
                        }
                      >
                        {filterPreviews[key] ? (
                          <img
                            src={filterPreviews[key]}
                            alt={label}
                            style={{
                              width: "100%",
                              aspectRatio: "3/4",
                              objectFit: "cover",
                              borderRadius: 6,
                              border: selectedFilter === key
                                ? "2px solid rgba(99,102,241,0.6)"
                                : "2px solid transparent",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%", aspectRatio: "3/4",
                              borderRadius: 6,
                              background: "rgba(255,255,255,0.05)",
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: selectedFilter === key ? "#818cf8" : "rgba(255,255,255,0.4)",
                            fontWeight: selectedFilter === key ? 600 : 400,
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Continue */}
                <div className="px-4 py-4 shrink-0">
                  <button
                    onClick={enterExportPhase}
                    className="w-full py-4 rounded-xl text-white cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      boxShadow: "0 4px 24px rgba(99,102,241,0.3)",
                      fontSize: "0.95rem", fontWeight: 600,
                    }}
                  >
                    Continuar — Exportar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── EXPORT ── */}
        {phase === "export" && (
          <div className="flex flex-col min-h-full px-4 py-5 gap-5">
            {/* Final preview */}
            <div
              className="rounded-2xl overflow-hidden border flex items-center justify-center"
              style={{
                borderColor: "rgba(255,255,255,0.07)",
                background: "#111218",
                minHeight: 220,
                maxHeight: "45vh",
              }}
            >
              {processing ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: "50%",
                      border: "3px solid rgba(99,102,241,0.15)",
                      borderTop: "3px solid #6366f1",
                      animation: "sspin 0.9s linear infinite",
                    }}
                  />
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.82rem" }}>
                    Renderizando em alta resolução...
                  </p>
                </div>
              ) : exportDataUrl ? (
                <img
                  src={exportDataUrl}
                  alt="resultado"
                  style={{ maxWidth: "100%", maxHeight: "45vh", objectFit: "contain", padding: 8 }}
                />
              ) : null}
            </div>

            {/* Export info */}
            {exportCanvas && !processing && (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <CheckCircle size={16} style={{ color: "#818cf8", flexShrink: 0 }} />
                <div>
                  <p style={{ color: "#fff", fontSize: "0.82rem", fontWeight: 500 }}>
                    Documento pronto · {exportCanvas.width} × {exportCanvas.height}px
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem" }}>
                    Filtro: {FILTERS.find((f) => f.key === selectedFilter)?.label} · Perspectiva corrigida
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDownloadPDF}
                disabled={!exportCanvas || exporting || processing}
                className="w-full py-4 rounded-xl text-white cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  boxShadow: exportCanvas ? "0 4px 24px rgba(99,102,241,0.3)" : "none",
                  fontSize: "0.95rem", fontWeight: 600, minHeight: 52,
                }}
              >
                {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                Baixar PDF Escaneado
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadPNG}
                  disabled={!exportCanvas || exporting || processing}
                  className="py-3.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 border text-sm"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: 500,
                  }}
                >
                  <Download size={14} /> PNG
                </button>

                <button
                  onClick={handleSendToConverter}
                  disabled={!exportCanvas || exporting || processing || done}
                  className="py-3.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 border text-sm"
                  style={{
                    background: done ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.1)",
                    borderColor: done ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.25)",
                    color: done ? "#10b981" : "#818cf8",
                    fontWeight: 500,
                  }}
                >
                  {done
                    ? <><CheckCircle size={14} /> Enviado!</>
                    : <><Send size={14} /> Conversor</>
                  }
                </button>
              </div>

              <button
                onClick={() => {
                  setSrcCanvas(null); setSrcDataUrl(null); setCorners(null);
                  setBaseCanvas(null); setFilterPreviews({}); setMainPreviewUrl(null);
                  setExportCanvas(null); setExportDataUrl(null); setDone(false);
                  setPhase("source");
                }}
                className="w-full py-3 rounded-xl cursor-pointer flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
                style={{ color: "rgba(255,255,255,0.3)", borderBottom: "none" }}
              >
                <RefreshCw size={13} /> Escanear novamente
              </button>
            </div>

            {/* Privacy note */}
            <p
              className="text-center"
              style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.72rem" }}
            >
              100% local · nenhum dado enviado para servidores
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes sspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
