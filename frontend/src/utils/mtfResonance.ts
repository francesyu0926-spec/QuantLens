export type MtfTrend = "bull" | "bear" | "neutral";

export interface MtfFrame {
  interval: string;
  trend: MtfTrend;
  rsi: number | null;
}

export interface MtfResonance {
  headline: string;
  detail: string;
}

const SCAN_ORDER = ["5m", "15m", "1h", "1d"] as const;

export function pickResonanceFrames(frames: MtfFrame[]): MtfFrame[] {
  const map = new Map(frames.map((f) => [f.interval, f]));
  return SCAN_ORDER.map((iv) => map.get(iv)).filter(Boolean) as MtfFrame[];
}

function trendCn(t: MtfTrend) {
  return t === "bull" ? "多" : t === "bear" ? "空" : "震荡";
}

export function analyzeMtfResonance(frames: MtfFrame[]): MtfResonance {
  const scan = pickResonanceFrames(frames);
  if (scan.length === 0) {
    return { headline: "多周期扫描中", detail: "等待 5m/15m/1h/1d 数据…" };
  }

  const byIv = Object.fromEntries(scan.map((f) => [f.interval, f])) as Record<
    string,
    MtfFrame
  >;
  const d1 = byIv["1d"];
  const h1 = byIv["1h"];
  const m15 = byIv["15m"];
  const m5 = byIv["5m"];

  if (d1?.trend === "bull" && h1?.trend === "bull" && (m15?.rsi ?? 50) < 42) {
    return {
      headline: "顺势低吸机会",
      detail:
        "日线与 1 小时偏多，15 分钟 RSI 回落，属于大趋势向上的回踩窗口，宜分批不追涨。",
    };
  }

  if (d1?.trend === "bear" && h1?.trend === "bear" && m5?.trend === "bull") {
    return {
      headline: "逆势反弹，快进快出",
      detail:
        "大周期仍空，5 分钟出现短线金叉式转强，仅适合轻仓博弈反弹，破位需及时离场。",
    };
  }

  const bulls = scan.filter((f) => f.trend === "bull").length;
  const bears = scan.filter((f) => f.trend === "bear").length;

  if (bulls >= 3) {
    return {
      headline: "多周期共振偏多",
      detail: `${scan.map((f) => `${f.interval}${trendCn(f.trend)}`).join(" · ")}，大方向可偏多对待。`,
    };
  }
  if (bears >= 3) {
    return {
      headline: "多周期共振偏空",
      detail: `${scan.map((f) => `${f.interval}${trendCn(f.trend)}`).join(" · ")}，反弹以减仓/观望为主。`,
    };
  }

  return {
    headline: "周期分歧",
    detail: `${scan.map((f) => `${f.interval}${trendCn(f.trend)}`).join(" · ")}，避免被短周期牵着走。`,
  };
}