import { useMemo, useState } from "react";
import type { AlertRules } from "../hooks/useAlertRules";
import type { AlertSignal, Candle } from "../types/market";
import { A_SHARE_ONLY } from "../config/market";
import {
  backtestEmaCross,
  formatProfitLossRatio,
  type BacktestStats,
} from "../utils/backtest";
import { SignalLog, type SignalScope } from "./SignalLog";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

type Tab = "signals" | "position" | "backtest" | "depth";

interface Props {
  symbol: string;
  price: number;
  candles: Candle[];
  signals: AlertSignal[];
  rules: AlertRules;
  scope: SignalScope;
  onScopeChange: (s: SignalScope) => void;
  onOpenSettings: () => void;
  onPickSignal?: (s: AlertSignal) => void;
}

export function RightDock({
  symbol,
  price,
  candles,
  signals,
  rules,
  scope,
  onScopeChange,
  onOpenSettings,
  onPickSignal,
}: Props) {
  const [tab, setTab] = useState<Tab>("signals");
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
      <nav className="dock-tabs" aria-label="右侧面板">
        {(
          [
            ["signals", "策略信号"],
            ["position", "模拟持仓"],
            ["backtest", "快速回测"],
            ...(!A_SHARE_ONLY ? ([["depth", "盘口"]] as const) : []),
          ] as readonly [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dock-tab${tab === id ? " on" : ""}`}
            onClick={() => {
              setTab(id);
              if (id === "depth") loadDepth();
            }}
          >
            {label}
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
          onOpenSettings={onOpenSettings}
          onPick={onPickSignal}
        />
      )}

      {tab === "position" && (
        <section className="dock-panel">
          <h2>模拟持仓</h2>
          <label className="field">
            开仓价
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={price > 0 ? String(price) : ""}
            />
          </label>
          <label className="field">
            止损价
            <input value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
          <label className="field">
            总资金 ({A_SHARE_ONLY ? "元" : "USD"})
            <input value={capital} onChange={(e) => setCapital(e.target.value)} />
          </label>
          {posCalc ? (
            <ul className="pos-stats">
              <li>建议仓位约 {posCalc.shares.toFixed(4)} 单位</li>
              <li>名义敞口 {posCalc.notional.toFixed(2)}</li>
              <li>单笔风险 {posCalc.riskAmt.toFixed(2)} (1%)</li>
              <li>
                浮盈浮亏 {posCalc.floatPnl.toFixed(2)} (
                {posCalc.floatPct >= 0 ? "+" : ""}
                {posCalc.floatPct.toFixed(2)}%)
              </li>
            </ul>
          ) : (
            <p className="muted">填写开仓与止损后计算仓位与浮盈</p>
          )}
        </section>
      )}

      {tab === "backtest" && (
        <section className="dock-panel">
          <h2>EMA 金叉回测</h2>
          <p className="muted backtest-desc">
            金叉做多、死叉平仓；胜率/盈亏比仅统计已平仓回合，累计收益含持仓市值
          </p>
          {!stats && <p className="muted">需要至少 60 根 K 线</p>}
          {stats && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">成交次数</span>
                  <span className="stat-value">{stats.trades}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">胜率</span>
                  <span className="stat-value">
                    {stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">盈亏比</span>
                  <span className="stat-value">
                    {formatProfitLossRatio(stats.profitLossRatio)}
                  </span>
                </div>
                <div className="stat-card stat-dd">
                  <span className="stat-label">最大回撤</span>
                  <span className="stat-value">
                    {stats.maxDrawdown.toFixed(2)}%
                  </span>
                </div>
                <div
                  className={`stat-card span-2 stat-return${
                    stats.totalReturnPct >= 0 ? " up" : " down"
                  }`}
                >
                  <span className="stat-label">累计收益率</span>
                  <span className="stat-value">
                    {stats.totalReturnPct >= 0 ? "+" : ""}
                    {stats.totalReturnPct.toFixed(2)}%
                  </span>
                </div>
              </div>
              {stats.openPosition && (
                <div className="backtest-open-card">
                  <span className="backtest-open-card__tag">当前持仓中（未平仓）</span>
                  <p className="backtest-open-card__body">
                    开仓价: {stats.openPosition.entryPrice.toFixed(2)} | 当前浮盈:{" "}
                    <span
                      className={
                        stats.openPosition.floatingPnlPct >= 0 ? "up" : "down"
                      }
                    >
                      {stats.openPosition.floatingPnlPct >= 0 ? "+" : ""}
                      {stats.openPosition.floatingPnlPct.toFixed(2)}%
                    </span>
                  </p>
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