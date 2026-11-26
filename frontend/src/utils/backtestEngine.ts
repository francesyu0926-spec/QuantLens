import type { Candle } from "../types/market";
import {
  computeBollinger,
  computeMacd,
  computeRsi,
  ema,
} from "./indicators";
import type { BacktestStats, ClosedTrade } from "./backtest";

export type BacktestStrategyId =
  | "ema_cross"
  | "ema_rsi_filter"
  | "rsi_revert"
  | "boll_break"
  | "macd_zero";

/** 归一化资金 1.0 ≈ cashScaleCny 元 */
export interface AShareCostProfile {
  enabled: boolean;
  cashScaleCny: number;
  commissionBps: number;
  minCommissionCny: number;
  stampDutySellBps: number;
  tPlusOne: boolean;
}

export const DEFAULT_A_SHARE_COSTS: AShareCostProfile = {
  enabled: true,
  cashScaleCny: 100_000,
  commissionBps: 3,
  minCommissionCny: 5,
  stampDutySellBps: 5,
  tPlusOne: true,
};

export interface BacktestParams {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiBuy: number;
  rsiSell: number;
  bollPeriod: number;
  bollMult: number;
  feeBps: number;
}

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  emaFast: 20,
  emaSlow: 50,
  rsiPeriod: 14,
  rsiBuy: 30,
  rsiSell: 70,
  bollPeriod: 20,
  bollMult: 2,
  feeBps: 10,
};

export const BACKTEST_STRATEGIES: {
  id: BacktestStrategyId;
  label: string;
  hint: string;
}[] = [
  { id: "ema_cross", label: "EMA 趋势跟随", hint: "金叉做多 / 死叉平仓" },
  {
    id: "ema_rsi_filter",
    label: "EMA + RSI 过滤",
    hint: "金叉且 RSI<60 进场；死叉或 RSI>75 离场",
  },
  { id: "rsi_revert", label: "RSI 均值回归", hint: "超卖买 / 超买卖" },
  { id: "boll_break", label: "布林突破", hint: "上破上轨买 / 回中轨卖" },
  { id: "macd_zero", label: "MACD 零轴", hint: "上穿 0 买 / 下穿 0 卖" },
];

export interface TradeLogEntry {
  kind: "buy" | "sell";
  time: number;
  price: number;
  pnl?: number;
  returnPct?: number;
  holdBars?: number;
}

export interface BacktestResult extends BacktestStats {
  equityCurve: number[];
  benchmarkCurve: number[];
  tradeLog: TradeLogEntry[];
  benchmarkReturnPct: number;
}

const INITIAL_CASH = 1;

function markEquity(cash: number, shares: number, price: number, feeRate: number) {
  if (shares <= 0) return cash;
  return cash + shares * price * (1 - feeRate);
}

type BarSignal = { entry: boolean; exit: boolean };

function signalsEmaCross(
  candles: Candle[],
  fast: number,
  slow: number
): BarSignal[] {
  const closes = candles.map((c) => c.close);
  const eF = ema(closes, fast);
  const eS = ema(closes, slow);
  return candles.map((_, i) => {
    if (i < 1) return { entry: false, exit: false };
    const crossUp = eF[i - 1] <= eS[i - 1] && eF[i] > eS[i];
    const crossDn = eF[i - 1] >= eS[i - 1] && eF[i] < eS[i];
    return { entry: crossUp, exit: crossDn };
  });
}

function signalsRsiRevert(
  candles: Candle[],
  period: number,
  buyLevel: number,
  sellLevel: number
): BarSignal[] {
  const closes = candles.map((c) => c.close);
  const rsi = computeRsi(closes, period);
  const out: BarSignal[] = candles.map(() => ({ entry: false, exit: false }));
  let wasOversold = false;
  for (let i = period; i < candles.length; i++) {
    if (rsi[i] < buyLevel) wasOversold = true;
    const entry = wasOversold && rsi[i] > buyLevel + 2;
    if (entry) wasOversold = false;
    const exit = rsi[i] > sellLevel;
    out[i] = { entry, exit };
  }
  return out;
}

function signalsBollBreak(candles: Candle[], period: number, mult: number): BarSignal[] {
  const closes = candles.map((c) => c.close);
  const boll = computeBollinger(closes, period, mult);
  return candles.map((c, i) => {
    if (i < period) return { entry: false, exit: false };
    const entry = c.close > boll.upper[i];
    const exit = c.close < boll.middle[i];
    return { entry, exit };
  });
}

function signalsMacdZero(candles: Candle[]): BarSignal[] {
  const closes = candles.map((c) => c.close);
  const { macd } = computeMacd(closes);
  return candles.map((_, i) => {
    if (i < 2) return { entry: false, exit: false };
    const crossUp = macd[i - 1] <= 0 && macd[i] > 0;
    const crossDn = macd[i - 1] >= 0 && macd[i] < 0;
    return { entry: crossUp, exit: crossDn };
  });
}

function signalsEmaRsiFilter(
  candles: Candle[],
  fast: number,
  slow: number,
  rsiPeriod: number
): BarSignal[] {
  const closes = candles.map((c) => c.close);
  const eF = ema(closes, fast);
  const eS = ema(closes, slow);
  const rsi = computeRsi(closes, rsiPeriod);
  return candles.map((_, i) => {
    if (i < 1) return { entry: false, exit: false };
    const crossUp = eF[i - 1] <= eS[i - 1] && eF[i] > eS[i];
    const crossDn = eF[i - 1] >= eS[i - 1] && eF[i] < eS[i];
    const r = rsi[i];
    const entry = crossUp && Number.isFinite(r) && r < 60;
    const exit = crossDn || (Number.isFinite(r) && r > 75);
    return { entry, exit };
  });
}

function feeRate(notional: number, side: "buy" | "sell", costs: AShareCostProfile): number {
  if (!costs.enabled || notional <= 0) return 0;
  const comm = Math.max(
    notional * (costs.commissionBps / 10_000),
    costs.minCommissionCny / costs.cashScaleCny
  );
  const stamp =
    side === "sell" ? notional * (costs.stampDutySellBps / 10_000) : 0;
  return (comm + stamp) / notional;
}

function cnDayId(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

function buildSignals(
  strategy: BacktestStrategyId,
  candles: Candle[],
  p: BacktestParams
): BarSignal[] {
  switch (strategy) {
    case "ema_cross":
      return signalsEmaCross(candles, p.emaFast, p.emaSlow);
    case "ema_rsi_filter":
      return signalsEmaRsiFilter(candles, p.emaFast, p.emaSlow, p.rsiPeriod);
    case "rsi_revert":
      return signalsRsiRevert(candles, p.rsiPeriod, p.rsiBuy, p.rsiSell);
    case "boll_break":
      return signalsBollBreak(candles, p.bollPeriod, p.bollMult);
    case "macd_zero":
      return signalsMacdZero(candles);
    default:
      return candles.map(() => ({ entry: false, exit: false }));
  }
}

export function runBacktest(
  candles: Candle[],
  strategy: BacktestStrategyId,
  params: BacktestParams = DEFAULT_BACKTEST_PARAMS,
  costs: AShareCostProfile = DEFAULT_A_SHARE_COSTS
): BacktestResult | null {
  const minBars =
    strategy === "ema_cross" || strategy === "ema_rsi_filter"
      ? Math.max(params.emaSlow, 30) + 5
      : strategy === "rsi_revert"
        ? params.rsiPeriod + 10
        : 40;
  if (candles.length < minBars) return null;

  const signals = buildSignals(strategy, candles, params);
  const simpleFee = params.feeBps / 10_000;

  let cash = INITIAL_CASH;
  let shares = 0;
  let entryCost = 0;
  let entryPrice = 0;
  let entryBar = 0;
  let entryDay = "";

  const closedTrades: ClosedTrade[] = [];
  const tradeLog: TradeLogEntry[] = [];
  const equityCurve: number[] = [];
  let peak = INITIAL_CASH;
  let maxDd = 0;

  const firstPx = candles[0].close;
  const buyFee0 = costs.enabled ? feeRate(INITIAL_CASH, "buy", costs) : simpleFee;
  let benchShares = (INITIAL_CASH * (1 - buyFee0)) / firstPx;

  for (let i = 0; i < candles.length; i++) {
    const sig = signals[i];
    const px = candles[i].close;
    const t = candles[i].time;
    const day = cnDayId(t);
    const t1Blocked =
      costs.enabled &&
      costs.tPlusOne &&
      shares > 0 &&
      entryDay !== "" &&
      day === entryDay;

    if (shares <= 0 && sig.entry) {
      const buyFee = costs.enabled ? feeRate(cash, "buy", costs) : simpleFee;
      const buyValue = cash * (1 - buyFee);
      shares = buyValue / px;
      entryCost = cash;
      entryPrice = px;
      entryBar = i;
      entryDay = day;
      cash = 0;
      tradeLog.push({ kind: "buy", time: t, price: px });
    } else if (shares > 0 && sig.exit && !t1Blocked) {
      const grossProceeds = shares * px;
      const sellFee = costs.enabled
        ? feeRate(grossProceeds, "sell", costs)
        : simpleFee;
      cash = grossProceeds * (1 - sellFee);
      const pnl = cash - entryCost;
      const returnPct = entryCost > 0 ? (pnl / entryCost) * 100 : 0;
      closedTrades.push({ pnl, returnPct });
      tradeLog.push({
        kind: "sell",
        time: t,
        price: px,
        pnl,
        returnPct,
        holdBars: i - entryBar,
      });
      shares = 0;
      entryCost = 0;
      entryPrice = 0;
      entryDay = "";
    }

    const markFee = costs.enabled ? feeRate(px * Math.max(shares, 0), "sell", costs) : simpleFee;
    const equity = markEquity(cash, shares, px, markFee);
    equityCurve.push(equity);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - equity) / peak);
  }

  const lastPx = candles[candles.length - 1].close;
  const lastMarkFee = costs.enabled
    ? feeRate(lastPx * Math.max(shares, 0), "sell", costs)
    : simpleFee;
  const equityFinal = markEquity(cash, shares, lastPx, lastMarkFee);
  const sellBenchFee = costs.enabled
    ? feeRate(benchShares * lastPx, "sell", costs)
    : simpleFee;
  const benchFinal = benchShares * lastPx * (1 - sellBenchFee);
  const benchmarkReturnPct =
    ((benchFinal - INITIAL_CASH) / INITIAL_CASH) * 100;

  const benchmarkCurve = candles.map((c) => {
    const f = costs.enabled
      ? feeRate(benchShares * c.close, "sell", costs)
      : simpleFee;
    return benchShares * c.close * (1 - f);
  });

  let openPosition = null as BacktestStats["openPosition"];
  if (shares > 0) {
    const liquid = shares * lastPx * (1 - lastMarkFee);
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
  if (n === 0) profitLossRatio = null;
  else if (losses.length === 0) {
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
    equityCurve,
    benchmarkCurve,
    tradeLog,
    benchmarkReturnPct,
  };
}