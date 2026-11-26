const BACKUP_VERSION = 1;

const MANAGED_KEYS = [
  "quantlens.watchlist.extra",
  "quantlens-paper-trades",
  "quantlens-trading-journal",
  "quantlens-alert-rules",
  "quantlens-price-color-mode",
  "quantlens-novice-assist",
] as const;

export interface UserDataBackup {
  version: number;
  exportedAt: string;
  entries: Record<string, unknown>;
}

function collectPriceLineKeys(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("quantlens.priceLines.")) {
        out[key] = localStorage.getItem(key);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function exportUserDataBackup(): UserDataBackup {
  const entries: Record<string, unknown> = {};
  for (const key of MANAGED_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      try {
        entries[key] = JSON.parse(raw);
      } catch {
        entries[key] = raw;
      }
    }
  }
  entries.__priceLines = collectPriceLineKeys();
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function downloadUserDataBackup(): void {
  const blob = new Blob(
    [JSON.stringify(exportUserDataBackup(), null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quantlens-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreEntry(key: string, value: unknown) {
  if (value == null) return;
  if (typeof value === "string") {
    localStorage.setItem(key, value);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function restoreUserDataBackup(
  raw: unknown
): { ok: true } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "不是有效的 JSON 备份" };
  }
  const data = raw as UserDataBackup;
  if (!data.entries || typeof data.entries !== "object") {
    return { ok: false, message: "缺少 entries 字段" };
  }
  try {
    for (const key of MANAGED_KEYS) {
      if (key in data.entries) {
        restoreEntry(key, data.entries[key]);
      }
    }
    const pl = data.entries.__priceLines;
    if (pl && typeof pl === "object") {
      for (const [k, v] of Object.entries(pl as Record<string, string | null>)) {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "写入 localStorage 失败（配额或权限）" };
  }
}

export async function restoreUserDataFromFile(
  file: File
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    return restoreUserDataBackup(parsed);
  } catch {
    return { ok: false, message: "无法解析备份文件" };
  }
}