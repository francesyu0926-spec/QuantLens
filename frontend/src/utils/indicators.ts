import type { Candle } from "../types/market";
import type { SeriesMarker, Time } from "lightweight-charts";

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | undefined;
  for (const v of values) {
    prev = prev === undefined ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function computeBollinger(
  closes: number[],
  length = 20,
  mult = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const win = closes.slice(Math.max(0, i - length + 1), i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance =
      win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
    const std = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, middle, lower };
}

export function computeMacd(closes: number[]) {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const signal = ema(macd, 9);
  const hist = macd.map((v, i) => v - signal[i]);
  return { macd, signal, hist };
}

export function computeRsi(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(50);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      rsi.push(50);
      continue;
    }
    if (i === period) {
      avgGain /= period;
      avgLoss /= period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

export function emaCrossMarkers(candles: Candle[]): SeriesMarker<Time>[] {
  if (candles.length < 3) return [];
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const markers: SeriesMarker<Time>[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = e20[i - 1] - e50[i - 1];
    const cur = e20[i] - e50[i];
    const t = candles[i].time as Time;
    if (prev <= 0 && cur > 0) {
      markers.push({
        time: t,
        position: "belowBar",
        color: "#3fb950",
        shape: "arrowUp",
        text: "金叉",
      });
    } else if (prev >= 0 && cur < 0) {
      markers.push({
        time: t,
        position: "aboveBar",
        color: "#f85149",
        shape: "arrowDown",
        text: "死叉",
      });
    }
  }
  return markers.slice(-40);
}