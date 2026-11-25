import { useEffect, useMemo, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";
import { ConnectionStatusCapsule, type ConnectionMeta } from "./ConnectionStatusCapsule";
import type { ChartLayoutMode, TimeInterval } from "../types/chart";
import { LayoutSwitchMenu } from "./LayoutSwitchMenu";
import type { Candle } from "../types/market";
import { isAShareSessionOpen } from "../utils/marketSession";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";

function exchangeSuffix(code: string): string {
  if (!/^\d{6}$/.test(code)) return code;
  if (code.startsWith("6") || code.startsWith("5")) return `${code}.SH`;
  return `${code}.SZ`;
}

interface Props {
  symbol: string;
  symbolName: string;
  interval: TimeInterval;
  loadError: string | null;
  loading: boolean;
  chartReady: boolean;
  switchPending: boolean;
  connectionMeta: ConnectionMeta;
  onReconnect: () => void;
  onDiagnose: () => void;
  onSettings: () => void;
  effectivePrice: number;
  displayCandles: Candle[];
  quotes: QuoteMap;
  chartLayout: ChartLayoutMode;
  onChartLayout: (mode: ChartLayoutMode) => void;
  noviceMode: boolean;
  onToggleNovice: () => void;
}

export function TopStatusBar({
  symbol,
  symbolName,
  interval,
  loadError,
  loading,
  chartReady,
  switchPending,
  connectionMeta,
  onReconnect,
  onDiagnose,
  onSettings,
  effectivePrice,
  displayCandles,
  quotes,
  chartLayout,
  onChartLayout,
  noviceMode,
  onToggleNovice,
}: Props) {
  const [sessionOpen, setSessionOpen] = useState(() => isAShareSessionOpen());

  useEffect(() => {
    const tick = () => setSessionOpen(isAShareSessionOpen());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const marketHint = A_SHARE_ONLY
    ? sessionOpen
      ? "交易中"
      : "已休市"
    : symbol.includes("/")
      ? "7×24"
      : /^\d{6}$/.test(symbol)
        ? sessionOpen
          ? "交易中"
          : "已休市"
        : "休市";

  const priceMove = useMemo(() => {
    if (effectivePrice <= 0) return null;
    const q = quotes[symbol];
    if (q?.changePct != null && Number.isFinite(q.changePct)) {
      const pct = q.changePct;
      const ref = effectivePrice / (1 + pct / 100);
      return { amt: effectivePrice - ref, pct };
    }
    if (displayCandles.length >= 2) {
      const prev = displayCandles[displayCandles.length - 2].close;
      if (prev > 0) {
        const amt = effectivePrice - prev;
        return { amt, pct: (amt / prev) * 100 };
      }
    }
    return null;
  }, [effectivePrice, quotes, symbol, displayCandles]);

  const up = priceMove ? priceMove.pct >= 0 : true;
  const displayPrice = effectivePrice > 0 ? effectivePrice.toFixed(2) : "—";

  return (
    <header className="top-bar">
      <div className="top-zone top-zone-brand">
        <h1 className="top-logo">QuantLens</h1>
        <ConnectionStatusCapsule
          loadError={loadError}
          loading={loading}
          chartReady={chartReady}
          symbol={symbol}
          meta={connectionMeta}
          onReconnect={onReconnect}
        />
      </div>

      <div className="top-vrule" aria-hidden />

      <div className="top-zone top-zone-symbol">
        <div
          className={`top-symbol-block${
            !chartReady && switchPending ? " is-stale" : ""
          }`}
        >
          <span className="top-symbol-name">{symbolName || symbol}</span>
          <span className="top-symbol-code">{exchangeSuffix(symbol)}</span>
        </div>
        <span className="top-tag top-tag-interval">{interval}</span>
        <span
          className={`top-tag top-tag-session${
            sessionOpen ? " is-open" : " is-closed"
          }`}
        >
          <span className="top-session-dot" aria-hidden />
          {marketHint}
        </span>
      </div>

      <div className="top-spacer" aria-hidden />

      <div className="top-zone top-zone-actions">
        <LayoutSwitchMenu value={chartLayout} onChange={onChartLayout} />
        <button
          type="button"
          className={`top-btn top-btn-novice${noviceMode ? " on" : ""}`}
          title="开启后用白话解读盘面与指标"
          aria-pressed={noviceMode}
          onClick={onToggleNovice}
        >
          白话
        </button>
        <button type="button" className="top-btn top-btn-ai" onClick={onDiagnose}>
          <span className="top-btn-spark" aria-hidden>
            ✦
          </span>
          AI 诊断
        </button>
        <button
          type="button"
          className="top-btn top-btn-icon"
          title="预警规则"
          onClick={onSettings}
        >
          ⚙
        </button>
        <div className="top-vrule top-vrule-tall" aria-hidden />
        <div className="top-quote">
          <span
            className={`top-quote-px tabular${
              priceMove ? (up ? " up" : " down") : ""
            }`}
          >
            {displayPrice}
          </span>
          {priceMove && (
            <span
              className={`top-quote-chg tabular${up ? " up" : " down"}`}
            >
              {up ? "+" : ""}
              {priceMove.amt.toFixed(2)}{" "}
              {up ? "+" : ""}
              {priceMove.pct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </header>
  );
}