import { useEffect, useMemo, useState } from "react";
import type { WatchlistItem } from "../types/market";

interface Props {
  items: WatchlistItem[];
  active: string;
  onSelect: (symbol: string) => void;
}

type GroupKey = "crypto" | "us" | "a_share";

const GROUP_LABEL: Record<GroupKey, string> = {
  crypto: "加密货币",
  us: "美股",
  a_share: "A 股",
};

function classify(symbol: string): GroupKey {
  if (symbol.includes("/")) return "crypto";
  if (/^\d{6}$/.test(symbol)) return "a_share";
  return "us";
}

function Sparkline({ values }: { values?: number[] }) {
  if (!values || values.length < 2) {
    return <svg className="spark" viewBox="0 0 64 20" aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 64;
      const y = 18 - ((v - min) / range) * 16;
      return `${x},${y}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className="spark" viewBox="0 0 64 20" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "#3fb950" : "#f85149"}
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function Watchlist({ items, active, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const activeGroup = classify(active);
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    crypto: activeGroup !== "crypto",
    us: activeGroup !== "us",
    a_share: activeGroup !== "a_share",
  });

  useEffect(() => {
    const g = classify(active);
    setCollapsed({
      crypto: g !== "crypto",
      us: g !== "us",
      a_share: g !== "a_share",
    });
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.symbol.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map: Record<GroupKey, WatchlistItem[]> = {
      crypto: [],
      us: [],
      a_share: [],
    };
    for (const item of filtered) {
      map[classify(item.symbol)].push(item);
    }
    return map;
  }, [filtered]);

  return (
    <aside className="watchlist">
      <h2>自选</h2>
      <label className="watch-search-wrap">
        <span className="watch-search-icon" aria-hidden>
          ⌕
        </span>
        <input
          className="watch-search"
          placeholder="搜索代码 / 名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {(Object.keys(grouped) as GroupKey[]).map((key) => {
        const rows = grouped[key];
        if (rows.length === 0) return null;
        const shut = collapsed[key];
        return (
          <section key={key} className="watch-group">
            <button
              type="button"
              className="group-head"
              onClick={() =>
                setCollapsed((c) => ({ ...c, [key]: !c[key] }))
              }
            >
              <span>{GROUP_LABEL[key]}</span>
              <span>{shut ? "▸" : "▾"}</span>
            </button>
            {!shut && (
              <ul>
                {rows.map((item) => (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      className={item.symbol === active ? "active" : ""}
                      onClick={() => onSelect(item.symbol)}
                    >
                      <span className="sym">{item.symbol}</span>
                      <span className="name">{item.name}</span>
                      <Sparkline values={item.sparkline} />
                      <span className="px">
                        {item.price == null || item.price <= 0
                          ? "—"
                          : item.price.toFixed(2)}
                      </span>
                      <span
                        className={
                          item.changePct == null
                            ? "chg"
                            : item.changePct >= 0
                              ? "chg up"
                              : "chg down"
                        }
                      >
                        {item.changePct == null
                          ? "—"
                          : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}