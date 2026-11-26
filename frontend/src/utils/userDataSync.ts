const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

export const SYNC_MANAGED_KEYS = [
  "quantlens.watchlist.extra",
  "quantlens-paper-trades",
  "quantlens-trading-journal",
  "quantlens-alert-rules",
  "quantlens-price-color-mode",
  "quantlens-novice-assist",
] as const;

const DRAWING_PREFIX = "quantlens.priceLines.";

function localDrawingEntries(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAWING_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function readLocalKey(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function writeLocalKey(key: string, value: unknown) {
  if (value == null) {
    localStorage.removeItem(key);
    return;
  }
  if (typeof value === "string") {
    localStorage.setItem(key, value);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export async function pullUserDataFromServer(): Promise<number> {
  try {
    const res = await fetch(`${API}/sync`);
    if (!res.ok) return -1;
    const data = (await res.json()) as {
      entries?: Record<string, unknown>;
    };
    const entries = data.entries ?? {};
    for (const [key, val] of Object.entries(entries)) {
      writeLocalKey(key, val);
    }
    return Object.keys(entries).length;
  } catch {
    return -1;
  }
}

export async function pushLocalUserDataToServer(): Promise<boolean> {
  const entries: Record<string, unknown> = {
    ...localDrawingEntries(),
  };
  for (const key of SYNC_MANAGED_KEYS) {
    const val = readLocalKey(key);
    if (val !== undefined) entries[key] = val;
  }
  if (Object.keys(entries).length === 0) return true;
  try {
    const res = await fetch(`${API}/sync/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncUserDataKey(key: string, payload: unknown): Promise<void> {
  const allowed =
    SYNC_MANAGED_KEYS.includes(key as (typeof SYNC_MANAGED_KEYS)[number]) ||
    key.startsWith(DRAWING_PREFIX);
  if (!allowed) return;
  try {
    await fetch(`${API}/sync/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
  } catch {
    /* offline */
  }
}

export async function bootstrapUserDataSync(): Promise<void> {
  const n = await pullUserDataFromServer();
  if (n < 0) {
    await pushLocalUserDataToServer();
    return;
  }
  if (n === 0) {
    await pushLocalUserDataToServer();
  }
}