import { useCallback, useMemo, useState } from "react";
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

interface Props {
  symbol: string;
  candles: Candle[];
  watchlistSymbols: string[];
  chartInterval: TimeInterval;
}

function formatBarTime(t: number): string {
  const d = new Date(t * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

function miniCurvePath(
  strategy: number[],
  benchmark: number[],
  width: number,
  height: number
): { strategy: string; benchmark: string } | null {
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
  return { strategy: toPath(ns), benchmark: toPath(nb) };
}

interface LeaderRow {
  symbol: string;
  returnPct: number;
  winRate: number | null;
  trades: number;
}

export function BacktestPanel({
  symbol,
  candles,
  watchlistSymbols,
  chartInterval,
}: Props) {
  const [strategy, setStrategy] = useState<BacktestStrategyId>("ema_cross");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_BACKTEST_PARAMS);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [rankBy, setRankBy] = useState<"return" | "winRate">("return");

  const stats = useMemo(
    () => runBacktest(candles, strategy, params),
    [candles, strategy, params]
  );

  const hint = BACKTEST_STRATEGIES.find((s) => s.id === strategy)?.hint ?? "";

  const paths = useMemo(() => {
    if (!stats) return null;
    return miniCurvePath(stats.equityCurve, stats.benchmarkCurve, 280, 72);
  }, [stats]);

  const tradeRows = useMemo(() => {
    if (!stats) return [];
    const rows: {
      buyTime: number;
      sellTime: number | null;
      holdBars: number | null;
      returnPct: number | null;
    }[] = [];
    let openBuy: { time: number; price: number } | null = null;
    for (const e of stats.tradeLog) {
      if (e.kind === "buy") {
        if (!openBuy) openBuy = { time: e.time, price: e.price };
      } else if (e.kind === "sell" && openBuy) {
        rows.push({
          buyTime: openBuy.time,
          sellTime: e.time,
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
        holdBars: null,
        returnPct: stats.openPosition.floatingPnlPct,
      });
    }
    return rows.slice(-12).reverse();
  }, [stats]);

  const patchParam = <K extends keyof BacktestParams>(
    key: K,
    value: BacktestParams[K]
  ) => setParams((p) => ({ ...p, [key]: value }));

  const runWatchlistBatch = useCallback(async () => {
    const list = watchlistSymbols.slice(0, 20);
    if (list.length === 0) return;
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
          <>
            <label className="backtest-slider">
              <span>快线 EMA</span>
              <input
                type="range"
                min={5}
                max={40}
                value={params.emaFast}
                onChange={(e) => patchParam("emaFast", Number(e.target.value))}
              />
              <span className="tabular">{params.emaFast}</span>
            </label>
            <label className="backtest-slider">
              <span>慢线 EMA</span>
              <input
                type="range"
                min={20}
                max={120}
                value={params.emaSlow}
                onChange={(e) => patchParam("emaSlow", Number(e.target.value))}
              />
              <span className="tabular">{params.emaSlow}</span>
            </label>
          </>
        );
      case "rsi_revert":
        return (
          <>
            <label className="backtest-slider">
              <span>RSI 周期</span>
              <input
                type="range"
                min={6}
                max={30}
                value={params.rsiPeriod}
                onChange={(e) => patchParam("rsiPeriod", Number(e.target.value))}
              />
              <span className="tabular">{params.rsiPeriod}</span>
            </label>
            <label className="backtest-slider">
              <span>超卖买</span>
              <input
                type="range"
                min={15}
                max={40}
                value={params.rsiBuy}
                onChange={(e) => patchParam("rsiBuy", Number(e.target.value))}
              />
              <span className="tabular">{params.rsiBuy}</span>
            </label>
            <label className="backtest-slider">
              <span>超买卖</span>
              <input
                type="range"
                min={60}
                max={85}
                value={params.rsiSell}
                onChange={(e) => patchParam("rsiSell", Number(e.target.value))}
              />
              <span className="tabular">{params.rsiSell}</span>
            </label>
          </>
        );
      case "boll_break":
        return (
          <>
            <label className="backtest-slider">
              <span>布林周期</span>
              <input
                type="range"
                min={10}
                max={40}
                value={params.bollPeriod}
                onChange={(e) =>
                  patchParam("bollPeriod", Number(e.target.value))
                }
              />
              <span className="tabular">{params.bollPeriod}</span>
            </label>
            <label className="backtest-slider">
              <span>标准差倍数</span>
              <input
                type="range"
                min={15}
                max={30}
                value={params.bollMult * 10}
                onChange={(e) =>
                  patchParam("bollMult", Number(e.target.value) / 10)
                }
              />
              <span className="tabular">{params.bollMult.toFixed(1)}</span>
            </label>
          </>
        );
      default:
        return (
          <p className="muted backtest-strat-hint">
            MACD(12,26,9) 零轴穿越；无需额外参数
          </p>
        );
    }
  };

  return (
    <section className="dock-panel backtest-panel">
      <header className="backtest-head">
        <h2 className="backtest-title">策略回测</h2>
        <span className="backtest-meta muted">
          {symbol} · {candles.length} 根 K 线
        </span>
        <button
          type="button"
          className="backtest-help"
          title="全仓单向做多；胜率/盈亏比仅统计已平仓回合"
          aria-label="回测规则说明"
        >
          ?
        </button>
      </header>

      <span className="backtest-field-label">策略模板</span>
      <div className="backtest-strat-row" role="group" aria-label="策略模板">
        {BACKTEST_STRATEGIES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip backtest-strat-chip${
              strategy === s.id ? " active" : ""
            }`}
            onClick={() => setStrategy(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted backtest-strat-hint">{hint}</p>

      <div className="backtest-sliders">{paramSliders()}</div>

      {!stats && <p className="muted">K 线数量不足，无法回测</p>}

      {stats && (
        <>
          <div className="backtest-hero">
            <span className="backtest-hero-label">策略累计收益</span>
            <span
              className={`backtest-hero-value tabular pnl-${
                stats.totalReturnPct >= 0 ? "up" : "down"
              }`}
            >
              {stats.totalReturnPct >= 0 ? "+" : ""}
              {stats.totalReturnPct.toFixed(2)}%
            </span>
            <p className="backtest-hero-sub muted">
              买入持有{" "}
              <span className="tabular">
                {stats.benchmarkReturnPct >= 0 ? "+" : ""}
                {stats.benchmarkReturnPct.toFixed(2)}%
              </span>
            </p>
          </div>

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

          {paths && (
            <div className="backtest-curve-card">
              <div className="backtest-curve-legend">
                <span className="backtest-leg-strategy">策略净值</span>
                <span className="backtest-leg-bench muted">买入持有</span>
              </div>
              <svg
                className="backtest-curve-svg"
                viewBox="0 0 280 72"
                role="img"
                aria-label="净值曲线对比"
              >
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

          {tradeRows.length > 0 && (
            <div className="backtest-trades">
              <h3 className="backtest-subtitle">交易明细</h3>
              <div className="backtest-trades-head muted">
                <span>买入</span>
                <span>卖出</span>
                <span>持有</span>
                <span>盈亏</span>
              </div>
              {tradeRows.map((row, i) => (
                <div className="backtest-trades-row" key={`${row.buyTime}-${i}`}>
                  <span className="tabular">{formatBarTime(row.buyTime)}</span>
                  <span className="tabular">
                    {row.sellTime ? formatBarTime(row.sellTime) : "持仓中"}
                  </span>
                  <span className="tabular">
                    {row.holdBars != null ? `${row.holdBars} bars` : "—"}
                  </span>
                  <span
                    className={`tabular pnl-${
                      (row.returnPct ?? 0) >= 0 ? "up" : "down"
                    }`}
                  >
                    {row.returnPct == null
                      ? "—"
                      : `${row.returnPct >= 0 ? "+" : ""}${row.returnPct.toFixed(2)}%`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {stats.openPosition && (
            <div className="backtest-open-card">
              <div className="backtest-open-row">
                <span className="backtest-open-title">当前持仓中</span>
                <span className="backtest-open-badge">未平仓</span>
              </div>
              <div className="backtest-open-row">
                <span className="backtest-open-entry tabular">
                  开仓 {stats.openPosition.entryPrice.toFixed(2)}
                </span>
                <span
                  className={`backtest-open-pnl tabular pnl-${
                    stats.openPosition.floatingPnlPct >= 0 ? "up" : "down"
                  }`}
                >
                  浮盈 {stats.openPosition.floatingPnlPct >= 0 ? "+" : ""}
                  {stats.openPosition.floatingPnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <div className="backtest-batch">
        <h3 className="backtest-subtitle">自选批量榜</h3>
        <p className="muted backtest-strat-hint">
          对自选列表跑同一策略（最多 20 只），找出更「适配」的标的
        </p>
        <div className="backtest-batch-actions">
          <select
            className="backtest-rank-select"
            value={rankBy}
            onChange={(e) =>
              setRankBy(e.target.value as "return" | "winRate")
            }
          >
            <option value="return">按累计收益</option>
            <option value="winRate">按胜率</option>
          </select>
          <button
            type="button"
            className="chip"
            disabled={batchBusy || watchlistSymbols.length === 0}
            onClick={() => void runWatchlistBatch()}
          >
            {batchBusy ? "回测中…" : "一键批量回测"}
          </button>
        </div>
        {leaderboard && leaderboard.length === 0 && (
          <p className="muted">无有效结果（K 线不足或拉取失败）</p>
        )}
        {leaderboard && leaderboard.length > 0 && (
          <ol className="backtest-leaderboard">
            {leaderboard.map((row, idx) => (
              <li key={row.symbol} className="backtest-leader-row">
                <span className="backtest-rank">{idx + 1}</span>
                <span className="backtest-leader-sym">{row.symbol}</span>
                <span
                  className={`tabular pnl-${row.returnPct >= 0 ? "up" : "down"}`}
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