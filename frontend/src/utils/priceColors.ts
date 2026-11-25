import { A_SHARE_ONLY } from "../config/market";

export type PriceColorMode = "auto" | "cn_red_up" | "intl_green_up";

export interface PriceColors {
  up: string;
  down: string;
}

const CN: PriceColors = { up: "#f85149", down: "#3fb950" };
const INTL: PriceColors = { up: "#3fb950", down: "#f85149" };

export function isAShareSymbol(symbol: string): boolean {
  return /^\d{6}$/.test(symbol);
}

export function resolvePriceColors(
  mode: PriceColorMode,
  symbol: string
): PriceColors {
  if (mode === "cn_red_up") return CN;
  if (mode === "intl_green_up") return INTL;
  const cn = A_SHARE_ONLY || isAShareSymbol(symbol);
  return cn ? CN : INTL;
}

export const PRICE_COLOR_MODE_LABEL: Record<PriceColorMode, string> = {
  auto: "自动（A 股红涨绿跌 / 其他绿涨红跌）",
  cn_red_up: "红涨绿跌（沪深习惯）",
  intl_green_up: "绿涨红跌（国际 / 加密）",
};