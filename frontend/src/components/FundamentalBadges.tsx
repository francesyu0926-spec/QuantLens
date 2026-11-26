import type { CapitalFlowSnapshot, FundamentalsSnapshot } from "../hooks/useFundamentals";

function formatCap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e11) return `${(v / 1e8).toFixed(0)}亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return v.toFixed(0);
}

function formatPe(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return v.toFixed(1);
}

function peRisk(pe: number | null | undefined): "low" | "mid" | "high" | "none" {
  if (pe == null || !Number.isFinite(pe) || pe <= 0) return "none";
  if (pe > 80 || pe < 0) return "high";
  if (pe > 45) return "mid";
  return "low";
}

interface Props {
  symbol: string;
  fundamentals: FundamentalsSnapshot | null;
  flow: CapitalFlowSnapshot | null;
  loading?: boolean;
}

export function FundamentalBadges({
  symbol,
  fundamentals,
  flow,
  loading,
}: Props) {
  if (!/^\d{6}$/.test(symbol)) return null;

  const pe = fundamentals?.pe_ttm;
  const risk = peRisk(pe);
  const score = flow?.flow_score ?? 0;
  const inflow = flow?.main_net_inflow;
  const flowPct = Math.round(Math.abs(score) * 100);
  const flowUp = (inflow ?? score) >= 0;

  return (
    <div className="fund-badges" title="基本面快照 · 主力资金">
      {loading && !fundamentals && (
        <span className="fund-badge fund-badge-muted">基本面…</span>
      )}
      {fundamentals?.ok && (
        <>
          {fundamentals.industry && (
            <span className="fund-badge">{fundamentals.industry}</span>
          )}
          <span className="fund-badge" title="市盈率 TTM">
            PE {formatPe(pe)}
          </span>
          <span className="fund-badge" title="市净率">
            PB {formatPe(fundamentals.pb)}
          </span>
          <span className="fund-badge" title="总市值">
            {formatCap(fundamentals.market_cap)}
          </span>
          {risk === "high" && (
            <span className="fund-badge fund-badge-warn" title="估值偏高，注意财报雷">
              估值预警
            </span>
          )}
        </>
      )}
      {flow?.ok && (
        <div className="fund-flow" title={`主力净流入 ${inflow ?? "—"}`}>
          <span className="fund-flow-label">主力</span>
          <span className="fund-flow-track">
            <span
              className={`fund-flow-fill${flowUp ? " in" : " out"}`}
              style={{ width: `${Math.min(100, flowPct)}%` }}
            />
          </span>
          <span className={`fund-flow-amt tabular pnl-${flowUp ? "up" : "down"}`}>
            {inflow != null && Number.isFinite(inflow)
              ? `${flowUp ? "+" : ""}${(inflow / 1e4).toFixed(0)}万`
              : "—"}
          </span>
        </div>
      )}
    </div>
  );
}