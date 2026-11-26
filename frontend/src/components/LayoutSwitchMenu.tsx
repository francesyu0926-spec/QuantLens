import { CHART_LAYOUTS, type ChartLayoutMode } from "../types/chart";

interface Props {
  value: ChartLayoutMode;
  onChange: (v: ChartLayoutMode) => void;
  noviceMode?: boolean;
}

export function LayoutSwitchMenu({
  value,
  onChange,
  noviceMode = false,
}: Props) {
  if (noviceMode) {
    return (
      <span
        className="layout-switch-novice"
        title="小白模式固定单图，专注价格与白话总结"
      >
        单图
      </span>
    );
  }

  return (
    <div
      className="layout-switch-iconbar"
      role="radiogroup"
      aria-label="分屏布局"
    >
      {CHART_LAYOUTS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          aria-label={item.label}
          className={`layout-switch-ico${value === item.id ? " is-on" : ""}`}
          title={`切换${item.label}`}
          onClick={() => onChange(item.id)}
        >
          <span aria-hidden>{item.icon}</span>
        </button>
      ))}
    </div>
  );
}