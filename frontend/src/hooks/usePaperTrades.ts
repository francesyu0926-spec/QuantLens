import { useCallback, useMemo, useState } from "react";

export interface PaperTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  time: number;
  qty: number;
}

const STORAGE_KEY = "quantlens-paper-trades";

function loadAll(): Record<string, PaperTrade[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PaperTrade[]>;
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, PaperTrade[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function usePaperTrades(symbol: string) {
  const [version, setVersion] = useState(0);

  const trades = useMemo(() => {
    void version;
    return loadAll()[symbol] ?? [];
  }, [symbol, version]);

  const openPosition = useMemo(() => {
    let entry: number | null = null;
    let qty = 0;
    let entryTime: number | null = null;
    for (const t of trades) {
      if (t.side === "buy") {
        entry = t.price;
        qty = t.qty;
        entryTime = t.time;
      } else if (t.side === "sell") {
        entry = null;
        qty = 0;
        entryTime = null;
      }
    }
    if (entry == null || qty <= 0) return null;
    return { entry, qty, entryTime };
  }, [trades]);

  const push = useCallback(
    (side: "buy" | "sell", price: number, qty: number) => {
      if (!(price > 0 && qty > 0)) return;
      const all = loadAll();
      const list = all[symbol] ?? [];
      const row: PaperTrade = {
        id: `${Date.now()}-${side}`,
        symbol,
        side,
        price,
        time: Math.floor(Date.now() / 1000),
        qty,
      };
      all[symbol] = [...list, row];
      saveAll(all);
      setVersion((v) => v + 1);
    },
    [symbol]
  );

  const buy = useCallback(
    (price: number, qty: number) => push("buy", price, qty),
    [push]
  );

  const sell = useCallback(
    (price: number, qty: number) => push("sell", price, qty),
    [push]
  );

  return { trades, openPosition, buy, sell };
}