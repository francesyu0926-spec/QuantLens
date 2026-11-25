import type { Indicators } from "../types/market";

interface Props {
  indicators: Indicators;
  price: number;
}

function Row({ label, value }: { label: string; value?: number }) {
  if (value == null || Number.isNaN(value)) return null;
  return (
    <div className="ind-row">
      <span>{label}</span>
      <span>{value.toFixed(4)}</span>
    </div>
  );
}

export function IndicatorPanel({ indicators, price }: Props) {
  return (
    <section className="indicator-panel">
      <h3>实时指标</h3>
      <Row label="最新价" value={price} />
      <Row label="EMA(20)" value={indicators.ema20} />
      <Row label="EMA(50)" value={indicators.ema50} />
      <Row label="RSI(14)" value={indicators.rsi} />
      <Row label="MACD" value={indicators.macd} />
      <Row label="Signal" value={indicators.macd_signal} />
      <Row label="Hist" value={indicators.macd_hist} />
      <Row label="ATR(14)" value={indicators.atr} />
      <Row label="BB Upper" value={indicators.bb_upper} />
      <Row label="BB Mid" value={indicators.bb_middle} />
      <Row label="BB Lower" value={indicators.bb_lower} />
    </section>
  );
}