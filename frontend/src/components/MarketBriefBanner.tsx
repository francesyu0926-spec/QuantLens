import { useMemo } from "react";
import type { CapitalFlowSnapshot } from "../hooks/useFundamentals";
import type { Candle } from "../types/market";
import { buildMarketBrief } from "../utils/marketPlainLanguage";
import {
  buildNovicePlainSentence,
  trafficLightFromCandles,
  trafficLightLabel,
} from "../utils/noviceCopy";

interface Props {
  candles: Candle[];
  noviceMode?: boolean;
  capitalFlow?: CapitalFlowSnapshot | null;
}

export function MarketBriefBanner({
  candles,
  noviceMode = false,
  capitalFlow = null,
}: Props) {
  const brief = useMemo(() => {
    if (noviceMode) {
      const traffic = trafficLightFromCandles(candles);
      const tone =
        traffic === "sunny" ? "bull" : traffic === "rainy" ? "bear" : "neutral";
      return {
        tone: tone as "bull" | "bear" | "neutral",
        text: buildNovicePlainSentence(candles, capitalFlow),
        traffic,
      };
    }
    return { ...buildMarketBrief(candles), traffic: null };
  }, [candles, noviceMode, capitalFlow]);

  const lead = useMemo(() => {
    if (noviceMode && "traffic" in brief && brief.traffic) {
      return trafficLightLabel(brief.traffic);
    }
    const t = brief.text.trim();
    const idx = t.search(/[：:]/);
    if (idx > 0 && idx <= 24) return t.slice(0, idx);
    const cut = t.indexOf("，");
    if (cut > 0 && cut <= 20) return t.slice(0, cut);
    return t.slice(0, Math.min(12, t.length));
  }, [brief, noviceMode]);

  const icon =
    brief.tone === "bull" ? "📈" : brief.tone === "bear" ? "📉" : "➖";

  return (
    <div
      className={`market-brief market-brief-${brief.tone}${
        noviceMode ? " market-brief-novice" : ""
      }`}
      role="status"
      aria-live="polite"
      data-novice-tour="brief"
    >
      <span className="market-brief-icon" aria-hidden>
        {icon}
      </span>
      <div className="market-brief-body">
        <strong className="market-brief-lead">{lead}</strong>
        <p className="market-brief-text">{brief.text}</p>
      </div>
    </div>
  );
}