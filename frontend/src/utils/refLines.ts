import type { Candle } from "../types/market";

export interface RefLineInput {
  price: number;
  title: string;
  color: string;
  /** higher wins when prices cluster */
  priority: number;
}

export function mergeRefLines(
  candles: Candle[],
  lines: RefLineInput[]
): RefLineInput[] {
  if (lines.length <= 1) return lines;
  if (candles.length === 0) return lines;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const span = Math.max(0, Math.max(...highs) - Math.min(...lows)) || 1;
  const thresh = Math.max(span * 0.015, span * 0.00025, 0.05);

  const sorted = [...lines].sort((a, b) => b.priority - a.priority);
  const kept: RefLineInput[] = [];
  for (const line of sorted) {
    if (!Number.isFinite(line.price)) continue;
    if (kept.some((k) => Math.abs(k.price - line.price) < thresh)) continue;
    kept.push(line);
  }
  return kept.sort((a, b) => a.price - b.price);
}

export const REF_LINE_COLORS = {
  support: "rgba(59, 130, 246, 0.65)",
  resistance: "rgba(245, 158, 11, 0.65)",
  manual: "rgba(88, 166, 255, 0.55)",
  stop: "rgba(248, 81, 73, 0.6)",
  take: "rgba(63, 185, 80, 0.6)",
  position: "rgba(245, 158, 11, 0.7)",
} as const;