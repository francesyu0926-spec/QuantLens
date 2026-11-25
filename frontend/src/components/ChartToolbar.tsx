import { useEffect, useRef, useState } from "react";
import type { ChartDisplayOptions, TimeInterval } from "../types/chart";
import { INTERVALS } from "../types/chart";
import type { PriceLineDef } from "../hooks/usePriceLines";

interface Props {
  interval: TimeInterval;
  onInterval: (v: TimeInterval) => void;
  options: ChartDisplayOptions;
  onOptions: (v: ChartDisplayOptions) => void;
  price: number;
  lines: PriceLineDef[];
  onAddLine: (price: number, label: string) => void;
  onRemoveLine: (id: string) => void;
}

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip ${on ? "on" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
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
}: Props) {
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
        <Toggle
          label="EMA"
          on={options.showEma}
          onClick={() => onOptions({ ...options, showEma: !options.showEma })}
        />
        <Toggle
          label="BOLL"
          on={options.showBoll}
          onClick={() => onOptions({ ...options, showBoll: !options.showBoll })}
        />
        <Toggle
          label="VOL"
          on={options.showVolume}
          onClick={() =>
            onOptions({ ...options, showVolume: !options.showVolume })
          }
        />
        <Toggle
          label="MACD"
          on={options.subChart === "macd"}
          onClick={() => onOptions({ ...options, subChart: "macd" })}
        />
        <Toggle
          label="RSI"
          on={options.subChart === "rsi"}
          onClick={() => onOptions({ ...options, subChart: "rsi" })}
        />
      </div>

      <span className="toolbar-grow" aria-hidden />

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
    </div>
  );
}