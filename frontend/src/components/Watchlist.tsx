import { useEffect, useMemo, useRef, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";
import { isAShareSessionOpen } from "../utils/marketSession";
import type { PriceColors } from "../utils/priceColors";
import type { WatchlistItem } from "../types/market";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

interface Props {
  items: WatchlistItem[];
  active: string;
  onSelect: (symbol: string) => void;
  onAddSymbol?: (symbol: string, name: string) => void;
  quotesLoading?: boolean;
  onVisibleSymbols?: (symbols: string[]) => void;
  priceColors: PriceColors;
}

type GroupKey = "crypto" | "us" | "a_share";

const GROUP_LABEL: Record<GroupKey, string> = {
  crypto: "加密货币",
  us: "美股",
  a_share: "A 股",
};

interface SearchHit {
  symbol: string;
  name: string;
  market?: string;
}

function classify(symbol: string): GroupKey {
  if (symbol.includes("/")) return "crypto";
  if (/^\d{6}$/.test(symbol)) return "a_share";
  return "us";
}

function Sparkline({
  values,
  colors,
}: {
  values?: number[];
  colors: PriceColors;
}) {
  if (!values || values.length < 2) {
    return null;
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
        stroke={up ? colors.up : colors.down}
        strokeWidth="1.2"
      />
    </svg>
  );
}

function Row({
  item,
  active,
  onSelect,
  priceColors,
}: {
  item: WatchlistItem;
  active: string;
  onSelect: (s: string) => void;
  priceColors: PriceColors;
}) {
  return (
    <li className="watch-li" data-symbol={item.symbol}>
      <button
        type="button"
        className={`watch-row${item.symbol === active ? " active" : ""}`}
        onClick={() => onSelect(item.symbol)}
      >
        <div className="watch-ident">
          <span className="sym" title={item.symbol}>
            {item.symbol || "—"}
          </span>
          <span className="name" title={item.name}>
            {item.name || "—"}
          </span>
        </div>
        <Sparkline values={item.sparkline} colors={priceColors} />
        <div className="watch-quote">
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
        </div>
      </button>
    </li>
  );
}

export function Watchlist({
  items,
  active,
  onSelect,
  onAddSymbol,
  quotesLoading,
  onVisibleSymbols,
  priceColors,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const sessionOpen = isAShareSessionOpen();
  const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
  const activeGroup = classify(active);
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    crypto: activeGroup !== "crypto",
    us: activeGroup !== "us",
    a_share: activeGroup !== "a_share",
  });

  const known = useMemo(() => new Set(items.map((i) => i.symbol)), [items]);

  useEffect(() => {
    const g = classify(active);
    setCollapsed({
      crypto: g !== "crypto",
      us: g !== "us",
      a_share: g !== "a_share",
    });
  }, [active]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteHits([]);
      return;
    }
    const localOk = items.some(
      (i) =>
        i.symbol.toLowerCase().includes(q.toLowerCase()) ||
        i.name.toLowerCase().includes(q.toLowerCase())
    );
    if (localOk) {
      setRemoteHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/catalog/search?q=${encodeURIComponent(q)}&limit=30`
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: SearchHit[] };
        if (!cancelled) setRemoteHits(data.items ?? []);
      } catch {
        if (!cancelled) setRemoteHits([]);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, items]);

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

  const remoteRows = remoteHits.filter((h) => !known.has(h.symbol));

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !onVisibleSymbols) return;

    const intersecting = new Map<Element, boolean>();
    const publish = () => {
      const syms: string[] = [];
      intersecting.forEach((on, el) => {
        if (!on) return;
        const sym = (el as HTMLElement).dataset.symbol;
        if (sym) syms.push(sym);
      });
      onVisibleSymbols(syms);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersecting.set(entry.target, entry.isIntersecting);
        }
        publish();
      },
      { root, rootMargin: "40px 0px", threshold: 0.12 }
    );

    const nodes = root.querySelectorAll<HTMLElement>("li[data-symbol]");
    nodes.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [filtered, collapsed, remoteRows, onVisibleSymbols]);

  return (
    <aside className="watchlist">
      <h2>{A_SHARE_ONLY ? "A 股自选" : "自选"}</h2>
      <label className="watch-search-wrap">
        <span className="watch-search-icon" aria-hidden>
          ⌕
        </span>
        <input
          className="watch-search"
          placeholder={
            A_SHARE_ONLY ? "搜索代码 / 名称 / 全市场" : "搜索代码 / 名称 / A股全市场"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="watch-hint muted">
        已加载 {items.length} 标的 · 支持全市场搜索
      </p>
      {quotesLoading && sessionOpen && (
        <p className="quotes-status">实时报价获取中…</p>
      )}
      <div className="watch-scroll" ref={scrollRef}>
        {remoteRows.length > 0 && (
          <section className="watch-group watch-remote">
            <div className="group-head static">
              <span>市场搜索</span>
              <span>{remoteRows.length}</span>
            </div>
            <ul>
              {remoteRows.map((hit) => (
                <li key={hit.symbol}>
                  <button
                    type="button"
                    className="add-hit"
                    onClick={() => {
                      onAddSymbol?.(hit.symbol, hit.name);
                      onSelect(hit.symbol);
                      setQuery("");
                      setRemoteHits([]);
                    }}
                  >
                    <span className="sym">{hit.symbol}</span>
                    <span className="name">{hit.name}</span>
                    <span className="chg muted">+ 添加</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      {(Object.keys(grouped) as GroupKey[]).map((key) => {
        if (A_SHARE_ONLY && key !== "a_share") return null;
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
                <span>
                  {GROUP_LABEL[key]} ({rows.length})
                </span>
                <span>{shut ? "▸" : "▾"}</span>
              </button>
              {!shut && (
                <ul>
                  {rows.map((item) => (
                    <Row
                      key={item.symbol}
                      item={item}
                      active={active}
                      onSelect={onSelect}
                      priceColors={priceColors}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}