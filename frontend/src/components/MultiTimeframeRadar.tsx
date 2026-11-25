import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

interface Frame {
  interval: string;
  trend: "bull" | "bear" | "neutral";
  rsi: number | null;
}

interface Props {
  symbol: string;
}

export function MultiTimeframeRadar({ symbol }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `${API}/radar?symbol=${encodeURIComponent(symbol)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { frames?: Frame[] };
        if (!cancelled) setFrames(data.frames ?? []);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (frames.length === 0) return null;

  return (
    <section className="radar-matrix" aria-label="多周期共振">
      <span className="radar-title">共振雷达</span>
      {frames.map((f) => (
        <div key={f.interval} className={`radar-cell trend-${f.trend}`}>
          <strong>{f.interval}</strong>
          <span>{f.trend === "bull" ? "多" : f.trend === "bear" ? "空" : "—"}</span>
          <span className="rsi">
            RSI {f.rsi != null ? f.rsi.toFixed(0) : "—"}
          </span>
        </div>
      ))}
    </section>
  );
}