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
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { AlertSignal, Candle } from "../types/market";
import type { ChartDisplayOptions } from "../types/chart";
import { dedupeCandles, sanitizeMarkers } from "../utils/candles";
import {
  computeBollinger,
  computeMacd,
  computeRsi,
  ema,
  emaCrossMarkers,
} from "../utils/indicators";

interface Props {
  candles: Candle[];
  signals: AlertSignal[];
  options: ChartDisplayOptions;
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

const AUX_LINE = {
  priceLineVisible: false,
  lastValueVisible: false,
} as const;

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

export const ChartWorkspace = forwardRef<ChartWorkspaceHandle, Props>(
  function ChartWorkspace({ candles: rawCandles, signals, options }, ref) {
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
  const bbUp = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMid = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLow = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLine = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignal = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHist = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const didFit = useRef(false);
  const syncing = useRef(false);
  const [legend, setLegend] = useState<LegendState>({ visible: false });
  const [legendHover, setLegendHover] = useState(false);
  const candlesRef = useRef(candles);
  const ema20Ref = useRef<number[]>([]);
  const ema50Ref = useRef<number[]>([]);
  const macdHistRef = useRef<number[]>([]);

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const ema20 = useMemo(() => ema(closes, 20), [closes]);
  const ema50 = useMemo(() => ema(closes, 50), [closes]);
  candlesRef.current = candles;
  ema20Ref.current = ema20;
  ema50Ref.current = ema50;
  const boll = useMemo(() => computeBollinger(closes), [closes]);
  const macd = useMemo(() => computeMacd(closes), [closes]);
  macdHistRef.current = macd.hist;
  const rsi = useMemo(() => computeRsi(closes), [closes]);

  const latestLegend = useMemo((): LegendState => {
    if (candles.length === 0) return { visible: false };
    const idx = candles.length - 1;
    const c = candles[idx];
    const prevClose = idx > 0 ? candles[idx - 1].close : c.open;
    const changePct = ((c.close - prevClose) / prevClose) * 100;
    return {
      visible: true,
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      changePct,
      ema20: ema20[idx],
      ema50: ema50[idx],
    };
  }, [candles, ema20, ema50]);

  const signalMarkers = useMemo((): SeriesMarker<Time>[] => {
    return signals
      .filter((s) => s.rule === "ema_golden_cross")
      .slice(0, 20)
      .map((s) => {
        const candle = candles.find((c) => c.time === s.bar_time);
        return {
          time: (candle?.time ?? Math.floor(s.ts / 1000)) as Time,
          position: "belowBar" as const,
          color: "#3fb950",
          shape: "arrowUp" as const,
          text: "金叉",
        };
      });
  }, [signals, candles]);

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
    },
  }));

  const resizeCharts = () => {
    const total = shellRef.current?.clientHeight ?? 480;
    const mainH = Math.max(200, Math.floor(total * 0.74));
    const subH = Math.max(72, total - mainH);
    const w = shellRef.current?.clientWidth ?? 0;
    if (mainRef.current) mainRef.current.style.height = `${mainH}px`;
    if (subRef.current) subRef.current.style.height = `${subH}px`;
    mainChart.current?.applyOptions({ width: w, height: mainH });
    subChart.current?.applyOptions({ width: w, height: subH });
  };

  useEffect(() => {
    if (!mainRef.current || !subRef.current) return;

    const baseOpts = {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1117" },
        textColor: "#8b949e",
      },
      grid: {
        vertLines: { color: "#21262d" },
        horzLines: { color: "#21262d" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: "#30363d" },
      rightPriceScale: { borderColor: "#30363d" },
    };

    const main = createChart(mainRef.current, {
      ...baseOpts,
      height: 320,
      timeScale: { visible: false, borderColor: "#30363d" },
      rightPriceScale: {
        borderColor: "#30363d",
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
    });
    const sub = createChart(subRef.current, {
      ...baseOpts,
      height: 96,
      timeScale: { visible: true, borderColor: "#30363d" },
    });

    const candles_s = main.addCandlestickSeries({
      upColor: "#3fb950",
      downColor: "#f85149",
      borderVisible: false,
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
      priceLineVisible: true,
      lastValueVisible: true,
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
        sub.clearCrosshairPosition();
        return;
      }
      const candle = param.seriesData.get(candles_s) as CandlestickData | undefined;
      if (!candle) return;
      const list = candlesRef.current;
      const idx = list.findIndex((c) => c.time === param.time);
      const prevClose = idx > 0 ? list[idx - 1].close : candle.open;
      const changePct = ((candle.close - prevClose) / prevClose) * 100;
      setLegendHover(true);
      setLegend({
        visible: true,
        time: param.time as number,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        changePct,
        ema20: idx >= 0 ? ema20Ref.current[idx] : undefined,
        ema50: idx >= 0 ? ema50Ref.current[idx] : undefined,
      });

      if (idx >= 0 && macdHist.current && param.time) {
        const y = macdHistRef.current[idx] ?? 0;
        sub.setCrosshairPosition(y, param.time, macdHist.current);
      }
    };

    main.subscribeCrosshairMove(syncCrosshair);

    sub.subscribeCrosshairMove((param) => {
      try {
        if (!param.time) {
          main.clearCrosshairPosition();
          setLegendHover(false);
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

    const ro = new ResizeObserver(() => resizeCharts());
    if (shellRef.current) ro.observe(shellRef.current);
    resizeCharts();

    return () => {
      ro.disconnect();
      main.remove();
      sub.remove();
      mainChart.current = null;
      subChart.current = null;
      didFit.current = false;
    };
  }, []);

  useEffect(() => {
    if (!candleSeries.current || candles.length === 0) return;

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
    const histMarkers = emaCrossMarkers(candles);
    const merged = sanitizeMarkers(
      [...histMarkers, ...signalMarkers].slice(-50),
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
                ? "rgba(63,185,80,0.45)"
                : "rgba(248,81,73,0.45)",
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
    }

    const showBoll = options.showBoll;
    bbUp.current?.applyOptions({ visible: showBoll });
    bbMid.current?.applyOptions({ visible: showBoll });
    bbLow.current?.applyOptions({ visible: showBoll });
    if (showBoll) {
      bbUp.current?.setData(toLineData(candles, boll.upper));
      bbMid.current?.setData(toLineData(candles, boll.middle));
      bbLow.current?.setData(toLineData(candles, boll.lower));
    }

    macdLine.current?.applyOptions({
      visible: options.subChart === "macd",
    });
    macdSignal.current?.applyOptions({
      visible: options.subChart === "macd",
    });
    macdHist.current?.applyOptions({
      visible: options.subChart === "macd",
    });
    rsiSeries.current?.applyOptions({
      visible: options.subChart === "rsi",
    });

    if (options.subChart === "macd") {
      macdLine.current?.setData(toLineData(candles, macd.macd));
      macdSignal.current?.setData(toLineData(candles, macd.signal));
      macdHist.current?.setData(
        candles.map((c, i) => ({
          time: c.time as Time,
          value: macd.hist[i],
          color: macd.hist[i] >= 0 ? "#3fb950" : "#f85149",
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
  }, [candles, options, ema20, ema50, boll, macd, rsi, signalMarkers]);

  const leg = legendHover && legend.close != null ? legend : latestLegend;

  return (
    <div className="chart-workspace" ref={shellRef}>
      {leg.visible && leg.close != null && (
        <div className="chart-legend">
          <span>O {leg.open?.toFixed(2)}</span>
          <span>H {leg.high?.toFixed(2)}</span>
          <span>L {leg.low?.toFixed(2)}</span>
          <span>C {leg.close.toFixed(2)}</span>
          <span className={(leg.changePct ?? 0) >= 0 ? "leg-up" : "leg-down"}>
            {(leg.changePct ?? 0) >= 0 ? "+" : ""}
            {(leg.changePct ?? 0).toFixed(2)}%
          </span>
          {options.showEma && (
            <>
              <span className="leg-ema20">
                EMA20 {leg.ema20?.toFixed(2) ?? "—"}
              </span>
              <span className="leg-ema50">
                EMA50 {leg.ema50?.toFixed(2) ?? "—"}
              </span>
            </>
          )}
        </div>
      )}
      <div className="chart-main" ref={mainRef} />
      <div className="chart-sub" ref={subRef} />
    </div>
  );
});