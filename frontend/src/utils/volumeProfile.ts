import type { Candle } from "../types/market";

export interface VolumeProfileBin {
  price: number;
  volume: number;
}

export function buildVolumeProfile(
  candles: Candle[],
  bins = 28
): VolumeProfileBin[] {
  if (candles.length === 0) return [];
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const span = max - min || 1;
  const step = span / bins;
  const buckets = new Array(bins).fill(0) as number[];
  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    const i = Math.min(bins - 1, Math.max(0, Math.floor((mid - min) / step)));
    buckets[i] += c.volume;
  }
  const peak = Math.max(...buckets, 1);
  return buckets.map((volume, i) => ({
    price: min + (i + 0.5) * step,
    volume: volume / peak,
  }));
}