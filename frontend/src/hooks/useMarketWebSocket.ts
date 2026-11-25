import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertSignal, Candle, Indicators } from "../types/market";
import { dedupeCandles } from "../utils/candles";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8765/ws";
const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

export interface MarketState {
  symbol: string;
  price: number;
  candles: Candle[];
  indicators: Indicators;
  signals: AlertSignal[];
  connected: boolean;
  loading: boolean;
  loadError: string | null;
}

const defaultState = (): MarketState => ({
  symbol: "BTC/USDT",
  price: 0,
  candles: [],
  indicators: {},
  signals: [],
  connected: false,
  loading: true,
  loadError: null,
});

async function fetchSnapshot(symbol: string, interval: string) {
  const qs = new URLSearchParams({ symbol, interval: interval || "1m" });
  const res = await fetch(`${API}/klines?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{
    candles: Candle[];
    price: number;
    ok: boolean;
  }>;
}

export function useMarketWebSocket(symbol: string, interval: string) {
  const [state, setState] = useState<MarketState>(defaultState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const [retryCount, setRetryCount] = useState(0);

  const loadSnapshot = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, loadError: null }));
    try {
      const data = await fetchSnapshot(symbol, interval);
      if (data.ok && data.candles?.length) {
        setState((s) => ({
          ...s,
          candles: dedupeCandles(data.candles),
          price: data.price ?? s.price,
          loading: false,
          loadError: null,
          symbol,
        }));
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          loadError: "K 线为空，请重试或切换数据源",
        }));
      }
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        loadError: "加载失败，请检查后端是否运行",
      }));
    }
  }, [symbol, interval]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const qs = new URLSearchParams({
      symbol,
      interval: interval || "1m",
    });
    const ws = new WebSocket(`${WS_URL}?${qs.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({
        ...s,
        connected: true,
        symbol,
        loading: s.candles.length === 0,
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "status") {
          if (data.error) {
            setState((s) => ({
              ...s,
              loading: false,
              loadError: data.error,
            }));
          } else if (data.loading) {
            setState((s) => ({ ...s, loading: true, loadError: null }));
          }
          return;
        }
        if (data.type !== "market") return;

        setState((s) => {
          let candles: Candle[];
          if (Array.isArray(data.candles) && data.candles.length > 0) {
            candles = dedupeCandles(data.candles);
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

          const signals =
            data.signals?.length > 0
              ? [...data.signals, ...s.signals].slice(0, 100)
              : s.signals;

          return {
            ...s,
            price: data.price,
            candles,
            indicators: data.indicators ?? {},
            signals,
            loading: false,
            loadError: candles.length ? null : s.loadError,
          };
        });
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, [symbol, interval]);

  const retry = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setRetryCount((c) => c + 1);
    loadSnapshot();
    connect();
  }, [connect, loadSnapshot]);

  useEffect(() => {
    loadSnapshot();
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect, loadSnapshot, retryCount]);

  return { ...state, retry };
}