import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

export interface QuoteMap {
  [symbol: string]: {
    price: number | null;
    changePct: number | null;
    sparkline?: number[];
  };
}

export function useWatchlistQuotes(symbols: string[], active: string, activePrice: number) {
  const [quotes, setQuotes] = useState<QuoteMap>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${API}/quotes?symbols=${encodeURIComponent(symbols.join(","))}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as QuoteMap;
        if (!cancelled) setQuotes(data);
      } catch {
        /* offline */
      }
    };

    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbols.join(",")]);

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