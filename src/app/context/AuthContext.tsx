/**
 * AuthContext.tsx
 * Contexto de autenticação com sessão automática.
 * Não exige login manual — gera um JWT em background na inicialização.
 * Toda a camada de segurança (validação, sanitização, JWT) continua ativa.
 */

import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";
import { type JWTPayload, type UserRole, getTokenTimeLeft } from "../utils/security/jwt";
import {
  checkExistingSession,
  autoLogin,
  logout as doLogout,
  type LoginResult,
} from "../utils/security/auth";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  username: string;
  name: string;
  role: UserRole;
  exp: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  timeLeft: string;
  hasRole: (required: UserRole) => boolean;
  /** Renova o JWT manualmente (chamado internamente quando expira) */
  renewSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState("");
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Aplica dados do resultado de login/auto-login ─────────────────────────
  const applySession = useCallback((result: LoginResult) => {
    setUser({
      username: result.user.username,
      name: result.user.name,
      role: result.user.role,
      exp: Math.floor(result.expiresAt.getTime() / 1000),
    });
  }, []);

  // ── Renova a sessão (auto-login silencioso) ───────────────────────────────
  const renewSession = useCallback(async () => {
    try {
      const result = await autoLogin();
      applySession(result);
    } catch (e) {
      console.error("[Auth] Falha ao renovar sessão:", e);
    }
  }, [applySession]);

  // ── Inicialização: verifica sessão existente ou cria uma nova ─────────────
  useEffect(() => {
    const init = async () => {
      try {
        const payload: JWTPayload | null = await checkExistingSession();
        if (payload) {
          // Sessão válida já existe (mesma aba recarregada)
          setUser({
            username: payload.sub,
            name: payload.name,
            role: payload.role,
            exp: payload.exp,
          });
        } else {
          // Nenhuma sessão — faz auto-login transparente
          const result = await autoLogin();
          applySession(result);
        }
      } catch (e) {
        console.error("[Auth] Erro na inicialização:", e);
        // Tenta recuperar em background
        renewSession();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [applySession, renewSession]);

  // ── Agendamento de renovação automática (30min antes de expirar) ──────────
  useEffect(() => {
    if (!user) return;

    const msUntilExpiry = user.exp * 1000 - Date.now();
    const msUntilRenew = Math.max(msUntilExpiry - 30 * 60 * 1000, 0);

    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = setTimeout(renewSession, msUntilRenew);

    return () => {
      if (renewTimer.current) clearTimeout(renewTimer.current);
    };
  }, [user, renewSession]);

  // ── Contador regressivo visível no Navbar ─────────────────────────────────
  useEffect(() => {
    if (!user) { setTimeLeft(""); return; }

    const tick = () => {
      const remaining = user.exp - Math.floor(Date.now() / 1000);
      if (remaining <= 0) { renewSession(); return; }
      setTimeLeft(getTokenTimeLeft({ exp: user.exp } as JWTPayload));
    };

    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── hasRole ───────────────────────────────────────────────────────────────
  const hasRole = useCallback(
    (required: UserRole) => {
      if (!user) return false;
      const h: Record<UserRole, number> = { viewer: 0, user: 1, admin: 2 };
      return (h[user.role] ?? -1) >= (h[required] ?? 99);
    },
    [user]
  );

  // ── Logout limpa a sessão e faz auto-login imediato ───────────────────────
  // (não exibe tela de login — renova silenciosamente)
  useEffect(() => {
    const handleLogout = () => {
      doLogout();
      renewSession();
    };
    // Expõe globalmente para uso interno se necessário
    (window as unknown as Record<string, unknown>).__transformaRenew = handleLogout;
  }, [renewSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        timeLeft,
        hasRole,
        renewSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Safe fallback — context not available (outside AuthProvider)
    return {
      user: null,
      loading: false,
      isAuthenticated: false,
      timeLeft: "",
      hasRole: () => false,
      renewSession: async () => {},
    };
  }
  return ctx;
}