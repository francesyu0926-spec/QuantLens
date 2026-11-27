import { useMemo, useState } from "react";
import type { WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import {
  runScreener,
  runUniverseScreener,
  SCREENER_PRESETS,
  SCREENER_TITLE_PARTS,
  triggerUniverseRebuild,
  type ScreenerPresetId,
} from "../utils/screener";
import { NOVICE_SCREENER_COPY } from "../utils/noviceCopy";

interface Props {
  open: boolean;
  items: WatchlistItem[];
  quotes: QuoteMap;
  onClose: () => void;
  onResult: (symbols: string[] | null) => void;
  noviceMode?: boolean;
}

function presetDisplay(
  id: ScreenerPresetId,
  noviceMode: boolean
): { title: string; hint: string; chip: string } {
  const base = SCREENER_PRESETS.find((p) => p.id === id)!;
  if (noviceMode) {
    const n = NOVICE_SCREENER_COPY[id];
    return { title: n.title, hint: n.hint, chip: n.chip };
  }
  const parts = SCREENER_TITLE_PARTS[id];
  return { title: parts.title, hint: base.hint, chip: parts.chip };
}

export function ScreenerModal({
  open,
  items,
  quotes,
  onClose,
  onResult,
  noviceMode = false,
}: Props) {
  const [preset, setPreset] = useState<ScreenerPresetId>("momentum");
  const [scope, setScope] = useState<"watchlist" | "market">("watchlist");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const presets = useMemo(
    () =>
      SCREENER_PRESETS.map((p) => ({
        id: p.id,
        ...presetDisplay(p.id, noviceMode),
      })),
    [noviceMode]
  );

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
        <header className="screener-head">
          <div className="screener-title-row">
            <span className="screener-title-ico" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16l-6.5 7.5V19l-3 1.5V11.5L4 4z" />
              </svg>
            </span>
            <h3 className="screener-title">条件选股</h3>
          </div>
          <p className="screener-desc">
            {noviceMode
              ? "在自选或全市场里，用白话条件筛出值得看的标的。"
              : "自选池实时筛选；全市场模式使用快照（涨幅）或盘后批量指标库（RSI/MACD/EMA）"}
          </p>
        </header>

        <div className="screener-body">
          <div className="screener-segment" role="group" aria-label="筛选范围">
            <button
              type="button"
              className={`screener-segment-btn${
                scope === "watchlist" ? " is-on" : ""
              }`}
              aria-pressed={scope === "watchlist"}
              onClick={() => setScope("watchlist")}
            >
              自选池
            </button>
            <button
              type="button"
              className={`screener-segment-btn${
                scope === "market" ? " is-on" : ""
              }`}
              aria-pressed={scope === "market"}
              onClick={() => setScope("market")}
            >
              全市场
            </button>
          </div>

          {scope === "market" && preset !== "momentum" && (
            <div className="screener-lib-actions">
              <p className="screener-lib-hint">
                {noviceMode
                  ? "全市场技术指标需先建好库，首次可能稍慢。"
                  : "基于成交额 Top 标的的日线指标；启动后自动补建，约数分钟完成。"}
              </p>
              <button
                type="button"
                className="chip tiny screener-rebuild-btn"
                disabled={running}
                onClick={() =>
                  void triggerUniverseRebuild().then((ok) => {
                    setProgress(ok ? "已请求重建指标库…" : "重建请求失败");
                  })
                }
              >
                重建指标库
              </button>
            </div>
          )}

          <ul className="screener-cards" role="radiogroup" aria-label="筛选条件">
            {presets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={preset === p.id}
                  className={`screener-card${
                    preset === p.id ? " is-on" : ""
                  }`}
                  onClick={() => setPreset(p.id)}
                >
                  <span className="screener-card-mark" aria-hidden />
                  <div className="screener-card-text">
                    <div className="screener-card-title-row">
                      <span className="screener-card-title">{p.title}</span>
                      <span className="screener-param tabular">{p.chip}</span>
                    </div>
                    <span className="screener-card-hint">{p.hint}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {progress && (
            <p className="screener-progress" role="status">
              {progress}
            </p>
          )}
        </div>

        <footer className="screener-foot">
          <div className="screener-actions">
            <button
              type="button"
              className="screener-clear-btn"
              onClick={() => {
                onResult(null);
                onClose();
              }}
            >
              清除筛选
            </button>
            <button
              type="button"
              className="screener-run-btn"
              disabled={running}
              onClick={() => void run()}
            >
              运行
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}