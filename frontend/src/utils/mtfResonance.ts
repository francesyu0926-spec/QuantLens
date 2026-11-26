export type MtfTrend = "bull" | "bear" | "neutral";

export interface MtfFrame {
  interval: string;
  trend: MtfTrend;
  rsi: number | null;
}

export interface MtfResonance {
  headline: string;
  detail: string;
  /** 悬停结论标题时展示的扫描逻辑 */
  tooltip: string;
}

const SCAN_ORDER = ["5m", "15m", "1h", "1d"] as const;

export function pickResonanceFrames(frames: MtfFrame[]): MtfFrame[] {
  const map = new Map(frames.map((f) => [f.interval, f]));
  return SCAN_ORDER.map((iv) => map.get(iv)).filter(Boolean) as MtfFrame[];
}

export function trendArrow(t: MtfTrend): string {
  return t === "bull" ? "↑" : t === "bear" ? "↓" : "→";
}

export function frameScanLine(f: MtfFrame): string {
  const rsi =
    f.rsi != null && Number.isFinite(f.rsi)
      ? ` · RSI ${Math.round(f.rsi)}`
      : "";
  if (f.trend === "bull") {
    return `${f.interval} 均线多头排列${rsi}`;
  }
  if (f.trend === "bear") {
    return `${f.interval} 均线空头排列${rsi}`;
  }
  return `${f.interval} 方向震荡${rsi}`;
}

function joinTooltip(lines: string[]): string {
  return lines.join("；");
}

export function analyzeMtfResonance(frames: MtfFrame[]): MtfResonance {
  const scan = pickResonanceFrames(frames);
  if (scan.length === 0) {
    return {
      headline: "多周期扫描中",
      detail: "等待 5m/15m/1h/1d 数据…",
      tooltip: "等待各周期 K 线同步…",
    };
  }

  const scanTooltip = joinTooltip(scan.map(frameScanLine));

  const byIv = Object.fromEntries(scan.map((f) => [f.interval, f])) as Record<
    string,
    MtfFrame
  >;
  const d1 = byIv["1d"];
  const h1 = byIv["1h"];
  const m15 = byIv["15m"];
  const m5 = byIv["5m"];

  if (d1?.trend === "bull" && h1?.trend === "bull" && (m15?.rsi ?? 50) < 42) {
    const detail =
      "日线与 1 小时偏多，15 分钟 RSI 回落，属于大趋势向上的回踩窗口，宜分批不追涨。";
    return {
      headline: "顺势低吸机会",
      detail,
      tooltip: `${scanTooltip}。${detail}`,
    };
  }

  if (d1?.trend === "bear" && h1?.trend === "bear" && m5?.trend === "bull") {
    const detail =
      "大周期仍空，5 分钟出现短线转强，仅适合轻仓博弈反弹，破位需及时离场。";
    return {
      headline: "逆势反弹，快进快出",
      detail,
      tooltip: `${scanTooltip}。${detail}`,
    };
  }

  const bulls = scan.filter((f) => f.trend === "bull").length;
  const bears = scan.filter((f) => f.trend === "bear").length;

  if (bulls >= 3) {
  const detail = "大方向可偏多对待，短周期回调不破关键均线可持有。";
    return {
      headline: "多周期共振偏多",
      detail,
      tooltip: `${scanTooltip}。${detail}`,
    };
  }
  if (bears >= 3) {
  const detail = "大周期偏空，反弹以减仓/观望为主。";
    return {
      headline: "多周期共振偏空",
      detail,
      tooltip: `${scanTooltip}。${detail}`,
    };
  }

  const detail = "各周期方向不一致，避免被短周期牵着走。";
  return {
    headline: "周期分歧",
    detail,
    tooltip: `${scanTooltip}。${detail}`,
  };
}