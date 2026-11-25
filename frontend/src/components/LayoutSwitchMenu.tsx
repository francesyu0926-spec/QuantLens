import { useEffect, useRef, useState } from "react";
import { CHART_LAYOUTS, type ChartLayoutMode } from "../types/chart";

interface Props {
  value: ChartLayoutMode;
  onChange: (v: ChartLayoutMode) => void;
}

export function LayoutSwitchMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current =
    CHART_LAYOUTS.find((x) => x.id === value) ?? CHART_LAYOUTS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="layout-switch-menu" ref={rootRef}>
      <button
        type="button"
        className="layout-switch-trigger"
        title="分屏布局"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>{current.icon}</span>
        <span className="layout-switch-caret">▾</span>
      </button>
      {open && (
        <div className="layout-switch-drop" role="menu">
          {CHART_LAYOUTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === item.id}
              className={`layout-switch-item${
                value === item.id ? " on" : ""
              }`}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
            >
              <span className="layout-switch-item-icon">{item.icon}</span>
              <span className="layout-switch-item-label">{item.label}</span>
              {value === item.id ? (
                <span className="layout-switch-check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}