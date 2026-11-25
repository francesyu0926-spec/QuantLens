import type { Candle } from "../types/market";
import type { MtfFrame } from "./mtfResonance";
import { analyzeMtfResonance } from "./mtfResonance";
import {
  computeHealthScore,
  type HealthScore,
} from "./marketHealthScore";
import {
  findKeyLevels,
  keyLevelDistances,
} from "./chartPatterns";
import { buildMarketBrief } from "./marketPlainLanguage";
import { computeMacd, computeRsi, ema } from "./indicators";

export interface LevelQuote {
  price: number;
  pct: number | null;
}

export interface StructuredReport {
  situation: string;
  bullBear: string;
  advice: string;
  health: HealthScore;
  levels: {
    resistance?: LevelQuote;
    support?: LevelQuote;
  };
  scenarioUp: number;
  scenarioDown: number;
  mtfHeadline: string;
  supportPrice?: number;
  resistancePrice?: number;
}

export function buildStructuredReport(
  symbol: string,
  candles: Candle[],
  price: number,
  mtfFrames: MtfFrame[]
): StructuredReport {
  const health = computeHealthScore(candles);
  const brief = buildMarketBrief(candles);
  const pivots = findKeyLevels(candles);
  const dist = keyLevelDistances(candles, price, pivots);
  const mtf = analyzeMtfResonance(mtfFrames);

  const situation =
    brief.tone === "bull"
      ? "震荡上行，短线动能占上风。"
      : brief.tone === "bear"
        ? "震荡下行，空方结构占优。"
        : "横盘震荡，方向未明。";

  const closes = candles.map((c) => c.close);
  const { hist } = computeMacd(closes);
  const rsi = computeRsi(closes);
  const n = closes.length - 1;
  const volTone =
    hist[n] > 0 && hist[n] > hist[n - 1]
      ? "MACD 红柱伸长，动能增强"
      : hist[n] < 0
        ? "MACD 绿柱，动能偏弱"
        : "MACD 动能中性";
  const rsiTxt = Number.isFinite(rsi[n])
    ? rsi[n] > 65
      ? "RSI 偏高"
      : rsi[n] < 35
        ? "RSI 偏低"
        : "RSI 中性"
    : "RSI 暂无";
  const ema20 = ema(closes, 20)[n];
  const emaTxt =
    Number.isFinite(ema20) && price > ema20
      ? "价格在 EMA20 上方"
      : "价格在 EMA20 下方";

  const bullBear = `${emaTxt}；${volTone}；${rsiTxt}。综合体检 ${health.score}/100（${health.label}）。`;

  const res = dist.resistance?.price;
  const sup = dist.support?.price;
  const scenarioUp = res ?? price * 1.02;
  const scenarioDown = sup ?? price * 0.98;

  const levelQuotes: StructuredReport["levels"] = {};
  if (dist.resistance) {
    levelQuotes.resistance = {
      price: dist.resistance.price,
      pct: dist.toResistancePct,
    };
  }
  if (dist.support) {
    levelQuotes.support = {
      price: dist.support.price,
      pct: dist.toSupportPct,
    };
  }

  const mtfHeadline =
    mtfFrames.length > 0 ? mtf.headline : "周期分歧";

  void symbol;

  return {
    situation,
    bullBear,
    advice: health.advice,
    health,
    levels: levelQuotes,
    scenarioUp,
    scenarioDown,
    mtfHeadline,
    supportPrice: sup,
    resistancePrice: res,
  };
}

function formatKeyLevels(levels: StructuredReport["levels"]): string {
  const parts: string[] = [];
  if (levels.resistance) {
    parts.push(
      `上方阻力 ${levels.resistance.price.toFixed(2)}${
        levels.resistance.pct != null
          ? `（约 +${levels.resistance.pct.toFixed(2)}%）`
          : ""
      }`
    );
  }
  if (levels.support) {
    parts.push(
      `下方支撑 ${levels.support.price.toFixed(2)}${
        levels.support.pct != null
          ? `（约 ${levels.support.pct.toFixed(2)}%）`
          : ""
      }`
    );
  }
  if (parts.length === 0) return "暂无明显枢轴支撑/阻力簇。";
  return parts.join("；");
}

export function reportToCopyText(report: StructuredReport): string {
  const up = report.scenarioUp.toFixed(2);
  const down = report.scenarioDown.toFixed(2);
  return [
    `【当前局势】${report.situation}`,
    `【多空依据】${report.bullBear}`,
    `【关键点位】${formatKeyLevels(report.levels)}`,
    `【多周期】${report.mtfHeadline}`,
    `【观察剧本】① 放量站稳 ${up}；② 跌破 ${down}`,
    `【白话建议】${report.advice}`,
    "以上为技术结构解读，非投资建议。",
  ].join("\n");
}