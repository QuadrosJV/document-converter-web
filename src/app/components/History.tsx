import { useState, useEffect, useCallback } from "react";
import { Download, Trash2, Trash, FileText, Search, SortAsc, SortDesc, RefreshCw } from "lucide-react";
import {
  getHistoryEntries,
  downloadHistoryEntry,
  deleteHistoryEntry,
  clearHistory,
  formatBytes,
  formatDate,
  type HistoryEntry,
} from "../utils/historyStore";

// ─── Format color map ──────────────────────────────────────────────────────────

const FORMAT_COLOR: Record<string, string> = {
  pdf: "#ef4444",
  docx: "#3b82f6",
  doc: "#3b82f6",
  xlsx: "#10b981",
  xls: "#10b981",
  csv: "#f59e0b",
  txt: "#94a3b8",
  md: "#8b5cf6",
  html: "#f97316",
  json: "#06b6d4",
  xml: "#a78bfa",
  png: "#ec4899",
  jpg: "#f43f5e",
  jpeg: "#f43f5e",
  webp: "#14b8a6",
  rtf: "#6366f1",
};

function getColor(ext: string) {
  return FORMAT_COLOR[ext.toLowerCase()] ?? "#64748b";
}

// ─── Single history card ───────────────────────────────────────────────────────

function HistoryCard({
  entry,
  onDelete,
}: {
  entry: HistoryEntry;
  onDelete: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const color = getColor(entry.targetExt);

  const handleDownload = async () => {
    setDownloading(true);
    const ok = await downloadHistoryEntry(entry.id, entry.convertedName);
    if (!ok) setNotFound(true);
    setDownloading(false);
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)")
      }
    >
      {/* Format badge */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          shrink: 0,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "1rem" }}>{entry.targetIcon}</span>
        <span style={{ color, fontSize: "0.55rem", fontWeight: 700, marginTop: 1 }}>
          {entry.targetExt.toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            color: "#e2e8f0",
            fontSize: "0.85rem",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.convertedName}
        </p>
        <p style={{ color: "#475569", fontSize: "0.72rem", marginTop: 2 }}>
          <span style={{ color: "#64748b" }}>
            {entry.originalName.length > 28
              ? entry.originalName.substring(0, 26) + "…"
              : entry.originalName}
          </span>
          {" → "}
          <span style={{ color }}>
            {entry.targetLabel}
          </span>
        </p>
        <p style={{ color: "#334155", fontSize: "0.68rem", marginTop: 2 }}>
          {formatDate(entry.date)} · {formatBytes(entry.convertedSize)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {notFound ? (
          <span style={{ color: "#ef4444", fontSize: "0.7rem" }}>Arquivo expirado</span>
        ) : (
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              background: downloading ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              color: "#10b981",
              cursor: downloading ? "not-allowed" : "pointer",
              fontSize: "0.78rem",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            {downloading ? (
              <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Download size={13} />
            )}
            {/* Hide label on very small screens */}
            <span className="hidden sm:inline">Baixar</span>
          </button>
        )}

        <button
          onClick={() => onDelete(entry.id)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#475569",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)";
            (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#475569";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.06)";
          }}
          title="Remover do histórico"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── History page ──────────────────────────────────────────────────────────────

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterExt, setFilterExt] = useState("Todos");
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(() => {
    setEntries(getHistoryEntries());
  }, []);

  useEffect(() => {
    load();
    // Refresh when tab becomes visible (in case another tab converted something)
    const onVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const handleDelete = async (id: string) => {
    await deleteHistoryEntry(id);
    load();
  };

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    await clearHistory();
    setConfirmClear(false);
    load();
  };

  // Unique extensions for filter
  const uniqueExts = ["Todos", ...Array.from(new Set(entries.map((e) => e.targetExt.toUpperCase())))];

  // Filter + sort
  const filtered = entries
    .filter((e) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        e.originalName.toLowerCase().includes(q) ||
        e.convertedName.toLowerCase().includes(q) ||
        e.targetLabel.toLowerCase().includes(q);
      const matchExt = filterExt === "Todos" || e.targetExt.toUpperCase() === filterExt;
      return matchSearch && matchExt;
    })
    .sort((a, b) => sortAsc ? a.date - b.date : b.date - a.date);

  return (
    <section className="w-full px-4 sm:px-6 pb-16" style={{ paddingTop: 24 }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16 }}
        >
          <div style={{ flex: 1 }}>
            <h2 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600 }}>
              Histórico de Conversões
            </h2>
            <p style={{ color: "#475569", fontSize: "0.78rem", marginTop: 2 }}>
              {entries.length === 0
                ? "Nenhuma conversão ainda"
                : `${entries.length} arquivo${entries.length === 1 ? "" : "s"} convertido${entries.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 8,
                background: confirmClear ? "rgba(239,68,68,0.15)" : "transparent",
                border: `1px solid ${confirmClear ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: confirmClear ? "#ef4444" : "#475569",
                cursor: "pointer",
                fontSize: "0.78rem",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseLeave={() => setConfirmClear(false)}
            >
              <Trash size={13} />
              {confirmClear ? "Confirmar limpeza" : "Limpar tudo"}
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center gap-4 py-20"
            style={{ textAlign: "center" }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={28} style={{ color: "rgba(99,102,241,0.4)" }} />
            </div>
            <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
              Nenhuma conversão realizada ainda
            </p>
            <p style={{ color: "#334155", fontSize: "0.78rem", maxWidth: 320 }}>
              Converta um arquivo na aba <strong style={{ color: "#6366f1" }}>Conversor</strong> para
              ver o histórico aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Search + filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              {/* Search */}
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#475569",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder="Pesquisar arquivo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    paddingLeft: 36,
                    paddingRight: 12,
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e2e8f0",
                    fontSize: "0.83rem",
                    outline: "none",
                  }}
                />
              </div>

              {/* Sort */}
              <button
                onClick={() => setSortAsc((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                }}
              >
                {sortAsc ? <SortAsc size={14} /> : <SortDesc size={14} />}
                {sortAsc ? "Mais antigo" : "Mais recente"}
              </button>
            </div>

            {/* Extension filter */}
            {uniqueExts.length > 2 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                  paddingBottom: 4,
                  marginBottom: 16,
                }}
              >
                {uniqueExts.map((ext) => (
                  <button
                    key={ext}
                    onClick={() => setFilterExt(ext)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      background: filterExt === ext ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
                      border: filterExt === ext ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.07)",
                      color: filterExt === ext ? "#818cf8" : "#64748b",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}
                  >
                    {ext}
                  </button>
                ))}
              </div>
            )}

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.length === 0 ? (
                <p style={{ color: "#475569", fontSize: "0.85rem", textAlign: "center", padding: "24px 0" }}>
                  Nenhum resultado para "{search}"
                </p>
              ) : (
                filtered.map((entry) => (
                  <HistoryCard key={entry.id} entry={entry} onDelete={handleDelete} />
                ))
              )}
            </div>

            {/* Footer info */}
            <p
              style={{
                color: "#1e2347",
                fontSize: "0.7rem",
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Histórico armazenado localmente no navegador · Máximo de 50 conversões
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
