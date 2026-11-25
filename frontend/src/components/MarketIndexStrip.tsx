import { A_SHARE_ONLY } from "../config/market";
import { INDEX_WIND_SYMBOLS } from "../config/pinnedWatchlist";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import type { PriceColors } from "../utils/priceColors";
import { Sparkline } from "./Sparkline";

const INDEX_LABELS: Record<(typeof INDEX_WIND_SYMBOLS)[number], string> = {
  "510050": "上证50",
  "510300": "沪深300",
  "159915": "创业板",
};

interface Props {
  quotes: QuoteMap;
  priceColors: PriceColors;
  onSelect: (symbol: string) => void;
}

export function MarketIndexStrip({ quotes, priceColors, onSelect }: Props) {
  if (!A_SHARE_ONLY) return null;

  return (
    <section className="market-wind" aria-label="大盘风向标">
      <p className="market-wind-title">大盘风向</p>
      <ul className="market-wind-list">
        {INDEX_WIND_SYMBOLS.map((symbol) => {
          const label = INDEX_LABELS[symbol];
          const q = quotes[symbol];
          const pct = q?.changePct;
          const px = q?.price;
          const up = pct != null ? pct >= 0 : true;
          const showPct = pct != null && Number.isFinite(pct);
          const hasPx = px != null && px > 0;
          return (
            <li key={symbol}>
              <button
                type="button"
                className="market-wind-item"
                title={`查看 ${label}`}
                onClick={() => onSelect(symbol)}
              >
                <span className="market-wind-ident">
                  <span className="market-wind-name">{label}</span>
                </span>
                <Sparkline values={q?.sparkline} colors={priceColors} />
                <span className="market-wind-quote">
                  <span className="market-wind-px tabular">
                    {hasPx ? px.toFixed(2) : "—"}
                  </span>
                  <span
                    className={`market-wind-chg tabular${showPct ? (up ? " up" : " down") : ""}`}
                  >
                    {showPct
                      ? `${up ? "+" : ""}${pct.toFixed(2)}%`
                      : "—"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}