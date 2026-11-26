import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AlertSignal, Candle } from "../types/market";
import type {
  ChartDisplayOptions,
  ChartLayoutMode,
  TimeInterval,
} from "../types/chart";
import { INTERVALS } from "../types/chart";
import type { PriceLineDef } from "../hooks/usePriceLines";
import type { PriceColors } from "../utils/priceColors";
import type { PaperTrade } from "../hooks/usePaperTrades";
import type { JournalEntry } from "../hooks/useTradingJournal";
import { usePaneKlines } from "../hooks/usePaneKlines";
import { snapCrosshairTime } from "../utils/crosshairSync";
import type { SeriesMarker, Time } from "lightweight-charts";
import {
  ChartWorkspace,
  type ChartWorkspaceHandle,
} from "./ChartWorkspace";
import { ChartPaneState } from "./ChartPaneState";

interface Props {
  layout: ChartLayoutMode;
  symbol: string;
  primaryInterval: TimeInterval;
  primaryCandles: Candle[];
  signals: AlertSignal[];
  options: ChartDisplayOptions;
  priceLines: PriceLineDef[];
  priceColors: PriceColors;
  paperTrades: PaperTrade[];
  journalEntries?: JournalEntry[];
  openEntry: number | null;
  livePrice: number;
  onAddPriceLine: (price: number) => void;
  patternMarkers?: SeriesMarker<Time>[];
  autoPriceLines?: { price: number; title: string; color?: string }[];
  activePane: number;
  onActivePaneChange: (idx: number) => void;
  dualIv: TimeInterval;
  onDualIvChange: (iv: TimeInterval) => void;
  quadIvs: TimeInterval[];
  onQuadIvChange: (idx: number, iv: TimeInterval) => void;
  /** 主行情切换失败时，子格不再显示无限「加载中」 */
  marketBlocked?: boolean;
  marketBlockReason?: string | null;
  onMarketRetry?: () => void;
  /** 顶栏全局错误条已展示时，子格仅文案、不显示重试 */
  globalErrorBanner?: boolean;
  /** 与顶栏「重新加载」联动，重拉各辅助周期 */
  paneReloadToken?: number;
  /** 主图展示的是缓存/延迟数据（全局异常时边框变警告色） */
  primaryStale?: boolean;
  noviceMode?: boolean;
}

export const ChartPaneGrid = forwardRef<ChartWorkspaceHandle, Props>(function ChartPaneGrid({
  layout,
  symbol,
  primaryInterval,
  primaryCandles,
  signals,
  options,
  priceLines,
  priceColors,
  paperTrades,
  journalEntries = [],
  openEntry,
  livePrice,
  onAddPriceLine,
  patternMarkers = [],
  autoPriceLines = [],
  activePane,
  onActivePaneChange,
  dualIv,
  onDualIvChange,
  quadIvs,
  onQuadIvChange,
  marketBlocked = false,
  marketBlockReason = null,
  onMarketRetry,
  globalErrorBanner = false,
  paneReloadToken = 0,
  primaryStale = false,
  noviceMode = false,
}, ref) {
  const globalMarketFault =
    Boolean(marketBlockReason) && (marketBlocked || globalErrorBanner);
  const suppressPaneRetry = globalMarketFault;
  const [ivPickerFor, setIvPickerFor] = useState<number | null>(null);

  const intervals = useMemo(() => {
    if (layout === "single") return [primaryInterval];
    if (layout === "dual") return [primaryInterval, dualIv];
    return quadIvs;
  }, [layout, primaryInterval, dualIv, quadIvs]);

  const multivPane = layout !== "single";
  const hideSubChart = multivPane || noviceMode;

  const paneOptions = useMemo(
    () =>
      noviceMode
        ? {
            ...options,
            showEma: false,
            showBoll: false,
            showVolumeProfile: false,
            showVolume: true,
            intradayAvg: false,
          }
        : options,
    [options, noviceMode]
  );

  const pane1 = usePaneKlines(
    symbol,
    intervals[1] ?? primaryInterval,
    multivPane && intervals.length > 1
  );
  const pane2 = usePaneKlines(
    symbol,
    intervals[2] ?? "1h",
    layout === "quad"
  );
  const pane3 = usePaneKlines(
    symbol,
    intervals[3] ?? "1d",
    layout === "quad"
  );

  useEffect(() => {
    if (paneReloadToken < 1) return;
    if (!multivPane) return;
    pane1.retry();
    if (layout === "quad") {
      pane2.retry();
      pane3.retry();
    }
  }, [paneReloadToken, multivPane, layout, pane1.retry, pane2.retry, pane3.retry]);

  const extraCandles = [primaryCandles, pane1.candles, pane2.candles, pane3.candles];

  const [sync, setSync] = useState<{ time: number; from: string } | null>(null);
  const primaryRef = useRef<ChartWorkspaceHandle>(null);
  useImperativeHandle(ref, () => ({
    scrollToBar: (time: number) => primaryRef.current?.scrollToBar(time),
  }));

  const onCrosshair = useCallback((time: number | null, paneId: string) => {
    if (time == null) setSync(null);
    else setSync({ time, from: paneId });
  }, []);

  const gridClass =
    layout === "quad"
      ? "chart-pane-grid is-quad"
      : layout === "dual"
        ? "chart-pane-grid is-dual"
        : "chart-pane-grid is-single";

  const positionTitle = useMemo(() => {
    if (openEntry == null || livePrice <= 0) return "";
    const pnl = livePrice - openEntry;
    const pct = (pnl / openEntry) * 100;
    const sign = pnl >= 0 ? "+" : "";
    return `持仓 ${openEntry.toFixed(2)} · ${sign}${pnl.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  }, [openEntry, livePrice]);

  const pickIv = (idx: number, iv: TimeInterval) => {
    if (layout === "quad") onQuadIvChange(idx, iv);
    else onDualIvChange(iv);
    setIvPickerFor(null);
  };

  if (layout === "single") {
    return (
      <div className="chart-pane-grid is-single">
        {primaryCandles.length > 0 ? (
          <ChartWorkspace
            ref={primaryRef}
            symbol={symbol}
            candles={primaryCandles}
            signals={signals}
            options={paneOptions}
            priceLines={priceLines}
            priceColors={priceColors}
            onAddPriceLine={onAddPriceLine}
            paperTrades={paperTrades}
            journalEntries={journalEntries}
            positionCostLine={
              openEntry != null
                ? {
                    price: openEntry,
                    title: positionTitle || "持仓成本",
                  }
                : null
            }
            patternMarkers={patternMarkers}
            autoPriceLines={autoPriceLines}
            cacheDelayed={primaryStale}
          />
        ) : (
          <div className="chart-pane-empty muted">加载 K 线…</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={gridClass}
      onClick={() => setIvPickerFor(null)}
      onMouseLeave={() => setSync(null)}
    >
      {intervals.map((iv, idx) => {
        const paneId = `pane-${iv}-${idx}`;
        const candles = idx === 0 ? primaryCandles : extraCandles[idx] ?? [];
        const compact = true;
        const peerTime =
          sync && sync.from !== paneId
            ? snapCrosshairTime(sync.time, candles)
            : null;

        const labelIv =
          idx === 1 && layout === "dual" ? pane1.resolvedIv : iv;
        const paneLoaders = [null, pane1, pane2, pane3] as const;
        const paneApi = idx > 0 ? paneLoaders[idx] : null;
        const paneErr = paneApi?.error ?? null;
        const paneLoading = paneApi?.loading ?? false;
        const showTimeScale = layout === "quad" ? idx >= 2 : true;

        const canPickIv = layout === "quad" || (layout === "dual" && idx === 1);

        const hasData = candles.length > 0;
        const failDetail =
          marketBlockReason ??
          paneErr ??
          (marketBlocked ? "网络超时" : null);
        let showError =
          !hasData &&
          (marketBlocked ||
            Boolean(paneErr) ||
            (!paneLoading && !hasData && idx > 0 && paneApi != null));
        let showLoading =
          !hasData && !showError && (paneLoading || (idx === 0 && !hasData));

        /* 全局错误条展示时：子格不出现「加载中」，统一引导顶栏重新加载 */
        if (!hasData && globalErrorBanner && globalMarketFault) {
          showError = true;
          showLoading = false;
        }

        const paneDetail = globalMarketFault
          ? "数据源超时"
          : paneErr ?? failDetail ?? `暂无 ${labelIv} 数据`;

        const onRetryPane = () => {
          if (marketBlocked && onMarketRetry) {
            onMarketRetry();
            return;
          }
          paneApi?.retry();
        };

        return (
          <div
            className={`chart-pane${activePane === idx ? " is-active" : ""}${
              idx === 0 && primaryStale ? " is-stale-data" : ""
            }`}
            key={paneId}
            onClick={(e) => {
              e.stopPropagation();
              onActivePaneChange(idx);
            }}
          >
            <button
              type="button"
              className={`chart-pane-capsule${activePane === idx ? " is-active" : ""}${
                ivPickerFor === idx ? " is-open" : ""
              }`}
              title={canPickIv ? "切换本格周期" : `${symbol} · ${labelIv}`}
              onClick={(e) => {
                e.stopPropagation();
                if (canPickIv) {
                  setIvPickerFor((p) => (p === idx ? null : idx));
                } else {
                  onActivePaneChange(idx);
                }
              }}
            >
              {labelIv}
            </button>
            {ivPickerFor === idx && canPickIv && (
              <div
                className="chart-pane-iv-menu"
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                {INTERVALS.map((si) => (
                  <button
                    key={si}
                    type="button"
                    role="menuitem"
                    className={`chip tiny${labelIv === si ? " on" : ""}`}
                    onClick={() => pickIv(idx, si)}
                  >
                    {si}
                  </button>
                ))}
              </div>
            )}
            {hasData ? (
              <ChartWorkspace
                ref={idx === 0 ? primaryRef : undefined}
                symbol={symbol}
                candles={candles}
                signals={idx === 0 ? signals : []}
                options={paneOptions}
                priceLines={idx === 0 ? priceLines : []}
                priceColors={priceColors}
                onAddPriceLine={idx === 0 ? onAddPriceLine : undefined}
                compact={compact}
                hideSubChart={hideSubChart}
                showTimeScale={showTimeScale}
                paneId={paneId}
                peerCrosshairTime={peerTime}
                onCrosshairTime={onCrosshair}
                paperTrades={idx === 0 ? paperTrades : []}
                journalEntries={idx === 0 ? journalEntries : []}
                positionCostLine={
                  idx === 0 && openEntry != null
                    ? { price: openEntry, title: positionTitle || "持仓成本" }
                    : null
                }
                patternMarkers={idx === 0 ? patternMarkers : []}
                autoPriceLines={idx === 0 ? autoPriceLines : []}
                cacheDelayed={idx === 0 && primaryStale}
              />
            ) : showLoading ? (
              <ChartPaneState mode="loading" interval={labelIv} />
            ) : showError || !hasData ? (
              <ChartPaneState
                mode="error"
                interval={labelIv}
                detail={paneDetail}
                onRetry={suppressPaneRetry ? undefined : onRetryPane}
                suppressRetry={suppressPaneRetry}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
});