import { useEffect, useState } from "react";
import type { AlertSignal } from "../types/market";
import type { TimeInterval } from "../types/chart";
import { fetchKlinesResilient } from "../utils/marketApi";
import { backfillEmaSignals } from "../utils/signalHistory";

export function useWatchlistEmaSignals(
  symbols: string[],
  interval: TimeInterval,
  enabled: boolean
) {
  const [signals, setSignals] = useState<AlertSignal[]>([]);
  const key = symbols.join("\0");

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      setSignals([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const batch = symbols.slice(0, 10);
      const acc: AlertSignal[] = [];
      for (const sym of batch) {
        if (cancelled) return;
        try {
          const snap = await fetchKlinesResilient(sym, interval);
          if (snap.candles.length > 0) {
            acc.push(...backfillEmaSignals(sym, snap.candles, 5));
          }
        } catch {
          /* skip symbol */
        }
      }
      if (!cancelled) {
        acc.sort((a, b) => b.ts - a.ts);
        setSignals(acc.slice(0, 80));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [key, interval, enabled, symbols]);

  return signals;
}