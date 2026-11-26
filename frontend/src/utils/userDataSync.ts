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
const LOCAL_SYNC_META_KEY = "quantlens.user-data-meta";

type SyncMeta = Record<string, number>;

function readSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SyncMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSyncMeta(meta: SyncMeta) {
  localStorage.setItem(LOCAL_SYNC_META_KEY, JSON.stringify(meta));
}

function touchLocalKey(key: string) {
  const meta = readSyncMeta();
  meta[key] = Date.now() / 1000;
  writeSyncMeta(meta);
}

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

function writeLocalKey(key: string, value: unknown, touchMeta = true) {
  if (value == null) {
    localStorage.removeItem(key);
    return;
  }
  if (typeof value === "string") {
    localStorage.setItem(key, value);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
  if (touchMeta) touchLocalKey(key);
}

export async function pullUserDataFromServer(): Promise<number> {
  try {
    const res = await fetch(`${API}/sync`);
    if (!res.ok) return -1;
    const data = (await res.json()) as {
      entries?: Record<string, unknown>;
      updated_at?: Record<string, number>;
    };
    const entries = data.entries ?? {};
    const serverMeta = data.updated_at ?? {};
    const localMeta = readSyncMeta();
    let applied = 0;
    const nextMeta = { ...localMeta };
    for (const [key, val] of Object.entries(entries)) {
      const serverTs = serverMeta[key] ?? 0;
      const localTs = localMeta[key] ?? 0;
      if (serverTs >= localTs || localTs === 0) {
        writeLocalKey(key, val, false);
        nextMeta[key] = serverTs || Date.now() / 1000;
        applied += 1;
      }
    }
    writeSyncMeta(nextMeta);
    return applied;
  } catch {
    return -1;
  }
}

export async function pushLocalUserDataToServer(): Promise<boolean> {
  const entries: Record<string, unknown> = {
    ...localDrawingEntries(),
  };
  const client_updated_at: Record<string, number> = {};
  const meta = readSyncMeta();
  for (const key of SYNC_MANAGED_KEYS) {
    const val = readLocalKey(key);
    if (val !== undefined) {
      entries[key] = val;
      client_updated_at[key] = meta[key] ?? Date.now() / 1000;
    }
  }
  for (const key of Object.keys(entries)) {
    if (key.startsWith(DRAWING_PREFIX) && client_updated_at[key] == null) {
      client_updated_at[key] = meta[key] ?? Date.now() / 1000;
    }
  }
  if (Object.keys(entries).length === 0) return true;
  try {
    const res = await fetch(`${API}/sync/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, client_updated_at }),
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
  touchLocalKey(key);
  const client_updated_at = readSyncMeta()[key] ?? Date.now() / 1000;
  try {
    await fetch(`${API}/sync/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, client_updated_at }),
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
  await pushLocalUserDataToServer();
}