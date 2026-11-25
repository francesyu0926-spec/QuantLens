import { useState } from "react";
import type { WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import {
  runScreener,
  SCREENER_PRESETS,
  type ScreenerPresetId,
} from "../utils/screener";

interface Props {
  open: boolean;
  items: WatchlistItem[];
  quotes: QuoteMap;
  onClose: () => void;
  onResult: (symbols: string[] | null) => void;
}

export function ScreenerModal({
  open,
  items,
  quotes,
  onClose,
  onResult,
}: Props) {
  const [preset, setPreset] = useState<ScreenerPresetId>("momentum");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  if (!open) return null;

  const run = async () => {
    setRunning(true);
    setProgress("筛选中…");
    try {
      const hits = await runScreener(items, preset, quotes, (d, t) => {
        setProgress(`已扫描 ${d}/${t}`);
      });
      onResult(hits);
      setProgress(`命中 ${hits.length} 只`);
      window.setTimeout(onClose, 400);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="screener-backdrop" role="presentation" onClick={onClose}>
      <div
        className="screener-panel"
        role="dialog"
        aria-label="条件选股"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>条件选股</h3>
        <p className="muted screener-desc">
          在当前自选池内轻量筛选（技术类会并行拉取 K 线）
        </p>
        <ul className="screener-list">
          {SCREENER_PRESETS.map((p) => (
            <li key={p.id}>
              <label className="screener-option">
                <input
                  type="radio"
                  name="preset"
                  checked={preset === p.id}
                  onChange={() => setPreset(p.id)}
                />
                <span className="screener-option-label">{p.label}</span>
                <span className="muted">{p.hint}</span>
              </label>
            </li>
          ))}
        </ul>
        {progress && <p className="screener-progress muted">{progress}</p>}
        <div className="screener-actions">
          <button
            type="button"
            className="chip"
            onClick={() => {
              onResult(null);
              onClose();
            }}
          >
            清除筛选
          </button>
          <button
            type="button"
            className="chip on"
            disabled={running}
            onClick={() => void run()}
          >
            运行
          </button>
        </div>
      </div>
    </div>
  );
}