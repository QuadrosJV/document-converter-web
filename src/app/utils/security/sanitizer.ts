/**
 * sanitizer.ts
 * Proteção contra XSS e injeção de conteúdo:
 *  • DOMPurify para sanitização de HTML (bloqueia scripts, eventos inline, etc.)
 *  • Sanitização de texto puro (remove caracteres de controle, escapa entidades HTML)
 *  • Proteção contra injeção em metadados (localStorage, IndexedDB)
 *  • Validação de URLs (bloqueia javascript:, vbscript:, data:)
 *  • Detecção de padrões de SQL Injection em entradas do usuário
 */

import DOMPurify from "dompurify";

// ─── Configuração do DOMPurify ────────────────────────────────────────────────

/** Configuração restrita: apenas elementos e atributos seguros */
const PURIFY_CONFIG_STRICT: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "ins",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span", "hr",
    "a", "img",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class", "id",
    "colspan", "rowspan", "width", "height",
    "border", "cellpadding", "cellspacing",
    "align", "valign",
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
  FORBID_ATTR: ["style", "action", "formaction"],
  FORCE_BODY: true,
  SANITIZE_DOM: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  USE_PROFILES: false,
};

/** Configuração para documentos DOCX convertidos — um pouco mais permissiva para preservar formatação */
const PURIFY_CONFIG_DOCX: DOMPurify.Config = {
  ...PURIFY_CONFIG_STRICT,
  ALLOWED_TAGS: [
    ...((PURIFY_CONFIG_STRICT.ALLOWED_TAGS as string[]) || []),
    "figure", "figcaption", "caption", "col", "colgroup",
    "mark", "sub", "sup", "small", "abbr",
  ],
  ALLOWED_ATTR: [
    ...((PURIFY_CONFIG_STRICT.ALLOWED_ATTR as string[]) || []),
    "data-id", "lang", "dir",
  ],
};

// ─── Hooks DOMPurify — validação adicional ────────────────────────────────────

// Bloqueia hrefs perigosos (javascript:, vbscript:, data:text/html)
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if ("href" in node) {
    const href = (node as HTMLAnchorElement).href;
    if (/^(javascript|vbscript|data):/i.test(href)) {
      node.removeAttribute("href");
    }
  }
  if ("src" in node) {
    const src = (node as HTMLImageElement).src;
    // Permitir apenas data:image/ e URLs http/https
    if (src && !src.startsWith("data:image/") && !/^https?:\/\//i.test(src)) {
      node.removeAttribute("src");
    }
  }
});

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Sanitiza HTML de fontes não confiáveis (DOCX, OCR, input do usuário).
 * Remove scripts, eventos inline, iframes e outros vetores de XSS.
 */
export function sanitizeHtml(dirty: string, mode: "strict" | "docx" = "strict"): string {
  if (!dirty || typeof dirty !== "string") return "";
  const config = mode === "docx" ? PURIFY_CONFIG_DOCX : PURIFY_CONFIG_STRICT;
  return DOMPurify.sanitize(dirty, config) as string;
}

/**
 * Sanitiza texto puro:
 *  • Remove caracteres de controle (exceto newline e tab)
 *  • Limita o tamanho máximo
 *  • Remove NULL bytes
 */
export function sanitizeText(input: string, maxLength = 100_000): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/\0/g, "")                          // Remove NULL bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove chars de controle (exceto \t, \n, \r)
    .slice(0, maxLength)
    .trim();
}

/**
 * Escapa entidades HTML para exibição segura como texto (não HTML).
 * Use quando precisar exibir texto em contextos HTML sem interpretação.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Sanitiza um nome de arquivo:
 *  • Remove path traversal (../, /, \)
 *  • Remove caracteres especiais perigosos
 *  • Limita o comprimento
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")      // Substitui chars inválidos
    .replace(/\.\./g, "")                  // Remove path traversal
    .replace(/^\.+/, "")                   // Remove pontos iniciais (arquivos ocultos Unix)
    .replace(/\0/g, "")                    // Remove NULL bytes
    .slice(0, 255)                          // Limite de nome de arquivo
    .trim() || "arquivo";
}

/**
 * Valida e sanitiza uma URL.
 * Retorna null se a URL for perigosa.
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // Bloqueia protocolos perigosos
  if (/^(javascript|vbscript|data|blob|file):/i.test(trimmed)) return null;

  // Permite apenas http, https e caminhos relativos
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/") && !trimmed.startsWith("#")) {
    return null;
  }

  return trimmed;
}

// ─── Detecção de padrões de ataque em inputs do usuário ──────────────────────

/** Padrões de SQL Injection */
const SQL_INJECTION_PATTERNS = [
  /'\s*OR\s+'?\d+'?\s*=\s+'?\d+/gi,
  /'\s*;\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|EXEC)\s/gi,
  /UNION\s+(ALL\s+)?SELECT/gi,
  /--\s*$/m,
  /\/\*[\s\S]*?\*\//g, // Comentários SQL
  /xp_cmdshell/gi,
  /sp_executesql/gi,
  /EXEC\s*\(/gi,
  /CAST\s*\(\s*0x/gi,
  /CONVERT\s*\(.+,\s*0x/gi,
];

/** Padrões de XSS em campos de texto */
const XSS_PATTERNS = [
  /<script/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'`]/gi,
  /eval\s*\(/gi,
  /expression\s*\(/gi,
  /vbscript:/gi,
  /<iframe/gi,
  /&#x?[0-9a-f]+;/gi, // Entidades HTML encodadas
];

export interface ThreatScanResult {
  safe: boolean;
  threats: string[];
}

/**
 * Escaneia um input de texto por padrões de ataque.
 * Usado para campos de formulário (username, busca, etc.)
 */
export function scanForThreats(input: string): ThreatScanResult {
  const threats: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      threats.push("SQL Injection detectado");
      break;
    }
  }

  for (const pattern of XSS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      threats.push("XSS (Cross-Site Scripting) detectado");
      break;
    }
  }

  return { safe: threats.length === 0, threats };
}

/**
 * Sanitiza dados antes de armazenar no localStorage/IndexedDB.
 * Garante que apenas strings seguras são persistidas.
 */
export function sanitizeForStorage(data: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const safeKey = sanitizeText(key, 128);
    if (!safeKey) continue;

    if (typeof value === "string") {
      safe[safeKey] = sanitizeText(value, 10_000);
    } else if (typeof value === "number" || typeof value === "boolean") {
      safe[safeKey] = value;
    } else if (value === null || value === undefined) {
      safe[safeKey] = null;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      safe[safeKey] = sanitizeForStorage(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      safe[safeKey] = value.map((item) =>
        typeof item === "string" ? sanitizeText(item, 10_000) : item
      );
    }
  }

  return safe;
}
