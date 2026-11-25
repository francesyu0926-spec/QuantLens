import { useMemo, useState } from "react";
import type { AlertRules } from "../hooks/useAlertRules";
import type { PaperTrade } from "../hooks/usePaperTrades";
import { TradingJournalPanel } from "./TradingJournalPanel";
import type { AlertSignal, Candle } from "../types/market";
import type { TimeInterval } from "../types/chart";
import { A_SHARE_ONLY } from "../config/market";
import {
  backtestEmaCross,
  formatProfitLossRatio,
  type BacktestStats,
} from "../utils/backtest";
import { SignalLog, type SignalScope } from "./SignalLog";
import { MarketHealthCard } from "./MarketHealthCard";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

type Tab = "signals" | "position" | "backtest" | "journal" | "depth";

interface Props {
  symbol: string;
  price: number;
  candles: Candle[];
  signals: AlertSignal[];
  rules: AlertRules;
  scope: SignalScope;
  onScopeChange: (s: SignalScope) => void;
  onPickSignal?: (s: AlertSignal) => void;
  onCollapsePanel?: () => void;
  paperOpen?: { entry: number; qty: number; entryTime: number | null } | null;
  paperTrades?: PaperTrade[];
  onPaperBuy?: (qty: number) => void;
  onPaperSell?: (qty: number) => void;
  chartInterval?: TimeInterval;
  supportPrice?: number | null;
}

export function RightDock({
  symbol,
  price,
  candles,
  signals,
  rules,
  scope,
  onScopeChange,
  onPickSignal,
  onCollapsePanel,
  paperOpen,
  paperTrades = [],
  onPaperBuy,
  onPaperSell,
  chartInterval = "1m",
  supportPrice = null,
}: Props) {
  const [tab, setTab] = useState<Tab>("signals");
  const [paperQty, setPaperQty] = useState("100");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [capital, setCapital] = useState("10000");
  const [depth, setDepth] = useState<{
    bids: { price: number; amount: number }[];
    asks: { price: number; amount: number }[];
  } | null>(null);

  const stats = useMemo((): BacktestStats | null => {
    if (tab !== "backtest") return null;
    return backtestEmaCross(candles);
  }, [candles, tab]);

  const applyQtyPct = (pct: number) => {
    const e = Number(entry) || price;
    const cap = Number(capital);
    if (!(e > 0 && cap > 0)) return;
    const raw = (cap * pct) / e;
    const step = A_SHARE_ONLY ? 100 : 1;
    const lots = Math.max(step, Math.floor(raw / step) * step);
    setPaperQty(String(lots));
  };

  const posCalc = useMemo(() => {
    const e = Number(entry) || price;
    const st = Number(stop);
    const cap = Number(capital);
    if (!(e > 0 && st > 0 && cap > 0) || e === st) return null;
    const riskPerShare = Math.abs(e - st);
    const riskPct = 0.01;
    const riskAmt = cap * riskPct;
    const shares = riskAmt / riskPerShare;
    const notional = shares * e;
    const floatPnl = price > 0 ? (price - e) * shares : 0;
    const floatPct = e > 0 ? ((price - e) / e) * 100 : 0;
    return { shares, notional, floatPnl, floatPct, riskAmt };
  }, [entry, stop, capital, price]);

  const riskSummary = useMemo(() => {
    const e = Number(entry) || price;
    const st = Number(stop);
    if (!(st > 0) || !(e > 0) || !posCalc) return null;
    let sugShares = posCalc.shares;
    if (A_SHARE_ONLY) {
      sugShares = Math.max(100, Math.floor(sugShares / 100) * 100);
    } else {
      sugShares = Math.floor(sugShares);
    }
    const qty = Number(paperQty) > 0 ? Number(paperQty) : sugShares;
    const lossAmt = (st - e) * qty;
    const lossPct = ((st - e) / e) * 100;
    return { lossAmt, lossPct, sugShares };
  }, [entry, stop, price, paperQty, posCalc]);

  const loadDepth = async () => {
    if (!symbol.includes("/")) return;
    try {
      const res = await fetch(
        `${API}/depth?symbol=${encodeURIComponent(symbol)}&levels=10`
      );
      if (!res.ok) return;
      const data = await res.json();
      setDepth({
        bids: data.bids ?? [],
        asks: data.asks ?? [],
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="right-dock">
      <MarketHealthCard candles={candles} price={price} />
      <nav className="dock-tabs" aria-label="右侧面板">
        <button
          type="button"
          className="dock-fold"
          title="收起侧栏 (F 专注)"
          aria-label="收起侧栏"
          onClick={onCollapsePanel}
        >
          ▸
        </button>
        {(
          [
            ["signals", "信号", "策略信号"],
            ["position", "持仓", "模拟持仓"],
            ["backtest", "回测", "快速回测"],
            ["journal", "笔记", "复盘笔记"],
            ...(!A_SHARE_ONLY
              ? ([["depth", "盘口", "盘口深度"]] as const)
              : []),
          ] as readonly [Tab, string, string][]
        ).map(([id, short, title]) => (
          <button
            key={id}
            type="button"
            className={`dock-tab${tab === id ? " on" : ""}`}
            title={title}
            onClick={() => {
              setTab(id);
              if (id === "depth") loadDepth();
            }}
          >
            {short}
          </button>
        ))}
      </nav>

      {tab === "signals" && (
        <SignalLog
          className="signal-log-dock"
          signals={signals}
          rules={rules}
          scope={scope}
          onScopeChange={onScopeChange}
          onPick={onPickSignal}
        />
      )}

      {tab === "position" && (
        <section className="dock-panel paper-panel">
          <h2 className="paper-panel-title">模拟持仓</h2>
          <div className="paper-inline-field">
            <span className="paper-inline-label">开仓价</span>
            <input
              className="paper-inline-input tabular"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={price > 0 ? price.toFixed(2) : "—"}
              inputMode="decimal"
            />
            <button
              type="button"
              className="paper-link-btn"
              disabled={!(price > 0)}
              onClick={() => setEntry(price.toFixed(2))}
            >
              现价
            </button>
          </div>
          <div className="paper-stop-block">
            <div className="paper-inline-field">
              <span className="paper-inline-label">止损价</span>
              <input
                className="paper-inline-input tabular"
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                placeholder="选填"
                inputMode="decimal"
              />
            </div>
            <div className="paper-stop-chips">
              <button
                type="button"
                className="paper-chip-btn"
                disabled={!(price > 0)}
                onClick={() => {
                  const ref = Number(entry) || price;
                  setStop((ref * 0.98).toFixed(2));
                }}
              >
                -2%
              </button>
              <button
                type="button"
                className="paper-chip-btn"
                disabled={supportPrice == null}
                onClick={() =>
                  supportPrice != null && setStop(supportPrice.toFixed(2))
                }
              >
                支撑位
              </button>
            </div>
          </div>
          <div className="paper-capital-row">
            <label className="paper-capital-cell">
              <span className="paper-field-label">总资金</span>
              <div className="paper-value-box">
                <input
                  className="paper-value-input tabular"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  inputMode="numeric"
                />
                <span className="paper-input-suffix" aria-hidden>
                  {A_SHARE_ONLY ? "元" : "USD"}
                </span>
              </div>
            </label>
            <label className="paper-capital-cell">
              <span className="paper-field-label">数量</span>
              <div className="paper-value-box">
                <input
                  className="paper-value-input tabular"
                  value={paperQty}
                  onChange={(e) => setPaperQty(e.target.value)}
                  placeholder="100"
                  inputMode="numeric"
                />
                <span className="paper-input-suffix" aria-hidden>
                  股
                </span>
              </div>
            </label>
          </div>
          <div className="paper-segment" role="group" aria-label="仓位比例">
            {(
              [
                ["25%", 0.25],
                ["50%", 0.5],
                ["75%", 0.75],
                ["全仓", 1],
              ] as const
            ).map(([label, pct]) => (
              <button
                key={label}
                type="button"
                className="paper-segment-btn"
                onClick={() => applyQtyPct(pct)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="paper-actions paper-actions-grid">
            <button
              type="button"
              className="paper-btn-buy"
              disabled={!(price > 0)}
              onClick={() => {
                const q = Number(paperQty);
                if (q > 0) onPaperBuy?.(q);
              }}
            >
              市价买入
            </button>
            <button
              type="button"
              className="paper-btn-sell"
              disabled={!paperOpen || !(price > 0)}
              onClick={() => {
                const q = Number(paperQty) || paperOpen?.qty || 0;
                if (q > 0) onPaperSell?.(q);
              }}
            >
              平仓卖出
            </button>
          </div>
          {paperTrades.length > 0 && (
            <ul className="paper-trade-log">
              {paperTrades.slice(-6).reverse().map((t) => (
                <li key={t.id}>
                  {t.side === "buy" ? "买" : "卖"} @{t.price.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
          <div className="paper-risk-card">
            {riskSummary ? (
              <div className="paper-risk-cols">
                <span className="paper-risk-item tabular pnl-down">
                  预估亏损 {riskSummary.lossAmt.toFixed(2)} (
                  {riskSummary.lossPct.toFixed(1)}%)
                </span>
                <span className="paper-risk-item tabular">
                  建议股数 {riskSummary.sugShares} 股
                </span>
              </div>
            ) : (
              <p className="paper-risk-hint muted">
                输入止损价自动测算最大亏损与建议仓位
              </p>
            )}
          </div>
        </section>
      )}

      {tab === "journal" && (
        <TradingJournalPanel
          symbol={symbol}
          interval={chartInterval}
          price={price}
          extraTags={paperOpen ? ["持仓中"] : []}
        />
      )}

      {tab === "backtest" && (
        <section className="dock-panel backtest-panel">
          <header className="backtest-head">
            <h2 className="backtest-title">EMA 金叉回测</h2>
            <span className="backtest-meta muted">
              基于当前 {candles.length} 根 K 线
            </span>
            <button
              type="button"
              className="backtest-help"
              title="金叉做多、死叉平仓；胜率/盈亏比仅统计已平仓回合，累计收益含持仓市值"
              aria-label="回测规则说明"
            >
              ?
            </button>
          </header>
          {!stats && <p className="muted">需要至少 60 根 K 线</p>}
          {stats && (
            <>
              <div className="backtest-hero">
                <span className="backtest-hero-label">累计收益率</span>
                <span
                  className={`backtest-hero-value tabular pnl-${
                    stats.totalReturnPct >= 0 ? "up" : "down"
                  }`}
                >
                  {stats.totalReturnPct >= 0 ? "+" : ""}
                  {stats.totalReturnPct.toFixed(2)}%
                </span>
                {stats.openPosition && (
                  <p className="backtest-hero-sub">
                    当前持仓浮盈{" "}
                    <span
                      className={`tabular pnl-${
                        stats.openPosition.floatingPnlPct >= 0 ? "up" : "down"
                      }`}
                    >
                      {stats.openPosition.floatingPnlPct >= 0 ? "+" : ""}
                      {stats.openPosition.floatingPnlPct.toFixed(2)}%
                    </span>
                  </p>
                )}
              </div>
              <div className="stat-grid stat-grid-aux">
                <div className="stat-card">
                  <span className="stat-label">成交次数</span>
                  <span className="stat-value stat-neutral">
                    {stats.trades}
                  </span>
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
                      浮盈{" "}
                      {stats.openPosition.floatingPnlPct >= 0 ? "+" : ""}
                      {stats.openPosition.floatingPnlPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === "depth" && (
        <section className="dock-panel">
          <h2>订单簿 Top10</h2>
          {!symbol.includes("/") && (
            <p className="muted">仅加密货币支持盘口深度</p>
          )}
          {symbol.includes("/") && (
            <button type="button" className="chip" onClick={loadDepth}>
              刷新
            </button>
          )}
          {depth && (
            <div className="depth-grid">
              <div>
                <strong className="leg-up">买盘</strong>
                {depth.bids.map((b) => (
                  <div key={b.price} className="depth-row">
                    <span>{b.price.toFixed(2)}</span>
                    <span>{b.amount.toFixed(4)}</span>
                  </div>
                ))}
              </div>
              <div>
                <strong className="leg-down">卖盘</strong>
                {depth.asks.map((a) => (
                  <div key={a.price} className="depth-row">
                    <span>{a.price.toFixed(2)}</span>
                    <span>{a.amount.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}