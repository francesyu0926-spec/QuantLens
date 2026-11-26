import { useCallback, useEffect, useState } from "react";

export interface JournalEntry {
  id: string;
  symbol: string;
  interval: string;
  ts: number;
  price: number;
  note: string;
  tags: string[];
}

const STORAGE_KEY = "quantlens-trading-journal";
export const JOURNAL_CHANGED_EVENT = "quantlens-journal-changed";

function load(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as JournalEntry[];
  } catch {
    return [];
  }
}

function save(rows: JournalEntry[]) {
  const clipped = rows.slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clipped));
  void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
    syncUserDataKey(STORAGE_KEY, clipped)
  );
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT));
  }
}

export function useTradingJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => load());

  useEffect(() => {
    const refresh = () => setEntries(load());
    window.addEventListener(JOURNAL_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(JOURNAL_CHANGED_EVENT, refresh);
  }, []);

  const addEntry = useCallback(
    (input: Omit<JournalEntry, "id" | "ts">) => {
      const row: JournalEntry = {
        ...input,
        id: `${Date.now()}`,
        ts: Date.now(),
      };
      const next = [row, ...load()].slice(0, 200);
      save(next);
      setEntries(next);
      return row;
    },
    []
  );

  const removeEntry = useCallback((id: string) => {
    const next = load().filter((e) => e.id !== id);
    save(next);
    setEntries(next);
  }, []);

  return { entries, addEntry, removeEntry };
}