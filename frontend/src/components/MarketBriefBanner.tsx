import { useMemo } from "react";
import type { Candle } from "../types/market";
import { buildMarketBrief } from "../utils/marketPlainLanguage";

interface Props {
  candles: Candle[];
}

export function MarketBriefBanner({ candles }: Props) {
  const brief = useMemo(() => buildMarketBrief(candles), [candles]);

  const lead = useMemo(() => {
    const t = brief.text.trim();
    const idx = t.search(/[：:]/);
    if (idx > 0 && idx <= 24) return t.slice(0, idx);
    const cut = t.indexOf("，");
    if (cut > 0 && cut <= 20) return t.slice(0, cut);
    return t.slice(0, Math.min(12, t.length));
  }, [brief.text]);

  const icon =
    brief.tone === "bull" ? "📈" : brief.tone === "bear" ? "📉" : "➖";

  return (
    <div
      className={`market-brief market-brief-${brief.tone}`}
      role="status"
      aria-live="polite"
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