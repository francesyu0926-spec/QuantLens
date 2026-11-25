import type { WatchlistItem } from "../types/market";

interface Props {
  items: WatchlistItem[];
  active: string;
  onSelect: (symbol: string) => void;
}

export function Watchlist({ items, active, onSelect }: Props) {
  return (
    <aside className="watchlist">
      <h2>自选</h2>
      <ul>
        {items.map((item) => (
          <li key={item.symbol}>
            <button
              type="button"
              className={item.symbol === active ? "active" : ""}
              onClick={() => onSelect(item.symbol)}
            >
              <span className="sym">{item.symbol}</span>
              <span className="px">{item.price.toFixed(2)}</span>
              <span
                className={
                  item.changePct >= 0 ? "chg up" : "chg down"
                }
              >
                {item.changePct >= 0 ? "+" : ""}
                {item.changePct.toFixed(2)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}