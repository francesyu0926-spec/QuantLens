export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  ema20?: number;
  ema50?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  macd_hist?: number;
  atr?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
}

export interface AlertSignal {
  id: string;
  symbol: string;
  rule: string;
  message: string;
  price: number;
  ts: number;
}

export interface MarketPacket {
  type: "market";
  symbol: string;
  price: number;
  candle: Candle;
  indicators: Indicators;
  signals: AlertSignal[];
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}