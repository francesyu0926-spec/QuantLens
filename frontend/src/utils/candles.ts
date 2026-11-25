import type { Candle } from "../types/market";
import type { SeriesMarker, Time } from "lightweight-charts";

/** lightweight-charts uses UTCTimestamp = unix seconds */
export function normalizeCandleTime(t: number): number {
  if (!Number.isFinite(t)) return 0;
  const n = Math.floor(t);
  if (n > 2_000_000_000) return Math.floor(n / 1000);
  return n;
}

export function normalizeCandle(c: Candle): Candle {
  return { ...c, time: normalizeCandleTime(c.time) };
}

/** Strict ascending, unique timestamps. */
export function dedupeCandles(raw: Candle[]): Candle[] {
  const sorted = raw
    .map(normalizeCandle)
    .filter((c) => c.time > 0)
    .sort((a, b) => a.time - b.time);

  const out: Candle[] = [];
  let last = -1;
  for (const c of sorted) {
    if (c.time <= last) continue;
    out.push(c);
    last = c.time;
  }
  return out;
}

export function sanitizeMarkers<T extends SeriesMarker<Time>>(
  markers: T[],
  candleTimes: Set<number>
): T[] {
  const seen = new Set<number>();
  return markers.filter((m) => {
    const t = m.time as number;
    if (!candleTimes.has(t)) return false;
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}