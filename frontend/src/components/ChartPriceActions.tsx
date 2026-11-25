import type { PriceLineDef } from "../hooks/usePriceLines";

interface Props {
  price: number;
  lines: PriceLineDef[];
  onAdd: (price: number, label: string) => void;
  onRemove: (id: string) => void;
}

export function ChartPriceActions({
  price,
  lines,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div className="chart-actions">
      <button
        type="button"
        className="pill-btn pill-hint"
        title="按住 Alt，在图表上点击以添加水平价位线"
      >
        ⌨ 画线
      </button>
      {price > 0 && (
        <>
          <button
            type="button"
            className="pill-btn pill-mark"
            onClick={() => onAdd(price, "现价")}
            title="在当前价位画水平线"
          >
            标记现价
          </button>
          <button
            type="button"
            className="pill-btn pill-sl"
            onClick={() => onAdd(price * 0.98, "止损")}
            title="距现价 -2% 止损线"
          >
            -2% 止损
          </button>
          <button
            type="button"
            className="pill-btn pill-tp"
            onClick={() => onAdd(price * 1.02, "止盈")}
            title="距现价 +2% 止盈线"
          >
            +2% 止盈
          </button>
        </>
      )}
      {lines.map((l) => (
        <button
          key={l.id}
          type="button"
          className="pill-btn pill-line"
          onClick={() => onRemove(l.id)}
          title="点击移除该价位线"
        >
          {l.label} {l.price.toFixed(2)} ×
        </button>
      ))}
    </div>
  );
}