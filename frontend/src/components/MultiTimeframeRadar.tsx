import { useEffect, useMemo, useState } from "react";
import { analyzeMtfResonance, type MtfFrame } from "../utils/mtfResonance";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

type Frame = MtfFrame;

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

  const display = useMemo(() => {
    const want = new Set(["5m", "15m", "1h", "1d"]);
    const picked = frames.filter((f) => want.has(f.interval));
    return picked.length > 0 ? picked : frames.slice(0, 4);
  }, [frames]);

  const resonance = useMemo(
    () => analyzeMtfResonance(display),
    [display]
  );

  if (display.length === 0) return null;

  return (
    <section className="radar-matrix" aria-label="多周期共振">
      <span className="radar-title">多周期扫描</span>
      {display.map((f) => (
        <div key={f.interval} className={`radar-cell trend-${f.trend}`}>
          <strong>{f.interval}</strong>
          <span>{f.trend === "bull" ? "多" : f.trend === "bear" ? "空" : "—"}</span>
          <span className="rsi">
            RSI {f.rsi != null ? f.rsi.toFixed(0) : "—"}
          </span>
        </div>
      ))}
      <p className="radar-resonance">
        <strong>{resonance.headline}</strong>
        <span className="muted">{resonance.detail}</span>
      </p>
    </section>
  );
}