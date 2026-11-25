import type { Candle } from "../types/market";

/** 将主图时间对齐到目标序列最近的一根 K 线（跨周期联动） */
export function snapCrosshairTime(
  targetTime: number,
  candles: Candle[]
): number | null {
  if (!candles.length || !Number.isFinite(targetTime)) return null;
  let best = candles[0]!.time;
  let bestDiff = Math.abs(targetTime - best);
  for (let i = 1; i < candles.length; i++) {
    const t = candles[i]!.time;
    const d = Math.abs(targetTime - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = t;
    }
  }
  return best;
}