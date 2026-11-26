import { useEffect, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";
import { isAShareSessionOpen } from "../utils/marketSession";
import type { WsPhase } from "../utils/wsConnection";
import { WS_MAX_RECONNECT_ATTEMPTS } from "../utils/wsConnection";

export type ConnectionCapsuleMode =
  | "stream"
  | "poll"
  | "closed"
  | "connecting"
  | "reconnecting"
  | "failed"
  | "warn"
  | "syncing"
  | "slow";

export interface ConnectionMeta {
  lastHeartbeat: number;
  latencyMs: number;
  reconnectAttempt: number;
  phase: WsPhase;
  online: boolean;
}

interface Props {
  loadError: string | null;
  loading: boolean;
  chartReady: boolean;
  chartStale?: boolean;
  symbol: string;
  meta: ConnectionMeta;
  onReconnect?: () => void;
  className?: string;
  /** 侧栏绿点：悬停显示简短同步说明 */
  tipStyle?: "default" | "friendly";
}

function dataSourceLabel(symbol: string): string {
  if (symbol.includes("/")) return "Binance / CCXT WebSocket";
  if (/^\d{6}$/.test(symbol)) return "东方财富 · AKShare";
  if (A_SHARE_ONLY) return "东方财富 · AKShare";
  return "Yahoo Finance";
}

function resolveMode(
  meta: ConnectionMeta,
  loadError: string | null,
  loading: boolean,
  chartReady: boolean,
  symbol: string,
  chartStale: boolean,
  sessionOpen: boolean
): ConnectionCapsuleMode {
  if (meta.phase === "failed" || (!meta.online && meta.phase !== "connected")) {
    return "failed";
  }
  if (meta.phase === "connecting") return "connecting";
  if (meta.phase === "reconnecting") return "reconnecting";
  if (meta.phase === "disconnected") return "closed";

  if (meta.phase === "connected") {
    if (loadError && !chartReady) return "warn";
    if (loadError && !loading && !chartReady) return "warn";
    if (loading && !chartReady) {
      return chartStale ? "syncing" : "slow";
    }
    const aShare = A_SHARE_ONLY || /^\d{6}$/.test(symbol);
    if (aShare && !sessionOpen) return "closed";
    if (symbol.includes("/")) return "stream";
    return "poll";
  }

  return "reconnecting";
}

function labelFor(
  mode: ConnectionCapsuleMode,
  meta: ConnectionMeta,
  pollSec: number
): string {
  switch (mode) {
    case "stream": {
      const ms =
        meta.latencyMs > 0 && meta.latencyMs < 60_000
          ? meta.latencyMs
          : 24;
      return `实时流 · ${ms}ms`;
    }
    case "poll":
      return `快照同步 · ${pollSec}s`;
    case "closed":
      return meta.phase === "disconnected"
        ? "未连接 · 休市"
        : "已休市 · 盘后";
    case "connecting":
      return "连接中…";
    case "reconnecting": {
      const n = Math.max(1, meta.reconnectAttempt);
      return `重连中 (${n}/${WS_MAX_RECONNECT_ATTEMPTS})…`;
    }
    case "failed":
      return meta.online ? "连接断开 · 点击重连" : "网络离线 · 点击重连";
    case "warn":
      return "行情异常";
    case "slow":
      return "网络缓慢…";
    case "syncing":
      return "同步中…";
    default:
      return "连接中…";
  }
}

export function ConnectionStatusCapsule({
  loadError,
  loading,
  chartReady,
  chartStale = false,
  symbol,
  meta,
  onReconnect,
  className,
  tipStyle = "default",
}: Props) {
  const [tipOpen, setTipOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(() => isAShareSessionOpen());

  useEffect(() => {
    const refresh = () => setSessionOpen(isAShareSessionOpen());
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const pollSec = symbol.includes("/") ? 5 : /^\d{6}$/.test(symbol) ? 5 : 15;
  const mode = resolveMode(
    meta,
    loadError,
    loading,
    chartReady,
    symbol,
    chartStale,
    sessionOpen
  );
  const label = labelFor(mode, meta, pollSec);
  const source = dataSourceLabel(symbol);
  const clickable = mode === "failed" && Boolean(onReconnect);

  const heartbeat =
    meta.lastHeartbeat > 0
      ? new Date(meta.lastHeartbeat).toLocaleTimeString()
      : "—";
  const latency =
    meta.latencyMs > 0 && meta.latencyMs < 120_000
      ? `${meta.latencyMs}ms`
      : "—";

  const healthy =
    mode === "stream" ||
    mode === "poll" ||
    mode === "syncing" ||
    mode === "slow";

  const tipText =
    tipStyle === "friendly" && healthy && !loadError
      ? `数据连接正常，每 ${pollSec}s 同步`
      : tipStyle === "friendly" && mode === "closed"
        ? "已休市 · 盘后快照"
        : tipStyle === "friendly" && mode === "failed"
          ? "连接异常 · 点击重连"
          : `状态：${meta.phase} | 数据源：${source} | 最后心跳：${heartbeat} | RTT / 间隔：${latency}`;

  return (
    <span
      className={`conn-capsule conn-capsule--${mode}${clickable ? " conn-capsule--click" : ""}${
        className ? ` ${className}` : ""
      }`}
      tabIndex={clickable ? 0 : 0}
      onClick={() => clickable && onReconnect?.()}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onReconnect?.();
        }
      }}
      onMouseEnter={() => setTipOpen(true)}
      onMouseLeave={() => setTipOpen(false)}
      onFocus={() => setTipOpen(true)}
      onBlur={() => setTipOpen(false)}
    >
      <span className="conn-dot" aria-hidden />
      <span className="conn-label">{label}</span>
      {tipOpen && (
        <span className="conn-tip" role="tooltip">
          {tipText}
        </span>
      )}
    </span>
  );
}