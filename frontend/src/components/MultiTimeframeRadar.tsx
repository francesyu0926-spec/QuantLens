import { useEffect, useMemo, useState } from "react";
import {
  analyzeMtfResonance,
  frameScanLine,
  pickResonanceFrames,
  trendArrow,
  type MtfFrame,
} from "../utils/mtfResonance";
import { INTERVALS, type TimeInterval } from "../types/chart";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

interface Props {
  symbol: string;
  onPickInterval?: (interval: TimeInterval) => void;
}

function toTimeInterval(iv: string): TimeInterval | null {
  return (INTERVALS as readonly string[]).includes(iv)
    ? (iv as TimeInterval)
    : null;
}

function trendCn(t: MtfFrame["trend"]) {
  return t === "bull" ? "多" : t === "bear" ? "空" : "平";
}

export function MultiTimeframeRadar({ symbol, onPickInterval }: Props) {
  const [frames, setFrames] = useState<MtfFrame[]>([]);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `${API}/radar?symbol=${encodeURIComponent(symbol)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { frames?: MtfFrame[] };
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

  const display = useMemo(() => pickResonanceFrames(frames), [frames]);

  const resonance = useMemo(
    () => analyzeMtfResonance(display.length ? display : frames),
    [display, frames]
  );

  if (display.length === 0 && frames.length === 0) return null;

  const ordered = display.length > 0 ? display : frames.slice(0, 4);

  return (
    <section className="radar-matrix radar-matrix--compact" aria-label="多周期共振">
      <p
        className="radar-headline"
        onMouseEnter={() => setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        onFocus={() => setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
        tabIndex={0}
        title={resonance.tooltip}
      >
        {resonance.headline}
        {tipOpen && (
          <span className="radar-tip" role="tooltip">
            {resonance.tooltip}
          </span>
        )}
      </p>
      <div className="radar-capsules" role="list">
        {ordered.map((f) => {
          const iv = toTimeInterval(f.interval);
          const clickable = Boolean(onPickInterval && iv);
          return (
            <button
              key={f.interval}
              type="button"
              role="listitem"
              className={`radar-cap trend-${f.trend}${
                clickable ? " is-clickable" : ""
              }`}
              title={`${frameScanLine(f)} · 点击切换 ${f.interval}`}
              disabled={!clickable}
              onClick={() => iv && onPickInterval?.(iv)}
            >
              <span className="radar-cap-iv">{f.interval}</span>
              <span className="radar-cap-bias" aria-hidden>
                {trendArrow(f.trend)}
                {trendCn(f.trend)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}