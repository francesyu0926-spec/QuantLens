import { useMemo } from "react";
import type { Candle } from "../types/market";
import { buildMarketBrief } from "../utils/marketPlainLanguage";

interface Props {
  candles: Candle[];
}

export function MarketBriefBanner({ candles }: Props) {
  const brief = useMemo(() => buildMarketBrief(candles), [candles]);

  return (
    <div
      className={`market-brief market-brief-${brief.tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="market-brief-dot" aria-hidden />
      <p className="market-brief-text">{brief.text}</p>
    </div>
  );
}