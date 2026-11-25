import type { Candle } from "../types/market";
import { computeBollinger, computeMacd, computeRsi, ema } from "./indicators";

export type BriefTone = "bull" | "bear" | "neutral";

export interface MarketBrief {
  tone: BriefTone;
  text: string;
}

export const INDICATOR_PLAIN_TIPS: Record<
  string,
  { title: string; lines: [string, string] }
> = {
  EMA: {
    title: "均线趋势",
    lines: [
      "短均线在上、长均线在下，通常表示偏多；反过来则偏空。",
      "金叉（短上穿长）常被视为转强信号，死叉则提示降温。",
    ],
  },
  BOLL: {
    title: "布林带通道",
    lines: [
      "价格在中轨上方且贴近上轨，说明偏强但也可能过热。",
      "跌回中轨以下或贴近下轨，往往意味着支撑测试或弱势整理。",
    ],
  },
  MACD: {
    title: "动能快慢线",
    lines: [
      "红柱变长＝上涨动能增强；绿柱变长＝下跌动能增强。",
      "快线上穿慢线叫金叉，下穿叫死叉，可辅助判断拐点。",
    ],
  },
  RSI: {
    title: "市场温度计",
    lines: [
      "高于 70 多表示超买、情绪偏热；低于 30 多表示超卖、情绪偏冷。",
      "极端数值附近更适合观望，等待回落或反弹企稳再加减。",
    ],
  },
};

export function buildMarketBrief(candles: Candle[]): MarketBrief {
  if (candles.length < 30) {
    return {
      tone: "neutral",
      text: "K 线尚少，暂无法判断——可先换更长周期或等待更多数据。",
    };
  }

  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;
  const price = closes[last];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const boll = computeBollinger(closes);
  const rsi = computeRsi(closes);
  const { macd, signal } = computeMacd(closes);

  const ema20 = e20[last];
  const ema50 = e50[last];
  const upper = boll.upper[last];
  const mid = boll.middle[last];
  const lower = boll.lower[last];
  const rsiVal = rsi[last];
  const macdDiff = macd[last] - signal[last];

  const aboveEma =
    Number.isFinite(ema20) && Number.isFinite(ema50) && price > ema20 && ema20 > ema50;
  const belowEma =
    Number.isFinite(ema20) && Number.isFinite(ema50) && price < ema20 && ema20 < ema50;
  const nearUpper =
    Number.isFinite(upper) && upper > 0 && (upper - price) / upper < 0.008;
  const nearLower =
    Number.isFinite(lower) && lower > 0 && (price - lower) / lower < 0.01;

  if (belowEma && macdDiff < 0) {
    return {
      tone: "bear",
      text: `弱势下行：价格在均线下方且均线空头排列，动能偏弱。建议多看少动，等待止跌或金叉再考虑介入。`,
    };
  }

  if (aboveEma && nearUpper) {
    return {
      tone: "bull",
      text: `短线偏强：价稳于均线之上，但已贴近布林上轨，追高风险加大。可等回踩中轨或缩量整理后再决策。`,
    };
  }

  if (aboveEma) {
    const rsiHint =
      rsiVal > 70
        ? " RSI 偏高，注意短线过热。"
        : rsiVal < 40
          ? " RSI 不高，上涨仍有余地。"
          : "";
    return {
      tone: "bull",
      text: `短线偏多：价格站上均线且短均线在上${rsiHint}宜顺势观察，不盲目追高。`,
    };
  }

  if (nearLower || (Number.isFinite(rsiVal) && rsiVal < 32)) {
    return {
      tone: "neutral",
      text: `超卖/支撑区：价格靠近布林下轨或 RSI 偏低，可能有反弹但趋势未明。轻仓试探，设好止损。`,
    };
  }

  if (belowEma) {
    return {
      tone: "bear",
      text: `震荡偏弱：价在均线下方运行，未形成金叉。建议控制仓位，等待重新站上 EMA20。`,
    };
  }

  const bandPos =
    Number.isFinite(mid) && mid > 0
      ? price >= mid
        ? "中轨之上"
        : "中轨之下"
      : "中轨附近";

  return {
    tone: "neutral",
    text: `震荡整理：价格在${bandPos}，方向不够明朗。结合成交量与副图 MACD/RSI 再确认。`,
  };
}