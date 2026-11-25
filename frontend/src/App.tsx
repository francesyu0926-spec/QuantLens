import { useEffect, useMemo, useRef, useState } from "react";
import { AlertSettings } from "./components/AlertSettings";
import { ChartErrorBoundary } from "./components/ChartErrorBoundary";
import { ChartLoadOverlay } from "./components/ChartLoadOverlay";
import { ChartToolbar } from "./components/ChartToolbar";
import {
  ChartWorkspace,
  type ChartWorkspaceHandle,
} from "./components/ChartWorkspace";
import { IndicatorPanel } from "./components/IndicatorPanel";
import { SignalLog } from "./components/SignalLog";
import { Watchlist } from "./components/Watchlist";
import { useAlertRules } from "./hooks/useAlertRules";
import { useMarketWebSocket } from "./hooks/useMarketWebSocket";
import { useWatchlistQuotes } from "./hooks/useWatchlistQuotes";
import {
  DEFAULT_CHART_OPTIONS,
  type ChartDisplayOptions,
  INTERVALS,
  type TimeInterval,
} from "./types/chart";
import type { AlertSignal, WatchlistItem } from "./types/market";
import { backfillEmaSignals } from "./utils/signalHistory";

const WATCHLIST_SEED: Omit<WatchlistItem, "price" | "changePct">[] = [
  { symbol: "BTC/USDT", name: "Bitcoin" },
  { symbol: "ETH/USDT", name: "Ethereum" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "600519", name: "贵州茅台" },
  { symbol: "000001", name: "平安银行" },
];

const SYMBOLS = WATCHLIST_SEED.map((i) => i.symbol);

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* no audio */
  }
}

export default function App() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [interval, setInterval] = useState<TimeInterval>("1m");
  const [chartOptions, setChartOptions] =
    useState<ChartDisplayOptions>(DEFAULT_CHART_OPTIONS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { rules, setRules } = useAlertRules();

  const market = useMarketWebSocket(symbol, interval);
  const quotes = useWatchlistQuotes(SYMBOLS, symbol, market.price);
  const prevLiveCount = useRef(0);
  const chartRef = useRef<ChartWorkspaceHandle>(null);

  const allSignals = useMemo((): AlertSignal[] => {
    const hist = backfillEmaSignals(symbol, market.candles, 10);
    const live = market.signals;
    const seen = new Set<string>();
    const merged: AlertSignal[] = [];
    for (const s of [...live, ...hist]) {
      const key = `${s.rule}-${s.bar_time ?? s.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
    return merged.slice(0, 100);
  }, [market.signals, market.candles, symbol]);

  useEffect(() => {
    const liveOnly = market.signals.length;
    if (
      rules.soundEnabled &&
      liveOnly > prevLiveCount.current &&
      prevLiveCount.current > 0
    ) {
      playBeep();
    }
    prevLiveCount.current = liveOnly;
  }, [market.signals.length, rules.soundEnabled]);

  const quotePx = quotes[symbol]?.price ?? 0;
  const effectivePrice = market.price > 0 ? market.price : quotePx;

  const watchlist = useMemo((): WatchlistItem[] => {
    return WATCHLIST_SEED.map((item) => {
      const q = quotes[item.symbol];
      const isActive = item.symbol === symbol;
      const px =
        isActive && effectivePrice > 0
          ? effectivePrice
          : q?.price ?? null;
      const price = px;
      const changePct =
        isActive && market.candles.length >= 2 && effectivePrice > 0
          ? ((effectivePrice -
              market.candles[market.candles.length - 2].close) /
              market.candles[market.candles.length - 2].close) *
            100
          : q?.changePct ?? null;
      const sparkline =
        isActive && market.candles.length > 2
          ? market.candles.slice(-30).map((c) => c.close)
          : q?.sparkline;
      return { ...item, price, changePct, sparkline };
    });
  }, [quotes, symbol, effectivePrice, market.candles]);

  const displayPrice =
    effectivePrice > 0 ? effectivePrice.toFixed(2) : "—";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 6) {
        setInterval(INTERVALS[n - 1]);
        return;
      }
      const idx = SYMBOLS.indexOf(symbol);
      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        setSymbol(SYMBOLS[idx - 1]);
      }
      if (e.key === "ArrowDown" && idx >= 0 && idx < SYMBOLS.length - 1) {
        e.preventDefault();
        setSymbol(SYMBOLS[idx + 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbol]);

  const marketLabel = symbol.includes("/")
    ? "加密 7×24"
    : /^\d{6}$/.test(symbol)
      ? "A股 交易时段"
      : "美股 交易时段";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-cluster">
          <h1>QuantLens</h1>
          <span className={`status ${market.connected ? "on" : "off"}`}>
            {market.connected ? "实时连接" : "重连中…"}
          </span>
        </div>
        <div className="symbol-cluster">
          <span className="pill pill-symbol">{symbol}</span>
          <span className="pill pill-interval">{interval}</span>
          <span className="pill pill-market">{marketLabel}</span>
        </div>
        <span className="live-price">{displayPrice}</span>
      </header>

      <div className="layout">
        <Watchlist items={watchlist} active={symbol} onSelect={setSymbol} />
        <main className="chart-area">
          <ChartToolbar
            interval={interval}
            onInterval={setInterval}
            options={chartOptions}
            onOptions={setChartOptions}
          />
          <IndicatorPanel
            indicators={market.indicators}
            price={effectivePrice}
          />
          <div className="chart-stack">
            <ChartLoadOverlay
              symbol={symbol}
              interval={interval}
              loading={market.loading}
              error={market.loadError}
              hasData={market.candles.length > 0}
              onRetry={market.retry}
            />
            <ChartErrorBoundary
              key={`err-${symbol}-${interval}`}
              onRetry={market.retry}
            >
              <ChartWorkspace
                ref={chartRef}
                key={`${symbol}-${interval}`}
                candles={market.candles}
                signals={allSignals}
                options={chartOptions}
              />
            </ChartErrorBoundary>
          </div>
        </main>
        <SignalLog
          signals={allSignals}
          rules={rules}
          onOpenSettings={() => setSettingsOpen(true)}
          onPick={(sig) => {
            const t = sig.bar_time;
            if (t != null) chartRef.current?.scrollToBar(t);
          }}
        />
      </div>

      <AlertSettings
        open={settingsOpen}
        rules={rules}
        onChange={setRules}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}