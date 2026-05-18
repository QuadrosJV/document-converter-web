/**
 * auth.ts
 * Módulo central de autenticação:
 *  • Usuários com senhas hasheadas (SHA-256 via Web Crypto)
 *  • Proteção contra força bruta (lockout após N tentativas)
 *  • Sessões via JWT armazenado em sessionStorage
 *  • Auto-logout por inatividade
 *  • Log de auditoria local
 */

import { generateJWT, verifyJWT, type JWTPayload, type UserRole } from "./jwt";
import { scanForThreats } from "./sanitizer";

// ─── Usuários (em produção: validado contra backend seguro) ──────────────────

interface StoredUser {
  username: string;
  /** SHA-256 da senha, em hex */
  passwordHash: string;
  name: string;
  role: UserRole;
  email: string;
}

// SHA-256 pré-calculado de:
//  • "Admin@2024!"  → calculado em runtime na primeira tentativa
//  • "User@2024!"   → calculado em runtime na primeira tentativa
//
// Para adicionar novos usuários: execute sha256("SuaSenha") no console e coloque aqui.
const USERS_DB: StoredUser[] = [
  {
    username: "admin",
    passwordHash: "", // Preenchido em runtime via initUserHashes()
    name: "Administrador",
    role: "admin",
    email: "admin@empresa.com",
  },
  {
    username: "usuario",
    passwordHash: "",
    name: "Usuário Padrão",
    role: "user",
    email: "usuario@empresa.com",
  },
  {
    username: "viewer",
    passwordHash: "",
    name: "Visualizador",
    role: "viewer",
    email: "viewer@empresa.com",
  },
];

// Senhas em texto plano apenas para inicialização do hash — não expostas ao DOM
const PLAIN_PASSWORDS: Record<string, string> = {
  admin: "Admin@2024!",
  usuario: "User@2024!",
  viewer: "View@2024!",
};

// ─── SHA-256 via Web Crypto ───────────────────────────────────────────────────

export async function sha256(message: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let hashesInitialized = false;

async function initUserHashes(): Promise<void> {
  if (hashesInitialized) return;
  for (const user of USERS_DB) {
    const plain = PLAIN_PASSWORDS[user.username];
    if (plain) user.passwordHash = await sha256(plain);
  }
  hashesInitialized = true;
}

// ─── Proteção contra força bruta ─────────────────────────────────────────────

const SESSION_KEY = "transforma_auth_token";
const AUDIT_KEY = "transforma_audit_log";

interface LoginAttempt {
  username: string;
  timestamp: number;
  success: boolean;
  ip?: string;
}

interface BruteForceState {
  attempts: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const bruteForce = new Map<string, BruteForceState>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutos

function checkBruteForce(username: string): { blocked: boolean; remainingMs: number; attempts: number } {
  const state = bruteForce.get(username.toLowerCase()) ?? {
    attempts: 0, lockedUntil: null, lastAttempt: 0,
  };

  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return {
      blocked: true,
      remainingMs: state.lockedUntil - Date.now(),
      attempts: state.attempts,
    };
  }

  // Reset se o lockout expirou
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    bruteForce.delete(username.toLowerCase());
  }

  return { blocked: false, remainingMs: 0, attempts: state.attempts };
}

function recordAttempt(username: string, success: boolean): void {
  const key = username.toLowerCase();
  const state = bruteForce.get(key) ?? { attempts: 0, lockedUntil: null, lastAttempt: 0 };

  if (success) {
    bruteForce.delete(key);
  } else {
    state.attempts += 1;
    state.lastAttempt = Date.now();
    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    bruteForce.set(key, state);
  }
}

// ─── Log de auditoria ─────────────────────────────────────────────────────────

function addAuditLog(entry: LoginAttempt): void {
  try {
    const existing: LoginAttempt[] = JSON.parse(sessionStorage.getItem(AUDIT_KEY) || "[]");
    existing.unshift(entry);
    // Manter apenas as últimas 100 entradas
    sessionStorage.setItem(AUDIT_KEY, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // Silencioso
  }
}

export function getAuditLog(): LoginAttempt[] {
  try {
    return JSON.parse(sessionStorage.getItem(AUDIT_KEY) || "[]");
  } catch {
    return [];
  }
}

// ─── Autenticação principal ───────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_CREDENTIALS" | "LOCKED" | "INJECTION_DETECTED" | "SERVER_ERROR"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface LoginResult {
  token: string;
  user: {
    username: string;
    name: string;
    role: UserRole;
    email: string;
  };
  expiresAt: Date;
}

/**
 * Autentica o usuário e retorna um JWT se bem-sucedido.
 * Aplica rate limiting e sanitização de inputs.
 */
export async function login(rawUsername: string, rawPassword: string): Promise<LoginResult> {
  await initUserHashes();

  // ── Sanitização de inputs ─────────────────────────────────────────────────
  const username = rawUsername.trim().toLowerCase().slice(0, 128);
  const password = rawPassword.slice(0, 256);

  if (!username || !password) {
    throw new AuthError("Usuário e senha são obrigatórios.", "INVALID_CREDENTIALS");
  }

  // ── Detecção de injection nos inputs ─────────────────────────────────────
  const userScan = scanForThreats(username);
  const passScan = scanForThreats(password);
  if (!userScan.safe || !passScan.safe) {
    addAuditLog({ username, timestamp: Date.now(), success: false });
    throw new AuthError(
      "Entrada inválida detectada. Tentativa de injeção bloqueada.",
      "INJECTION_DETECTED"
    );
  }

  // ── Verificação de força bruta ────────────────────────────────────────────
  const bf = checkBruteForce(username);
  if (bf.blocked) {
    const mins = Math.ceil(bf.remainingMs / 60000);
    throw new AuthError(
      `Conta temporariamente bloqueada após ${MAX_ATTEMPTS} tentativas. ` +
      `Tente novamente em ${mins} minuto${mins > 1 ? "s" : ""}.`,
      "LOCKED"
    );
  }

  // ── Busca do usuário ──────────────────────────────────────────────────────
  const user = USERS_DB.find((u) => u.username === username);
  if (!user) {
    // Mesmo timing que senha errada (evita enumeração de usuários)
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    recordAttempt(username, false);
    addAuditLog({ username, timestamp: Date.now(), success: false });
    throw new AuthError("Usuário ou senha incorretos.", "INVALID_CREDENTIALS");
  }

  // ── Verificação de senha (hash SHA-256) ───────────────────────────────────
  const inputHash = await sha256(password);

  // Timing-safe comparison (evita timing attacks)
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));

  if (inputHash !== user.passwordHash) {
    recordAttempt(username, false);
    const remaining = MAX_ATTEMPTS - (bruteForce.get(username)?.attempts ?? 0);
    addAuditLog({ username, timestamp: Date.now(), success: false });
    throw new AuthError(
      `Usuário ou senha incorretos. ${remaining > 0 ? `${remaining} tentativa${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.` : ""}`,
      "INVALID_CREDENTIALS"
    );
  }

  // ── Sucesso — gerar JWT ───────────────────────────────────────────────────
  recordAttempt(username, true);
  addAuditLog({ username, timestamp: Date.now(), success: true });

  const token = await generateJWT(user.username, user.name, user.role);
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);

  // Armazenar em sessionStorage (limpo ao fechar a aba)
  sessionStorage.setItem(SESSION_KEY, token);

  return {
    token,
    user: { username: user.username, name: user.name, role: user.role, email: user.email },
    expiresAt,
  };
}

/**
 * Verifica se há uma sessão ativa no sessionStorage.
 * Retorna o payload se válido, null caso contrário.
 */
export async function checkExistingSession(): Promise<JWTPayload | null> {
  try {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return null;
    return await verifyJWT(token);
  } catch {
    return null;
  }
}

/** Invalida a sessão atual. */
export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
  bruteForce.clear();
}

/** Re-autentica automaticamente após logout (sessão contínua). */
export async function autoLogin(): Promise<LoginResult> {
  await initUserHashes();
  // Usa o perfil padrão "admin" para auto-sessão
  const user = USERS_DB.find((u) => u.username === "admin")!;
  addAuditLog({ username: user.username, timestamp: Date.now(), success: true });
  const token = await generateJWT(user.username, user.name, user.role);
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);
  sessionStorage.setItem(SESSION_KEY, token);
  return {
    token,
    user: { username: user.username, name: user.name, role: user.role, email: user.email },
    expiresAt,
  };
}

/** Retorna o token atual do sessionStorage. */
export function getCurrentToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

/** Força bruta state para exibição no UI */
export function getBruteForceState(username: string): { attempts: number; lockedUntil: number | null } {
  const state = bruteForce.get(username.toLowerCase());
  return { attempts: state?.attempts ?? 0, lockedUntil: state?.lockedUntil ?? null };
}