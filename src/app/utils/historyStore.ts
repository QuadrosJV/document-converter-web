/**
 * historyStore.ts
 * Armazena o histórico de conversões no navegador:
 *  - Metadados no localStorage (leitura rápida)
 *  - Blobs no IndexedDB (armazenamento persistente de arquivos)
 */

const DB_NAME = "transforma_db";
const DB_VER = 1;
const BLOB_STORE = "blobs";
const META_KEY = "transforma_history_meta";

export interface HistoryEntry {
  id: string;
  originalName: string;
  originalSize: number;
  targetExt: string;
  targetLabel: string;
  targetIcon: string;
  convertedName: string;
  convertedSize: number;
  date: number; // timestamp ms
}

// ─── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put({ id, blob });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(BLOB_STORE, "readonly");
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => res(req.result?.blob ?? null);
    req.onerror = () => rej(req.error);
  });
}

async function deleteBlob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ─── Metadata helpers (localStorage) ─────────────────────────────────────────

function loadMeta(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveMeta(entries: HistoryEntry[]) {
  localStorage.setItem(META_KEY, JSON.stringify(entries));
}

// ─── Public API ───────────────────────────────────────────────────────────────

const MAX_ENTRIES = 50; // Keep last 50 conversions

export async function addHistoryEntry(
  entry: HistoryEntry,
  blob: Blob
): Promise<void> {
  const entries = loadMeta();
  entries.unshift(entry); // newest first

  // Trim old entries
  if (entries.length > MAX_ENTRIES) {
    const removed = entries.splice(MAX_ENTRIES);
    for (const r of removed) {
      await deleteBlob(r.id).catch(() => {});
    }
  }
  saveMeta(entries);
  await putBlob(entry.id, blob);
}

export function getHistoryEntries(): HistoryEntry[] {
  return loadMeta();
}

export async function downloadHistoryEntry(id: string, filename: string): Promise<boolean> {
  const blob = await getBlob(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const entries = loadMeta().filter((e) => e.id !== id);
  saveMeta(entries);
  await deleteBlob(id).catch(() => {});
}

export async function clearHistory(): Promise<void> {
  const entries = loadMeta();
  for (const e of entries) {
    await deleteBlob(e.id).catch(() => {});
  }
  saveMeta([]);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
