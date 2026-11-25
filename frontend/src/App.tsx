import { useEffect, useMemo, useRef, useState } from "react";
import { AlertSettings } from "./components/AlertSettings";
import { ChartErrorBoundary } from "./components/ChartErrorBoundary";
import { ChartLoadOverlay } from "./components/ChartLoadOverlay";
import { ConnectionStatusCapsule } from "./components/ConnectionStatusCapsule";
import { ChartPriceActions } from "./components/ChartPriceActions";
import { ChartToolbar } from "./components/ChartToolbar";
import {
  ChartWorkspace,
  type ChartWorkspaceHandle,
} from "./components/ChartWorkspace";
import { IndicatorPanel } from "./components/IndicatorPanel";
import { AiDiagnoseModal } from "./components/AiDiagnoseModal";
import { ErrorBanner } from "./components/ErrorBanner";
import { MultiTimeframeRadar } from "./components/MultiTimeframeRadar";
import { RightDock } from "./components/RightDock";
import type { SignalScope } from "./components/SignalLog";
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
import type { AlertSignal, Candle, WatchlistItem } from "./types/market";
import { usePersistedWatchlist } from "./hooks/usePersistedWatchlist";
import { usePriceLines } from "./hooks/usePriceLines";
import { DEFAULT_SYMBOL, A_SHARE_ONLY } from "./config/market";
import { backfillEmaSignals } from "./utils/signalHistory";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

async function relayWebhook(url: string, title: string, text: string) {
  try {
    await fetch(`${API}/webhook/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title, text }),
    });
  } catch {
    /* ignore */
  }
}

const cacheKey = (sym: string, iv: string) => `${sym}@${iv}`;

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
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setInterval] = useState<TimeInterval>("1m");
  const [chartOptions, setChartOptions] =
    useState<ChartDisplayOptions>(DEFAULT_CHART_OPTIONS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const [signalScope, setSignalScope] = useState<SignalScope>("current");
  const [watchlistSignals, setWatchlistSignals] = useState<AlertSignal[]>([]);
  const { rules, setRules } = useAlertRules();
  const { items: watchlistSeed, addSymbol, symbolList } = usePersistedWatchlist();
  const { lines: priceLines, addLine, removeLine } = usePriceLines(symbol);
  const pushedSignals = useRef(new Set<string>());
  const priceLineHits = useRef(new Set<string>());

  const [visibleWatchSymbols, setVisibleWatchSymbols] = useState<string[]>([]);

  const market = useMarketWebSocket(symbol, interval);
  const quoteSymbols = useMemo(() => {
    const visible =
      visibleWatchSymbols.length > 0
        ? visibleWatchSymbols
        : symbolList.slice(0, 15);
    const merged = new Set([symbol, ...visible]);
    return [...merged];
  }, [visibleWatchSymbols, symbolList, symbol]);

  const quotes = useWatchlistQuotes(quoteSymbols, symbol, market.price);
  const prevLiveCount = useRef(0);
  const chartRef = useRef<ChartWorkspaceHandle>(null);
  const chartCache = useRef(
    new Map<string, { candles: Candle[]; price: number }>()
  );
  const lastReadySymbol = useRef(DEFAULT_SYMBOL);
  const [showBanner, setShowBanner] = useState(false);

  const chartReady = market.candles.length > 0;
  const fallback = chartCache.current.get(
    cacheKey(lastReadySymbol.current, interval)
  );
  const displayCandles = chartReady ? market.candles : fallback?.candles ?? [];
  const chartViewSymbol = chartReady ? symbol : lastReadySymbol.current;
  const switchPending =
    !chartReady && (market.loading || Boolean(market.loadError));

  useEffect(() => {
    if (market.candles.length > 0) {
      chartCache.current.set(cacheKey(symbol, interval), {
        candles: market.candles,
        price: market.price,
      });
      lastReadySymbol.current = symbol;
      setShowBanner(false);
    }
  }, [market.candles, market.price, symbol, interval]);

  useEffect(() => {
    if (market.loadError && !chartReady) setShowBanner(true);
  }, [market.loadError, chartReady, symbol]);

  const cancelSwitch = () => {
    setShowBanner(false);
    const revertTo = lastReadySymbol.current;
    if (symbol !== revertTo) setSymbol(revertTo);
  };

  const showStale = switchPending && displayCandles.length > 0;

  const allSignals = useMemo((): AlertSignal[] => {
    const hist = backfillEmaSignals(chartViewSymbol, displayCandles, 40);
    const live = market.signals.filter((s) => s.symbol === chartViewSymbol);
    const seen = new Set<string>();
    const merged: AlertSignal[] = [];
    for (const s of [...live, ...hist]) {
      const key = `${s.symbol}-${s.rule}-${s.bar_time ?? s.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
    return merged.sort((a, b) => b.ts - a.ts).slice(0, 100);
  }, [market.signals, displayCandles, chartViewSymbol]);

  useEffect(() => {
    if (market.signals.length === 0) return;
    setWatchlistSignals((prev) => {
      const seen = new Set(prev.map((s) => s.id));
      const added = market.signals.filter(
        (s) => symbolList.includes(s.symbol) && !seen.has(s.id)
      );
      if (added.length === 0) return prev;
      return [...added, ...prev].slice(0, 200);
    });
  }, [market.signals]);

  const displaySignals = useMemo(() => {
    if (signalScope === "watchlist") {
      const seen = new Set<string>();
      const merged: AlertSignal[] = [];
      for (const s of [...allSignals, ...watchlistSignals]) {
        if (!symbolList.includes(s.symbol)) continue;
        const key = `${s.symbol}-${s.rule}-${s.bar_time ?? s.ts}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(s);
      }
      return merged
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 100);
    }
    return allSignals.filter((s) => s.symbol === chartViewSymbol);
  }, [
    signalScope,
    allSignals,
    watchlistSignals,
    chartViewSymbol,
    symbolList,
  ]);

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

  useEffect(() => {
    if (!rules.webhookEnabled || !rules.webhookUrl.trim()) return;
    for (const s of market.signals) {
      if (pushedSignals.current.has(s.id)) continue;
      pushedSignals.current.add(s.id);
      void relayWebhook(
        rules.webhookUrl.trim(),
        `${s.symbol} ${s.rule}`,
        `${s.message} @${s.price.toFixed(4)}`
      );
    }
  }, [market.signals, rules.webhookEnabled, rules.webhookUrl]);

  const quotePx = quotes[symbol]?.price ?? 0;
  const effectivePrice = chartReady
    ? market.price > 0
      ? market.price
      : quotePx
    : 0;

  useEffect(() => {
    const px = effectivePrice;
    if (px <= 0) return;
    for (const line of priceLines) {
      const tol = Math.max(line.price * 0.0008, 0.0001);
      if (Math.abs(px - line.price) > tol) continue;
      const key = `${line.id}-${Math.floor(Date.now() / 60_000)}`;
      if (priceLineHits.current.has(key)) continue;
      priceLineHits.current.add(key);
      if (rules.soundEnabled) playBeep();
    }
  }, [effectivePrice, priceLines, rules.soundEnabled]);

  const quotesLoading = useMemo(() => {
    const sample = watchlistSeed.slice(0, 20);
    const ok = sample.filter((i) => {
      const q = quotes[i.symbol];
      return q?.price != null && q.price > 0;
    }).length;
    return ok < Math.min(3, sample.length);
  }, [quotes, watchlistSeed]);

  const watchlist = useMemo((): WatchlistItem[] => {
    return watchlistSeed.map((item) => {
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
  }, [quotes, symbol, effectivePrice, market.candles, watchlistSeed]);

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
      const idx = symbolList.indexOf(symbol);
      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        setSymbol(symbolList[idx - 1]);
      }
      if (e.key === "ArrowDown" && idx >= 0 && idx < symbolList.length - 1) {
        e.preventDefault();
        setSymbol(symbolList[idx + 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbol, symbolList]);

  const marketLabel = A_SHARE_ONLY
    ? "A股 交易时段"
    : symbol.includes("/")
      ? "加密 7×24"
      : /^\d{6}$/.test(symbol)
        ? "A股 交易时段"
        : "美股 交易时段";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-cluster">
          <h1>QuantLens</h1>
          <ConnectionStatusCapsule
            loadError={market.loadError}
            loading={market.loading}
            chartReady={chartReady}
            symbol={symbol}
            meta={market.connectionMeta}
            onReconnect={market.retry}
          />
        </div>
        <div className="symbol-cluster">
          <span
            className={`pill pill-symbol${
              !chartReady && switchPending ? " pill-stale" : ""
            }`}
          >
            {!chartReady && switchPending && (
              <span className="disc" title="当前标的暂无行情" aria-hidden>
                ●
              </span>
            )}
            {symbol}
          </span>
          <span className="pill pill-interval">{interval}</span>
          <span className="pill pill-market">{marketLabel}</span>
        </div>
        <button
          type="button"
          className="chip"
          onClick={() => setDiagnoseOpen(true)}
        >
          AI 诊断
        </button>
        <span className="live-price">{displayPrice}</span>
      </header>

      {showBanner && market.loadError && (
        <ErrorBanner
          title="行情拉取超时"
          detail={`切换至 ${symbol} 失败，请检查网络或稍后重试。`}
          onRetry={market.retry}
          onDismiss={() => {
            setShowBanner(false);
            cancelSwitch();
          }}
        />
      )}

      <div className="layout">
        <Watchlist
          items={watchlist}
          active={symbol}
          onSelect={setSymbol}
          onAddSymbol={addSymbol}
          quotesLoading={quotesLoading}
          onVisibleSymbols={setVisibleWatchSymbols}
        />
        <main className="chart-area">
          <ChartToolbar
            interval={interval}
            onInterval={setInterval}
            options={chartOptions}
            onOptions={setChartOptions}
          />
          <ChartPriceActions
            price={effectivePrice}
            lines={priceLines}
            onAdd={addLine}
            onRemove={removeLine}
          />
          <MultiTimeframeRadar symbol={symbol} />
          <IndicatorPanel
            indicators={market.indicators}
            price={effectivePrice}
          />
          <div className="chart-stack">
            {showStale && (
              <span className="delayed-tag">延迟 · {chartViewSymbol}</span>
            )}
            <ChartLoadOverlay
              targetSymbol={symbol}
              interval={interval}
              loading={market.loading}
              error={market.loadError}
              visible={switchPending}
              suppressCenterError={showStale}
              onRetry={market.retry}
              onCancel={cancelSwitch}
            />
            {displayCandles.length > 0 && (
              <ChartErrorBoundary
                key={`err-${chartViewSymbol}-${interval}`}
                onRetry={market.retry}
              >
                <ChartWorkspace
                  ref={chartRef}
                  key={`${chartViewSymbol}-${interval}`}
                  symbol={chartViewSymbol}
                  candles={displayCandles}
                  signals={allSignals}
                  options={chartOptions}
                  priceLines={priceLines}
                  onAddPriceLine={(p) => addLine(p, "关键价位")}
                />
              </ChartErrorBoundary>
            )}
          </div>
        </main>
        <RightDock
          symbol={chartViewSymbol}
          price={effectivePrice}
          candles={displayCandles}
          signals={displaySignals}
          rules={rules}
          scope={signalScope}
          onScopeChange={setSignalScope}
          onOpenSettings={() => setSettingsOpen(true)}
          onPickSignal={(sig) => {
            if (sig.symbol !== symbol) setSymbol(sig.symbol);
            const t = sig.bar_time;
            if (t != null) {
              window.setTimeout(() => chartRef.current?.scrollToBar(t), 80);
            }
          }}
        />
      </div>

      {diagnoseOpen && (
        <AiDiagnoseModal
          symbol={symbol}
          interval={interval}
          onClose={() => setDiagnoseOpen(false)}
        />
      )}

      <AlertSettings
        open={settingsOpen}
        rules={rules}
        onChange={setRules}
        onClose={() => setSettingsOpen(false)}
      />

    </div>
  );
}