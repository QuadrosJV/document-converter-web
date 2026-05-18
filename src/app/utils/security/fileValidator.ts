/**
 * fileValidator.ts
 * Validação rigorosa de arquivos antes de qualquer processamento:
 *  • Verificação de tamanho máximo
 *  • Whitelist de extensões permitidas
 *  • Verificação de magic bytes (assinatura binária do arquivo)
 *  • Bloqueio de executáveis e arquivos perigosos
 *  • Detecção de discrepância entre extensão e conteúdo real
 */

// ─── Configuração de limites ──────────────────────────────────────────────────

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ─── Extensões explicitamente bloqueadas (executáveis / binários perigosos) ───

const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "com", "bat", "cmd", "msi", "msp", "msc",
  "dmg", "pkg", "deb", "rpm", "apk", "ipa", "app",
  "sys", "drv", "inf", "scr", "pif", "cpl",
  "vbs", "vbe", "js", "jse", "wsh", "wsf",
  "ps1", "ps2", "psc1", "psc2",
  "hta", "htc",
  "jar", "jnlp",
  "lnk", "url", "sct",
]);

// ─── Extensões permitidas (whitelist) ────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  // Documentos
  "pdf", "docx", "doc", "odt", "rtf", "txt", "md", "markdown", "log",
  // Web / dados
  "html", "htm", "xml", "json", "csv",
  // Planilhas
  "xlsx", "xls",
  // Imagens
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif", "svg",
  // Outros texto
  "yaml", "yml", "toml", "ini", "cfg",
]);

// ─── Magic bytes (assinaturas binárias de tipos de arquivo) ──────────────────

interface MagicSignature {
  bytes: number[];
  offset?: number; // offset em bytes onde a assinatura começa (padrão: 0)
  mask?: number[]; // bitmask para comparação parcial
}

const MAGIC_SIGNATURES: Record<string, MagicSignature[]> = {
  pdf:  [{ bytes: [0x25, 0x50, 0x44, 0x46] }],                                       // %PDF
  png:  [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],              // PNG
  jpg:  [{ bytes: [0xFF, 0xD8, 0xFF] }],                                               // JPEG
  jpeg: [{ bytes: [0xFF, 0xD8, 0xFF] }],
  gif:  [{ bytes: [0x47, 0x49, 0x46, 0x38] }],                                        // GIF8
  bmp:  [{ bytes: [0x42, 0x4D] }],                                                    // BM
  webp: [{ bytes: [0x52, 0x49, 0x46, 0x46] }],                                        // RIFF (WebP usa RIFF)
  tiff: [
    { bytes: [0x49, 0x49, 0x2A, 0x00] }, // little-endian
    { bytes: [0x4D, 0x4D, 0x00, 0x2A] }, // big-endian
  ],
  tif: [
    { bytes: [0x49, 0x49, 0x2A, 0x00] },
    { bytes: [0x4D, 0x4D, 0x00, 0x2A] },
  ],
  // DOCX, XLSX, ODT — todos são ZIP internamente
  docx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
  xlsx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
  odt:  [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
  // DOC / XLS — formato OLE2
  doc:  [{ bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }],
  xls:  [{ bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }],
};

// ─── Padrões de conteúdo malicioso em texto ──────────────────────────────────

const MALICIOUS_TEXT_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi,          // onclick=, onload=, etc.
  /eval\s*\(/gi,
  /document\.cookie/gi,
  /document\.write/gi,
  /window\.location/gi,
  /\.innerHTML\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /data:text\/html/gi,
  /--\s*DROP\s+TABLE/gi,  // SQL
  /;\s*DELETE\s+FROM/gi,
  /UNION\s+SELECT/gi,
  /'\s*OR\s+'1'\s*=\s*'1/gi,
];

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  fileInfo: {
    name: string;
    ext: string;
    size: number;
    sizeMB: string;
    mimeType: string;
    magicBytesMatch: boolean | null; // null = não verificado (texto)
    threats: string[];
  };
}

// ─── Implementação ────────────────────────────────────────────────────────────

/** Lê os primeiros N bytes de um arquivo como Uint8Array */
async function readFileHeader(file: File, bytes = 16): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, bytes);
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = reject;
    reader.readAsArrayBuffer(slice);
  });
}

/** Compara os magic bytes do arquivo com as assinaturas conhecidas */
function checkMagicBytes(header: Uint8Array, ext: string): boolean | null {
  const sigs = MAGIC_SIGNATURES[ext.toLowerCase()];
  if (!sigs) return null; // Sem assinatura definida para esta extensão

  return sigs.some((sig) => {
    const offset = sig.offset ?? 0;
    if (header.length < offset + sig.bytes.length) return false;
    return sig.bytes.every((b, i) => {
      if (sig.mask) return (header[offset + i]! & sig.mask[i]!) === b;
      return header[offset + i] === b;
    });
  });
}

/** Verifica se o conteúdo de texto contém padrões maliciosos */
async function scanTextContent(file: File): Promise<string[]> {
  const threats: string[] = [];
  const textExts = new Set(["txt", "md", "html", "htm", "xml", "json", "csv", "rtf", "log", "yaml", "yml"]);
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (!textExts.has(ext)) return threats;

  try {
    const text = await file.slice(0, 64 * 1024).text(); // Primeiro 64KB

    for (const pattern of MALICIOUS_TEXT_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        const name = pattern.toString().replace(/\/gi$/, "").replace(/^\//, "");
        threats.push(`Padrão suspeito detectado: ${name.substring(0, 40)}`);
        break; // Reportar apenas a primeira ameaça por arquivo
      }
    }
  } catch {
    // Falha silenciosa na leitura de texto
  }

  return threats;
}

/** Valida completamente um arquivo antes de processá-lo */
export async function validateFile(file: File): Promise<ValidationResult> {
  const warnings: string[] = [];
  const threats: string[] = [];

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

  // ── 1. Tamanho máximo ─────────────────────────────────────────────────────
  if (file.size === 0) {
    return {
      valid: false,
      error: "O arquivo está vazio.",
      warnings,
      fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch: null, threats },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Arquivo muito grande (${sizeMB} MB). Limite: ${MAX_FILE_SIZE_MB} MB.`,
      warnings,
      fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch: null, threats },
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    warnings.push(`Arquivo grande (${sizeMB} MB). A conversão pode demorar mais.`);
  }

  // ── 2. Extensão bloqueada ─────────────────────────────────────────────────
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido: .${ext.toUpperCase()}. Arquivos executáveis e scripts são bloqueados por segurança.`,
      warnings,
      fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch: null, threats: ["Tipo de arquivo bloqueado"] },
    };
  }

  // ── 3. Extensão desconhecida (não na whitelist) ───────────────────────────
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    warnings.push(`Extensão .${ext.toUpperCase()} não reconhecida. Será tratada como texto simples.`);
  }

  // ── 4. Magic bytes ────────────────────────────────────────────────────────
  let magicBytesMatch: boolean | null = null;
  try {
    const header = await readFileHeader(file, 16);
    magicBytesMatch = checkMagicBytes(header, ext);

    if (magicBytesMatch === false) {
      warnings.push(
        `Aviso: O conteúdo do arquivo não corresponde à extensão .${ext.toUpperCase()}. ` +
        `O arquivo pode estar corrompido ou ter a extensão errada.`
      );
    }
  } catch {
    warnings.push("Não foi possível verificar a assinatura do arquivo.");
  }

  // ── 5. Scan de conteúdo malicioso (apenas arquivos de texto) ─────────────
  const contentThreats = await scanTextContent(file);
  threats.push(...contentThreats);

  if (threats.length > 0) {
    return {
      valid: false,
      error: `Conteúdo potencialmente malicioso detectado. O arquivo foi bloqueado.`,
      warnings,
      fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch, threats },
    };
  }

  // ── 6. Nome de arquivo suspeito ───────────────────────────────────────────
  const dangerousNamePatterns = [/\.\./g, /\//g, /\\/g, /\0/g, /%00/g];
  if (dangerousNamePatterns.some((p) => p.test(file.name))) {
    return {
      valid: false,
      error: "Nome de arquivo inválido ou potencialmente perigoso.",
      warnings,
      fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch, threats: ["Nome suspeito"] },
    };
  }

  return {
    valid: true,
    warnings,
    fileInfo: { name: file.name, ext, size: file.size, sizeMB, mimeType: file.type, magicBytesMatch, threats },
  };
}

/** Formata o resultado de validação para exibição */
export function formatValidationError(result: ValidationResult): string {
  return result.error ?? "Arquivo inválido.";
}
