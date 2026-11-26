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
import { SidebarBrandStrip } from "./components/SidebarBrandStrip";
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
import { loadAllPaperTrades, usePaperTrades } from "./hooks/usePaperTrades";
import { useTradingJournal } from "./hooks/useTradingJournal";
import { buildDailyReviewMarkdown } from "./utils/dailyReview";
import {
  defaultDualSecondary,
  QUAD_INTERVALS_DEFAULT,
  resolveToolbarInterval,
} from "./utils/chartLayout";
import { useNoviceAssist } from "./hooks/useNoviceAssist";
import { useWatchlistEmaSignals } from "./hooks/useWatchlistEmaSignals";
import { MarketBriefBanner } from "./components/MarketBriefBanner";
import { NoviceOnboardingTour } from "./components/NoviceOnboardingTour";
import { plainPriceLineTitle } from "./utils/noviceCopy";
import { DEFAULT_SYMBOL } from "./config/market";
import { resolveAShareDisplayName } from "./config/aShareDisplayNames";
import {
  INDEX_WIND_SYMBOLS,
  PINNED_A_SHARE_SYMBOLS,
} from "./config/pinnedWatchlist";
import { backfillEmaSignals } from "./utils/signalHistory";
import { MiniTicker } from "./components/MiniTicker";
import { MarketPulseBar } from "./components/MarketPulseBar";
import { ClipboardSymbolToast } from "./components/ClipboardSymbolToast";
import { SectorPeersModal } from "./components/SectorPeersModal";
import { SignalsDetachedShell } from "./components/SignalsDetachedShell";
import { useFundamentals } from "./hooks/useFundamentals";
import { bootstrapUserDataSync } from "./utils/userDataSync";
import {
  isTauri,
  nativeNotify,
  updateTrayQuotes,
} from "./utils/nativeBridge";
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

const URL_MODE =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;

const MINI_MODE = URL_MODE === "mini";
const SIGNALS_MODE = URL_MODE === "signals";

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
      setChartOptions((o) => ({
        ...o,
        intradayAvg: iv === "1m" ? o.intradayAvg : false,
      }));
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

  const intradayMode =
    interval === "1m" && chartOptions.intradayAvg && chartLayout === "single";

  const setIntradayMode = useCallback((on: boolean) => {
    if (on) {
      setInterval("1m");
      setChartOptions((o) => ({ ...o, intradayAvg: true }));
    } else {
      setChartOptions((o) => ({ ...o, intradayAvg: false }));
    }
  }, []);

  const openSectorPeers = useCallback(async (industry: string) => {
    setSectorIndustry(industry);
    setSectorOpen(true);
    setSectorLoading(true);
    try {
      const res = await fetch(
        `${API}/sector/peers?industry=${encodeURIComponent(industry)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          peers?: typeof sectorPeers;
        };
        setSectorPeers(data.peers ?? []);
      } else {
        setSectorPeers([]);
      }
    } catch {
      setSectorPeers([]);
    } finally {
      setSectorLoading(false);
    }
  }, []);

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
  const {
    noviceMode,
    toggleNovice,
    onboardingDone,
    completeOnboarding,
  } = useNoviceAssist();
  const proChartSnapshot = useRef<ChartDisplayOptions | null>(null);
  const proLayoutSnapshot = useRef<ChartLayoutMode | null>(null);
  const [noviceTourPaper, setNoviceTourPaper] = useState(false);
  const showNoviceTour = noviceMode && !onboardingDone;

  const applyChartLayout = useCallback(
    (mode: ChartLayoutMode) => {
      if (noviceMode && mode !== "single") return;
      setChartLayout(mode);
    },
    [noviceMode]
  );

  const { items: watchlistSeed, addSymbol, symbolList } = usePersistedWatchlist();
  const {
    lines: priceLines,
    addLine,
    removeLine,
    toggleLineAlert,
  } = usePriceLines(symbol);
  const { entries: journalEntries, addEntry: addJournalEntry } =
    useTradingJournal();
  const { trades: paperTrades, openPosition, buy: paperBuy, sell: paperSell } =
    usePaperTrades(symbol);
  const [camouflage, setCamouflage] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorIndustry, setSectorIndustry] = useState("");
  const [sectorPeers, setSectorPeers] = useState<
    { symbol: string; name: string; change_pct: number; price: number }[]
  >([]);
  const [sectorLoading, setSectorLoading] = useState(false);
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

  useEffect(() => {
    if (!isTauri()) return;
    const lines = symbolList.slice(0, 5).map((sym) => {
      const q = quotes[sym];
      const px =
        q?.price != null && q.price > 0 ? q.price.toFixed(2) : "—";
      const pct =
        q?.changePct != null
          ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`
          : "";
      return `${sym} ${px} ${pct}`.trim();
    });
    const tip = ["QuantLens", ...lines].join("\n");
    void updateTrayQuotes(tip);
  }, [quotes, symbolList]);
  const { fundamentals, flow: capitalFlow, loading: fundamentalsLoading } =
    useFundamentals(symbol, !MINI_MODE);
  const prevLiveCount = useRef(0);

  useEffect(() => {
    void bootstrapUserDataSync();
  }, []);

  useEffect(() => {
    if (noviceMode) {
      if (!proChartSnapshot.current) {
        proChartSnapshot.current = chartOptions;
      }
      setChartOptions((o) => ({
        ...o,
        showEma: false,
        showBoll: false,
        showVolumeProfile: false,
        showVolume: true,
        intradayAvg: false,
      }));
      if (chartLayout !== "single" && proLayoutSnapshot.current == null) {
        proLayoutSnapshot.current = chartLayout;
      }
      setChartLayout("single");
      setLeftPanelOpen(true);
      setRightPanelOpen(true);
      return;
    }
    if (proChartSnapshot.current) {
      setChartOptions(proChartSnapshot.current);
      proChartSnapshot.current = null;
    }
    if (proLayoutSnapshot.current) {
      setChartLayout(proLayoutSnapshot.current);
      proLayoutSnapshot.current = null;
    }
  }, [noviceMode]);

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
  const [paneReloadToken, setPaneReloadToken] = useState(0);

  const marketMatches = market.symbol === symbol;
  const chartReady = marketMatches && market.candles.length > 0;
  const prevSymbolCache = chartCache.current.get(
    cacheKey(lastReadySymbol.current, interval)
  );
  const sameSymbolCache =
    symbol === lastReadySymbol.current
      ? chartCache.current.get(cacheKey(symbol, interval))
      : undefined;
  const displayCandles = chartReady
    ? market.candles
    : sameSymbolCache?.candles ?? prevSymbolCache?.candles ?? [];
  const chartViewSymbol = symbol;
  const switchPending =
    !chartReady &&
    (market.loading ||
      Boolean(market.loadError) ||
      !marketMatches);
  const showStale = switchPending && displayCandles.length > 0;
  const showLoadOverlay =
    switchPending &&
    !showStale &&
    (market.loading || (Boolean(market.loadError) && !market.loading));
  useEffect(() => {
    if (market.candles.length > 0) {
      chartCache.current.set(cacheKey(symbol, interval), {
        candles: market.candles,
        price: market.price,
      });
      lastReadySymbol.current = symbol;
      if (!market.loadError) setShowBanner(false);
    }
  }, [market.candles, market.price, symbol, interval, market.loadError]);

  useEffect(() => {
    if (market.loadError && !chartReady) setShowBanner(true);
  }, [market.loadError, chartReady, symbol]);

  const cancelSwitch = () => {
    setShowBanner(false);
    const revertTo = lastReadySymbol.current;
    if (symbol !== revertTo) setSymbol(revertTo);
  };

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
      if (rules.desktopNotifyEnabled) {
        void nativeNotify(
          `${s.symbol} ${s.rule}`,
          `${s.message} @${s.price.toFixed(2)}`,
          s.symbol
        );
      }
      if (rules.paperAutoOnSignal && s.symbol === symbol && !openPosition) {
        const px = s.price > 0 ? s.price : market.price;
        const bullish = /金叉|超卖|下轨|上穿/i.test(`${s.rule} ${s.message}`);
        if (bullish && px > 0) paperBuy(px, 100);
      }
    }
  }, [
    market.signals,
    market.price,
    rules.webhookEnabled,
    rules.webhookUrl,
    rules.desktopNotifyEnabled,
    rules.paperAutoOnSignal,
    symbol,
    openPosition,
    paperBuy,
  ]);

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
        title: noviceMode ? plainPriceLineTitle("阻力") : "阻力",
        color: "#F59E0B",
      });
    }
    if (dist.support) {
      lines.push({
        price: dist.support.price,
        title: noviceMode ? plainPriceLineTitle("支撑") : "支撑",
        color: "#3B82F6",
      });
    }
    return lines;
  }, [displayCandles, effectivePrice, noviceMode]);

  useEffect(() => {
    const px = effectivePrice;
    if (px <= 0) return;
    for (const line of priceLines) {
      if (line.alert === false) continue;
      const tol = Math.max(line.price * 0.0008, 0.0001);
      if (Math.abs(px - line.price) > tol) continue;
      const key = `${line.id}-${Math.floor(Date.now() / 60_000)}`;
      if (priceLineHits.current.has(key)) continue;
      priceLineHits.current.add(key);
      const msg = `${symbol} 触及 ${line.label} @${line.price.toFixed(2)}`;
      if (rules.soundEnabled) playBeep();
      if (rules.desktopNotifyEnabled) {
        void nativeNotify("画线提醒", msg, symbol);
      }
      if (rules.webhookEnabled && rules.webhookUrl.trim()) {
        void relayWebhook(rules.webhookUrl.trim(), "画线提醒", msg);
      }
    }
  }, [
    effectivePrice,
    priceLines,
    rules.soundEnabled,
    rules.desktopNotifyEnabled,
    rules.webhookEnabled,
    rules.webhookUrl,
    symbol,
  ]);

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

  const runDailyReview = useCallback(() => {
    const md = buildDailyReviewMarkdown({
      watchlist,
      quotes,
      signals: displaySignals,
      paperBySymbol: loadAllPaperTrades(),
      symbol,
    });
    addJournalEntry({
      symbol,
      interval,
      price: effectivePrice,
      note: md,
      tags: ["日复盘"],
    });
  }, [
    watchlist,
    quotes,
    displaySignals,
    symbol,
    interval,
    effectivePrice,
    addJournalEntry,
  ]);

  const watchlistDisplay = useMemo(() => {
    if (!screenerSymbols) return watchlist;
    const allow = new Set(screenerSymbols);
    return watchlist.filter((item) => allow.has(item.symbol));
  }, [watchlist, screenerSymbols]);
  const activeName = useMemo(() => {
    const wl = watchlistSeed.find((i) => i.symbol === symbol)?.name;
    return resolveAShareDisplayName(symbol, wl, fundamentals?.name);
  }, [symbol, watchlistSeed, fundamentals?.name]);
    watchlistSeed.find((i) => i.symbol === symbol)?.name ?? symbol;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setCamouflage((c) => !c);
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

  if (SIGNALS_MODE) {
    return <SignalsDetachedShell />;
  }

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
    <div
      className={`app-shell${leftPanelOpen ? "" : " collapsed-left"}${
        rightPanelOpen ? "" : " collapsed-right"
      }${camouflage ? " app-shell--camouflage" : ""}`}
      style={shellStyle}
    >
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
        onChartLayout={applyChartLayout}
        noviceMode={noviceMode}
        onToggleNovice={toggleNovice}
        fundamentals={fundamentals}
        capitalFlow={capitalFlow}
        fundamentalsLoading={fundamentalsLoading}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        onIndustryClick={openSectorPeers}
      />
      <MarketPulseBar />

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
            <>
            <SidebarBrandStrip
              onCollapsePanel={() => setLeftPanelOpen(false)}
            />
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
            />
            </>
          )}
        </aside>
        <main className="chart-area">
          {showBanner && market.loadError && (
            <ErrorBanner
              title="行情拉取超时，请检查网络或稍后重试"
              onRetry={() => {
                market.retry();
                setPaneReloadToken((t) => t + 1);
              }}
              onDismiss={() => {
                setShowBanner(false);
                cancelSwitch();
              }}
            />
          )}
          <ChartToolbar
            interval={toolbarInterval}
            onInterval={applyChartInterval}
            options={chartOptions}
            onOptions={setChartOptions}
            price={effectivePrice}
            lines={priceLines}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onToggleLineAlert={toggleLineAlert}
            intradayMode={intradayMode}
            onIntraday={setIntradayMode}
            noviceMode={noviceMode}
            chartLayout={chartLayout}
          />
          {noviceMode && displayCandles.length > 0 && (
            <MarketBriefBanner
              candles={displayCandles}
              noviceMode
              capitalFlow={capitalFlow}
            />
          )}
          {chartLayout === "single" && !noviceMode && (
            <MultiTimeframeRadar
              symbol={symbol}
              onPickInterval={applyChartInterval}
            />
          )}
          <div className="chart-stack">
            <ChartLoadOverlay
              targetSymbol={symbol}
              interval={interval}
              loading={market.loading}
              error={market.loadError}
              visible={showLoadOverlay}
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
                  journalEntries={journalEntries}
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
                  marketBlocked={Boolean(market.loadError) && !chartReady}
                  marketBlockReason={market.loadError}
                  onMarketRetry={market.retry}
                  globalErrorBanner={showBanner && Boolean(market.loadError)}
                  paneReloadToken={paneReloadToken}
                  primaryStale={
                    showStale ||
                    (showBanner &&
                      Boolean(market.loadError) &&
                      displayCandles.length > 0)
                  }
                  noviceMode={noviceMode}
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
                autoPriceLines.find((l) => l.color === "#3B82F6")?.price ??
                null
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
              onTradeClick={(t) => {
                window.setTimeout(() => chartRef.current?.scrollToBar(t), 80);
              }}
              onDailyReview={runDailyReview}
              noviceMode={noviceMode}
              noviceTourPaper={noviceTourPaper}
              onNoviceTourPaperSeen={() => setNoviceTourPaper(false)}
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
        noviceMode={noviceMode}
      />

      <ClipboardSymbolToast
        onOpen={(code) => {
          addSymbol(code, resolveAShareDisplayName(code));
          setSymbol(code);
        }}
      />

      <SectorPeersModal
        open={sectorOpen}
        industry={sectorIndustry}
        loading={sectorLoading}
        peers={sectorPeers}
        onClose={() => setSectorOpen(false)}
        onPick={(sym) => {
          const peer = sectorPeers.find((p) => p.symbol === sym);
          addSymbol(sym, peer?.name ?? resolveAShareDisplayName(sym));
          setSymbol(sym);
          setSectorOpen(false);
        }}
      />

      <NoviceOnboardingTour
        active={showNoviceTour}
        onDone={completeOnboarding}
        onReachPaper={() => {
          setRightPanelOpen(true);
          setNoviceTourPaper(true);
        }}
      />

      {camouflage && (
        <div className="camouflage-screen" aria-hidden>
          <div className="camouflage-doc">
            <h1>季度经营数据汇总</h1>
            <table className="camouflage-sheet">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>营业收入</td>
                  <td>1,284.2</td>
                  <td>1,356.8</td>
                  <td>1,402.1</td>
                </tr>
                <tr>
                  <td>毛利率</td>
                  <td>32.1%</td>
                  <td>31.8%</td>
                  <td>32.4%</td>
                </tr>
                <tr>
                  <td>费用率</td>
                  <td>18.6%</td>
                  <td>18.2%</td>
                  <td>17.9%</td>
                </tr>
              </tbody>
            </table>
            <p className="muted">Alt+B 恢复看盘界面</p>
          </div>
        </div>
      )}
    </div>
  );
}