import { useEffect, useMemo } from "react";
import type { Candle } from "../types/market";
import { focusMainChart } from "../utils/nativeBridge";

interface Props {
  symbol: string;
  symbolName: string;
  price: number;
  changePct: number | null;
  candles: Candle[];
}

function sparkPath(candles: Candle[], w: number, h: number): string {
  const closes = candles.slice(-40).map((c) => c.close);
  if (closes.length < 2) return "";
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  return closes
    .map((v, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MiniTicker({
  symbol,
  symbolName,
  price,
  changePct,
  candles,
}: Props) {
  const up = (changePct ?? 0) >= 0;
  const path = useMemo(() => sparkPath(candles, 120, 36), [candles]);

  useEffect(() => {
    document.body.classList.add("mini-ticker-mode");
    return () => document.body.classList.remove("mini-ticker-mode");
  }, []);

  return (
    <div
      className="mini-ticker"
      role="button"
      tabIndex={0}
      onClick={() => void focusMainChart(symbol)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void focusMainChart(symbol);
      }}
    >
      <div className="mini-ticker-head">
        <span className="mini-ticker-name">{symbolName || symbol}</span>
        <span className="mini-ticker-code">{symbol}</span>
      </div>
      <div className="mini-ticker-body">
        <span className={`mini-ticker-px tabular pnl-${up ? "up" : "down"}`}>
          {price > 0 ? price.toFixed(2) : "—"}
        </span>
        {changePct != null && (
          <span className={`mini-ticker-chg tabular pnl-${up ? "up" : "down"}`}>
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        )}
        {path && (
          <svg className="mini-ticker-spark" viewBox="0 0 120 36" aria-hidden>
            <path d={path} fill="none" className="mini-ticker-spark-line" />
          </svg>
        )}
      </div>
    </div>
  );
}