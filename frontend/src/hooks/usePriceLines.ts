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

function readLinesForSymbol(symbol: string): PriceLineDef[] {
  try {
    const raw = localStorage.getItem(keyFor(symbol));
    return raw ? (JSON.parse(raw) as PriceLineDef[]) : [];
  } catch {
    return [];
  }
}

type LinesUpdater =
  | PriceLineDef[]
  | ((prev: PriceLineDef[]) => PriceLineDef[]);

export function usePriceLines(symbol: string) {
  const [lines, setLines] = useState<PriceLineDef[]>(() =>
    readLinesForSymbol(symbol)
  );

  const reloadFromStorage = useCallback(() => {
    setLines(readLinesForSymbol(symbol));
  }, [symbol]);

  useEffect(() => {
    reloadFromStorage();
  }, [reloadFromStorage]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyFor(symbol)) reloadFromStorage();
    };
    const onSynced = () => reloadFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener("quantlens-userdata-synced", onSynced);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("quantlens-userdata-synced", onSynced);
    };
  }, [symbol, reloadFromStorage]);

  const persist = useCallback(
    (next: LinesUpdater) => {
      setLines((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const clipped = resolved.slice(0, 12);
        const storageKey = keyFor(symbol);
        localStorage.setItem(storageKey, JSON.stringify(clipped));
        void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
          syncUserDataKey(storageKey, clipped)
        );
        return clipped;
      });
    },
    [symbol]
  );

  const addLine = useCallback(
    (price: number, label = "关键价位") => {
      const color =
        label.includes("止损")
          ? "#f85149"
          : label.includes("止盈")
            ? "#3fb950"
            : "#58a6ff";
      persist((prev) => {
        const dup = prev.some((l) => Math.abs(l.price - price) < 0.005);
        if (dup) return prev;
        return [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            price,
            label,
            color,
            alert: true,
          },
        ];
      });
    },
    [persist]
  );

  const removeLine = useCallback(
    (id: string) => persist((prev) => prev.filter((l) => l.id !== id)),
    [persist]
  );

  const toggleLineAlert = useCallback(
    (id: string) => {
      persist((prev) =>
        prev.map((l) => (l.id === id ? { ...l, alert: !l.alert } : l))
      );
    },
    [persist]
  );

  const clearLines = useCallback(() => persist([]), [persist]);

  return {
    lines,
    addLine,
    removeLine,
    toggleLineAlert,
    clearLines,
    setLines: persist,
  };
}