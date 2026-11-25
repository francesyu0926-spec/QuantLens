import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";
const BATCH_SIZE = 20;
const BATCH_GAP_MS = 250;
const POLL_MS = 60_000;
const MAX_PER_ROUND = 50;

export interface QuoteMap {
  [symbol: string]: {
    price: number | null;
    changePct: number | null;
    sparkline?: number[];
  };
}

async function fetchQuoteBatch(symbols: string[]): Promise<QuoteMap> {
  if (symbols.length === 0) return {};
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(
      `${API}/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
      { signal: controller.signal }
    );
    if (!res.ok) return {};
    return (await res.json()) as QuoteMap;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export function useWatchlistQuotes(
  symbols: string[],
  active: string,
  activePrice: number
) {
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const symbolKey = symbols.join("\0");
  const roundRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const unique = [...new Set(symbols)];
      const ordered = [active, ...unique.filter((s) => s !== active)].filter(
        Boolean
      );
      const start =
        unique.length <= MAX_PER_ROUND
          ? 0
          : (roundRef.current * MAX_PER_ROUND) % ordered.length;
      const head: string[] = [];
      for (let i = 0; i < Math.min(MAX_PER_ROUND, ordered.length); i++) {
        head.push(ordered[(start + i) % ordered.length]);
      }
      if (!head.includes(active)) head.unshift(active);
      roundRef.current += 1;

      try {
        for (let i = 0; i < head.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const chunk = head.slice(i, i + BATCH_SIZE);
          const data = await fetchQuoteBatch(chunk);
          if (cancelled) return;
          setQuotes((q) => {
            const next = { ...q };
            for (const sym of chunk) {
              const row = data[sym];
              if (!row || typeof row !== "object") continue;
              next[sym] = {
                price:
                  typeof row.price === "number" && Number.isFinite(row.price)
                    ? row.price
                    : null,
                changePct:
                  typeof row.changePct === "number" &&
                  Number.isFinite(row.changePct)
                    ? row.changePct
                    : null,
                sparkline: Array.isArray(row.sparkline)
                  ? row.sparkline
                  : undefined,
              };
            }
            return next;
          });
          if (i + BATCH_SIZE < head.length) {
            await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
          }
        }
      } catch {
        /* offline */
      }
    };

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolKey, active]);

  useEffect(() => {
    if (activePrice > 0) {
      setQuotes((q) => ({
        ...q,
        [active]: {
          ...q[active],
          price: activePrice,
        },
      }));
    }
  }, [active, activePrice]);

  return quotes;
}