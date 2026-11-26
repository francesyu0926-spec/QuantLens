import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

type Pulse = {
  phase?: string | null;
  limit_up?: number | null;
  limit_down?: number | null;
  note?: string;
};

export function MarketPulseBar() {
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API}/market/pulse`);
        if (!res.ok) return;
        const data = (await res.json()) as Pulse;
        if (!cancelled) setPulse(data);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!pulse) return null;
  const auction = pulse.phase === "call_auction";

  return (
    <div
      className={`market-pulse${auction ? " market-pulse--auction" : ""}`}
      role="status"
    >
      {auction && <span className="market-pulse-tag">集合竞价</span>}
      {pulse.limit_up != null && (
        <span className="market-pulse-item">
          涨停 <strong className="up">{pulse.limit_up}</strong>
        </span>
      )}
      {pulse.limit_down != null && (
        <span className="market-pulse-item">
          跌停 <strong className="down">{pulse.limit_down}</strong>
        </span>
      )}
      {pulse.note && <span className="market-pulse-note muted">{pulse.note}</span>}
    </div>
  );
}