import type { Time } from "lightweight-charts";
import type { SeriesMarker } from "lightweight-charts";
import type { Candle } from "../types/market";
import { computeMacd, computeRsi } from "./indicators";

export interface KeyLevel {
  price: number;
  kind: "support" | "resistance";
  strength: number;
}

export interface KeyLevelDistances {
  support: KeyLevel | null;
  resistance: KeyLevel | null;
  toResistancePct: number | null;
  toSupportPct: number | null;
}

function isPivotHigh(candles: Candle[], i: number, wing = 2): boolean {
  const h = candles[i].high;
  for (let k = 1; k <= wing; k++) {
    if (i - k < 0 || i + k >= candles.length) return false;
    if (candles[i - k].high >= h || candles[i + k].high >= h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], i: number, wing = 2): boolean {
  const l = candles[i].low;
  for (let k = 1; k <= wing; k++) {
    if (i - k < 0 || i + k >= candles.length) return false;
    if (candles[i - k].low <= l || candles[i + k].low <= l) return false;
  }
  return true;
}

function clusterLevels(prices: number[], tolPct = 0.0035): KeyLevel[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { sum: number; count: number }[] = [];
  for (const p of sorted) {
    const hit = clusters.find(
      (c) => Math.abs(c.sum / c.count - p) / p <= tolPct
    );
    if (hit) {
      hit.sum += p;
      hit.count += 1;
    } else {
      clusters.push({ sum: p, count: 1 });
    }
  }
  return clusters
    .filter((c) => c.count >= 2)
    .map((c) => ({
      price: c.sum / c.count,
      kind: "support" as const,
      strength: c.count,
    }));
}

export function findKeyLevels(candles: Candle[], lookback = 100): KeyLevel[] {
  const slice = candles.slice(-lookback);
  if (slice.length < 20) return [];

  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (isPivotHigh(slice, i)) highs.push(slice[i].high);
    if (isPivotLow(slice, i)) lows.push(slice[i].low);
  }

  const resClusters = clusterLevels(highs).map((l) => ({
    ...l,
    kind: "resistance" as const,
  }));
  const supClusters = clusterLevels(lows);

  return [...supClusters, ...resClusters].sort(
    (a, b) => b.strength - a.strength
  );
}

export function keyLevelDistances(
  _candles: Candle[],
  price: number,
  levels: KeyLevel[]
): KeyLevelDistances {
  if (!(price > 0)) {
    return {
      support: null,
      resistance: null,
      toResistancePct: null,
      toSupportPct: null,
    };
  }
  const supports = levels
    .filter((l) => l.kind === "support" && l.price < price)
    .sort((a, b) => b.price - a.price);
  const resistances = levels
    .filter((l) => l.kind === "resistance" && l.price > price)
    .sort((a, b) => a.price - b.price);

  const support = supports[0] ?? null;
  const resistance = resistances[0] ?? null;

  return {
    support,
    resistance,
    toResistancePct: resistance
      ? ((resistance.price - price) / price) * 100
      : null,
    toSupportPct: support ? ((support.price - price) / price) * 100 : null,
  };
}

function detectBearishDiv(
  candles: Candle[],
  series: number[]
): number | null {
  const n = candles.length - 1;
  if (n < 25) return null;
  let hiIdx = -1;
  let hiPrice = -Infinity;
  for (let i = n - 20; i < n; i++) {
    if (candles[i].high > hiPrice) {
      hiPrice = candles[i].high;
      hiIdx = i;
    }
  }
  const prevHi = Math.max(...candles.slice(n - 40, n - 10).map((c) => c.high));
  if (hiIdx < 0 || hiPrice <= prevHi) return null;
  const indNow = series[n];
  const indPrev = Math.max(...series.slice(n - 35, n - 8));
  if (Number.isFinite(indNow) && Number.isFinite(indPrev) && indNow < indPrev) {
    return candles[n].time;
  }
  return null;
}

function detectBullishDiv(candles: Candle[], series: number[]): number | null {
  const n = candles.length - 1;
  if (n < 25) return null;
  let loIdx = -1;
  let loPrice = Infinity;
  for (let i = n - 20; i < n; i++) {
    if (candles[i].low < loPrice) {
      loPrice = candles[i].low;
      loIdx = i;
    }
  }
  const prevLo = Math.min(...candles.slice(n - 40, n - 10).map((c) => c.low));
  if (loIdx < 0 || loPrice >= prevLo) return null;
  const indNow = series[n];
  const indPrev = Math.min(...series.slice(n - 35, n - 8));
  if (Number.isFinite(indNow) && Number.isFinite(indPrev) && indNow > indPrev) {
    return candles[n].time;
  }
  return null;
}

export function scanPatternMarkers(candles: Candle[]): SeriesMarker<Time>[] {
  if (candles.length < 30) return [];
  const markers: SeriesMarker<Time>[] = [];
  const closes = candles.map((c) => c.close);
  const rsi = computeRsi(closes);
  const { macd } = computeMacd(closes);

  const bearMacd = detectBearishDiv(candles, macd);
  const bearRsi = detectBearishDiv(candles, rsi);
  const bullMacd = detectBullishDiv(candles, macd);
  const bullRsi = detectBullishDiv(candles, rsi);

  if (bearMacd != null || bearRsi != null) {
    const t = (bearMacd ?? bearRsi) as Time;
    markers.push({
      time: t,
      position: "aboveBar",
      color: "#f59e0b",
      shape: "circle",
      text: "!",
    });
  }
  if (bullMacd != null || bullRsi != null) {
    const t = (bullMacd ?? bullRsi) as Time;
    markers.push({
      time: t,
      position: "belowBar",
      color: "#58a6ff",
      shape: "circle",
      text: "!",
    });
  }

  const n = candles.length - 1;
  const last = candles[n];
  const prev5 = candles.slice(Math.max(0, n - 5), n);
  const avgVol =
    prev5.reduce((s, c) => s + c.volume, 0) / Math.max(1, prev5.length);
  const prevCloses = candles.slice(Math.max(0, n - 6), n).map((c) => c.close);
  const avgChg =
    prevCloses.length > 1
      ? prevCloses.reduce((s, p, i, arr) => {
          if (i === 0) return s;
          return s + Math.abs((p - arr[i - 1]) / arr[i - 1]);
        }, 0) /
        (prevCloses.length - 1)
      : 0;
  const chg = n > 0 ? (last.close - candles[n - 1].close) / candles[n - 1].close : 0;

  if (
    chg > avgChg * 1.2 &&
    last.volume > avgVol * 2 &&
    last.close > last.open
  ) {
    markers.push({
      time: last.time as Time,
      position: "belowBar",
      color: "#f97316",
      shape: "arrowUp",
      text: "↑",
    });
  }

  return markers;
}