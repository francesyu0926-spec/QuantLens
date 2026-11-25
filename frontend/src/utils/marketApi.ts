import type { Candle } from "../types/market";
import type { TimeInterval } from "../types/chart";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";
const REST_TIMEOUT_MS = 8_000;

export async function fetchKlines(symbol: string, interval: TimeInterval) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ symbol, interval });
    const res = await fetch(`${API}/klines?${qs.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      candles: Candle[];
      price: number;
      ok: boolean;
    };
    return { candles: data.candles ?? [], price: data.price ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}

const PANE_FALLBACKS: Partial<Record<TimeInterval, TimeInterval[]>> = {
  "1d": ["4h", "1h", "15m"],
  "4h": ["1h", "15m"],
  "1h": ["15m", "5m"],
};

export async function fetchKlinesResilient(
  symbol: string,
  preferred: TimeInterval
): Promise<{
  candles: Candle[];
  price: number;
  interval: TimeInterval;
}> {
  const tries = [
    preferred,
    ...(PANE_FALLBACKS[preferred] ?? ["15m", "1h"]),
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const iv of tries) {
    try {
      const snap = await fetchKlines(symbol, iv);
      if (snap.candles.length > 0) {
        return { candles: snap.candles, price: snap.price, interval: iv };
      }
    } catch {
      /* try next */
    }
  }
  return { candles: [], price: 0, interval: preferred };
}