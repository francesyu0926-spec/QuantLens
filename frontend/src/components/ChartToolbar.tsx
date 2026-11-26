import { useEffect, useRef, useState } from "react";
import type {
  ChartDisplayOptions,
  ChartLayoutMode,
  TimeInterval,
} from "../types/chart";
import { INTERVALS } from "../types/chart";
import type { PriceLineDef } from "../hooks/usePriceLines";
import { INDICATOR_PLAIN_TIPS } from "../utils/marketPlainLanguage";

interface Props {
  interval: TimeInterval;
  onInterval: (v: TimeInterval) => void;
  options: ChartDisplayOptions;
  onOptions: (v: ChartDisplayOptions) => void;
  price: number;
  lines: PriceLineDef[];
  onAddLine: (price: number, label: string) => void;
  onRemoveLine: (id: string) => void;
  noviceMode?: boolean;
  chartLayout?: ChartLayoutMode;
}

function IndicatorToggle({
  label,
  on,
  onClick,
  showTip,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  showTip?: boolean;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const tip = INDICATOR_PLAIN_TIPS[label];

  const onEnter = () => {
    if (!showTip || !tip) return;
    hoverTimer.current = window.setTimeout(() => setTipOpen(true), 500);
  };

  const onLeave = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setTipOpen(false);
  };

  return (
    <span className="ind-toggle-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        type="button"
        className={`chip ${on ? "on" : ""}`}
        onClick={onClick}
      >
        {label}
      </button>
      {showTip && tipOpen && tip && (
        <div className="ind-tip-card" role="tooltip">
          <strong>{tip.title}</strong>
          <p>{tip.lines[0]}</p>
          <p>{tip.lines[1]}</p>
        </div>
      )}
    </span>
  );
}

export function ChartToolbar({
  interval,
  onInterval,
  options,
  onOptions,
  price,
  lines,
  onAddLine,
  onRemoveLine,
  noviceMode = false,
  chartLayout = "single",
}: Props) {
  const hideDrawTools = chartLayout !== "single";
  const [drawOpen, setDrawOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setDrawOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [drawOpen]);

  return (
    <div className="chart-toolbar chart-toolbar-unified">
      <div className="toolbar-leading">
      <div className="interval-group">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            type="button"
            className={`chip ${interval === iv ? "on" : ""}`}
            onClick={() => onInterval(iv)}
          >
            {iv}
          </button>
        ))}
      </div>

      <span className="toolbar-vdiv" aria-hidden />

      <div className="toggle-group">
        <IndicatorToggle
          label="EMA"
          on={options.showEma}
          showTip={noviceMode}
          onClick={() => onOptions({ ...options, showEma: !options.showEma })}
        />
        <IndicatorToggle
          label="BOLL"
          on={options.showBoll}
          showTip={noviceMode}
          onClick={() => onOptions({ ...options, showBoll: !options.showBoll })}
        />
        <button
          type="button"
          className={`chip ${options.showVolume ? "on" : ""}`}
          onClick={() =>
            onOptions({ ...options, showVolume: !options.showVolume })
          }
        >
          VOL
        </button>
        <button
          type="button"
          className={`chip ${options.showVolumeProfile ? "on" : ""}`}
          onClick={() =>
            onOptions({
              ...options,
              showVolumeProfile: !options.showVolumeProfile,
            })
          }
        >
          VP
        </button>
        <IndicatorToggle
          label="MACD"
          on={options.subChart === "macd"}
          showTip={noviceMode}
          onClick={() => onOptions({ ...options, subChart: "macd" })}
        />
        <IndicatorToggle
          label="RSI"
          on={options.subChart === "rsi"}
          showTip={noviceMode}
          onClick={() => onOptions({ ...options, subChart: "rsi" })}
        />
      </div>
      </div>

      {!hideDrawTools && (
      <div className="draw-menu" ref={menuRef}>
        <button
          type="button"
          className={`chip draw-menu-btn${drawOpen ? " on" : ""}`}
          onClick={() => setDrawOpen((o) => !o)}
          aria-expanded={drawOpen}
        >
          画线工具 ▾
        </button>
        {drawOpen && (
          <div className="draw-menu-panel" role="menu">
            <p className="draw-hint muted">Alt + 点击主图添加水平线</p>
            {price > 0 && (
              <>
                <button
                  type="button"
                  className="draw-item"
                  onClick={() => onAddLine(price, "现价")}
                >
                  标记现价
                </button>
                <button
                  type="button"
                  className="draw-item"
                  onClick={() => onAddLine(price * 0.98, "止损")}
                >
                  −2% 止损
                </button>
                <button
                  type="button"
                  className="draw-item"
                  onClick={() => onAddLine(price * 1.02, "止盈")}
                >
                  +2% 止盈
                </button>
              </>
            )}
            {lines.map((l) => (
              <button
                key={l.id}
                type="button"
                className="draw-item draw-item-line"
                onClick={() => onRemoveLine(l.id)}
              >
                移除 {l.label} @{l.price.toFixed(2)}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}