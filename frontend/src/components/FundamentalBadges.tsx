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

export function formatMainFlowText(flow: CapitalFlowSnapshot | null): string | null {
  if (!flow?.ok) return null;
  const inflow = flow.main_net_inflow;
  const score = flow.flow_score ?? 0;
  const flowUp = (inflow ?? score) >= 0;
  if (inflow != null && Number.isFinite(inflow)) {
    const abs = Math.abs(inflow);
    let amt: string;
    if (abs >= 1e8) amt = `${(inflow / 1e8).toFixed(2)}亿`;
    else amt = `${(inflow / 1e4).toFixed(0)}万`;
    return `${flowUp ? "+" : ""}${amt}`;
  }
  return null;
}

function FundChip({
  label,
  value,
  title,
  muted,
  warn,
}: {
  label?: string;
  value: string;
  title?: string;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={`fund-chip${muted ? " fund-chip-muted" : ""}${
        warn ? " fund-chip-warn" : ""
      }`}
      title={title}
    >
      {label ? <span className="fund-chip-k">{label}</span> : null}
      <span className="fund-chip-v">{value}</span>
    </span>
  );
}

interface Props {
  symbol: string;
  fundamentals: FundamentalsSnapshot | null;
  flow?: CapitalFlowSnapshot | null;
  loading?: boolean;
  /** 顶栏：弱化文字行，不展示主力进度条 */
  variant?: "chips" | "compact" | "micro";
  align?: "left" | "right" | "center";
}

export function FundamentalBadges({
  symbol,
  fundamentals,
  loading,
  variant = "compact",
  align = "right",
}: Props) {
  if (!/^\d{6}$/.test(symbol)) return null;

  const pe = fundamentals?.pe_ttm;
  const risk = peRisk(pe);

  const hasFund =
    fundamentals?.ok &&
    (fundamentals.is_etf ||
      fundamentals.industry ||
      fundamentals.pe_ttm != null ||
      fundamentals.pb != null ||
      fundamentals.market_cap != null);

  if (loading && !fundamentals) {
    if (variant === "micro") {
      return <p className="fund-micro-row muted">基本面加载中…</p>;
    }
    return variant === "compact" ? (
      <p className="fund-meta-line muted">基本面加载中…</p>
    ) : (
      <FundChip value="加载中…" muted />
    );
  }

  if (!loading && fundamentals && !fundamentals.ok) {
    if (variant === "micro") {
      return (
        <p className="fund-micro-row muted" title={fundamentals.reason}>
          基本面暂不可用
        </p>
      );
    }
    return variant === "compact" ? (
      <p className="fund-meta-line muted" title={fundamentals.reason}>
        基本面暂不可用
      </p>
    ) : (
      <FundChip value="基本面暂不可用" muted title={fundamentals.reason} />
    );
  }

  if (!hasFund || !fundamentals) return null;

  if (variant === "micro") {
  const microTag = (label: string, value: string) => (
      <span className="fund-micro-tag" key={label}>
        <span className="fund-micro-k">{label}</span>
        <span className="fund-micro-mid" aria-hidden>
          ·
        </span>
        <span className="fund-micro-v">{value}</span>
      </span>
    );
    return (
      <div
        className={`fund-micro-row fund-micro-row--${align}`}
        title="基本面快照"
      >
        {microTag("行业", fundamentals.industry ?? "—")}
        {fundamentals.pe_ttm != null && fundamentals.pe_ttm > 0
          ? microTag("PE", formatPe(pe))
          : null}
        {fundamentals.pb != null && fundamentals.pb > 0
          ? microTag("PB", formatPe(fundamentals.pb))
          : null}
        {microTag("市值", formatCap(fundamentals.market_cap))}
        {risk === "high" ? (
          <span className="fund-micro-warn">估值偏高</span>
        ) : null}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <p
        className={`fund-meta-line fund-meta-line--${align}`}
        title="基本面快照"
      >
        <span>
          <span className="fund-meta-k">行业</span>
          <span className="fund-meta-mid" aria-hidden>
            ·
          </span>
          <span className="fund-meta-v">
            {fundamentals.industry ?? "—"}
          </span>
        </span>
        {fundamentals.pe_ttm != null && fundamentals.pe_ttm > 0 ? (
          <>
            <span className="fund-meta-sep" aria-hidden>
              |
            </span>
            <span>
              <span className="fund-meta-k">PE</span>
              <span className="fund-meta-mid" aria-hidden>
                ·
              </span>
              <span className="fund-meta-v">{formatPe(pe)}</span>
            </span>
          </>
        ) : null}
        {fundamentals.pb != null && fundamentals.pb > 0 ? (
          <>
            <span className="fund-meta-sep" aria-hidden>
              |
            </span>
            <span>
              <span className="fund-meta-k">PB</span>
              <span className="fund-meta-mid" aria-hidden>
                ·
              </span>
              <span className="fund-meta-v">{formatPe(fundamentals.pb)}</span>
            </span>
          </>
        ) : null}
        <span className="fund-meta-sep" aria-hidden>
          |
        </span>
        <span>
          <span className="fund-meta-k">市值</span>
          <span className="fund-meta-mid" aria-hidden>
            ·
          </span>
          <span className="fund-meta-v">
            {formatCap(fundamentals.market_cap)}
          </span>
        </span>
        {risk === "high" && (
          <>
            <span className="fund-meta-sep" aria-hidden>
              |
            </span>
            <span className="fund-meta-warn">估值偏高</span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="fund-badges">
      <FundChip
        value={fundamentals.industry ?? "行业 —"}
        muted={!fundamentals.industry}
        title={fundamentals.industry ? "所属行业" : "行业需东财接口"}
      />
      <FundChip label="PE" value={formatPe(pe)} title="市盈率 TTM" />
      <FundChip label="PB" value={formatPe(fundamentals.pb)} title="市净率" />
      <FundChip
        label="市值"
        value={formatCap(fundamentals.market_cap)}
        title="总市值"
      />
      {risk === "high" && (
        <FundChip value="估值预警" warn title="估值偏高，注意财报雷" />
      )}
    </div>
  );
}