import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload, FileText, Download, CheckCircle, X,
  RefreshCw, ChevronDown, Loader2, AlertCircle, Camera, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { convert, downloadBlob } from "../utils/fileConverter";
import { addHistoryEntry } from "../utils/historyStore";
import { validateFile, type ValidationResult } from "../utils/security/fileValidator";
import { CameraModal } from "./CameraModal";
import { SmartScannerModal } from "./scanner/SmartScannerModal";

type Format = { ext: string; label: string; icon: string; group: string };

const OUTPUT_FORMATS: Format[] = [
  { ext: "docx", label: "Word (DOCX)",  icon: "📘", group: "Documentos" },
  { ext: "doc",  label: "Word (DOC)",   icon: "📘", group: "Documentos" },
  { ext: "pdf",  label: "PDF",          icon: "📕", group: "Documentos" },
  { ext: "rtf",  label: "RTF",          icon: "📄", group: "Documentos" },
  { ext: "odt",  label: "ODT",          icon: "📄", group: "Documentos" },
  { ext: "txt",  label: "Texto (TXT)",  icon: "📃", group: "Texto" },
  { ext: "md",   label: "Markdown",     icon: "📝", group: "Texto" },
  { ext: "log",  label: "LOG",          icon: "🗒️", group: "Texto" },
  { ext: "html", label: "HTML",         icon: "🌐", group: "Web" },
  { ext: "xml",  label: "XML",          icon: "💾", group: "Web" },
  { ext: "json", label: "JSON",         icon: "🔣", group: "Dados" },
  { ext: "csv",  label: "CSV",          icon: "📊", group: "Dados" },
  { ext: "xlsx", label: "Excel (XLSX)", icon: "📗", group: "Planilhas" },
  { ext: "xls",  label: "Excel (XLS)",  icon: "📗", group: "Planilhas" },
  { ext: "png",  label: "PNG",          icon: "🖼️", group: "Imagens" },
  { ext: "jpg",  label: "JPEG",         icon: "📷", group: "Imagens" },
  { ext: "webp", label: "WEBP",         icon: "🌄", group: "Imagens" },
  { ext: "gif",  label: "GIF → PNG",    icon: "🎞️", group: "Imagens" },
  { ext: "bmp",  label: "BMP",          icon: "🗂️", group: "Imagens" },
];

const GROUPS = ["Todos", "Documentos", "Texto", "Web", "Dados", "Planilhas", "Imagens"];
type Stage = "idle" | "ready" | "converting" | "done" | "error";

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ─── Format Selector Dropdown ─────────────────────────────────────────────────

function FormatDropdown({
  target,
  setTarget,
}: {
  target: Format;
  setTarget: (f: Format) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState("Todos");

  const filtered = group === "Todos"
    ? OUTPUT_FORMATS
    : OUTPUT_FORMATS.filter((f) => f.group === group);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderColor: open ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.10)",
          minHeight: 54,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{target.icon}</span>
          <div>
            <p className="text-white text-sm font-medium">{target.label}</p>
            <p className="text-white/30 text-xs">.{target.ext}</p>
          </div>
        </div>
        <ChevronDown
          size={15}
          className={`text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 left-0 right-0 z-50 rounded-2xl border overflow-hidden shadow-2xl"
            style={{
              background: "rgba(10,11,25,0.98)",
              backdropFilter: "blur(24px)",
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            {/* Groups */}
            <div className="flex gap-1 p-2 border-b overflow-x-auto" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {GROUPS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-all"
                  style={
                    group === g
                      ? { background: "rgba(99,102,241,0.2)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }
                      : { color: "rgba(255,255,255,0.3)", border: "1px solid transparent" }
                  }
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Options */}
            <div className="max-h-52 overflow-y-auto p-2">
              {filtered.map((fmt) => (
                <button
                  key={fmt.ext}
                  onClick={() => { setTarget(fmt); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all"
                  style={
                    target.ext === fmt.ext
                      ? { background: "rgba(99,102,241,0.15)", color: "#fff" }
                      : { color: "rgba(255,255,255,0.5)" }
                  }
                >
                  <span className="text-base">{fmt.icon}</span>
                  <span className="text-sm flex-1">{fmt.label}</span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>.{fmt.ext}</span>
                  {target.ext === fmt.ext && <CheckCircle size={12} style={{ color: "#6366f1" }} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Converter ────────────────────────────────────────────────────────────

export function Converter() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<Format>(OUTPUT_FORMATS[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setError(null);
    setValidation(null);
    setValidating(true);
    setResultBlob(null);
    setPreview(null);

    // ── Validação de segurança ──────────────────────────────────────────────
    const result = await validateFile(f);
    setValidation(result);
    setValidating(false);

    if (!result.valid) {
      setErrorMsg(result.error ?? "Arquivo inválido.");
      setStage("error");
      return;
    }

    setFile(f);
    setStage("ready");
    setErrorMsg("");
    if (f.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(f));
    }
  };

  const setError = (msg: string | null) => setErrorMsg(msg ?? "");

  const handleRemove = () => {
    setFile(null);
    setStage("idle");
    setErrorMsg("");
    setResultBlob(null);
    setPreview(null);
    setValidation(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setStage("converting");
    setErrorMsg("");
    try {
      await new Promise((r) => setTimeout(r, 400));
      const { blob, filename } = await convert(file, target.ext, target.label);
      setResultBlob(blob);
      setResultName(filename);
      setStage("done");
      await addHistoryEntry(
        {
          id: crypto.randomUUID(),
          originalName: file.name,
          originalSize: file.size,
          targetExt: target.ext,
          targetLabel: target.label,
          targetIcon: target.icon,
          convertedName: filename,
          convertedSize: blob.size,
          date: Date.now(),
        },
        blob
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao converter arquivo.");
      setStage("error");
    }
  };

  const handleDownload = () => {
    if (resultBlob && resultName) downloadBlob(resultBlob, resultName);
  };

  const handleReset = () => {
    setFile(null);
    setStage("idle");
    setErrorMsg("");
    setResultBlob(null);
    setPreview(null);
    setValidation(null);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      id="converter"
      className="w-full px-4 sm:px-6 pt-8 pb-12"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-2xl mx-auto">
        {/* Title */}
        <div className="text-center mb-6">
          <p className="text-white/30 text-xs tracking-widest uppercase mb-2" style={{ letterSpacing: "0.12em" }}>
            Ferramenta gratuita
          </p>
          <h2 className="text-white" style={{ fontSize: "clamp(1.3rem, 3vw, 1.7rem)", fontWeight: 700 }}>
            Converter arquivo
          </h2>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-5 sm:p-7 flex flex-col gap-5"
          style={{
            background: "rgba(255,255,255,0.025)",
            borderColor: isDragging ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.07)",
            boxShadow: isDragging ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
            transition: "all 0.2s",
          }}
        >
          {/* ── Upload zone ── */}
          <div>
            <p className="text-white/40 text-xs mb-2 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: "0.6rem", fontWeight: 700 }}>1</span>
              Upload do arquivo
            </p>

            <div
              onClick={() => !file && !validating && fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden
                ${isDragging ? "border-indigo-400 bg-indigo-500/10" : file ? "border-indigo-500/30 bg-indigo-500/5" : "border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/5"}`}
              style={{ minHeight: 140 }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="*/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              <AnimatePresence mode="wait">
                {validating ? (
                  <motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-8 text-center">
                    <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(99,102,241,0.2)", borderTop: "3px solid #6366f1", animation: "spin 1s linear infinite" }} />
                    <p style={{ color: "#64748b", fontSize: "0.82rem" }}>Validando arquivo...</p>
                  </motion.div>
                ) : !file ? (
                  <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      <Upload size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white/70 text-sm font-medium">Arraste o arquivo aqui</p>
                      <p className="text-white/30 text-xs mt-1">ou <span className="cursor-pointer" style={{ color: "#6366f1" }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>clique para selecionar</span></p>
                    </div>
                    <p className="text-white/20 text-xs">PDF, PNG, JPG, DOCX, XLSX, TXT e mais · Máx. 50 MB</p>
                  </motion.div>
                ) : (
                  <motion.div key="file" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-4 p-4">
                    {preview ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0">
                        <img src={preview} alt="preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
                        <FileText size={22} style={{ color: "#6366f1" }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{file.name}</p>
                      <p className="text-white/30 text-xs mt-0.5">{fmtBytes(file.size)}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors cursor-pointer shrink-0">
                      <X size={15} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Validation result */}
            <AnimatePresence>
              {validation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 rounded-xl px-3 py-2.5 flex flex-col gap-1.5"
                  style={{
                    background: validation.valid ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)",
                    border: `1px solid ${validation.valid ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    {validation.valid
                      ? <ShieldCheck size={13} style={{ color: "#10b981", flexShrink: 0 }} />
                      : <AlertTriangle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
                    }
                    <span style={{ color: validation.valid ? "#10b981" : "#f87171", fontSize: "0.75rem", fontWeight: 500 }}>
                      {validation.valid
                        ? `Arquivo validado · Magic bytes: ${validation.fileInfo.magicBytesMatch === true ? "✓" : validation.fileInfo.magicBytesMatch === false ? "⚠ Divergência" : "N/A"} · ${validation.fileInfo.sizeMB} MB`
                        : validation.error}
                    </span>
                  </div>
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle size={11} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: "#fbbf24", fontSize: "0.7rem" }}>{w}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Camera button */}
            <button
              onClick={() => setShowCamera(true)}
              className="mt-2.5 w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-white/50 hover:text-white/80 hover:border-indigo-500/30 transition-all duration-200 cursor-pointer text-sm active:scale-[0.98]"
              style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
            >
              <Camera size={15} style={{ color: "#6366f1" }} />
              Tirar foto com a câmera
            </button>

            {/* Smart Scanner button */}
            <button
              onClick={() => setShowScanner(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all duration-200 cursor-pointer text-sm active:scale-[0.98]"
              style={{
                borderColor: "rgba(99,102,241,0.25)",
                background: "rgba(99,102,241,0.06)",
                color: "rgba(129,140,248,0.85)",
              }}
            >
              <span style={{ fontSize: "1rem" }}>🔬</span>
              Escanear Documento
              <span
                className="ml-1 px-1.5 py-0.5 rounded text-xs"
                style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8", fontSize: "0.65rem" }}
              >
                NOVO
              </span>
            </button>
          </div>

          {/* ── Format selector ── */}
          <div>
            <p className="text-white/40 text-xs mb-2 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: "0.6rem", fontWeight: 700 }}>2</span>
              Converter para
            </p>
            <FormatDropdown target={target} setTarget={setTarget} />
          </div>

          {/* ── Convert button ── */}
          <button
            onClick={handleConvert}
            disabled={!file || stage === "converting" || !validation?.valid}
            className="w-full py-4 rounded-xl text-white font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{
              background: file && stage !== "converting" && validation?.valid
                ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                : "rgba(99,102,241,0.3)",
              fontSize: "0.95rem",
              boxShadow: file && validation?.valid ? "0 4px 24px rgba(99,102,241,0.3)" : "none",
              minHeight: 52,
            }}
          >
            {stage === "converting" ? (
              <><Loader2 size={17} className="animate-spin" /> Convertendo...</>
            ) : (
              <>Converter para {target.ext.toUpperCase()}</>
            )}
          </button>

          {/* ── Result ── */}
          <AnimatePresence>
            {stage === "done" && resultBlob && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.15)" }}>
                    <CheckCircle size={20} style={{ color: "#10b981" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{resultName}</p>
                    <p className="text-emerald-400/70 text-xs mt-0.5">{target.label} · {fmtBytes(resultBlob.size)} · Pronto!</p>
                  </div>
                </div>
                <div className="flex gap-2.5 shrink-0">
                  <button
                    onClick={handleDownload}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-medium text-sm cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg,#059669,#10b981)", boxShadow: "0 4px 16px rgba(16,185,129,0.25)", minHeight: 44 }}>
                    <Download size={15} />
                    Baixar {target.ext.toUpperCase()}
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border text-white/50 hover:text-white/80 cursor-pointer text-sm transition-all"
                    style={{ borderColor: "rgba(255,255,255,0.10)", minHeight: 44 }}>
                    <RefreshCw size={13} />
                    <span className="hidden sm:inline">Novo</span>
                  </button>
                </div>
              </motion.div>
            )}

            {stage === "error" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm font-medium">Erro</p>
                  <p className="text-white/40 text-xs mt-0.5 break-words">{errorMsg || "Tente novamente."}</p>
                </div>
                <button onClick={handleReset} className="shrink-0 text-white/30 hover:text-white/60 cursor-pointer"><X size={15} /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Privacy + security note */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <p className="text-white/15 text-xs flex items-center gap-1"><ShieldCheck size={10} style={{ color: "#10b981" }} /><span style={{ color: "#10b981", opacity: 0.5 }}>Validado</span></p>
            <p className="text-white/15 text-xs flex items-center gap-1"><AlertCircle size={10} />Processado localmente</p>
          </div>
        </div>

        {/* Format pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-1.5">
          {OUTPUT_FORMATS.map((f) => (
            <button key={f.ext} onClick={() => setTarget(f)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-150 cursor-pointer active:scale-95"
              style={target.ext === f.ext
                ? { borderColor: "rgba(99,102,241,0.4)", color: "#818cf8", background: "rgba(99,102,241,0.1)" }
                : { borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.02)" }}>
              <span>{f.icon}</span><span>{f.ext.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>

      {showCamera && <CameraModal onCapture={handleFile} onClose={() => setShowCamera(false)} />}
      {showScanner && (
        <SmartScannerModal
          onComplete={handleFile}
          onClose={() => setShowScanner(false)}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}