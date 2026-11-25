import type { WatchlistItem } from "../types/market";

interface Props {
  items: WatchlistItem[];
}

/** 基于自选涨跌家数的简易「市场温度」 */
export function MarketSentimentBar({ items }: Props) {
  const withChg = items.filter(
    (i) => i.changePct != null && Number.isFinite(i.changePct)
  );
  if (withChg.length < 3) return null;

  const up = withChg.filter((i) => (i.changePct ?? 0) >= 0).length;
  const ratio = Math.round((up / withChg.length) * 100);

  return (
    <section className="market-thermo" aria-label="涨跌温度">
      <div className="market-thermo-head">
        <span className="market-thermo-label">多空温度</span>
        <span className="market-thermo-val tabular">{ratio}% 看多</span>
      </div>
      <div
        className="market-thermo-track"
        role="progressbar"
        aria-valuenow={ratio}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="market-thermo-fill"
          style={{ width: `${ratio}%` }}
        />
      </div>
      <p className="market-thermo-hint muted">
        涨 {up} · 跌 {withChg.length - up}（有报价自选）
      </p>
    </section>
  );
}