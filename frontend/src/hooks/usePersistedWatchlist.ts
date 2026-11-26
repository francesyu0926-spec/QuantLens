import { useCallback, useMemo, useState } from "react";
import { WATCHLIST_CATALOG } from "../data/watchlistCatalog";
import type { WatchlistItem } from "../types/market";

const STORAGE_KEY = "quantlens.watchlist.extra";

type SeedItem = Omit<WatchlistItem, "price" | "changePct">;

function loadExtra(): SeedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SeedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExtra(items: SeedItem[]) {
  try {
    const clipped = items.slice(0, 80);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clipped));
    void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
      syncUserDataKey(STORAGE_KEY, clipped)
    );
  } catch {
    /* quota */
  }
}

export function usePersistedWatchlist() {
  const [extra, setExtra] = useState<SeedItem[]>(() => loadExtra());

  const items = useMemo((): SeedItem[] => {
    const seen = new Set<string>();
    const out: SeedItem[] = [];
    for (const row of [...WATCHLIST_CATALOG, ...extra]) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      out.push(row);
    }
    return out;
  }, [extra]);

  const addSymbol = useCallback((symbol: string, name: string) => {
    setExtra((prev) => {
      if (prev.some((p) => p.symbol === symbol)) return prev;
      if (WATCHLIST_CATALOG.some((p) => p.symbol === symbol)) return prev;
      const next = [{ symbol, name }, ...prev];
      saveExtra(next);
      return next;
    });
  }, []);

  const symbolList = useMemo(() => items.map((i) => i.symbol), [items]);

  return { items, addSymbol, symbolList };
}