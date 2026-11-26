import { useEffect, useMemo, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";
import { ConnectionStatusCapsule, type ConnectionMeta } from "./ConnectionStatusCapsule";
import type { ChartLayoutMode, TimeInterval } from "../types/chart";
import { LayoutSwitchMenu } from "./LayoutSwitchMenu";
import type { Candle } from "../types/market";
import { isAShareSessionOpen } from "../utils/marketSession";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import type { CapitalFlowSnapshot, FundamentalsSnapshot } from "../hooks/useFundamentals";
import {
  formatMainFlowText,
  FundamentalBadges,
} from "./FundamentalBadges";
import { isTauri, toggleMiniTicker } from "../utils/nativeBridge";
import { IconAiDiagnose, IconSmartInterpret } from "./TopBarFeatureIcons";

function exchangeSuffix(code: string): string {
  if (!/^\d{6}$/.test(code)) return code;
  if (code.startsWith("6") || code.startsWith("5")) return `${code}.SH`;
  return `${code}.SZ`;
}

interface Props {
  symbol: string;
  symbolName: string;
  interval: TimeInterval;
  loadError: string | null;
  loading: boolean;
  chartReady: boolean;
  switchPending: boolean;
  chartStale?: boolean;
  connectionMeta: ConnectionMeta;
  onReconnect: () => void;
  onDiagnose: () => void;
  onSettings: () => void;
  effectivePrice: number;
  displayCandles: Candle[];
  quotes: QuoteMap;
  chartLayout: ChartLayoutMode;
  onChartLayout: (mode: ChartLayoutMode) => void;
  noviceMode: boolean;
  onToggleNovice: () => void;
  fundamentals?: FundamentalsSnapshot | null;
  capitalFlow?: CapitalFlowSnapshot | null;
  fundamentalsLoading?: boolean;
  /** 左侧栏展开时，同步状态在顶栏左锚点，品牌仅在侧栏 */
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
}

export function TopStatusBar({
  symbol,
  symbolName,
  interval,
  loadError,
  loading,
  chartReady,
  switchPending,
  chartStale = false,
  connectionMeta,
  onReconnect,
  onDiagnose,
  onSettings,
  effectivePrice,
  displayCandles,
  quotes,
  chartLayout,
  onChartLayout,
  noviceMode,
  onToggleNovice,
  fundamentals = null,
  capitalFlow = null,
  fundamentalsLoading = false,
  leftPanelOpen = true,
  rightPanelOpen = true,
}: Props) {
  const headerDensity =
    chartLayout === "quad"
      ? " top-bar--quad"
      : chartLayout === "dual"
        ? " top-bar--compact"
        : "";
  const headerSqueeze =
    leftPanelOpen && rightPanelOpen ? " top-bar--squeeze" : "";
  const [sessionOpen, setSessionOpen] = useState(() => isAShareSessionOpen());

  useEffect(() => {
    const tick = () => setSessionOpen(isAShareSessionOpen());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const isAShare = A_SHARE_ONLY || /^\d{6}$/.test(symbol);

  const marketHint = A_SHARE_ONLY
    ? sessionOpen
      ? "交易中"
      : "已休市 · 盘后"
    : symbol.includes("/")
      ? "7×24"
      : isAShare
        ? sessionOpen
          ? "交易中"
          : "已休市 · 盘后"
        : "休市";

  const priceMove = useMemo(() => {
    if (effectivePrice <= 0) return null;
    const q = quotes[symbol];
    if (q?.changePct != null && Number.isFinite(q.changePct)) {
      const pct = q.changePct;
      const ref = effectivePrice / (1 + pct / 100);
      return { amt: effectivePrice - ref, pct };
    }
    if (displayCandles.length >= 2) {
      const prev = displayCandles[displayCandles.length - 2].close;
      if (prev > 0) {
        const amt = effectivePrice - prev;
        return { amt, pct: (amt / prev) * 100 };
      }
    }
    return null;
  }, [effectivePrice, quotes, symbol, displayCandles]);

  const mainFlowText = useMemo(
    () => formatMainFlowText(capitalFlow ?? null),
    [capitalFlow]
  );

  const flowUp = useMemo(() => {
    const inflow = capitalFlow?.main_net_inflow;
    const score = capitalFlow?.flow_score ?? 0;
    return (inflow ?? score) >= 0;
  }, [capitalFlow]);

  const up = priceMove ? priceMove.pct >= 0 : true;
  const displayPrice = effectivePrice > 0 ? effectivePrice.toFixed(2) : "—";
  const toneClass = priceMove ? (up ? " up" : " down") : "";

  const fundTip = useMemo(() => {
    if (fundamentalsLoading) return "基本面加载中";
    if (fundamentals && !fundamentals.ok) return "基本面暂不可用";
    if (!fundamentals?.ok) return "基本面";
    const bits: string[] = [];
    if (fundamentals.industry) bits.push(`行业 ${fundamentals.industry}`);
    if (fundamentals.pe_ttm != null && fundamentals.pe_ttm > 0) {
      bits.push(`PE ${fundamentals.pe_ttm.toFixed(1)}`);
    }
    if (fundamentals.pb != null && fundamentals.pb > 0) {
      bits.push(`PB ${fundamentals.pb.toFixed(1)}`);
    }
    if (fundamentals.market_cap != null) bits.push("含市值");
    return bits.length ? bits.join(" · ") : "基本面";
  }, [fundamentals, fundamentalsLoading]);

  return (
    <header
      className={`top-bar${
        leftPanelOpen ? " top-bar--with-side" : " top-bar--collapsed-left"
      }${headerDensity}${headerSqueeze}`}
    >
      <div className="top-bar-anchor">
        <div
          className={`top-bar-brand${
            leftPanelOpen ? " top-bar-brand--full" : " top-bar-brand--rail"
          }`}
        >
          {leftPanelOpen ? (
            <>
              <span className="top-bar-brand-word">QuantLens</span>
              <ConnectionStatusCapsule
                className="conn-capsule--sidebar-dot"
                loadError={loadError}
                loading={loading}
                chartReady={chartReady}
                chartStale={chartStale}
                symbol={symbol}
                meta={connectionMeta}
                onReconnect={onReconnect}
                tipStyle="friendly"
              />
            </>
          ) : (
            <div className="top-bar-brand-rail" title="QuantLens">
              <span className="sidebar-brand-mark sidebar-brand-mark--dock">
                QL
              </span>
              <ConnectionStatusCapsule
                className="conn-capsule--sidebar-dot conn-capsule--corner-dot"
                loadError={loadError}
                loading={loading}
                chartReady={chartReady}
                chartStale={chartStale}
                symbol={symbol}
                meta={connectionMeta}
                onReconnect={onReconnect}
                tipStyle="friendly"
              />
            </div>
          )}
        </div>
        {leftPanelOpen && <span className="top-bar-brand-vrule" aria-hidden />}
      </div>

      <div className="top-header-main">
        <div className="top-header-tri">
        <div
          className={`top-zone-left top-identity${
            !chartReady && switchPending ? " is-stale" : ""
          }`}
        >
          <h2 className="top-symbol-name">{symbolName || symbol}</h2>
          <div className="top-meta-row" role="group" aria-label="标的概览">
            <span className="top-symbol-code">{exchangeSuffix(symbol)}</span>
            <span className="top-meta-sep" aria-hidden>
              ·
            </span>
            <span className="top-tag-plain top-tag-interval">{interval}</span>
            <span className="top-meta-sep" aria-hidden>
              ·
            </span>
            <span
              className={`top-tag-session top-tag-session-plain${
                sessionOpen ? " is-open" : ""
              }`}
              title={marketHint}
            >
              {marketHint}
            </span>
          </div>
        </div>

        <div className={`top-zone-mid top-quote-hub${toneClass}`}>
          <div className={`top-quote-stack top-quote-hero${toneClass}`}>
            <span className={`top-quote-px tabular${toneClass}`}>
              {displayPrice}
            </span>
            {priceMove && (
              <span className={`top-quote-chg tabular${toneClass}`}>
                {up ? "+" : ""}
                {priceMove.amt.toFixed(2)} ({up ? "+" : ""}
                {priceMove.pct.toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="top-fund-strip">
            <div className="top-fund-line top-fund-line--wide">
              <FundamentalBadges
                symbol={symbol}
                fundamentals={fundamentals}
                loading={fundamentalsLoading}
                variant="micro"
                align="left"
              />
            </div>
            {/^\d{6}$/.test(symbol) && (
              <button
                type="button"
                className="top-fund-info-btn"
                title={fundTip}
                aria-label={`基本面：${fundTip}`}
              >
                ⓘ
              </button>
            )}
          </div>
          {mainFlowText && (
            <p
              className={`top-main-flow top-main-flow-wide tabular${
                flowUp ? " up" : " down"
              }`}
              title="主力净流入（今日）"
            >
              <span className="top-main-flow-k">主力净流入</span>
              <span className="top-main-flow-v">{mainFlowText}</span>
            </p>
          )}
        </div>

        <div className="top-zone-right top-zone top-zone-actions">
            <LayoutSwitchMenu value={chartLayout} onChange={onChartLayout} />
            <div className="top-ai-group top-actions-secondary">
              <button
                type="button"
                className={`top-btn top-btn-feature-ghost top-btn-ai${
                  noviceMode ? " on" : ""
                }`}
                title="智能解读：指标白话与盘面提示"
                aria-label="智能解读"
                aria-pressed={noviceMode}
                onClick={onToggleNovice}
              >
                <span className="top-btn-ico" aria-hidden>
                  <IconSmartInterpret />
                </span>
                <span className="top-btn-label">解读</span>
              </button>
              <button
                type="button"
                className="top-btn top-btn-feature-ghost top-btn-ai"
                title="AI 诊断：多周期与策略扫描"
                aria-label="AI 诊断"
                onClick={onDiagnose}
              >
                <span className="top-btn-ico" aria-hidden>
                  <IconAiDiagnose />
                </span>
                <span className="top-btn-label">诊断</span>
              </button>
            </div>
            {isTauri() && (
              <button
                type="button"
                className="top-btn top-btn-ghost-soft top-actions-secondary"
                title="置顶迷你看盘"
                onClick={() => void toggleMiniTicker(true)}
              >
                迷你
              </button>
            )}
            <button
              type="button"
              className="top-btn top-btn-icon-ghost"
              title="预警规则"
              aria-label="预警规则"
              onClick={onSettings}
            >
              ⚙
            </button>
        </div>
        </div>
      </div>

      <div className="top-bar-rail" aria-hidden />
    </header>
  );
}