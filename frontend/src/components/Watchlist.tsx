import { useEffect, useMemo, useRef, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";
import { isAShareSessionOpen } from "../utils/marketSession";
import type { PriceColors } from "../utils/priceColors";
import type { WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import { PINNED_A_SHARE_SYMBOLS } from "../config/pinnedWatchlist";
import { ScreenerModal } from "./ScreenerModal";
import { MarketIndexStrip } from "./MarketIndexStrip";
import { MarketSentimentBar } from "./MarketSentimentBar";
import { Sparkline } from "./Sparkline";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

interface Props {
  items: WatchlistItem[];
  poolItems?: WatchlistItem[];
  active: string;
  onSelect: (symbol: string) => void;
  onAddSymbol?: (symbol: string, name: string) => void;
  quotesLoading?: boolean;
  onVisibleSymbols?: (symbols: string[]) => void;
  priceColors: PriceColors;
  quotes?: QuoteMap;
  screenerActive?: boolean;
  onScreenerResult?: (symbols: string[] | null) => void;
  onCollapsePanel?: () => void;
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
  const hasQuote = item.price != null && item.price > 0;

  return (
    <li className="watch-li" data-symbol={item.symbol}>
      <button
        type="button"
        className={`watch-row${item.symbol === active ? " active" : ""}${
          !hasQuote ? " no-quote" : ""
        }`}
        onClick={() => onSelect(item.symbol)}
      >
        <div className="watch-ident">
          <span className="name" title={item.name || item.symbol}>
            {item.name?.trim() || item.symbol || "—"}
          </span>
          {hasQuote && item.changePct != null ? (
            <span
              className={
                item.changePct >= 0 ? "chg up" : "chg down"
              }
            >
              {item.changePct >= 0 ? "+" : ""}
              {item.changePct.toFixed(2)}%
            </span>
          ) : (
            <span className="sym muted" title={item.symbol}>
              {item.symbol || "—"}
            </span>
          )}
        </div>
        {hasQuote ? (
          <Sparkline values={item.sparkline} colors={priceColors} />
        ) : (
          <span className="watch-spark-placeholder" aria-hidden />
        )}
        <div className="watch-quote">
          {hasQuote ? (
            <span className="px">{item.price!.toFixed(2)}</span>
          ) : (
            <span className="watch-faint-dash">-</span>
          )}
        </div>
      </button>
    </li>
  );
}

export function Watchlist({
  items,
  poolItems,
  active,
  onSelect,
  onAddSymbol,
  quotesLoading,
  onVisibleSymbols,
  priceColors,
  quotes = {},
  screenerActive = false,
  onScreenerResult,
  onCollapsePanel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [screenerOpen, setScreenerOpen] = useState(false);
  const sessionOpen = isAShareSessionOpen();
  const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
  const activeGroup = classify(active);
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    crypto: activeGroup !== "crypto",
    us: activeGroup !== "us",
    a_share: activeGroup !== "a_share",
  });
  const [poolOpen, setPoolOpen] = useState(false);

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
      <div className="watch-title-row">
        {onCollapsePanel && (
          <button
            type="button"
            className="watch-fold"
            title="收起自选 (F 专注)"
            aria-label="收起自选"
            onClick={onCollapsePanel}
          >
            ◂
          </button>
        )}
        <h2>{A_SHARE_ONLY ? "A 股自选" : "自选"}</h2>
        <button
          type="button"
          className={`watch-screener${screenerActive ? " on" : ""}`}
          title="条件选股"
          onClick={() => setScreenerOpen(true)}
        >
          ⛃
        </button>
      </div>
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
      {screenerActive && (
        <p className="watch-hint muted">筛选结果 {items.length} 只</p>
      )}
      <ScreenerModal
        open={screenerOpen}
        items={poolItems ?? items}
        quotes={quotes}
        onClose={() => setScreenerOpen(false)}
        onResult={(syms) => onScreenerResult?.(syms)}
      />
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
              {!shut && key === "a_share" && rows.length > 6 ? (
                <>
                  <p className="watch-subhead muted">精选自选</p>
                  <ul>
                    {(() => {
                      const pinned = new Set<string>(PINNED_A_SHARE_SYMBOLS);
                      const pinnedRows = PINNED_A_SHARE_SYMBOLS.map((sym) =>
                        rows.find((r) => r.symbol === sym)
                      ).filter(Boolean) as WatchlistItem[];
                      const rest = rows.filter(
                        (i) =>
                          !pinned.has(i.symbol) &&
                          ((i.price ?? 0) > 0 || i.symbol === active)
                      );
                      const seen = new Set<string>();
                      const merged: WatchlistItem[] = [];
                      for (const item of [...pinnedRows, ...rest]) {
                        if (seen.has(item.symbol)) continue;
                        seen.add(item.symbol);
                        merged.push(item);
                      }
                      return merged;
                    })().map((item) => (
                        <Row
                          key={item.symbol}
                          item={item}
                          active={active}
                          onSelect={onSelect}
                          priceColors={priceColors}
                        />
                      ))}
                  </ul>
                  {rows.some((i) => (i.price ?? 0) <= 0 && i.symbol !== active) && (
                    <>
                      <button
                        type="button"
                        className="watch-pool-head"
                        onClick={() => setPoolOpen((o) => !o)}
                      >
                        <span>全市场池（点击展开）</span>
                        <span>{poolOpen ? "▾" : "▸"}</span>
                      </button>
                      {poolOpen && (
                        <ul>
                          {rows
                            .filter(
                              (i) => (i.price ?? 0) <= 0 && i.symbol !== active
                            )
                            .map((item) => (
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
                    </>
                  )}
                </>
              ) : (
                !shut && (
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
                )
              )}
            </section>
          );
        })}
      </div>
      <MarketSentimentBar items={items} />
      <MarketIndexStrip
        quotes={quotes}
        priceColors={priceColors}
        onSelect={onSelect}
      />
    </aside>
  );
}