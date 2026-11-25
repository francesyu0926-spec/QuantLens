import type { Candle } from "../types/market";
import { ema } from "./indicators";

export interface ClosedTrade {
  pnl: number;
  returnPct: number;
}

export interface OpenPosition {
  entryPrice: number;
  shares: number;
  entryCost: number;
  markPrice: number;
  floatingPnlPct: number;
  floatingPnlAmt: number;
}

export interface BacktestStats {
  /** 仅已平仓回合（买+卖=1 次） */
  closedTrades: ClosedTrade[];
  trades: number;
  wins: number;
  /** N=0 时为 null，界面显示 — */
  winRate: number | null;
  /** 平均盈利 / |平均亏损|；全胜无亏损时为 Infinity */
  profitLossRatio: number | null;
  maxDrawdown: number;
  /** 基于每根 K 线收盘权益 E_t（含持仓市值） */
  totalReturnPct: number;
  openPosition: OpenPosition | null;
  equityFinal: number;
}

const INITIAL_CASH = 1;

function markEquity(cash: number, shares: number, price: number, feeRate: number) {
  if (shares <= 0) return cash;
  return cash + shares * price * (1 - feeRate);
}

/**
 * EMA 金叉全仓单向做多；双轨：closed_trades + 每 K 线 equity_curve。
 */
export function backtestEmaCross(
  candles: Candle[],
  feeBps = 10
): BacktestStats | null {
  if (candles.length < 60) return null;

  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const r = feeBps / 10_000;

  let cash = INITIAL_CASH;
  let shares = 0;
  let entryCost = 0;
  let entryPrice = 0;

  const closedTrades: ClosedTrade[] = [];
  const equityCurve: number[] = [];
  let peak = INITIAL_CASH;
  let maxDd = 0;

  for (let i = 1; i < candles.length; i++) {
    const crossUp = e20[i - 1] <= e50[i - 1] && e20[i] > e50[i];
    const crossDn = e20[i - 1] >= e50[i - 1] && e20[i] < e50[i];
    const px = candles[i].close;

    if (shares <= 0 && crossUp) {
      const buyValue = cash * (1 - r);
      shares = buyValue / px;
      entryCost = cash;
      entryPrice = px;
      cash = 0;
    } else if (shares > 0 && crossDn) {
      const grossProceeds = shares * px;
      cash = grossProceeds * (1 - r);
      const pnl = cash - entryCost;
      const returnPct = entryCost > 0 ? (pnl / entryCost) * 100 : 0;
      closedTrades.push({ pnl, returnPct });
      shares = 0;
      entryCost = 0;
      entryPrice = 0;
    }

    const equity = markEquity(cash, shares, px, r);
    equityCurve.push(equity);
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - equity) / peak);
    }
  }

  const lastPx = candles[candles.length - 1].close;
  const equityFinal = markEquity(cash, shares, lastPx, r);

  let openPosition: OpenPosition | null = null;
  if (shares > 0) {
    const liquid = shares * lastPx * (1 - r);
    const floatingPnlAmt = liquid - entryCost;
    const floatingPnlPct = entryCost > 0 ? (floatingPnlAmt / entryCost) * 100 : 0;
    openPosition = {
      entryPrice,
      shares,
      entryCost,
      markPrice: lastPx,
      floatingPnlPct,
      floatingPnlAmt,
    };
  }

  const n = closedTrades.length;
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);

  const winRate = n > 0 ? (wins.length / n) * 100 : null;

  let profitLossRatio: number | null = null;
  if (n === 0) {
    profitLossRatio = null;
  } else if (losses.length === 0) {
    profitLossRatio = wins.length > 0 ? Number.POSITIVE_INFINITY : null;
  } else {
    const avgWin =
      wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss =
      losses.reduce((s, t) => s + t.pnl, 0) / losses.length;
    profitLossRatio = avgWin / Math.abs(avgLoss);
  }

  const totalReturnPct = ((equityFinal - INITIAL_CASH) / INITIAL_CASH) * 100;

  return {
    closedTrades,
    trades: n,
    wins: wins.length,
    winRate,
    profitLossRatio,
    maxDrawdown: maxDd * 100,
    totalReturnPct,
    openPosition,
    equityFinal,
  };
}

export function formatProfitLossRatio(ratio: number | null): string {
  if (ratio == null) return "—";
  if (!Number.isFinite(ratio)) return "∞";
  return ratio.toFixed(2);
}