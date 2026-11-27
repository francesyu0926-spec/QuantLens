import type { CapitalFlowSnapshot } from "../hooks/useFundamentals";
import type { Candle } from "../types/market";
import type { ScreenerPresetId } from "./screener";
import { computeHealthScore } from "./marketHealthScore";

export type TrafficLight = "sunny" | "cloudy" | "rainy";

export function valuationVerdict(pe: number | null | undefined): string {
  if (pe == null || !Number.isFinite(pe) || pe <= 0) return "—";
  if (pe > 60) return "偏贵";
  if (pe > 25) return "适中";
  return "偏便宜";
}

export function plainMainFlowLabel(flowUp: boolean): string {
  return flowUp ? "大资金净买入" : "大资金在撤出";
}

export function plainPriceLineTitle(title: string): string {
  if (title === "支撑" || title.includes("支撑"))
    return "跌到这里可能止跌";
  if (title === "阻力" || title.includes("阻力"))
    return "涨到这里可能遇压";
  if (title === "止损") return "亏损警戒线";
  if (title === "止盈") return "盈利目标线";
  if (title === "现价" || title === "当前价") return "当前价";
  if (title === "关键价位") return "自选价位";
  return title;
}

const RULE_PLAIN: Record<string, string> = {
  ema_golden_cross: "动能转强（偏多信号）",
  ema_death_cross: "动能减弱（风险提示）",
  rsi_oversold: "短线跌得较多，或有反弹",
  rsi_overbought: "短线涨得较快，注意回调",
  bb_break_lower: "价格偏低，观望企稳",
  bb_break_upper: "价格偏高，注意回落",
};

export function plainSignalMessage(rule: string, message: string): string {
  const base = RULE_PLAIN[rule];
  if (base) return base;
  return message
    .replace(/金叉/g, "动能转强")
    .replace(/死叉/g, "动能减弱")
    .replace(/超买/g, "涨得较快")
    .replace(/超卖/g, "跌得较多")
    .replace(/EMA/gi, "趋势")
    .replace(/RSI/gi, "情绪")
    .replace(/布林/g, "通道");
}

export function trafficLightFromCandles(candles: Candle[]): TrafficLight {
  if (candles.length < 35) return "cloudy";
  const h = computeHealthScore(candles);
  if (h.score >= 62 && !h.warnings.includes("追高风险")) return "sunny";
  if (h.score < 45) return "rainy";
  return "cloudy";
}

export function trafficLightLabel(light: TrafficLight): string {
  if (light === "sunny") return "强势（晴天）";
  if (light === "rainy") return "偏弱（雨天）";
  return "震荡（多云）";
}

export function noviceHealthOneLiner(
  score: number,
  warnings: string[]
): string {
  if (score >= 75 && warnings.length === 0) {
    return "趋势向上、资金面配合，可持有观察。";
  }
  if (score >= 62) {
    return warnings.includes("追高风险")
      ? "趋势尚可，但短线偏热，别追高。"
      : "整体偏强，小仓位跟进即可。";
  }
  if (score >= 45) return "方向不够明朗，先观望为宜。";
  return "走势偏弱，控制仓位、注意风险。";
}

/** 设置页：策略提醒开关（白话） */
export const NOVICE_ALERT_RULE_LABELS = {
  emaCross: "趋势动能转强 / 转弱",
  rsiOversold: "短线跌得多，注意反弹机会",
  rsiOverbought: "短线涨得快，注意回落",
  bbLower: "价格跌到偏低区间",
  bbUpper: "价格涨到偏高区间",
} as const;

export const NOVICE_NOTIFY_LABELS = {
  sound: "提醒时播放提示音",
  desktop: "弹出桌面通知",
  webhook: "推送到 Webhook",
  paperAuto: "提醒时自动练习买入（100 股）",
} as const;

export const NOVICE_INTERVALS = ["1m", "5m", "15m", "1d"] as const;

export const NOVICE_CHART_STOP_LINE = "跌到这里可能止损";
export const NOVICE_CHART_TAKE_LINE = "涨到这里可能止盈";

export const NOVICE_SCREENER_COPY: Record<
  ScreenerPresetId,
  { title: string; hint: string; chip: string }
> = {
  momentum: {
    title: "今日涨幅偏大",
    chip: "> 3%",
    hint: "按实时涨跌幅筛选，约 3% 以上",
  },
  oversold: {
    title: "短线跌得较多",
    chip: "超跌",
    hint: "情绪偏冷，或有反弹机会",
  },
  macd_cross: {
    title: "动能由弱转强",
    chip: "转暖",
    hint: "近两日趋势变暖",
  },
  above_ema20: {
    title: "价格在短期均线之上",
    chip: "均线",
    hint: "走势相对偏强",
  },
};

export function buildNovicePlainSentence(
  candles: Candle[],
  flow: CapitalFlowSnapshot | null | undefined
): string {
  if (candles.length < 12) {
    return "数据还不多，先看价格和下方的白话总结即可。";
  }
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const ref = n >= 6 ? closes[n - 6] : closes[0];
  const last = closes[n - 1];
  const chg = ref > 0 ? (last - ref) / ref : 0;

  let trend =
    chg > 0.015
      ? "近几日整体震荡上行"
      : chg < -0.015
        ? "近几日整体震荡下行"
        : "近几日涨跌互现";

  let flowPart = "";
  if (flow?.ok && flow.main_net_inflow != null) {
    flowPart =
      flow.main_net_inflow >= 0
        ? "，今日大资金净流入偏高"
        : "，今日大资金在撤出";
  }

  const h = candles.length >= 35 ? computeHealthScore(candles) : null;
  let tail = "，先观望再操作。";
  if (h?.warnings.includes("追高风险") || h?.warnings.includes("接近布林上轨")) {
    tail = "，但短线涨得有点快，不建议盲目追高。";
  } else if (h && h.score < 45) {
    tail = "，走势偏弱，注意风险控制。";
  } else if (h && h.score >= 62) {
    tail = "，可小仓关注，别一次性押满。";
  }

  return `${trend}${flowPart}${tail}`;
}