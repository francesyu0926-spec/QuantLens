import type { Candle } from "../types/market";
import { computeBollinger, computeMacd, computeRsi, ema } from "./indicators";

export interface HealthScore {
  score: number;
  label: string;
  advice: string;
  breakdown: { trend: number; momentum: number; position: number };
  warnings: string[];
}

export const TREND_MAX = 40;
export const MOMENTUM_MAX = 30;
export const POSITION_MAX = 30;

export function computeHealthScore(candles: Candle[]): HealthScore {
  const empty: HealthScore = {
    score: 0,
    label: "数据不足",
    advice: "等待更多 K 线后再评估多空体检分。",
    breakdown: { trend: 0, momentum: 0, position: 0 },
    warnings: [],
  };
  if (candles.length < 35) return empty;

  const closes = candles.map((c) => c.close);
  const n = closes.length - 1;
  const price = closes[n];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const { macd, signal, hist } = computeMacd(closes);
  const rsi = computeRsi(closes);
  const boll = computeBollinger(closes);

  const warnings: string[] = [];
  let trend = 0;

  if (Number.isFinite(e20[n]) && e20[n] > 0) {
    const abovePct = (price - e20[n]) / e20[n];
    if (abovePct >= 0.008) trend += 20;
    else if (abovePct >= 0.003) trend += 14;
    else if (abovePct > 0) trend += 8;
    else if (abovePct < -0.005) trend += 0;
    else trend += 4;
  }

  if (
    Number.isFinite(e20[n]) &&
    Number.isFinite(e50[n]) &&
    e50[n] > 0
  ) {
    const spread = (e20[n] - e50[n]) / e50[n];
    if (spread >= 0.004) trend += 20;
    else if (spread >= 0.0015) trend += 12;
    else if (spread > 0) trend += 6;
    else if (spread < -0.002) trend += 0;
    else trend += 3;
  }

  trend = Math.min(TREND_MAX, trend);

  let momentum = 0;
  const h = hist[n];
  const hPrev = hist[n - 1];
  const macdAbove =
    Number.isFinite(macd[n]) &&
    Number.isFinite(signal[n]) &&
    macd[n] > signal[n];

  if (Number.isFinite(h) && h >= 0 && macdAbove) {
    if (Number.isFinite(hPrev) && hPrev > 0 && h > hPrev * 1.05) {
      momentum = 28;
    } else if (Number.isFinite(hPrev) && h > hPrev) {
      momentum = 18;
    } else {
      momentum = 10;
    }
  } else if (Number.isFinite(h) && h >= 0) {
    momentum = 6;
  } else if (Number.isFinite(h) && h > hPrev) {
    momentum = 4;
  }

  momentum = Math.min(MOMENTUM_MAX, momentum);

  let position = 0;
  const r = rsi[n];
  if (Number.isFinite(r)) {
    if (r >= 48 && r <= 58) position = 30;
    else if (r >= 42 && r <= 62) position = 22;
    else if (r > 62 && r <= 70) position = 14;
    else if (r > 70 && r <= 78) {
      position = 6;
      warnings.push("追高风险");
    } else if (r > 78) {
      position = 2;
      warnings.push("追高风险");
    } else if (r >= 32 && r < 42) position = 12;
    else if (r < 32) position = 8;
    else position = 16;
  }

  position = Math.min(POSITION_MAX, position);

  const upper = boll.upper[n];
  let penalty = 0;
  if (Number.isFinite(upper) && upper > 0 && (upper - price) / upper < 0.01) {
    warnings.push("接近布林上轨");
    penalty += 10;
  }
  if (Number.isFinite(e20[n]) && price < e20[n]) {
    penalty += 8;
  }
  if (!macdAbove && Number.isFinite(h) && h < 0) {
    penalty += 6;
  }

  let raw = trend + momentum + position - penalty;
  raw = Math.max(0, Math.min(100, raw));

  let score = Math.round(raw);
  const perfectTrend = trend >= 36;
  const strongMom = momentum >= 24;
  const healthyRsi = position >= 26;
  if (
    score >= 95 &&
    !(perfectTrend && strongMom && healthyRsi && warnings.length === 0)
  ) {
    score = Math.min(score, 92);
  }
  if (warnings.includes("追高风险")) {
    score = Math.min(score, 78);
  }

  let label = "中性震荡";
  if (score >= 82) label = "偏多强势";
  else if (score >= 62) label = "偏多健康";
  else if (score >= 45) label = "中性";
  else if (score >= 28) label = "偏弱";
  else label = "偏空";

  let advice =
    "均线与动能暂无明确优势，宜观望或用小仓位验证方向。";
  if (score >= 70 && warnings.includes("接近布林上轨")) {
    advice =
      "均线多头排列且动能充足，但接近布林上轨，适合低吸不建议追高。";
  } else if (score >= 75 && warnings.length === 0) {
    advice = "趋势与动能配合较好，可顺势持有，跌破短均线再考虑减仓。";
  } else if (score < 35) {
    advice = "多空体检偏弱，多看少动，等待均线金叉或放量企稳。";
  } else if (warnings.includes("追高风险")) {
    advice = "动能仍在但情绪过热，不宜追涨，等回踩均线或缩量再评估。";
  }

  return {
    score,
    label,
    advice,
    breakdown: { trend, momentum, position },
    warnings,
  };
}