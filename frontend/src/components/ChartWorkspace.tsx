import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

const REF_LINE_STYLE = 2;
import type { PriceColors } from "../utils/priceColors";
import type { AlertSignal, Candle } from "../types/market";
import type { ChartDisplayOptions } from "../types/chart";
import type { PriceLineDef } from "../hooks/usePriceLines";
import type { PaperTrade } from "../hooks/usePaperTrades";
import type { JournalEntry } from "../hooks/useTradingJournal";
import { dedupeCandles, sanitizeMarkers } from "../utils/candles";
import { buildVolumeProfile } from "../utils/volumeProfile";
import { mergeRefLines, REF_LINE_COLORS } from "../utils/refLines";
import {
  computeBollinger,
  computeMacd,
  computeRsi,
  ema,
  emaCrossMarkers,
} from "../utils/indicators";

interface Props {
  symbol: string;
  candles: Candle[];
  signals: AlertSignal[];
  options: ChartDisplayOptions;
  priceLines?: PriceLineDef[];
  onAddPriceLine?: (price: number) => void;
  priceColors: PriceColors;
  compact?: boolean;
  /** 多图模式下隐藏 MACD/RSI 副图，主图占满高度 */
  hideSubChart?: boolean;
  /** 多图模式下主图底部时间轴（通常仅下排窗格开启） */
  showTimeScale?: boolean;
  paneId?: string;
  peerCrosshairTime?: number | null;
  onCrosshairTime?: (time: number | null, paneId: string) => void;
  paperTrades?: PaperTrade[];
  journalEntries?: JournalEntry[];
  positionCostLine?: { price: number; title: string } | null;
  patternMarkers?: SeriesMarker<Time>[];
  autoPriceLines?: { price: number; title: string; color?: string }[];
  /** 并入 OHLC 行：缓存/延迟提示（不占悬浮角标） */
  cacheDelayed?: boolean;
  /** 小白点图标记模式（单击主图添加价位线，无需 Alt） */
  priceMarkMode?: boolean;
}

export interface ChartWorkspaceHandle {
  scrollToBar: (time: number) => void;
}

interface LegendState {
  visible: boolean;
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  changePct?: number;
  ema20?: number;
  ema50?: number;
}

function legendFromBar(
  list: Candle[],
  idx: number,
  ema20: number[],
  ema50: number[]
): LegendState {
  const candle = list[idx];
  if (!candle) return { visible: false };
  const prevClose = idx > 0 ? list[idx - 1].close : candle.open;
  const changePct =
    prevClose > 0 ? ((candle.close - prevClose) / prevClose) * 100 : 0;
  return {
    visible: true,
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    changePct,
    ema20: idx >= 0 ? ema20[idx] : undefined,
    ema50: idx >= 0 ? ema50[idx] : undefined,
  };
}

function formatLegNum(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const AUX_LINE = {
  priceLineVisible: false,
  lastValueVisible: false,
} as const;

function sessionVwap(candles: Candle[]): number[] {
  let cumV = 0;
  let cumPv = 0;
  return candles.map((c) => {
    const v = c.volume > 0 ? c.volume : 1;
    const tp = (c.high + c.low + c.close) / 3;
    cumV += v;
    cumPv += tp * v;
    return cumV > 0 ? cumPv / cumV : c.close;
  });
}

function toLineData(
  candles: Candle[],
  values: number[]
): LineData<Time>[] {
  return candles
    .map((c, i) =>
      Number.isFinite(values[i])
        ? { time: c.time as Time, value: values[i] }
        : null
    )
    .filter(Boolean) as LineData<Time>[];
}

/** 从 flex 父级读取可用高度，避免用 shell 自身高度造成 ResizeObserver 正反馈撑高 */
function measureChartBudget(
  shell: HTMLElement | null,
  compact: boolean
): number {
  const minMain = compact ? 140 : 200;
  const fallback = compact ? 280 : 400;
  const hardCap = Math.floor(window.innerHeight * 0.58);
  if (!shell) return Math.min(fallback, hardCap);

  const area = shell.closest(".chart-area");
  const stack = shell.closest(".chart-stack");
  if (area instanceof HTMLElement && stack instanceof HTMLElement) {
    const areaRect = area.getBoundingClientRect();
    const stackTop = stack.getBoundingClientRect().top;
    const budget = areaRect.bottom - stackTop - 6;
    if (budget >= minMain) {
      return Math.min(Math.floor(budget), hardCap);
    }
  }

  const anchor =
    shell.closest(".chart-stack-body") ?? shell.closest(".chart-stack");
  if (anchor instanceof HTMLElement) {
    const h = anchor.getBoundingClientRect().height;
    if (h >= minMain && h < window.innerHeight * 0.85) {
      return Math.min(Math.floor(h), hardCap);
    }
  }
  return Math.min(fallback, hardCap);
}

export const ChartWorkspace = forwardRef<ChartWorkspaceHandle, Props>(
  function ChartWorkspace(
    {
      symbol,
      candles: rawCandles,
      signals,
      options,
      priceLines = [],
      onAddPriceLine,
      priceColors,
      compact = false,
      hideSubChart = false,
      showTimeScale = false,
      paneId,
      peerCrosshairTime,
      onCrosshairTime,
      paperTrades = [],
      journalEntries = [],
      positionCostLine = null,
      patternMarkers = [],
      autoPriceLines = [],
      cacheDelayed = false,
      priceMarkMode = false,
    },
    ref
  ) {
  const candles = useMemo(() => dedupeCandles(rawCandles), [rawCandles]);
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const mainChart = useRef<IChartApi | null>(null);
  const subChart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const avgSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUp = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMid = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLow = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLine = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignal = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHist = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const didFit = useRef(false);
  const [chartReady, setChartReady] = useState(false);
  const syncing = useRef(false);
  const [legend, setLegend] = useState<LegendState>({ visible: false });
  const [legendHover, setLegendHover] = useState(false);
  const candlesRef = useRef(candles);
  const ema20Ref = useRef<number[]>([]);
  const ema50Ref = useRef<number[]>([]);
  const macdHistRef = useRef<number[]>([]);
  const priceLineHandles = useRef<IPriceLine[]>([]);
  const altKey = useRef(false);
  const priceMarkModeRef = useRef(priceMarkMode);
  const lastResizeRef = useRef({ w: 0, mainH: 0, subH: 0 });
  const addLineRef = useRef(onAddPriceLine);
  const crosshairRef = useRef(onCrosshairTime);
  const paneIdRef = useRef(paneId);
  const [focusTime, setFocusTime] = useState<number | null>(null);
  addLineRef.current = onAddPriceLine;
  crosshairRef.current = onCrosshairTime;
  paneIdRef.current = paneId;
  priceMarkModeRef.current = priceMarkMode;

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const ema20 = useMemo(() => ema(closes, 20), [closes]);
  const ema50 = useMemo(() => ema(closes, 50), [closes]);
  candlesRef.current = candles;
  ema20Ref.current = ema20;
  ema50Ref.current = ema50;

  useEffect(() => {
    if (candles.length === 0) {
      setLegend({ visible: false });
      return;
    }
    if (!legendHover) {
      setLegend(legendFromBar(candles, candles.length - 1, ema20, ema50));
    }
  }, [candles, ema20, ema50, legendHover]);
  const boll = useMemo(() => computeBollinger(closes), [closes]);
  const macd = useMemo(() => computeMacd(closes), [closes]);
  macdHistRef.current = macd.hist;
  const rsi = useMemo(() => computeRsi(closes), [closes]);

  const volumeProfile = useMemo(
    () =>
      options.showVolumeProfile && candles.length > 0
        ? buildVolumeProfile(candles.slice(-120))
        : [],
    [candles, options.showVolumeProfile]
  );

  const paperMarkers = useMemo((): SeriesMarker<Time>[] => {
    const times = new Set(candles.map((c) => c.time));
    return paperTrades
      .filter((t) => t.symbol === symbol)
      .map((t) => {
        let bar = t.time;
        if (!times.has(bar)) {
          const nearest = candles.reduce((best, c) =>
            Math.abs(c.time - t.time) < Math.abs(best.time - t.time) ? c : best
          );
          bar = nearest?.time ?? t.time;
        }
        const buy = t.side === "buy";
        return {
          time: bar as Time,
          position: buy ? ("belowBar" as const) : ("aboveBar" as const),
          color: buy ? priceColors.up : priceColors.down,
          shape: buy ? ("arrowUp" as const) : ("arrowDown" as const),
          text: buy ? "B" : "S",
        };
      });
  }, [paperTrades, candles, symbol, priceColors]);

  const journalMarkers = useMemo((): SeriesMarker<Time>[] => {
    const times = new Set(candles.map((c) => c.time));
    return journalEntries
      .filter((e) => e.symbol === symbol)
      .map((e) => {
        const bar = Math.floor(e.ts / 1000);
        let t = bar;
        if (!times.has(t)) {
          const nearest = candles.reduce(
            (best, c) =>
              Math.abs(c.time - bar) < Math.abs(best.time - bar) ? c : best,
            candles[0]
          );
          t = nearest?.time ?? bar;
        }
        const tag = e.tags[0] ?? "";
        const open = tag.includes("开");
        const close = tag.includes("平");
        const watch = tag.includes("观察");
        return {
          time: t as Time,
          position: open
            ? ("belowBar" as const)
            : close
              ? ("aboveBar" as const)
              : ("inBar" as const),
          color: open ? "#f59e0b" : close ? "#94a3b8" : "#60a5fa",
          shape: "circle" as const,
          text: open ? "开" : close ? "平" : watch ? "观" : "笔",
        };
      });
  }, [journalEntries, candles, symbol]);

  const vwap = useMemo(
    () => (options.intradayAvg ? sessionVwap(candles) : []),
    [candles, options.intradayAvg]
  );

  const signalMarkers = useMemo((): SeriesMarker<Time>[] => {
    return signals
      .filter((s) => s.rule === "ema_golden_cross")
      .slice(0, 20)
      .map((s) => {
        const candle = candles.find((c) => c.time === s.bar_time);
        return {
          time: (candle?.time ?? Math.floor(s.ts / 1000)) as Time,
          position: "belowBar" as const,
          color: priceColors.up,
          shape: "arrowUp" as const,
          text: "",
        };
      });
  }, [signals, candles, priceColors.up]);

  useImperativeHandle(ref, () => ({
    scrollToBar: (time: number) => {
      const chart = mainChart.current;
      const list = candlesRef.current;
      if (!chart || list.length === 0) return;
      let idx = list.findIndex((c) => c.time === time);
      if (idx < 0) {
        idx = list.reduce((best, c, i) => {
          const d = Math.abs(c.time - time);
          return d < Math.abs(list[best].time - time) ? i : best;
        }, 0);
      }
      const span = 120;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, idx - Math.floor(span * 0.78)),
        to: Math.min(list.length, idx + Math.floor(span * 0.22)),
      });
      setFocusTime(time);
      window.setTimeout(() => setFocusTime(null), 2600);
    },
  }));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") altKey.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") altKey.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const resizeCharts = () => {
    const shell = shellRef.current;
    const parent = shell?.parentElement;
    const total = measureChartBudget(shell, compact);
    const hideSub = hideSubChart;
    const ratio = hideSub ? 1 : compact ? 0.82 : 0.74;
    let mainH = Math.max(
      compact ? 140 : 200,
      Math.floor(total * ratio)
    );
    let subH = hideSub
      ? 0
      : Math.max(compact ? 56 : 72, total - mainH);
    if (!hideSub && mainH + subH > total) {
      subH = Math.max(compact ? 56 : 72, total - mainH);
    }
    if (hideSub) {
      mainH = Math.min(mainH, total);
    }
    const w =
      shell?.clientWidth ||
      parent?.clientWidth ||
      Math.floor(window.innerWidth * 0.45);
    const prev = lastResizeRef.current;
    if (
      Math.abs(w - prev.w) < 2 &&
      Math.abs(mainH - prev.mainH) < 2 &&
      Math.abs(subH - prev.subH) < 2
    ) {
      return;
    }
    lastResizeRef.current = { w, mainH, subH };
    if (mainRef.current) mainRef.current.style.height = `${mainH}px`;
    if (subRef.current) {
      subRef.current.style.height = hideSub ? "0px" : `${subH}px`;
      subRef.current.style.display = hideSub ? "none" : "block";
    }
    mainChart.current?.applyOptions({ width: w, height: mainH });
    if (!hideSub) {
      subChart.current?.applyOptions({ width: w, height: subH });
    }
  };

  useEffect(() => {
    if (!mainRef.current || !subRef.current) return;

    const baseOpts = {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e14" },
        textColor: "#8b949e",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: !compact },
        horzLine: { labelVisible: !compact },
      },
      timeScale: { borderColor: "#1e293b" },
      rightPriceScale: { borderColor: "#1e293b" },
    };

    const main = createChart(mainRef.current, {
      ...baseOpts,
      height: 320,
      timeScale: { visible: false, borderColor: "#1e293b" },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
    });
    const sub = createChart(subRef.current, {
      ...baseOpts,
      height: 96,
      timeScale: {
        visible: true,
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candles_s = main.addCandlestickSeries({
      upColor: priceColors.up,
      downColor: priceColors.down,
      borderVisible: false,
      wickUpColor: priceColors.up,
      wickDownColor: priceColors.down,
      priceLineVisible: !compact,
      lastValueVisible: !compact,
    });

    const vol = main.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    main.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });

    ema20Series.current = main.addLineSeries({
      color: "#f0883e",
      lineWidth: 3,
      ...AUX_LINE,
    });
    ema50Series.current = main.addLineSeries({
      color: "#a371f7",
      lineWidth: 3,
      ...AUX_LINE,
    });
    avgSeries.current = main.addLineSeries({
      color: "#facc15",
      lineWidth: 2,
      lineStyle: 0,
      ...AUX_LINE,
    });
    bbUp.current = main.addLineSeries({
      color: "rgba(88,166,255,0.6)",
      lineWidth: 1,
      ...AUX_LINE,
    });
    bbMid.current = main.addLineSeries({
      color: "rgba(139,148,158,0.7)",
      lineWidth: 1,
      ...AUX_LINE,
    });
    bbLow.current = main.addLineSeries({
      color: "rgba(88,166,255,0.6)",
      lineWidth: 1,
      ...AUX_LINE,
    });

    macdLine.current = sub.addLineSeries({
      color: "#58a6ff",
      lineWidth: 1,
      ...AUX_LINE,
    });
    macdSignal.current = sub.addLineSeries({
      color: "#f0883e",
      lineWidth: 1,
      ...AUX_LINE,
    });
    macdHist.current = sub.addHistogramSeries({
      color: "#26a69a",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    rsiSeries.current = sub.addLineSeries({
      color: "#d2a8ff",
      lineWidth: 2,
      ...AUX_LINE,
    });

    mainChart.current = main;
    subChart.current = sub;
    candleSeries.current = candles_s;
    volSeries.current = vol;

    const sync = (source: IChartApi, target: IChartApi) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing.current || !range) return;
        syncing.current = true;
        target.timeScale().setVisibleLogicalRange(range);
        syncing.current = false;
      });
    };
    sync(main, sub);
    sync(sub, main);

    const syncCrosshair = (param: {
      time?: Time;
      seriesData: Map<unknown, unknown>;
    }) => {
      if (!param.time || !param.seriesData.size) {
        setLegendHover(false);
        const list = candlesRef.current;
        if (list.length > 0) {
          setLegend(
            legendFromBar(
              list,
              list.length - 1,
              ema20Ref.current,
              ema50Ref.current
            )
          );
        }
        sub.clearCrosshairPosition();
        return;
      }
      const candle = param.seriesData.get(candles_s) as CandlestickData | undefined;
      if (!candle) return;
      const list = candlesRef.current;
      const idx = list.findIndex((c) => c.time === param.time);
      setLegendHover(true);
      setLegend(
        legendFromBar(list, idx >= 0 ? idx : list.length - 1, ema20Ref.current, ema50Ref.current)
      );

      if (idx >= 0 && macdHist.current && param.time) {
        const y = macdHistRef.current[idx] ?? 0;
        sub.setCrosshairPosition(y, param.time, macdHist.current);
      }

      if (!syncing.current && paneIdRef.current && crosshairRef.current && param.time) {
        crosshairRef.current(param.time as number, paneIdRef.current);
      }
    };

    main.subscribeCrosshairMove(syncCrosshair);

    sub.subscribeCrosshairMove((param) => {
      try {
        if (!param.time) {
          main.clearCrosshairPosition();
          setLegendHover(false);
          const list = candlesRef.current;
          if (list.length > 0) {
            setLegend(
              legendFromBar(
                list,
                list.length - 1,
                ema20Ref.current,
                ema50Ref.current
              )
            );
          }
          return;
        }
        const candle = candlesRef.current.find((c) => c.time === param.time);
        if (candle) {
          main.setCrosshairPosition(candle.close, param.time, candles_s);
        }
      } catch {
        /* chart may be mid-update */
      }
    });

    const resizeTarget =
      shellRef.current?.closest(".chart-stack-body") ??
      shellRef.current?.closest(".chart-stack") ??
      shellRef.current;
    const ro = new ResizeObserver(() => resizeCharts());
    if (resizeTarget) ro.observe(resizeTarget);
    main.subscribeClick((param) => {
      if (
        (!altKey.current && !priceMarkModeRef.current) ||
        !param.point ||
        !candles_s
      ) {
        return;
      }
      const p = candles_s.coordinateToPrice(param.point.y);
      if (p != null) addLineRef.current?.(p as number);
    });

    resizeCharts();
    setChartReady(true);
    requestAnimationFrame(() => resizeCharts());

    return () => {
      ro.disconnect();
      main.remove();
      sub.remove();
      mainChart.current = null;
      subChart.current = null;
      didFit.current = false;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (
      peerCrosshairTime == null ||
      !mainChart.current ||
      !candleSeries.current
    ) {
      return;
    }
    const candle = candlesRef.current.find((c) => c.time === peerCrosshairTime);
    const time = peerCrosshairTime as Time;
    if (!candle) return;
    syncing.current = true;
    try {
      mainChart.current.setCrosshairPosition(candle.close, time, candleSeries.current);
    } catch {
      /* ignore */
    }
    syncing.current = false;
  }, [peerCrosshairTime]);

  useEffect(() => {
    if (!chartReady) return;
    requestAnimationFrame(() => resizeCharts());
  }, [chartReady, candles.length, compact, hideSubChart]);

  useEffect(() => {
    if (!chartReady) return;
    const onWin = () => requestAnimationFrame(() => resizeCharts());
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, [chartReady]);

  useEffect(() => {
    if (!chartReady || !candleSeries.current) return;
    candleSeries.current.applyOptions({
      priceLineVisible: !compact,
      lastValueVisible: !compact,
    });
    mainChart.current?.applyOptions({
      crosshair: {
        vertLine: { labelVisible: !compact },
        horzLine: { labelVisible: !compact },
      },
    });
  }, [compact, chartReady]);

  useEffect(() => {
    if (!chartReady || !mainChart.current) return;
    if (!hideSubChart) return;
    mainChart.current.timeScale().applyOptions({
      visible: showTimeScale,
      timeVisible: showTimeScale,
      secondsVisible: false,
      borderColor: "#1e293b",
    });
  }, [chartReady, hideSubChart, showTimeScale]);

  useEffect(() => {
    if (!candleSeries.current) return;
    candleSeries.current.applyOptions({
      upColor: priceColors.up,
      downColor: priceColors.down,
      wickUpColor: priceColors.up,
      wickDownColor: priceColors.down,
    });
  }, [priceColors]);

  useEffect(() => {
    didFit.current = false;
  }, [symbol]);

  useEffect(() => {
    if (!chartReady || !candleSeries.current || candles.length === 0) return;

    const ohlc: CandlestickData[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    try {
      candleSeries.current.setData(ohlc);
    } catch (err) {
      console.error("chart setData failed", err);
      return;
    }

    const times = new Set(candles.map((c) => c.time));
    const histMarkers = emaCrossMarkers(candles, priceColors);
    const focusMarkers: SeriesMarker<Time>[] =
      focusTime != null && times.has(focusTime)
        ? [
            {
              time: focusTime as Time,
              position: "aboveBar",
              color: "#58a6ff",
              shape: "circle",
              text: "信号",
            },
          ]
        : [];
    const merged = sanitizeMarkers(
      [
        ...histMarkers,
        ...signalMarkers,
        ...paperMarkers,
        ...journalMarkers,
        ...patternMarkers,
        ...focusMarkers,
      ].slice(-60),
      times
    );
    try {
      candleSeries.current.setMarkers(merged);
    } catch (err) {
      console.warn("setMarkers skipped", err);
    }

    if (volSeries.current) {
      if (options.showVolume) {
        volSeries.current.setData(
          candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color:
              c.close >= c.open
                ? hexAlpha(priceColors.up, 0.45)
                : hexAlpha(priceColors.down, 0.45),
          })) as HistogramData<Time>[]
        );
        volSeries.current.applyOptions({ visible: true });
      } else {
        volSeries.current.applyOptions({ visible: false });
      }
    }

    ema20Series.current?.applyOptions({ visible: options.showEma });
    ema50Series.current?.applyOptions({ visible: options.showEma });
    if (options.showEma) {
      ema20Series.current?.setData(toLineData(candles, ema20));
      ema50Series.current?.setData(toLineData(candles, ema50));
    } else {
      ema20Series.current?.setData([]);
      ema50Series.current?.setData([]);
    }

    const showAvg = options.intradayAvg && vwap.length > 0;
    avgSeries.current?.applyOptions({ visible: showAvg });
    if (showAvg) {
      avgSeries.current?.setData(toLineData(candles, vwap));
    } else {
      avgSeries.current?.setData([]);
    }

    const showBoll = options.showBoll;
    bbUp.current?.applyOptions({ visible: showBoll });
    bbMid.current?.applyOptions({ visible: showBoll });
    bbLow.current?.applyOptions({ visible: showBoll });
    if (showBoll) {
      bbUp.current?.setData(toLineData(candles, boll.upper));
      bbMid.current?.setData(toLineData(candles, boll.middle));
      bbLow.current?.setData(toLineData(candles, boll.lower));
    } else {
      bbUp.current?.setData([]);
      bbMid.current?.setData([]);
      bbLow.current?.setData([]);
    }

    const subOn = !hideSubChart;
    const showMacd = subOn && options.subChart === "macd";
    const showRsi = subOn && options.subChart === "rsi";

    macdLine.current?.applyOptions({ visible: showMacd });
    macdSignal.current?.applyOptions({ visible: showMacd });
    macdHist.current?.applyOptions({ visible: showMacd });
    rsiSeries.current?.applyOptions({ visible: showRsi });

    if (showMacd) {
      macdLine.current?.setData(toLineData(candles, macd.macd));
      macdSignal.current?.setData(toLineData(candles, macd.signal));
      macdHist.current?.setData(
        candles.map((c, i) => ({
          time: c.time as Time,
          value: macd.hist[i],
          color: macd.hist[i] >= 0 ? priceColors.up : priceColors.down,
        }))
      );
    } else {
      rsiSeries.current?.setData(toLineData(candles, rsi));
    }

    const chart = mainChart.current;
    if (!chart) return;
    if (!didFit.current && candles.length >= 20) {
      chart.timeScale().fitContent();
      didFit.current = true;
    } else if (candles.length > 0) {
      chart.timeScale().scrollToRealTime();
    }
  }, [
    chartReady,
    candles,
    options,
    ema20,
    ema50,
    boll,
    macd,
    rsi,
    signalMarkers,
    focusTime,
    paperMarkers,
    journalMarkers,
    vwap,
    patternMarkers,
    priceColors,
    hideSubChart,
  ]);

  useEffect(() => {
    const series = candleSeries.current;
    if (!series || !chartReady) return;
    for (const h of priceLineHandles.current) {
      series.removePriceLine(h);
    }

    const inputs = [
      ...autoPriceLines.map((line) => ({
        price: line.price,
        title: line.title.replace(/\s[\d.]+$/, "").trim() || line.title,
        color:
          line.color ??
          (line.title.includes("止损") || line.title.includes("止跌")
            ? REF_LINE_COLORS.stop
            : line.title.includes("止盈") || line.title.includes("遇压")
              ? REF_LINE_COLORS.take
              : line.title.startsWith("阻")
                ? REF_LINE_COLORS.resistance
                : REF_LINE_COLORS.support),
        priority: 30,
      })),
      ...priceLines.map((line) => ({
        price: line.price,
        title:
          line.label.includes("止损")
            ? "止损"
            : line.label.includes("止盈")
              ? "止盈"
              : line.label.includes("现价")
                ? "现价"
                : "关键位",
        color: line.label.includes("止损")
          ? REF_LINE_COLORS.stop
          : line.label.includes("止盈")
            ? REF_LINE_COLORS.take
            : REF_LINE_COLORS.manual,
        priority: 15,
      })),
      ...(positionCostLine
        ? [
            {
              price: positionCostLine.price,
              title: "持仓",
              color: REF_LINE_COLORS.position,
              priority: 25,
            },
          ]
        : []),
    ];

    const merged = mergeRefLines(candlesRef.current, inputs);
    const built = merged.map((line) =>
      series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: REF_LINE_STYLE,
        axisLabelVisible: !compact,
        title: line.title,
      })
    );
    priceLineHandles.current = built;
  }, [priceLines, positionCostLine, autoPriceLines, chartReady, symbol, compact]);

  const leg = legend.visible && legend.close != null ? legend : null;

  return (
    <div
      className={`chart-workspace${compact ? " is-compact" : ""}${
        hideSubChart ? " no-subchart" : ""
      }${priceMarkMode ? " chart-mark-price" : ""}`}
      ref={shellRef}
      onMouseLeave={() => {
        setLegendHover(false);
        mainChart.current?.clearCrosshairPosition();
        const list = candlesRef.current;
        if (list.length > 0) {
          setLegend(
            legendFromBar(
              list,
              list.length - 1,
              ema20Ref.current,
              ema50Ref.current
            )
          );
        }
      }}
    >
      {leg && (
        <div
          className={`chart-legend chart-legend-compact${
            compact ? " is-dense" : ""
          }${legendHover ? " is-crosshair" : ""}`}
          aria-live="polite"
        >
          <div className="legend-ohlc tabular">
            {cacheDelayed && (
              <span
                className="legend-cache-warn"
                title="当前展示缓存或延迟数据，非实时行情"
              >
                {compact ? "⚠" : "⚠ 延迟"}
              </span>
            )}
            {!compact && (
              <>
                <span className="leg-field">
                  <span className="leg-k">O</span>
                  <span className="leg-v leg-neutral">
                    {formatLegNum(leg.open)}
                  </span>
                </span>
                <span className="leg-field">
                  <span className="leg-k">H</span>
                  <span className="leg-v leg-high">
                    {formatLegNum(leg.high)}
                  </span>
                </span>
                <span className="leg-field">
                  <span className="leg-k">L</span>
                  <span className="leg-v leg-low">{formatLegNum(leg.low)}</span>
                </span>
              </>
            )}
            <span className="leg-field leg-field-close">
              {!compact && <span className="leg-k">C</span>}
              <span
                className={`leg-v leg-close${
                  compact ? " leg-close-only" : ""
                } ${
                  leg.close != null && leg.open != null && leg.close >= leg.open
                    ? "leg-up"
                    : "leg-down"
                }`}
              >
                {formatLegNum(leg.close)}
              </span>
              <span
                className={`leg-pct ${
                  (leg.changePct ?? 0) >= 0 ? "leg-up" : "leg-down"
                }`}
              >
                ({(leg.changePct ?? 0) >= 0 ? "+" : ""}
                {(leg.changePct ?? 0).toFixed(2)}%)
              </span>
            </span>
          </div>
          {options.showEma && (
            <>
              {!compact && <span className="legend-vrule" aria-hidden />}
              <span
                className={`legend-ema tabular${
                  compact ? " legend-ema--dots-only" : ""
                }`}
              >
                <span
                  className="leg-field"
                  title={`EMA20 ${formatLegNum(leg.ema20)}`}
                >
                  <span className="leg-dot leg-dot-ema20" aria-hidden />
                  {!compact && (
                    <span className="leg-v leg-neutral">
                      {formatLegNum(leg.ema20)}
                    </span>
                  )}
                </span>
                <span
                  className="leg-field"
                  title={`EMA50 ${formatLegNum(leg.ema50)}`}
                >
                  <span className="leg-dot leg-dot-ema50" aria-hidden />
                  {!compact && (
                    <span className="leg-v leg-neutral">
                      {formatLegNum(leg.ema50)}
                    </span>
                  )}
                </span>
              </span>
            </>
          )}
        </div>
      )}
      <div className="chart-main-wrap">
        <div className="chart-main" ref={mainRef} />
        {volumeProfile.length > 0 && (
          <div className="volume-profile" aria-hidden>
            {volumeProfile.map((bin, i) => (
              <span
                key={i}
                className="volume-profile-bar"
                style={{ flexGrow: bin.volume }}
                title={bin.price.toFixed(2)}
              />
            ))}
          </div>
        )}
      </div>
      <div
        className={`chart-sub-wrap${hideSubChart ? " is-hidden" : ""}`}
        aria-hidden={hideSubChart}
      >
        <div className="chart-sub" ref={subRef} />
        {!hideSubChart && options.subChart === "macd" && candles.length > 0 && (
          <div className="sub-ind-legend sub-ind-legend-macd" aria-hidden>
            <span className="sub-leg-item">
              <span className="sub-leg-dot macd-line" />
              MACD{" "}
              <strong>
                {macd.macd[macd.macd.length - 1]?.toFixed(3) ?? "—"}
              </strong>
            </span>
            <span className="sub-leg-item">
              <span className="sub-leg-dot macd-sig" />
              Sig{" "}
              <strong>
                {macd.signal[macd.signal.length - 1]?.toFixed(3) ?? "—"}
              </strong>
            </span>
          </div>
        )}
        {!hideSubChart && options.subChart === "rsi" && candles.length > 0 && (
          <div className="sub-ind-legend" aria-hidden>
            RSI {rsi[rsi.length - 1]?.toFixed(2) ?? "—"}
          </div>
        )}
      </div>
    </div>
  );
});