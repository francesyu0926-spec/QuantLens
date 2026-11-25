import type { WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import { fetchKlines } from "./marketApi";
import { computeMacd, computeRsi, ema } from "./indicators";

export type ScreenerPresetId =
  | "momentum"
  | "oversold"
  | "macd_cross"
  | "above_ema20";

export const SCREENER_PRESETS: {
  id: ScreenerPresetId;
  label: string;
  hint: string;
}[] = [
  {
    id: "momentum",
    label: "涨幅 > 3%",
    hint: "仅用实时涨跌幅",
  },
  {
    id: "oversold",
    label: "RSI(14) < 30",
    hint: "轻量拉取日线估算",
  },
  {
    id: "macd_cross",
    label: "MACD 金叉",
    hint: "近两根日线",
  },
  {
    id: "above_ema20",
    label: "收盘站上 EMA20",
    hint: "当前周期 K 线",
  },
];

function matchMomentum(symbol: string, quotes: QuoteMap): boolean {
  const q = quotes[symbol];
  return (q?.changePct ?? 0) > 3;
}

async function matchTechnical(
  symbol: string,
  preset: ScreenerPresetId
): Promise<boolean> {
  const { candles } = await fetchKlines(
    symbol,
    preset === "above_ema20" ? "15m" : "1d"
  );
  if (candles.length < 30) return false;
  const closes = candles.map((c) => c.close);

  if (preset === "oversold") {
    const rsi = computeRsi(closes);
    const last = rsi[rsi.length - 1];
    return Number.isFinite(last) && last < 30;
  }
  if (preset === "macd_cross") {
    const { macd, signal } = computeMacd(closes);
    const n = macd.length;
    if (n < 2) return false;
    const a0 = macd[n - 2] - signal[n - 2];
    const a1 = macd[n - 1] - signal[n - 1];
    return a0 <= 0 && a1 > 0;
  }
  if (preset === "above_ema20") {
    const e = ema(closes, 20);
    const lastClose = closes[closes.length - 1];
    const lastEma = e[e.length - 1];
    return lastClose > lastEma;
  }
  return false;
}

export async function runScreener(
  items: WatchlistItem[],
  preset: ScreenerPresetId,
  quotes: QuoteMap,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  if (preset === "momentum") {
    return items.filter((i) => matchMomentum(i.symbol, quotes)).map((i) => i.symbol);
  }

  const hits: string[] = [];
  const total = items.length;
  const concurrency = 4;
  let index = 0;
  let done = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (index < total) {
      const i = index++;
      const sym = items[i].symbol;
      try {
        if (await matchTechnical(sym, preset)) hits.push(sym);
      } catch {
        /* skip */
      }
      done += 1;
      onProgress?.(done, total);
    }
  });

  await Promise.all(workers);
  return hits;
}