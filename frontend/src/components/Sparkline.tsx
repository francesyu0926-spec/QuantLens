import type { PriceColors } from "../utils/priceColors";

export function Sparkline({
  values,
  colors,
}: {
  values?: number[];
  colors: PriceColors;
}) {
  if (!values || values.length < 2) {
    return <span className="watch-spark-placeholder" aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 64;
      const y = 18 - ((v - min) / range) * 16;
      return `${x},${y}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className="spark" viewBox="0 0 64 20" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? colors.up : colors.down}
        strokeWidth="1.2"
      />
    </svg>
  );
}