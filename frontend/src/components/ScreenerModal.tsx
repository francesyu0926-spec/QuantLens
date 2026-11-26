import { useState } from "react";
import type { WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import {
  runScreener,
  runUniverseScreener,
  SCREENER_PRESETS,
  triggerUniverseRebuild,
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
  const [scope, setScope] = useState<"watchlist" | "market">("watchlist");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  if (!open) return null;

  const run = async () => {
    setRunning(true);
    setProgress("筛选中…");
    try {
      let hits: string[] = [];
      if (scope === "market") {
        setProgress(
          preset === "momentum"
            ? "拉取全市场快照…"
            : "查询盘后指标库…"
        );
        const { symbols, library } = await runUniverseScreener(preset);
        hits = symbols;
        if (hits.length === 0 && library?.running) {
          setProgress(
            `指标库构建中 ${library.processed ?? 0}/${library.total ?? "?"}`
          );
        } else if (hits.length === 0 && (library?.symbol_count ?? 0) < 1) {
          void triggerUniverseRebuild();
          setProgress("指标库为空，已触发后台重建…");
        }
      } else {
        hits = await runScreener(items, preset, quotes, (d, t) => {
          setProgress(`已扫描 ${d}/${t}`);
        });
      }
      onResult(hits);
      setProgress(`命中 ${hits.length} 只`);
      window.setTimeout(onClose, 800);
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
          自选池实时筛选；全市场模式使用快照（涨幅）或盘后批量指标库（RSI/MACD/EMA）
        </p>
        <div className="screener-scope" role="radiogroup" aria-label="筛选范围">
          <label className="screener-option">
            <input
              type="radio"
              name="scope"
              checked={scope === "watchlist"}
              onChange={() => setScope("watchlist")}
            />
            <span>自选池</span>
          </label>
          <label className="screener-option">
            <input
              type="radio"
              name="scope"
              checked={scope === "market"}
              onChange={() => setScope("market")}
            />
            <span>全市场</span>
          </label>
        </div>
        {scope === "market" && preset !== "momentum" && (
          <div className="screener-lib-actions">
            <p className="muted screener-lib-hint">
              基于成交额 Top 标的的日线指标；启动后自动补建，约数分钟完成。
            </p>
            <button
              type="button"
              className="chip screener-rebuild-btn"
              disabled={running}
              onClick={() => void triggerUniverseRebuild().then((ok) => {
                setProgress(ok ? "已请求重建指标库…" : "重建请求失败");
              })}
            >
              重建指标库
            </button>
          </div>
        )}
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