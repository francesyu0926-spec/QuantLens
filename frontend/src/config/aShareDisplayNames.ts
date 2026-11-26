import { INDEX_WIND_SYMBOLS } from "./pinnedWatchlist";

/** 大盘风向标 / 常见 ETF 展示名（自选未缓存名称时的兜底） */
export const INDEX_ETF_DISPLAY_NAMES: Record<
  (typeof INDEX_WIND_SYMBOLS)[number],
  string
> = {
  "510050": "上证50ETF",
  "510300": "沪深300ETF",
  "159915": "创业板ETF",
};

export function resolveAShareDisplayName(
  symbol: string,
  watchlistName?: string | null,
  fundamentalsName?: string | null
): string {
  const wl = watchlistName?.trim();
  if (wl && wl !== symbol) return wl;
  const fn = fundamentalsName?.trim();
  if (fn && fn !== symbol) return fn;
  const idx = INDEX_ETF_DISPLAY_NAMES[symbol as keyof typeof INDEX_ETF_DISPLAY_NAMES];
  if (idx) return idx;
  return wl || fn || symbol;
}