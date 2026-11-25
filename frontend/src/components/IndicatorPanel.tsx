import type { Indicators } from "../types/market";

interface Props {
  indicators: Indicators;
  price: number;
}

function Chip({ label, value }: { label: string; value?: number }) {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return (
    <span className="ind-chip">
      <span>{label}</span>
      <strong>{value.toFixed(3)}</strong>
    </span>
  );
}

export function IndicatorPanel({ indicators, price }: Props) {
  return (
    <section className="indicator-strip" aria-label="实时指标">
      <Chip label="最新" value={price > 0 ? price : undefined} />
      <Chip label="EMA20" value={indicators.ema20} />
      <Chip label="EMA50" value={indicators.ema50} />
      <Chip label="RSI" value={indicators.rsi} />
      <Chip label="MACD" value={indicators.macd} />
      <Chip label="Signal" value={indicators.macd_signal} />
      <Chip label="BB上" value={indicators.bb_upper} />
      <Chip label="BB下" value={indicators.bb_lower} />
    </section>
  );
}