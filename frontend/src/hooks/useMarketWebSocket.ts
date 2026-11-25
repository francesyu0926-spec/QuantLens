import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertSignal, Candle, Indicators } from "../types/market";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8765/ws";

export interface MarketState {
  symbol: string;
  price: number;
  candles: Candle[];
  indicators: Indicators;
  signals: AlertSignal[];
  connected: boolean;
}

const defaultState = (): MarketState => ({
  symbol: "BTC/USDT",
  price: 0,
  candles: [],
  indicators: {},
  signals: [],
  connected: false,
});

export function useMarketWebSocket(symbol: string) {
  const [state, setState] = useState<MarketState>(defaultState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?symbol=${encodeURIComponent(symbol)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true, symbol }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type !== "market") return;

        setState((s) => {
          const candles = [...s.candles];
          const last = candles[candles.length - 1];
          if (last && last.time === data.candle.time) {
            candles[candles.length - 1] = data.candle;
          } else {
            candles.push(data.candle);
            if (candles.length > 500) candles.shift();
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
  }, [symbol]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}