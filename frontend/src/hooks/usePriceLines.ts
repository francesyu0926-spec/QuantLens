import { useCallback, useEffect, useState } from "react";

export interface PriceLineDef {
  id: string;
  price: number;
  label: string;
  color: string;
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
      localStorage.setItem(keyFor(symbol), JSON.stringify(next.slice(0, 12)));
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
        },
      ]);
    },
    [lines, persist]
  );

  const removeLine = useCallback(
    (id: string) => persist(lines.filter((l) => l.id !== id)),
    [lines, persist]
  );

  return { lines, addLine, removeLine, setLines: persist };
}