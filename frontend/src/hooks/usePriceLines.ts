import { useCallback, useEffect, useState } from "react";

export interface PriceLineDef {
  id: string;
  price: number;
  label: string;
  color: string;
  /** 价格触及该线时触发声音/通知 */
  alert?: boolean;
}

const keyFor = (symbol: string) => `quantlens.priceLines.${symbol}`;

export function usePriceLines(symbol: string) {
  const [lines, setLines] = useState<PriceLineDef[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(symbol));
      setLines(raw ? (JSON.parse(raw) as PriceLineDef[]) : []);
    } catch {
      setLines([]);
    }
  }, [symbol]);

  const persist = useCallback(
    (next: PriceLineDef[]) => {
      setLines(next);
      const clipped = next.slice(0, 12);
      const storageKey = keyFor(symbol);
      localStorage.setItem(storageKey, JSON.stringify(clipped));
      void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
        syncUserDataKey(storageKey, clipped)
      );
    },
    [symbol]
  );

  const addLine = useCallback(
    (price: number, label = "关键价位") => {
      const color =
        label.includes("止损") ? "#f85149" : label.includes("止盈") ? "#3fb950" : "#58a6ff";
      persist([
        ...lines,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          price,
          label,
          color,
          alert: true,
        },
      ]);
    },
    [lines, persist]
  );

  const removeLine = useCallback(
    (id: string) => persist(lines.filter((l) => l.id !== id)),
    [lines, persist]
  );

  const toggleLineAlert = useCallback(
    (id: string) => {
      persist(
        lines.map((l) => (l.id === id ? { ...l, alert: !l.alert } : l))
      );
    },
    [lines, persist]
  );

  return { lines, addLine, removeLine, toggleLineAlert, setLines: persist };
}