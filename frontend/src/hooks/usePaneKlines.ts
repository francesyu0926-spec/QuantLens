import { useEffect, useState } from "react";
import type { Candle } from "../types/market";
import type { TimeInterval } from "../types/chart";
import { fetchKlinesResilient } from "../utils/marketApi";

export function usePaneKlines(
  symbol: string,
  interval: TimeInterval,
  enabled: boolean
) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedIv, setResolvedIv] = useState(interval);

  useEffect(() => {
    if (!enabled || !symbol) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await fetchKlinesResilient(symbol, interval);
        if (!cancelled) {
          setCandles(snap.candles);
          setResolvedIv(snap.interval);
          if (snap.candles.length === 0) {
            setError("暂无 K 线，请检查后端或稍后重试");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "拉取失败");
          setCandles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval, enabled]);

  return { candles, loading, error, resolvedIv };
}