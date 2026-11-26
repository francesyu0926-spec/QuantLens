interface Peer {
  symbol: string;
  name: string;
  change_pct: number;
  price: number;
}

interface Props {
  open: boolean;
  industry: string;
  loading: boolean;
  peers: Peer[];
  onClose: () => void;
  onPick: (symbol: string) => void;
}

export function SectorPeersModal({
  open,
  industry,
  loading,
  peers,
  onClose,
  onPick,
}: Props) {
  if (!open) return null;
  return (
    <div className="sector-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sector-panel"
        role="dialog"
        aria-label="板块联动"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sector-head">
          <h3>板块 · {industry}</h3>
          <button type="button" className="chip" onClick={onClose}>
            关闭
          </button>
        </header>
        {loading && <p className="muted">加载同板块标的…</p>}
        {!loading && peers.length === 0 && (
          <p className="muted">暂无同板块数据</p>
        )}
        <ul className="sector-list">
          {peers.map((p) => (
            <li key={p.symbol}>
              <button
                type="button"
                className="sector-row"
                onClick={() => onPick(p.symbol)}
              >
                <span className="sector-name">{p.name}</span>
                <span className="sector-code muted">{p.symbol}</span>
                <span
                  className={
                    p.change_pct >= 0 ? "sector-pct up" : "sector-pct down"
                  }
                >
                  {p.change_pct >= 0 ? "+" : ""}
                  {p.change_pct.toFixed(2)}%
                </span>
                <span className="sector-px tabular">{p.price.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}