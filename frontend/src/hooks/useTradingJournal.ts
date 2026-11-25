import { useCallback, useState } from "react";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 200)));
}

export function useTradingJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => load());

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