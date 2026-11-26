import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { Candle } from "../types/market";
import type { TimeInterval } from "../types/chart";
import { formatProfitLossRatio } from "../utils/backtest";
import {
  BACKTEST_STRATEGIES,
  DEFAULT_BACKTEST_PARAMS,
  runBacktest,
  type BacktestParams,
  type BacktestStrategyId,
} from "../utils/backtestEngine";
import { fetchKlinesResilient } from "../utils/marketApi";
import { BacktestDarkMenu } from "./BacktestDarkMenu";

const RANK_OPTIONS = [
  { value: "return" as const, label: "按累计收益" },
  { value: "winRate" as const, label: "按胜率" },
];

type TradePnlSort = "default" | "desc" | "asc";

const CURVE_H = 70;
const CURVE_W = 280;
const TRADES_COLLAPSED = 4;

interface Props {
  symbol: string;
  candles: Candle[];
  watchlistSymbols: string[];
  chartInterval: TimeInterval;
  onTradeClick?: (barTime: number) => void;
}

const BAR_MINUTES: Record<TimeInterval, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

function formatHoldDuration(bars: number, interval: TimeInterval): string {
  const mins = bars * BAR_MINUTES[interval];
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) {
    const h = mins / 60;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  const d = mins / 1440;
  return d >= 10 ? `${Math.round(d)}天` : `${d.toFixed(1)}天`;
}

function formatEntryTime(t: number): string {
  const d = new Date(t * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

function formatFullTime(t: number): string {
  const d = new Date(t * 1000);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function miniCurvePaths(
  strategy: number[],
  benchmark: number[],
  width: number,
  height: number
): { strategy: string; benchmark: string; area: string } | null {
  const n = Math.min(strategy.length, benchmark.length);
  if (n < 2) return null;
  const baseS = strategy[0] || 1;
  const baseB = benchmark[0] || 1;
  const ns = strategy.map((v) => (v / baseS) * 100);
  const nb = benchmark.map((v) => (v / baseB) * 100);
  const all = [...ns, ...nb];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  const toPath = (arr: number[]) =>
    arr
      .slice(0, n)
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  const strat = toPath(ns);
  const xLast = x(n - 1);
  const x0 = x(0);
  const area = `${strat} L${xLast.toFixed(1)},${height} L${x0.toFixed(1)},${height} Z`;
  return { strategy: strat, benchmark: toPath(nb), area };
}

interface LeaderRow {
  symbol: string;
  returnPct: number;
  winRate: number | null;
  trades: number;
}

interface TradeRow {
  buyTime: number;
  sellTime: number | null;
  buyPrice: number;
  sellPrice: number | null;
  holdBars: number | null;
  returnPct: number | null;
}

type PanelView = "detail" | "leaderboard";

function ParamControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const rangeStyle = {
    "--range-pct": `${((value - min) / Math.max(1, max - min)) * 100}%`,
  } as CSSProperties;
  return (
    <div className="backtest-param">
      <div className="backtest-param-top">
        <span className="backtest-param-label">{label}</span>
        <div className="backtest-stepper">
          <button
            type="button"
            className="backtest-stepper-btn"
            aria-label={`${label} 减一`}
            onClick={() => onChange(clamp(value - 1))}
          >
            −
          </button>
          <span className="backtest-stepper-val tabular">{value}</span>
          <button
            type="button"
            className="backtest-stepper-btn"
            aria-label={`${label} 加一`}
            onClick={() => onChange(clamp(value + 1))}
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        className="backtest-range"
        min={min}
        max={max}
        value={value}
        style={rangeStyle}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
    </div>
  );
}

export function BacktestPanel({
  symbol,
  candles,
  watchlistSymbols,
  chartInterval,
  onTradeClick,
}: Props) {
  const [strategy, setStrategy] = useState<BacktestStrategyId>("ema_cross");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_BACKTEST_PARAMS);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [rankBy, setRankBy] = useState<"return" | "winRate">("return");
  const [panelView, setPanelView] = useState<PanelView>("detail");
  const [tradesExpanded, setTradesExpanded] = useState(false);
  const [hoverTradeTime, setHoverTradeTime] = useState<number | null>(null);
  const [pnlSort, setPnlSort] = useState<TradePnlSort>("default");

  const stats = useMemo(
    () => runBacktest(candles, strategy, params),
    [candles, strategy, params]
  );

  const paths = useMemo(() => {
    if (!stats) return null;
    return miniCurvePaths(stats.equityCurve, stats.benchmarkCurve, CURVE_W, CURVE_H);
  }, [stats]);

  const tradeRows = useMemo((): TradeRow[] => {
    if (!stats) return [];
    const rows: TradeRow[] = [];
    let openBuy: { time: number; price: number } | null = null;
    for (const e of stats.tradeLog) {
      if (e.kind === "buy") {
        if (!openBuy) openBuy = { time: e.time, price: e.price };
      } else if (e.kind === "sell" && openBuy) {
        rows.push({
          buyTime: openBuy.time,
          sellTime: e.time,
          buyPrice: openBuy.price,
          sellPrice: e.price,
          holdBars: e.holdBars ?? null,
          returnPct: e.returnPct ?? null,
        });
        openBuy = null;
      }
    }
    if (openBuy && stats.openPosition) {
      rows.push({
        buyTime: openBuy.time,
        sellTime: null,
        buyPrice: openBuy.price,
        sellPrice: null,
        holdBars: null,
        returnPct: stats.openPosition.floatingPnlPct,
      });
    }
    return rows.slice().reverse();
  }, [stats]);

  const sortedLeaderboard = useMemo(() => {
    if (!leaderboard) return null;
    const rows = [...leaderboard];
    rows.sort((a, b) =>
      rankBy === "return"
        ? b.returnPct - a.returnPct
        : (b.winRate ?? -1) - (a.winRate ?? -1)
    );
    return rows;
  }, [leaderboard, rankBy]);

  const sortedTradeRows = useMemo(() => {
    if (pnlSort === "default") return tradeRows;
    const rows = [...tradeRows];
    rows.sort((a, b) => {
      const av = a.returnPct ?? -Infinity;
      const bv = b.returnPct ?? -Infinity;
      return pnlSort === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [tradeRows, pnlSort]);

  const cyclePnlSort = () => {
    setPnlSort((s) =>
      s === "default" ? "desc" : s === "desc" ? "asc" : "default"
    );
  };

  useEffect(() => {
    setTradesExpanded(false);
    setPnlSort("default");
  }, [symbol, strategy]);

  const patchParam = <K extends keyof BacktestParams>(
    key: K,
    value: BacktestParams[K]
  ) => setParams((p) => ({ ...p, [key]: value }));

  const runWatchlistBatch = useCallback(async () => {
    const list = watchlistSymbols.slice(0, 20);
    if (list.length === 0) return;
    setPanelView("leaderboard");
    setBatchBusy(true);
    setLeaderboard(null);
    const rows: LeaderRow[] = [];
    for (const sym of list) {
      try {
        const snap =
          sym === symbol
            ? { candles, price: 0, interval: chartInterval }
            : await fetchKlinesResilient(sym, chartInterval);
        const bt = runBacktest(snap.candles, strategy, params);
        if (!bt) continue;
        rows.push({
          symbol: sym,
          returnPct: bt.totalReturnPct,
          winRate: bt.winRate,
          trades: bt.trades,
        });
      } catch {
        /* skip */
      }
    }
    rows.sort((a, b) =>
      rankBy === "return"
        ? b.returnPct - a.returnPct
        : (b.winRate ?? -1) - (a.winRate ?? -1)
    );
    setLeaderboard(rows);
    setBatchBusy(false);
  }, [watchlistSymbols, symbol, candles, chartInterval, strategy, params, rankBy]);

  const paramSliders = () => {
    switch (strategy) {
      case "ema_cross":
        return (
          <div className="backtest-param-grid">
            <ParamControl
              label="快线"
              value={params.emaFast}
              min={5}
              max={40}
              onChange={(n) => patchParam("emaFast", n)}
            />
            <ParamControl
              label="慢线"
              value={params.emaSlow}
              min={20}
              max={120}
              onChange={(n) => patchParam("emaSlow", n)}
            />
          </div>
        );
      case "rsi_revert":
        return (
          <ParamControl
            label="RSI"
            value={params.rsiPeriod}
            min={6}
            max={30}
            onChange={(n) => patchParam("rsiPeriod", n)}
          />
        );
      case "boll_break":
        return (
          <ParamControl
            label="周期"
            value={params.bollPeriod}
            min={10}
            max={40}
            onChange={(n) => patchParam("bollPeriod", n)}
          />
        );
      default:
        return null;
    }
  };


  if (panelView === "leaderboard") {
    return (
      <section className="dock-panel backtest-panel">
        <header className="backtest-leader-head">
          <button
            type="button"
            className="backtest-back"
            onClick={() => setPanelView("detail")}
          >
            ← 返回单股回测
          </button>
          <span className="backtest-leader-title">自选池排行榜</span>
        </header>
        <div className="backtest-batch-bar backtest-leader-toolbar">
          <BacktestDarkMenu
            value={rankBy}
            options={RANK_OPTIONS}
            onChange={setRankBy}
            triggerLabel={`排序：${
              rankBy === "return" ? "累计收益" : "胜率"
            }`}
            ariaLabel="排行榜排序"
          />
          <button
            type="button"
            className="backtest-batch-run"
            disabled={batchBusy || watchlistSymbols.length === 0}
            onClick={() => void runWatchlistBatch()}
          >
            {batchBusy ? "回测中…" : "重新批量"}
          </button>
        </div>
        <div className="backtest-panel-scroll">
          {batchBusy && (
            <p className="muted backtest-batch-status">正在批量回测自选…</p>
          )}
          {!batchBusy && sortedLeaderboard?.length === 0 && (
            <p className="muted">无有效结果</p>
          )}
          {sortedLeaderboard && sortedLeaderboard.length > 0 && (
            <ol className="backtest-leaderboard">
              {sortedLeaderboard.map((row, idx) => (
                <li key={row.symbol} className="backtest-leader-row">
                  <span className="backtest-rank">{idx + 1}</span>
                  <span className="backtest-leader-sym">{row.symbol}</span>
                  <span
                    className={`tabular pnl-${
                      row.returnPct >= 0 ? "up" : "down"
                    }`}
                  >
                    {row.returnPct >= 0 ? "+" : ""}
                    {row.returnPct.toFixed(2)}%
                  </span>
                  <span className="muted tabular">
                    {row.winRate == null ? "—" : `${row.winRate.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    );
  }

  const visibleTrades = tradesExpanded
    ? sortedTradeRows
    : sortedTradeRows.slice(0, TRADES_COLLAPSED);

  return (
    <section className="dock-panel backtest-panel">
      <div className="backtest-panel-scroll">
        <header className="backtest-head backtest-head-compact">
          <BacktestDarkMenu
            className="backtest-strat-menu"
            value={strategy}
            options={BACKTEST_STRATEGIES.map((s) => ({
              value: s.id,
              label: s.label,
            }))}
            onChange={setStrategy}
            ariaLabel="策略模板"
          />
          <span className="backtest-meta muted">{candles.length} 根K</span>
          <button
            type="button"
            className="backtest-help"
            title="全仓单向做多；胜率/盈亏比仅统计已平仓回合"
            aria-label="回测规则说明"
          >
            ?
          </button>
        </header>

        <div className="backtest-sliders backtest-sliders-compact">
          {paramSliders()}
        </div>

        {!stats && <p className="muted">K 线数量不足，无法回测</p>}

        {stats && (
          <>
          <div className="stat-grid stat-grid-aux">
            <div className="stat-card">
              <span className="stat-label">成交次数</span>
              <span className="stat-value stat-neutral">{stats.trades}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">胜率</span>
              <span className="stat-value stat-neutral">
                {stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">盈亏比</span>
              <span className="stat-value stat-neutral">
                {formatProfitLossRatio(stats.profitLossRatio)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">最大回撤</span>
              <span className="stat-value pnl-down tabular">
                {stats.maxDrawdown.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="backtest-curve-block">
            <div className="backtest-compare">
              <span className="backtest-compare-item">
                策略累计{" "}
                <strong
                  className={`tabular pnl-${
                    stats.totalReturnPct >= 0 ? "up" : "down"
                  }`}
                >
                  {stats.totalReturnPct >= 0 ? "+" : ""}
                  {stats.totalReturnPct.toFixed(2)}%
                </strong>
              </span>
              <span className="backtest-compare-item muted">
                买入持有{" "}
                <strong
                  className={`tabular pnl-${
                    stats.benchmarkReturnPct >= 0 ? "up" : "down"
                  }`}
                >
                  {stats.benchmarkReturnPct >= 0 ? "+" : ""}
                  {stats.benchmarkReturnPct.toFixed(2)}%
                </strong>
              </span>
            </div>
            {paths && (
              <div className="backtest-curve-wrap">
                <div className="backtest-curve-legend-out muted" aria-hidden>
                  <span className="backtest-leg-strategy">策略</span>
                  <span>持有</span>
                </div>
                <svg
                  className="backtest-curve-svg"
                  viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
                  role="img"
                  aria-label="净值曲线对比"
                >
                  <defs>
                    <linearGradient
                      id="bt-strat-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="backtest-curve-area"
                    d={paths.area}
                    fill="url(#bt-strat-fill)"
                  />
                  <path
                    className="backtest-curve-bench"
                    d={paths.benchmark}
                    fill="none"
                  />
                  <path
                    className="backtest-curve-strategy"
                    d={paths.strategy}
                    fill="none"
                  />
                </svg>
              </div>
            )}
          </div>

          {visibleTrades.length > 0 && (
            <div className="backtest-trades">
              <h3 className="backtest-subtitle">交易明细</h3>
              <div className="backtest-trades-head muted">
                <span>入场</span>
                <span className="backtest-trades-hold-h">时长</span>
                <button
                  type="button"
                  className={`backtest-trades-sort backtest-trades-pnl-h${
                    pnlSort !== "default" ? " is-active" : ""
                  }`}
                  title="点击切换盈亏排序"
                  onClick={cyclePnlSort}
                >
                  盈亏
                  <span className="backtest-sort-mark" aria-hidden>
                    {pnlSort === "desc"
                      ? " ↓"
                      : pnlSort === "asc"
                        ? " ↑"
                        : ""}
                  </span>
                </button>
              </div>
              {visibleTrades.map((row, i) => {
                const tip = row.sellTime
                  ? `买入 ${formatFullTime(row.buyTime)} @ ${row.buyPrice.toFixed(2)}\n卖出 ${formatFullTime(row.sellTime)} @ ${row.sellPrice?.toFixed(2) ?? "—"}`
                  : `买入 ${formatFullTime(row.buyTime)} @ ${row.buyPrice.toFixed(2)}\n尚未平仓`;
                const isOpen = row.sellTime == null;
                return (
                  <button
                    type="button"
                    className={`backtest-trades-row${
                      hoverTradeTime === row.buyTime ? " is-hover" : ""
                    }${isOpen ? " is-open" : ""}`}
                    key={`${row.buyTime}-${i}`}
                    title={tip}
                    onMouseEnter={() => setHoverTradeTime(row.buyTime)}
                    onMouseLeave={() => setHoverTradeTime(null)}
                    onClick={() => onTradeClick?.(row.buyTime)}
                  >
                    <span className="backtest-trades-entry">
                      {formatEntryTime(row.buyTime)}
                      {isOpen && (
                        <span className="backtest-hold-dot" aria-hidden />
                      )}
                    </span>
                    <span className="backtest-trades-hold">
                      {row.holdBars != null
                        ? formatHoldDuration(row.holdBars, chartInterval)
                        : isOpen ? (
                            <span className="backtest-hold-open" title="持仓中">
                              未平
                            </span>
                          ) : (
                            "—"
                          )}
                    </span>
                    <span
                      className={`backtest-trades-pnl pnl-${
                        (row.returnPct ?? 0) >= 0 ? "up" : "down"
                      }`}
                    >
                      {row.returnPct == null
                        ? "—"
                        : `${row.returnPct >= 0 ? "+" : ""}${row.returnPct.toFixed(2)}%`}
                    </span>
                  </button>
                );
              })}
              {sortedTradeRows.length > TRADES_COLLAPSED && (
                <button
                  type="button"
                  className="backtest-trades-more"
                  onClick={() => setTradesExpanded((v) => !v)}
                >
                  {tradesExpanded ? (
                    <>收起明细</>
                  ) : (
                    <>查看全部 {sortedTradeRows.length} 笔交易 ›</>
                  )}
                </button>
              )}
            </div>
          )}
          </>
        )}
      </div>

      {stats?.openPosition && (
        <div className="backtest-panel-pin">
          <div className="backtest-open-card" role="status">
            <div className="backtest-open-head">
              <span className="backtest-open-title">当前持仓</span>
              <span className="backtest-open-badge">未平仓</span>
            </div>
            <p className="backtest-open-meta muted">
              开仓价{" "}
              <span className="tabular">
                {stats.openPosition.entryPrice.toFixed(2)}
              </span>
              <span className="backtest-open-sep">·</span>
              现价{" "}
              <span className="tabular">
                {stats.openPosition.markPrice.toFixed(2)}
              </span>
            </p>
            <p
              className={`backtest-open-pnl-hero tabular pnl-${
                stats.openPosition.floatingPnlPct >= 0 ? "up" : "down"
              }`}
            >
              浮盈 {stats.openPosition.floatingPnlPct >= 0 ? "+" : ""}
              {stats.openPosition.floatingPnlPct.toFixed(2)}%
            </p>
          </div>
        </div>
      )}

      <div className="backtest-batch-bar backtest-batch-sticky backtest-batch-single">
        <button
          type="button"
          className="backtest-batch-run backtest-batch-run-full"
          disabled={batchBusy || watchlistSymbols.length === 0}
          onClick={() => void runWatchlistBatch()}
        >
          {batchBusy ? "…" : "批量跑自选"}
        </button>
      </div>
    </section>
  );
}