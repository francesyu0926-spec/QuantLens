import type { AlertSignal, Candle } from "../types/market";
import { ema } from "./indicators";

export function backfillEmaSignals(
  symbol: string,
  candles: Candle[],
  limit = 10
): AlertSignal[] {
  if (candles.length < 3) return [];
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const out: AlertSignal[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = e20[i - 1] - e50[i - 1];
    const cur = e20[i] - e50[i];
    const c = candles[i];
    if (prev <= 0 && cur > 0) {
      out.push({
        id: `hist-gc-${c.time}`,
        symbol,
        rule: "ema_golden_cross",
        message: "[历史] EMA20 上穿 EMA50",
        price: c.close,
        ts: c.time * 1000,
        bar_time: c.time,
      });
    } else if (prev >= 0 && cur < 0) {
      out.push({
        id: `hist-dc-${c.time}`,
        symbol,
        rule: "ema_death_cross",
        message: "[历史] EMA20 下穿 EMA50",
        price: c.close,
        ts: c.time * 1000,
        bar_time: c.time,
      });
    }
  }

  return out.slice(-limit).reverse();
}