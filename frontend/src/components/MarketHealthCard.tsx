import { useMemo, useState } from "react";
import type { Candle } from "../types/market";
import {
  computeHealthScore,
  MOMENTUM_MAX,
  POSITION_MAX,
  TREND_MAX,
} from "../utils/marketHealthScore";
import {
  findKeyLevels,
  keyLevelDistances,
} from "../utils/chartPatterns";

interface Props {
  candles: Candle[];
  price: number;
}

export function MarketHealthCard({ candles, price }: Props) {
  const [expanded, setExpanded] = useState(false);
  const health = useMemo(() => computeHealthScore(candles), [candles]);
  const dist = useMemo(() => {
    const levels = findKeyLevels(candles);
    return keyLevelDistances(candles, price, levels);
  }, [candles, price]);

  if (candles.length < 35) return null;

  const levelChips: { key: string; label: string; kind: "warn" | "support" }[] =
    [];
  if (health.warnings.includes("接近布林上轨")) {
    levelChips.push({ key: "boll", label: "近布林上轨", kind: "warn" });
  }
  if (dist.toSupportPct != null) {
    levelChips.push({
      key: "sup",
      label: `支撑 ${dist.toSupportPct.toFixed(2)}%`,
      kind: "support",
    });
  }
  if (dist.toResistancePct != null) {
    levelChips.push({
      key: "res",
      label: `阻力 +${dist.toResistancePct.toFixed(2)}%`,
      kind: "warn",
    });
  }

  const breakdownTip = `趋势 ${health.breakdown.trend}/${TREND_MAX} · 动能 ${health.breakdown.momentum}/${MOMENTUM_MAX} · 位置 ${health.breakdown.position}/${POSITION_MAX}`;

  const trackClass =
    health.score < 45
      ? "is-low"
      : health.score < 72
        ? "is-mid"
        : "is-high";

  const supportPx =
    dist.support?.price != null
      ? dist.support.price.toFixed(2)
      : null;

  const summaryBits = [
    `多空评分 ${health.score}（${health.label}）`,
    supportPx ? `支撑 ${supportPx}` : null,
  ].filter(Boolean);

  return (
    <section
      className={`health-card${expanded ? " is-expanded" : " is-collapsed"}`}
      aria-label="多空体检分"
    >
      <button
        type="button"
        className="health-fold-bar"
        aria-expanded={expanded}
        onClick={() => setExpanded((o) => !o)}
        title={breakdownTip}
      >
        <span className="health-fold-text tabular">{summaryBits.join(" · ")}</span>
        <span className="health-fold-action">{expanded ? "收起 ▴" : "展开 ▾"}</span>
      </button>

      {expanded && (
        <div className="health-expanded-body">
          <div
            className="health-score-track"
            role="progressbar"
            aria-valuenow={health.score}
            aria-valuemin={0}
            aria-valuemax={100}
            title={breakdownTip}
          >
            <span
              className={`health-score-fill ${trackClass}`}
              style={{
                width: `${Math.min(100, Math.max(0, health.score))}%`,
              }}
            />
          </div>
          <p className="health-advice">{health.advice}</p>
          {levelChips.length > 0 && (
            <div className="health-assist-chips">
              {levelChips.map((chip) => (
                <span
                  key={chip.key}
                  className={`assist-chip assist-chip-${chip.kind}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}