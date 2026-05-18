/**
 * jwt.ts
 * Implementação real de JWT usando Web Crypto API (HMAC-SHA256).
 * Não usa bibliotecas externas — usa a API nativa do navegador.
 *
 * Estrutura do token:
 *   header.payload.signature  (base64url-encoded)
 *
 * Algoritmo: HS256 (HMAC + SHA-256)
 * Expiração padrão: 8 horas
 * Armazenamento: sessionStorage (limpado ao fechar a aba — mais seguro que localStorage)
 */

// ─── Chave secreta ─────────────────────────────────────────────────────────────
// Em produção: gerada em tempo de build + injetada via variável de ambiente
// ou recuperada de um servidor de autenticação seguro.
const JWT_SECRET = "transforma-enterprise-hs256-secret-2024-v1";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user" | "viewer";

export interface JWTPayload {
  /** Subject (username) */
  sub: string;
  /** Display name */
  name: string;
  /** Role do usuário */
  role: UserRole;
  /** Issued At (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Issuer */
  iss: string;
  /** JWT ID (evita replay attacks) */
  jti: string;
}

export interface JWTHeader {
  alg: "HS256";
  typ: "JWT";
}

// ─── Helpers de Base64URL ─────────────────────────────────────────────────────

function base64urlEncode(input: string | ArrayBuffer): string {
  let base64: string;
  if (typeof input === "string") {
    base64 = btoa(unescape(encodeURIComponent(input)));
  } else {
    base64 = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return atob(padded + padding);
}

function base64urlDecodeToBytes(input: string): Uint8Array {
  const binary = base64urlDecode(input);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ─── Importação de chave HMAC ─────────────────────────────────────────────────

async function importHmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, // não exportável
    [usage]
  );
}

// ─── Geração do token ─────────────────────────────────────────────────────────

/**
 * Gera um JWT assinado com HMAC-SHA256.
 * @param sub   Username do usuário autenticado
 * @param name  Nome de exibição
 * @param role  Papel (admin | user | viewer)
 * @param ttlSeconds  Tempo de vida em segundos (padrão: 8h)
 */
export async function generateJWT(
  sub: string,
  name: string,
  role: UserRole,
  ttlSeconds = 8 * 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header: JWTHeader = { alg: "HS256", typ: "JWT" };
  const payload: JWTPayload = {
    sub,
    name,
    role,
    iat: now,
    exp: now + ttlSeconds,
    iss: "transforma-app",
    jti: crypto.randomUUID(), // Unique token ID
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(JWT_SECRET, "sign");
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  const signatureB64 = base64urlEncode(signatureBuffer);
  return `${message}.${signatureB64}`;
}

// ─── Verificação do token ─────────────────────────────────────────────────────

/**
 * Verifica e decodifica um JWT.
 * Retorna o payload se válido, null se inválido ou expirado.
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    // ── 1. Verificar assinatura ──────────────────────────────────────────────
    const key = await importHmacKey(JWT_SECRET, "verify");
    const signatureBytes = base64urlDecodeToBytes(signatureB64);
    const message = `${headerB64}.${payloadB64}`;

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(message)
    );

    if (!valid) {
      console.warn("[JWT] Assinatura inválida.");
      return null;
    }

    // ── 2. Decodificar header ────────────────────────────────────────────────
    const header: JWTHeader = JSON.parse(base64urlDecode(headerB64));
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      console.warn("[JWT] Header inválido:", header);
      return null;
    }

    // ── 3. Decodificar payload ───────────────────────────────────────────────
    const payload: JWTPayload = JSON.parse(base64urlDecode(payloadB64));

    // ── 4. Verificar expiração ───────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.warn("[JWT] Token expirado em", new Date(payload.exp * 1000).toLocaleString("pt-BR"));
      return null;
    }

    // ── 5. Verificar emissor ─────────────────────────────────────────────────
    if (payload.iss !== "transforma-app") {
      console.warn("[JWT] Emissor inválido:", payload.iss);
      return null;
    }

    // ── 6. Verificar campos obrigatórios ─────────────────────────────────────
    if (!payload.sub || !payload.role || !payload.jti) {
      console.warn("[JWT] Payload incompleto.");
      return null;
    }

    return payload;
  } catch (err) {
    console.error("[JWT] Erro ao verificar token:", err);
    return null;
  }
}

// ─── Decodificação sem verificação (para exibição de metadados) ───────────────

/**
 * Decodifica o payload sem verificar a assinatura.
 * NÃO use para autorização — apenas para exibição de informações.
 */
export function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(base64urlDecode(parts[1]));
  } catch {
    return null;
  }
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Calcula o tempo restante até expiração em formato legível */
export function getTokenTimeLeft(payload: JWTPayload): string {
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "Expirado";
  if (remaining < 60) return `${remaining}s`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}min`;
  return `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}min`;
}

/** Verifica se o payload tem uma role específica ou superior */
export function hasRole(payload: JWTPayload, required: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = { viewer: 0, user: 1, admin: 2 };
  return (hierarchy[payload.role] ?? -1) >= (hierarchy[required] ?? 99);
}
