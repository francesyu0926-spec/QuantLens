import type { AlertSignal } from "../types/market";

interface Props {
  signals: AlertSignal[];
}

export function SignalLog({ signals }: Props) {
  return (
    <section className="signal-log">
      <h2>策略信号</h2>
      <div className="log-scroll">
        {signals.length === 0 && (
          <p className="muted">等待规则触发…</p>
        )}
        {signals.map((sig) => (
          <article key={sig.id} className="signal-item">
            <time>{new Date(sig.ts).toLocaleTimeString()}</time>
            <strong>{sig.symbol}</strong>
            <span>{sig.message}</span>
            <span className="price">@{sig.price.toFixed(2)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}