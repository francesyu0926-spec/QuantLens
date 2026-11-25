import { useMemo, useState } from "react";
import { ChartPanel } from "./components/ChartPanel";
import { IndicatorPanel } from "./components/IndicatorPanel";
import { SignalLog } from "./components/SignalLog";
import { Watchlist } from "./components/Watchlist";
import { useMarketWebSocket } from "./hooks/useMarketWebSocket";
import type { WatchlistItem } from "./types/market";

const WATCHLIST_SEED: WatchlistItem[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 0, changePct: 0 },
  { symbol: "ETH/USDT", name: "Ethereum", price: 0, changePct: 0 },
  { symbol: "AAPL", name: "Apple", price: 0, changePct: 0 },
  { symbol: "600519", name: "贵州茅台", price: 0, changePct: 0 },
];

export default function App() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const market = useMarketWebSocket(symbol);

  const watchlist = useMemo(() => {
    return WATCHLIST_SEED.map((item) =>
      item.symbol === symbol
        ? {
            ...item,
            price: market.price,
            changePct:
              market.candles.length >= 2
                ? ((market.price -
                    market.candles[market.candles.length - 2].close) /
                    market.candles[market.candles.length - 2].close) *
                  100
                : 0,
          }
        : item
    );
  }, [symbol, market.price, market.candles]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>QuantLens</h1>
        <span className={`status ${market.connected ? "on" : "off"}`}>
          {market.connected ? "实时连接" : "重连中…"}
        </span>
        <span className="symbol-tag">{symbol}</span>
        <span className="live-price">{market.price.toFixed(2)}</span>
      </header>

      <div className="layout">
        <Watchlist items={watchlist} active={symbol} onSelect={setSymbol} />
        <main className="chart-area">
          <ChartPanel candles={market.candles} />
          <IndicatorPanel indicators={market.indicators} price={market.price} />
        </main>
        <SignalLog signals={market.signals} />
      </div>
    </div>
  );
}