/**
 * Navbar.tsx
 * Self-contained: manages auth state internally via JWT utils.
 * Does NOT depend on AuthContext/AuthProvider — works anywhere in the tree.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, PenLine, ShieldCheck, Clock, ChevronDown } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { checkExistingSession, autoLogin } from "../utils/security/auth";
import { getTokenTimeLeft, type UserRole, type JWTPayload } from "../utils/security/jwt";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NavUser {
  username: string;
  name: string;
  role: UserRole;
  exp: number;
}

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin:  { label: "Admin",         color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  user:   { label: "Usuário",       color: "#6366f1", bg: "rgba(99,102,241,0.12)"  },
  viewer: { label: "Visualizador",  color: "#10b981", bg: "rgba(16,185,129,0.12)" },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isEditor  = location.pathname.startsWith("/editor");

  const [user, setUser]         = useState<NavUser | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const renewRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Session init / auto-login ───────────────────────────────────────────────
  const startSession = useCallback(async () => {
    try {
      let payload: JWTPayload | null = await checkExistingSession();
      if (!payload) {
        const result = await autoLogin();
        payload = await checkExistingSession();
        if (!payload) {
          // Fallback: build payload from result directly
          setUser({
            username: result.user.username,
            name: result.user.name,
            role: result.user.role,
            exp: Math.floor(result.expiresAt.getTime() / 1000),
          });
          return;
        }
      }
      setUser({
        username: payload.sub,
        name: payload.name,
        role: payload.role,
        exp: payload.exp,
      });
    } catch (e) {
      console.error("[Navbar] Auth init error:", e);
    }
  }, []);

  useEffect(() => { startSession(); }, [startSession]);

  // ── Schedule renewal ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const msUntilExpiry = user.exp * 1000 - Date.now();
    const delay = Math.max(msUntilExpiry - 30 * 60 * 1000, 0);
    if (renewRef.current) clearTimeout(renewRef.current);
    renewRef.current = setTimeout(startSession, delay);
    return () => { if (renewRef.current) clearTimeout(renewRef.current); };
  }, [user, startSession]);

  // ── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setTimeLeft(""); return; }
    const tick = () => {
      const remaining = user.exp - Math.floor(Date.now() / 1000);
      if (remaining <= 0) { startSession(); return; }
      setTimeLeft(getTokenTimeLeft({ exp: user.exp } as JWTPayload));
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [user, startSession]);

  const role = user ? ROLE_CONFIG[user.role] : null;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        background: "rgba(11,12,27,0.92)",
        backdropFilter: "blur(16px)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0"
          onClick={() => navigate("/")}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            <FileText size={14} className="text-white" />
          </div>
          <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>
            <span className="text-white">Doc</span>
            <span style={{ color: "#6366f1" }}>Transforma</span>
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1.5 flex-1 justify-center">
          <NavBtn active={!isEditor} onClick={() => navigate("/")}>
            <FileText size={13} /> Conversor
          </NavBtn>
          <NavBtn active={isEditor} onClick={() => navigate("/editor")}>
            <PenLine size={13} /> Editor
          </NavBtn>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Mobile nav */}
          <button
            className="flex sm:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer"
            onClick={() => navigate(isEditor ? "/" : "/editor")}
            style={{
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#818cf8", fontSize: "0.78rem",
            }}
          >
            <PenLine size={12} />
            {isEditor ? "Home" : "Editor"}
          </button>

          {/* JWT badge */}
          <div className="relative">
            <button
              onClick={() => setShowInfo(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all"
              style={{
                background: showInfo ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <ShieldCheck size={13} style={{ color: "#10b981" }} />
              <span className="hidden sm:inline" style={{ color: "#10b981", fontSize: "0.72rem" }}>
                {user ? "JWT ativo" : "Autenticando…"}
              </span>
              <ChevronDown
                size={11}
                style={{
                  color: "#10b981",
                  opacity: 0.7,
                  transform: showInfo ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>

            {/* Popover */}
            {showInfo && user && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-50 rounded-2xl border"
                  style={{
                    background: "rgba(10,11,24,0.98)",
                    backdropFilter: "blur(24px)",
                    borderColor: "rgba(255,255,255,0.09)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    minWidth: 260,
                    padding: 16,
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)" }}
                    >
                      <ShieldCheck size={15} style={{ color: "#10b981" }} />
                    </div>
                    <div>
                      <p style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: 600 }}>
                        Sessão segura ativa
                      </p>
                      <p style={{ color: "#475569", fontSize: "0.68rem" }}>
                        Autenticação automática
                      </p>
                    </div>
                  </div>

                  {/* User info */}
                  <div
                    className="rounded-xl p-3 mb-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <InfoRow label="Usuário" value={user.name} />
                    <InfoRow label="Login"   value={`@${user.username}`} />
                    {role && (
                      <div className="flex items-center justify-between mt-2">
                        <span style={{ color: "#475569", fontSize: "0.72rem" }}>Perfil</span>
                        <span
                          className="px-2 py-0.5 rounded-md"
                          style={{
                            background: role.bg,
                            color: role.color,
                            fontSize: "0.65rem",
                            border: `1px solid ${role.color}30`,
                          }}
                        >
                          {role.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Token details */}
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <p style={{ color: "#334155", fontSize: "0.65rem", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Detalhes do token
                    </p>
                    <InfoRow label="Algoritmo"     value="HMAC-SHA256" muted />
                    <InfoRow label="Tipo"          value="JWT (HS256)"  muted />
                    <InfoRow label="Armazenamento" value="sessionStorage" muted />
                    <div className="flex items-center justify-between mt-1.5">
                      <span style={{ color: "#475569", fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={11} /> Expira em
                      </span>
                      <span style={{ color: "#818cf8", fontSize: "0.72rem" }}>{timeLeft}</span>
                    </div>
                  </div>

                  {/* Feature badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {["Validação de arquivo", "Anti-XSS (DOMPurify)", "Anti-injection", "Magic bytes"].map(b => (
                      <span
                        key={b}
                        style={{
                          padding: "2px 8px", borderRadius: 20,
                          background: "rgba(99,102,241,0.08)",
                          border: "1px solid rgba(99,102,241,0.15)",
                          color: "#818cf8", fontSize: "0.62rem",
                        }}
                      >
                        ✓ {b}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 8,
        background: active ? "rgba(99,102,241,0.12)" : "transparent",
        color: active ? "#818cf8" : "rgba(255,255,255,0.45)",
        border: active ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
        cursor: "pointer", fontSize: "0.83rem", transition: "all 0.2s",
      }}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between mt-1.5 first:mt-0">
      <span style={{ color: "#475569", fontSize: "0.72rem" }}>{label}</span>
      <span style={{ color: muted ? "#64748b" : "#94a3b8", fontSize: "0.72rem" }}>{value}</span>
    </div>
  );
}
