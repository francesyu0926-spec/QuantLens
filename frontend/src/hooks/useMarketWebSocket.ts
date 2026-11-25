import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertSignal, Candle, Indicators } from "../types/market";
import { dedupeCandles } from "../utils/candles";
import {
  backoffDelayMs,
  WS_CONNECT_TIMEOUT_MS,
  WS_IDLE_BEFORE_PING_MS,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_PONG_WAIT_MS,
  WS_WATCHDOG_TICK_MS,
  type WsPhase,
} from "../utils/wsConnection";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8765/ws";
const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";
const LOAD_TIMEOUT_MS = 18_000;
const REST_TIMEOUT_MS = 20_000;

export interface ConnectionMeta {
  lastHeartbeat: number;
  latencyMs: number;
  reconnectAttempt: number;
  phase: WsPhase;
  online: boolean;
}

export interface MarketState {
  symbol: string;
  price: number;
  candles: Candle[];
  indicators: Indicators;
  signals: AlertSignal[];
  connected: boolean;
  loading: boolean;
  loadError: string | null;
  connectionMeta: ConnectionMeta;
}

const DEFAULT_SYM =
  import.meta.env.VITE_DEFAULT_SYMBOL?.trim() || "600519";

const defaultMeta = (): ConnectionMeta => ({
  lastHeartbeat: 0,
  latencyMs: 0,
  reconnectAttempt: 0,
  phase: "disconnected",
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
});

const defaultState = (): MarketState => ({
  symbol: DEFAULT_SYM,
  price: 0,
  candles: [],
  indicators: {},
  signals: [],
  connected: false,
  loading: true,
  loadError: null,
  connectionMeta: defaultMeta(),
});

async function fetchSnapshot(symbol: string, interval: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ symbol, interval: interval || "1m" });
    const res = await fetch(`${API}/klines?${qs.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<{
      candles: Candle[];
      price: number;
      ok: boolean;
    }>;
  } finally {
    clearTimeout(timer);
  }
}

function touchMessage(
  lastMessageAt: { current: number },
  pingAwaitingSince: { current: number | null },
  at = Date.now()
) {
  lastMessageAt.current = at;
  pingAwaitingSince.current = null;
}

export function useMarketWebSocket(symbol: string, interval: string) {
  const [state, setState] = useState<MarketState>(defaultState);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const loadTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const watchdogRef = useRef<ReturnType<typeof setInterval>>();
  const [retryCount, setRetryCount] = useState(0);
  const requestGen = useRef(0);
  const lastPacketAt = useRef(0);
  const lastMessageAt = useRef(Date.now());
  const pingAwaitingSince = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const symbolRef = useRef(symbol);
  const intervalRef = useRef(interval);
  const phaseRef = useRef<WsPhase>("disconnected");

  symbolRef.current = symbol;
  intervalRef.current = interval;

  const setPhase = useCallback((phase: WsPhase, attempt?: number) => {
    phaseRef.current = phase;
    const connected = phase === "connected";
    setState((s) => ({
      ...s,
      connected,
      connectionMeta: {
        ...s.connectionMeta,
        phase,
        reconnectAttempt:
          attempt ?? s.connectionMeta.reconnectAttempt,
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
      },
    }));
  }, []);

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = undefined;
    }
  }, []);

  const clearSocketTimers = useCallback(() => {
    clearTimeout(reconnectRef.current);
    clearTimeout(connectTimeoutRef.current);
    stopWatchdog();
  }, [stopWatchdog]);

  const loadSnapshot = useCallback(
    async (opts?: { gapFill?: boolean }) => {
      const gen = ++requestGen.current;
      const sym = symbolRef.current;
      const iv = intervalRef.current;
      const gapFill = opts?.gapFill ?? false;

      if (!gapFill) {
        setState((s) => ({
          ...s,
          loading: true,
          loadError: null,
        }));
      }
      try {
        const data = await fetchSnapshot(sym, iv);
        if (gen !== requestGen.current) return;
        if (data.ok && data.candles?.length) {
          setState((s) => ({
            ...s,
            candles: gapFill
              ? dedupeCandles(
                  s.candles.length
                    ? [...s.candles, ...data.candles]
                    : data.candles
                )
              : dedupeCandles(data.candles),
            price: data.price ?? s.price,
            loading: false,
            loadError: null,
            symbol: sym,
          }));
        } else if (!gapFill) {
          setState((s) => ({
            ...s,
            loading: false,
            loadError:
              "K 线为空（数据源繁忙或限流），请稍后点「重新加载」",
          }));
        }
      } catch {
        if (gen !== requestGen.current) return;
        if (!gapFill) {
          setState((s) => ({
            ...s,
            loading: false,
            loadError: "timeout",
          }));
        }
      }
    },
    []
  );

  const destroySocket = useCallback(() => {
    intentionalCloseRef.current = true;
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    wsRef.current = null;
  }, []);

  function scheduleReconnect() {
    clearTimeout(reconnectRef.current);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      reconnectAttemptRef.current = WS_MAX_RECONNECT_ATTEMPTS;
      setPhase("failed", WS_MAX_RECONNECT_ATTEMPTS);
      return;
    }

    reconnectAttemptRef.current += 1;
    const attempt = reconnectAttemptRef.current;

    if (attempt > WS_MAX_RECONNECT_ATTEMPTS) {
      setPhase("failed", attempt);
      return;
    }

    setPhase("reconnecting", attempt);
    const delay = backoffDelayMs(attempt - 1);
    reconnectRef.current = setTimeout(() => {
      connectWs();
    }, delay);
  }

  const startWatchdog = useCallback(() => {
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (phaseRef.current !== "connected") return;

      const now = Date.now();
      const idle = now - lastMessageAt.current;

      if (pingAwaitingSince.current != null) {
        if (now - pingAwaitingSince.current > WS_PONG_WAIT_MS) {
          console.warn("[ws] watchdog: pong timeout, closing zombie socket");
          pingAwaitingSince.current = null;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (idle >= WS_IDLE_BEFORE_PING_MS) {
        pingAwaitingSince.current = now;
        try {
          ws.send(JSON.stringify({ type: "ping", ts: now }));
        } catch {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      }
    }, WS_WATCHDOG_TICK_MS);
  }, [stopWatchdog]);

  function connectWs() {
    clearSocketTimers();
    destroySocket();

    setPhase("connecting", reconnectAttemptRef.current);

    const qs = new URLSearchParams({
      symbol: symbolRef.current,
      interval: intervalRef.current || "1m",
    });
    const ws = new WebSocket(`${WS_URL}?${qs.toString()}`);
    wsRef.current = ws;

    connectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn("[ws] connect timeout");
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    }, WS_CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(connectTimeoutRef.current);
      reconnectAttemptRef.current = 0;
      touchMessage(lastMessageAt, pingAwaitingSince);
      setPhase("connected", 0);
      startWatchdog();

      if (hadConnectedRef.current) {
        void loadSnapshot({ gapFill: true });
      }
      hadConnectedRef.current = true;
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        if (data.type === "pong") {
          const beatAt = Date.now();
          const clientTs = Number(data.ts);
          const rtt =
            clientTs > 0 && beatAt >= clientTs ? beatAt - clientTs : 0;
          touchMessage(lastMessageAt, pingAwaitingSince, beatAt);
          setState((s) => ({
            ...s,
            connectionMeta: {
              ...s.connectionMeta,
              lastHeartbeat: beatAt,
              latencyMs: rtt > 0 ? rtt : s.connectionMeta.latencyMs,
            },
          }));
          return;
        }

        if (data.type === "status") {
          touchMessage(lastMessageAt, pingAwaitingSince);
          if (data.error) {
            setState((s) => ({
              ...s,
              loading: false,
              loadError: s.candles.length > 0 ? null : data.error,
            }));
          } else if (data.loading) {
            setState((s) =>
              s.loadError ? s : { ...s, loading: true, loadError: null }
            );
          }
          return;
        }

        if (data.type !== "market") return;

        touchMessage(lastMessageAt, pingAwaitingSince);
        const beatAt = Date.now();
        const beatGap = lastPacketAt.current ? beatAt - lastPacketAt.current : 0;
        lastPacketAt.current = beatAt;

        setState((s) => {
          let candles: Candle[];
          if (Array.isArray(data.candles) && data.candles.length > 0) {
            candles = dedupeCandles(data.candles);
          } else if (s.candles.length === 0) {
            return {
              ...s,
              price: data.price ?? s.price,
              loading: false,
              loadError: "K 线为空，请重试",
              connectionMeta: {
                ...s.connectionMeta,
                lastHeartbeat: beatAt,
                latencyMs: beatGap,
              },
            };
          } else {
            candles = [...s.candles];
            const last = candles[candles.length - 1];
            if (last && last.time === data.candle.time) {
              candles[candles.length - 1] = data.candle;
            } else {
              candles.push(data.candle);
              if (candles.length > 500) candles.shift();
            }
            candles = dedupeCandles(candles);
          }

          const sym = symbolRef.current;
          const incoming = (data.signals ?? []) as AlertSignal[];
          const signals =
            incoming.length > 0
              ? [...incoming, ...s.signals.filter((x) => x.symbol === sym)]
                  .filter((x) => x.symbol === sym)
                  .slice(0, 100)
              : s.signals.filter((x) => x.symbol === sym);

          return {
            ...s,
            price: data.price,
            candles,
            indicators: data.indicators ?? {},
            signals,
            loading: false,
            loadError: candles.length ? null : s.loadError,
            connectionMeta: {
              ...s.connectionMeta,
              lastHeartbeat: beatAt,
              latencyMs: beatGap,
            },
          };
        });
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      clearTimeout(connectTimeoutRef.current);
      stopWatchdog();
      const deliberate = intentionalCloseRef.current;
      intentionalCloseRef.current = false;

      if (deliberate) {
        setState((s) => ({ ...s, connected: false }));
        return;
      }

      if (phaseRef.current !== "failed") {
        setState((s) => ({
          ...s,
          connected: false,
          connectionMeta: {
            ...s.connectionMeta,
            phase: "reconnecting",
          },
        }));
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  const retry = useCallback(() => {
    clearTimeout(reconnectRef.current);
    reconnectAttemptRef.current = 0;
    phaseRef.current = "connecting";
    destroySocket();
    setRetryCount((c) => c + 1);
    void loadSnapshot();
    connectWs();
  }, [destroySocket, loadSnapshot]);

  useEffect(() => {
    requestGen.current += 1;
    lastPacketAt.current = 0;
    lastMessageAt.current = Date.now();
    pingAwaitingSince.current = null;
    reconnectAttemptRef.current = 0;
    hadConnectedRef.current = false;

    setState((s) => ({
      ...s,
      symbol,
      loading: true,
      loadError: null,
      candles: [],
      price: 0,
      indicators: {},
      signals: [],
      connected: false,
      connectionMeta: defaultMeta(),
    }));

    void loadSnapshot();
    connectWs();

    clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      setState((s) => {
        if (!s.loading || s.candles.length > 0) return s;
        return {
          ...s,
          loading: false,
          loadError: "timeout",
        };
      });
    }, LOAD_TIMEOUT_MS);

    return () => {
      clearSocketTimers();
      destroySocket();
    };
  }, [symbol, interval, retryCount]);

  useEffect(() => {
    const onOnline = () => {
      setState((s) => ({
        ...s,
        connectionMeta: { ...s.connectionMeta, online: true },
      }));
      if (phaseRef.current === "failed") {
        reconnectAttemptRef.current = 0;
        connectWs();
      }
    };
    const onOffline = () => {
      setState((s) => ({
        ...s,
        connectionMeta: { ...s.connectionMeta, online: false },
      }));
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { ...state, retry };
}