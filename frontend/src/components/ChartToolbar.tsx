import { useEffect, useRef, useState } from "react";
import type {
  ChartDisplayOptions,
  ChartLayoutMode,
  TimeInterval,
} from "../types/chart";
import { INTERVALS } from "../types/chart";
import type { PriceLineDef } from "../hooks/usePriceLines";
import { INDICATOR_PLAIN_TIPS } from "../utils/marketPlainLanguage";
import { NOVICE_INTERVALS, plainPriceLineTitle } from "../utils/noviceCopy";

interface Props {
  interval: TimeInterval;
  onInterval: (v: TimeInterval) => void;
  options: ChartDisplayOptions;
  onOptions: (v: ChartDisplayOptions) => void;
  price: number;
  lines: PriceLineDef[];
  onAddLine: (price: number, label: string) => void;
  onRemoveLine: (id: string) => void;
  onClearAllLines?: () => void;
  onToggleLineAlert?: (id: string) => void;
  intradayMode?: boolean;
  onIntraday?: (on: boolean) => void;
  noviceMode?: boolean;
  chartLayout?: ChartLayoutMode;
  markPriceMode?: boolean;
  onMarkPriceModeChange?: (on: boolean) => void;
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
  onClearAllLines,
  onToggleLineAlert,
  intradayMode = false,
  onIntraday,
  noviceMode = false,
  chartLayout = "single",
  markPriceMode = false,
  onMarkPriceModeChange,
}: Props) {
  const hideDrawTools = chartLayout !== "single";
  const intervalChoices = noviceMode
    ? INTERVALS.filter((iv) =>
        (NOVICE_INTERVALS as readonly string[]).includes(iv)
      )
    : INTERVALS;
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

  const manualLines = lines;

  return (
    <>
    <div className="chart-toolbar chart-toolbar-unified">
      <div className="toolbar-leading">
      <div className="interval-group">
        {!noviceMode && (
          <button
            type="button"
            className={`chip ${intradayMode ? "on" : ""}`}
            title="分时 · 1 分钟均价线"
            onClick={() => onIntraday?.(!intradayMode)}
          >
            分时
          </button>
        )}
        {intervalChoices.map((iv) => (
          <button
            key={iv}
            type="button"
            className={`chip ${interval === iv && !intradayMode ? "on" : ""}${
              interval === iv && intradayMode ? " on-soft" : ""
            }`}
            onClick={() => onInterval(iv)}
          >
            {iv}
          </button>
        ))}
      </div>

      <span className="toolbar-vdiv" aria-hidden />

      <div className="toggle-group">
        {!noviceMode && (
          <>
            <IndicatorToggle
              label="EMA"
              on={options.showEma}
              showTip={noviceMode}
              onClick={() =>
                onOptions({ ...options, showEma: !options.showEma })
              }
            />
            <IndicatorToggle
              label="BOLL"
              on={options.showBoll}
              showTip={noviceMode}
              onClick={() =>
                onOptions({ ...options, showBoll: !options.showBoll })
              }
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
          </>
        )}
        {noviceMode && options.showVolume && (
          <span className="chip on novice-vol-tag" title="成交量反映买卖活跃度">
            买卖活跃度
          </span>
        )}
      </div>
      </div>

      {!hideDrawTools && (
        <div className="draw-menu" ref={menuRef}>
          <button
            type="button"
            className={`chip draw-menu-btn${
              drawOpen || (noviceMode && markPriceMode) ? " on" : ""
            }`}
            onClick={() => setDrawOpen((o) => !o)}
            aria-expanded={drawOpen}
            title={noviceMode ? "添加或删除图上标记的价位" : undefined}
          >
            {noviceMode
              ? `标记价位 ▾${
                  manualLines.length > 0 ? ` · ${manualLines.length}` : ""
                }`
              : "画线工具 ▾"}
          </button>
          {drawOpen && (
            <div className="draw-menu-panel" role="menu">
              {noviceMode && (
                <button
                  type="button"
                  className={`draw-item draw-item-mode${
                    markPriceMode ? " on" : ""
                  }`}
                  onClick={() => onMarkPriceModeChange?.(!markPriceMode)}
                >
                  {markPriceMode ? "✓ 点图标记中（Esc 退出）" : "开启点图标记"}
                </button>
              )}
              <p className="draw-hint muted">
                {noviceMode
                  ? markPriceMode
                    ? "在 K 线主图上单击添加线"
                    : "可开启点图模式，或选快捷项"
                  : "Alt + 点击主图添加水平线"}
              </p>
              {price > 0 && (
                <>
                  <button
                    type="button"
                    className="draw-item"
                    onClick={() => {
                      onAddLine(price, noviceMode ? "当前价" : "现价");
                      setDrawOpen(false);
                    }}
                  >
                    {noviceMode ? "标出当前价" : "标记现价"}
                  </button>
                  <button
                    type="button"
                    className="draw-item"
                    onClick={() => {
                      onAddLine(price * 0.98, "止损");
                      setDrawOpen(false);
                    }}
                  >
                    {noviceMode ? "−2% 亏损警戒线" : "−2% 止损"}
                  </button>
                  <button
                    type="button"
                    className="draw-item"
                    onClick={() => {
                      onAddLine(price * 1.02, "止盈");
                      setDrawOpen(false);
                    }}
                  >
                    {noviceMode ? "+2% 盈利目标线" : "+2% 止盈"}
                  </button>
                </>
              )}
              {noviceMode && manualLines.length > 0 && (
                <p className="draw-section-label">已标记（点一下删除）</p>
              )}
              {manualLines.map((l) => (
                <div key={l.id} className="draw-item-row">
                  {!noviceMode && (
                    <button
                      type="button"
                      className={`draw-bell${l.alert !== false ? " on" : ""}`}
                      title="触及该线时提醒"
                      disabled={!onToggleLineAlert}
                      onClick={() => onToggleLineAlert?.(l.id)}
                    >
                      🔔
                    </button>
                  )}
                  <button
                    type="button"
                    className="draw-item draw-item-line draw-item-remove"
                    onClick={() => {
                      onRemoveLine(l.id);
                      if (manualLines.length <= 1) setDrawOpen(false);
                    }}
                  >
                    {noviceMode ? "× " : "移除 "}
                    {noviceMode ? plainPriceLineTitle(l.label) : l.label} @
                    {l.price.toFixed(2)}
                  </button>
                </div>
              ))}
              {noviceMode && manualLines.length > 0 && onClearAllLines && (
                <button
                  type="button"
                  className="draw-item draw-item-danger"
                  onClick={() => {
                    onClearAllLines();
                    setDrawOpen(false);
                    onMarkPriceModeChange?.(false);
                  }}
                >
                  清空全部自选价位
                </button>
              )}
              {noviceMode && manualLines.length === 0 && (
                <p className="draw-hint muted">还没有手动画线</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    {noviceMode && !hideDrawTools && manualLines.length > 0 && (
      <div className="novice-marked-lines" role="group" aria-label="已标记价位">
        <span className="novice-marked-lines-label">已标记</span>
        {manualLines.map((l) => (
          <button
            key={l.id}
            type="button"
            className="chip novice-mark-chip"
            title="点击删除这条线"
            onClick={() => onRemoveLine(l.id)}
          >
            {plainPriceLineTitle(l.label)} {l.price.toFixed(2)} ×
          </button>
        ))}
        {onClearAllLines && (
          <button
            type="button"
            className="chip novice-mark-clear"
            onClick={onClearAllLines}
          >
            全部清除
          </button>
        )}
      </div>
    )}
    </>
  );
}