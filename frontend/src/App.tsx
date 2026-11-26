import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AlertSettings } from "./components/AlertSettings";
import { ChartErrorBoundary } from "./components/ChartErrorBoundary";
import { ChartLoadOverlay } from "./components/ChartLoadOverlay";
import { TopStatusBar } from "./components/TopStatusBar";
import { ChartToolbar } from "./components/ChartToolbar";
import { ChartPaneGrid } from "./components/ChartPaneGrid";
import type { ChartWorkspaceHandle } from "./components/ChartWorkspace";
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
  type ChartLayoutMode,
  type TimeInterval,
} from "./types/chart";
import type { AlertSignal, Candle, WatchlistItem } from "./types/market";
import { usePersistedWatchlist } from "./hooks/usePersistedWatchlist";
import { usePriceLines } from "./hooks/usePriceLines";
import { usePriceColorScheme } from "./hooks/usePriceColorScheme";
import { usePaperTrades } from "./hooks/usePaperTrades";
import {
  defaultDualSecondary,
  QUAD_INTERVALS_DEFAULT,
  resolveToolbarInterval,
} from "./utils/chartLayout";
import { useNoviceAssist } from "./hooks/useNoviceAssist";
import { useWatchlistEmaSignals } from "./hooks/useWatchlistEmaSignals";
import { MarketBriefBanner } from "./components/MarketBriefBanner";
import { DEFAULT_SYMBOL } from "./config/market";
import {
  INDEX_WIND_SYMBOLS,
  PINNED_A_SHARE_SYMBOLS,
} from "./config/pinnedWatchlist";
import { backfillEmaSignals } from "./utils/signalHistory";
import { MiniTicker } from "./components/MiniTicker";
import { useFundamentals } from "./hooks/useFundamentals";
import { bootstrapUserDataSync } from "./utils/userDataSync";
import { isTauri, nativeNotify } from "./utils/nativeBridge";
import {
  findKeyLevels,
  keyLevelDistances,
  scanPatternMarkers,
} from "./utils/chartPatterns";

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

const MINI_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("mode") === "mini";

export default function App() {
  const [symbol, setSymbol] = useState(() => {
    if (MINI_MODE) {
      try {
        return localStorage.getItem("quantlens.lastSymbol") || DEFAULT_SYMBOL;
      } catch {
        return DEFAULT_SYMBOL;
      }
    }
    return DEFAULT_SYMBOL;
  });
  const [interval, setInterval] = useState<TimeInterval>("1m");
  const [chartOptions, setChartOptions] =
    useState<ChartDisplayOptions>(DEFAULT_CHART_OPTIONS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [chartLayout, setChartLayout] = useState<ChartLayoutMode>("single");
  const prevChartLayout = useRef<ChartLayoutMode>("single");
  const [screenerSymbols, setScreenerSymbols] = useState<string[] | null>(
    null
  );
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  useEffect(() => {
    if (chartLayout === "quad" && prevChartLayout.current !== "quad") {
      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    }
    prevChartLayout.current = chartLayout;
  }, [chartLayout]);

  const [multiActivePane, setMultiActivePane] = useState(0);
  const [dualPaneIv, setDualPaneIv] = useState<TimeInterval>("15m");
  const [quadPaneIvs, setQuadPaneIvs] = useState<TimeInterval[]>([
    ...QUAD_INTERVALS_DEFAULT,
  ]);

  useEffect(() => {
    setMultiActivePane(0);
    setDualPaneIv(defaultDualSecondary(interval));
    setQuadPaneIvs(() => {
      const next = [...QUAD_INTERVALS_DEFAULT];
      next[0] = interval;
      return next;
    });
  }, [symbol]);

  useEffect(() => {
    setMultiActivePane(0);
  }, [chartLayout]);

  useEffect(() => {
    setQuadPaneIvs((prev) => {
      const next = [...prev];
      next[0] = interval;
      return next;
    });
  }, [interval]);

  const toolbarInterval = useMemo(
    () =>
      resolveToolbarInterval(
        chartLayout,
        multiActivePane,
        interval,
        dualPaneIv,
        quadPaneIvs
      ),
    [chartLayout, multiActivePane, interval, dualPaneIv, quadPaneIvs]
  );

  const applyChartInterval = useCallback(
    (iv: TimeInterval) => {
      if (chartLayout === "single") {
        setInterval(iv);
        return;
      }
      if (chartLayout === "dual") {
        if (multiActivePane === 1) setDualPaneIv(iv);
        else setInterval(iv);
        return;
      }
      setQuadPaneIvs((prev) => {
        const next = [...prev];
        next[multiActivePane] = iv;
        return next;
      });
      if (multiActivePane === 0) setInterval(iv);
    },
    [chartLayout, multiActivePane]
  );

  const onQuadIvChange = useCallback((idx: number, iv: TimeInterval) => {
    setQuadPaneIvs((prev) => {
      const next = [...prev];
      next[idx] = iv;
      return next;
    });
    if (idx === 0) setInterval(iv);
  }, []);

  const [signalScope, setSignalScope] = useState<SignalScope>("current");
  const [watchlistSignals, setWatchlistSignals] = useState<AlertSignal[]>([]);
  const { rules, setRules } = useAlertRules();
  const { mode: priceColorMode, setMode: setPriceColorMode, colors: priceColors } =
    usePriceColorScheme(symbol);
  const { noviceMode, toggleNovice } = useNoviceAssist();
  const { items: watchlistSeed, addSymbol, symbolList } = usePersistedWatchlist();
  const { lines: priceLines, addLine, removeLine } = usePriceLines(symbol);
  const { trades: paperTrades, openPosition, buy: paperBuy, sell: paperSell } =
    usePaperTrades(symbol);
  const pushedSignals = useRef(new Set<string>());
  const priceLineHits = useRef(new Set<string>());

  const [visibleWatchSymbols, setVisibleWatchSymbols] = useState<string[]>([]);

  const market = useMarketWebSocket(symbol, interval);
  const quoteSymbols = useMemo(() => {
    const visible =
      visibleWatchSymbols.length > 0
        ? visibleWatchSymbols
        : symbolList.slice(0, 15);
    const merged = new Set([
      symbol,
      ...INDEX_WIND_SYMBOLS,
      ...PINNED_A_SHARE_SYMBOLS,
      ...visible,
    ]);
    return [...merged];
  }, [visibleWatchSymbols, symbolList, symbol]);

  const quotes = useWatchlistQuotes(quoteSymbols, symbol, market.price);
  const { fundamentals, flow: capitalFlow, loading: fundamentalsLoading } =
    useFundamentals(symbol, !MINI_MODE);
  const prevLiveCount = useRef(0);

  useEffect(() => {
    void bootstrapUserDataSync();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("quantlens.lastSymbol", symbol);
    } catch {
      /* ignore */
    }
  }, [symbol]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen<string>("navigate-symbol", (e) => {
        if (e.payload) setSymbol(e.payload);
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }, []);
  const chartRef = useRef<ChartWorkspaceHandle>(null);
  const chartCache = useRef(
    new Map<string, { candles: Candle[]; price: number }>()
  );
  const lastReadySymbol = useRef(DEFAULT_SYMBOL);
  const [showBanner, setShowBanner] = useState(false);

  const chartReady = market.candles.length > 0;
  const sameSymbolCache =
    symbol === lastReadySymbol.current
      ? chartCache.current.get(cacheKey(symbol, interval))
      : undefined;
  const displayCandles = chartReady
    ? market.candles
    : sameSymbolCache?.candles ?? [];
  const chartViewSymbol = chartReady ? symbol : symbol;
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
    const hist = backfillEmaSignals(chartViewSymbol, displayCandles, 12);
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
  }, [market.signals, symbolList]);

  const watchlistScopeSymbols = useMemo(() => {
    const merged = new Set<string>([
      symbol,
      ...PINNED_A_SHARE_SYMBOLS,
      ...symbolList.slice(0, 12),
    ]);
    return [...merged];
  }, [symbol, symbolList]);

  const watchlistBackfill = useWatchlistEmaSignals(
    watchlistScopeSymbols,
    interval,
    signalScope === "watchlist"
  );

  const displaySignals = useMemo(() => {
    if (signalScope === "watchlist") {
      const allow = new Set(watchlistScopeSymbols);
      const live = market.signals.filter((s) => allow.has(s.symbol));
      const seen = new Set<string>();
      const merged: AlertSignal[] = [];
      for (const s of [...live, ...watchlistSignals, ...watchlistBackfill]) {
        if (!allow.has(s.symbol)) continue;
        const key = `${s.symbol}-${s.rule}-${s.bar_time ?? s.ts}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(s);
      }
      return merged.sort((a, b) => b.ts - a.ts).slice(0, 100);
    }
    return allSignals.filter((s) => s.symbol === symbol);
  }, [
    signalScope,
    allSignals,
    watchlistSignals,
    watchlistBackfill,
    watchlistScopeSymbols,
    market.signals,
    symbol,
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
    for (const s of market.signals) {
      if (pushedSignals.current.has(s.id)) continue;
      pushedSignals.current.add(s.id);
      if (rules.webhookEnabled && rules.webhookUrl.trim()) {
        void relayWebhook(
          rules.webhookUrl.trim(),
          `${s.symbol} ${s.rule}`,
          `${s.message} @${s.price.toFixed(4)}`
        );
      }
      if (rules.soundEnabled) {
        void nativeNotify(
          `${s.symbol} ${s.rule}`,
          `${s.message} @${s.price.toFixed(2)}`,
          s.symbol
        );
      }
    }
  }, [market.signals, rules.webhookEnabled, rules.webhookUrl]);

  const quotePx = quotes[symbol]?.price ?? 0;
  const effectivePrice = chartReady
    ? market.price > 0
      ? market.price
      : quotePx
    : 0;

  const patternMarkers = useMemo(
    () => scanPatternMarkers(displayCandles),
    [displayCandles]
  );

  const autoPriceLines = useMemo(() => {
    const levels = findKeyLevels(displayCandles);
    const dist = keyLevelDistances(
      displayCandles,
      effectivePrice,
      levels
    );
    const lines: { price: number; title: string; color?: string }[] = [];
    if (dist.resistance) {
      lines.push({
        price: dist.resistance.price,
        title: "阻力",
        color: "#F59E0B",
      });
    }
    if (dist.support) {
      lines.push({
        price: dist.support.price,
        title: "支撑",
        color: "#3B82F6",
      });
    }
    return lines;
  }, [displayCandles, effectivePrice]);

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

  const watchlistDisplay = useMemo(() => {
    if (!screenerSymbols) return watchlist;
    const allow = new Set(screenerSymbols);
    return watchlist.filter((item) => allow.has(item.symbol));
  }, [watchlist, screenerSymbols]);

  const activeName =
    watchlistSeed.find((i) => i.symbol === symbol)?.name ?? symbol;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "f" || e.key === "F") {
        const both = leftPanelOpen && rightPanelOpen;
        setLeftPanelOpen(!both);
        setRightPanelOpen(!both);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 6) {
        applyChartInterval(INTERVALS[n - 1]);
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
  }, [symbol, symbolList, leftPanelOpen, rightPanelOpen, applyChartInterval]);

  const shellStyle = {
    "--color-price-up": priceColors.up,
    "--color-price-down": priceColors.down,
  } as CSSProperties;

  const changePct = quotes[symbol]?.changePct ?? null;

  if (MINI_MODE) {
    return (
      <MiniTicker
        symbol={symbol}
        symbolName={activeName}
        price={effectivePrice}
        changePct={changePct}
        candles={displayCandles}
      />
    );
  }

  return (
    <div className="app-shell" style={shellStyle}>
      <TopStatusBar
        symbol={symbol}
        symbolName={activeName}
        interval={toolbarInterval}
        loadError={market.loadError}
        loading={market.loading}
        chartReady={chartReady}
        switchPending={switchPending}
        connectionMeta={market.connectionMeta}
        onReconnect={market.retry}
        onDiagnose={() => setDiagnoseOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        effectivePrice={effectivePrice}
        displayCandles={displayCandles}
        quotes={quotes}
        chartLayout={chartLayout}
        onChartLayout={setChartLayout}
        noviceMode={noviceMode}
        onToggleNovice={toggleNovice}
        fundamentals={fundamentals}
        capitalFlow={capitalFlow}
        fundamentalsLoading={fundamentalsLoading}
      />

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

      <div
        className={`layout${leftPanelOpen ? "" : " collapsed-left"}${rightPanelOpen ? "" : " collapsed-right"}`}
      >
        <aside className="panel-shell panel-shell-left">
          {!leftPanelOpen && (
            <button
              type="button"
              className="panel-fold panel-fold-left panel-fold-collapsed"
              title="展开自选"
              onClick={() => setLeftPanelOpen(true)}
            >
              ▸
            </button>
          )}
          {leftPanelOpen && (
            <Watchlist
              items={watchlistDisplay}
              poolItems={watchlist}
              active={symbol}
              onSelect={setSymbol}
              onAddSymbol={addSymbol}
              quotesLoading={quotesLoading}
              onVisibleSymbols={setVisibleWatchSymbols}
              priceColors={priceColors}
              quotes={quotes}
              screenerActive={screenerSymbols != null}
              onScreenerResult={setScreenerSymbols}
              onCollapsePanel={() => setLeftPanelOpen(false)}
            />
          )}
        </aside>
        <main className="chart-area">
          <ChartToolbar
            interval={toolbarInterval}
            onInterval={applyChartInterval}
            options={chartOptions}
            onOptions={setChartOptions}
            price={effectivePrice}
            lines={priceLines}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            noviceMode={noviceMode}
          />
          {noviceMode && displayCandles.length > 0 && (
            <MarketBriefBanner candles={displayCandles} />
          )}
          {chartLayout === "single" && (
            <MultiTimeframeRadar symbol={symbol} />
          )}
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
                key={`err-${chartViewSymbol}-${interval}-${chartLayout}`}
                onRetry={market.retry}
              >
                <div className="chart-stack-body">
                <ChartPaneGrid
                  ref={chartRef}
                  layout={chartLayout}
                  symbol={chartViewSymbol}
                  primaryInterval={interval}
                  primaryCandles={displayCandles}
                  signals={allSignals}
                  options={chartOptions}
                  priceLines={priceLines}
                  priceColors={priceColors}
                  paperTrades={paperTrades}
                  openEntry={openPosition?.entry ?? null}
                  livePrice={effectivePrice}
                  onAddPriceLine={(p) => addLine(p, "关键价位")}
                  patternMarkers={patternMarkers}
                  autoPriceLines={autoPriceLines}
                  activePane={multiActivePane}
                  onActivePaneChange={setMultiActivePane}
                  dualIv={dualPaneIv}
                  onDualIvChange={setDualPaneIv}
                  quadIvs={quadPaneIvs}
                  onQuadIvChange={onQuadIvChange}
                />
                </div>
              </ChartErrorBoundary>
            )}
          </div>
        </main>
        <aside className="panel-shell panel-shell-right">
          {!rightPanelOpen && (
            <button
              type="button"
              className="panel-fold panel-fold-right panel-fold-collapsed"
              title="展开侧栏"
              onClick={() => setRightPanelOpen(true)}
            >
              ◂
            </button>
          )}
          {rightPanelOpen && (
            <RightDock
              symbol={chartViewSymbol}
              price={effectivePrice}
              supportPrice={
                autoPriceLines.find((l) => l.title === "支撑")?.price ?? null
              }
              candles={displayCandles}
              signals={displaySignals}
              rules={rules}
              scope={signalScope}
              onScopeChange={setSignalScope}
              onCollapsePanel={() => setRightPanelOpen(false)}
              paperOpen={openPosition}
              paperTrades={paperTrades}
              onPaperBuy={(qty) => paperBuy(effectivePrice, qty)}
              onPaperSell={(qty) => paperSell(effectivePrice, qty)}
              chartInterval={interval}
              watchlistSymbols={symbolList}
              onPickSignal={(sig) => {
                if (sig.symbol !== symbol) setSymbol(sig.symbol);
                const t = sig.bar_time;
                if (t != null) {
                  window.setTimeout(() => chartRef.current?.scrollToBar(t), 80);
                }
              }}
            />
          )}
        </aside>
      </div>

      {diagnoseOpen && (
        <AiDiagnoseModal
          symbol={symbol}
          interval={interval}
          candles={displayCandles}
          price={effectivePrice}
          onClose={() => setDiagnoseOpen(false)}
          onDrawLevels={(support, resistance) => {
            if (support != null) addLine(support, "支撑");
            if (resistance != null) addLine(resistance, "阻力");
            setDiagnoseOpen(false);
          }}
        />
      )}

      <AlertSettings
        open={settingsOpen}
        rules={rules}
        onChange={setRules}
        onClose={() => setSettingsOpen(false)}
        priceColorMode={priceColorMode}
        onPriceColorMode={setPriceColorMode}
      />

    </div>
  );
}