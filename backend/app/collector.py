"""Market data collector: sliding K-line window + demo/live feeders."""

from __future__ import annotations

import asyncio
import math
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import AsyncIterator

from .config import DEMO_MODE, DEMO_TICK_MS, KLINE_WINDOW


@dataclass
class Candle:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    def to_dict(self) -> dict:
        return {
            "time": self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


@dataclass
class SymbolBook:
    symbol: str
    candles: deque[Candle] = field(default_factory=lambda: deque(maxlen=KLINE_WINDOW))
    last_price: float = 0.0

    def update_tick(self, price: float, volume: float = 0.0) -> Candle:
        self.last_price = price
        now = int(time.time())
        bucket = now - (now % 60)

        if self.candles and self.candles[-1].time == bucket:
            c = self.candles[-1]
            c.high = max(c.high, price)
            c.low = min(c.low, price)
            c.close = price
            c.volume += volume
            return c

        prev_close = self.candles[-1].close if self.candles else price
        candle = Candle(
            time=bucket,
            open=prev_close,
            high=max(prev_close, price),
            low=min(prev_close, price),
            close=price,
            volume=volume,
        )
        self.candles.append(candle)
        return candle


class DemoFeed:
    """Synthetic random-walk ticks for offline development."""

    def __init__(self, symbol: str, seed_price: float = 42000.0) -> None:
        self.symbol = symbol
        self.price = seed_price

    async def stream(self) -> AsyncIterator[tuple[float, float]]:
        while True:
            self.price *= 1 + random.gauss(0, 0.0008)
            vol = random.uniform(0.1, 3.0)
            yield self.price, vol
            await asyncio.sleep(DEMO_TICK_MS / 1000)


def seed_prices(symbol: str) -> float:
    defaults = {
        "BTC/USDT": 67000.0,
        "ETH/USDT": 3500.0,
        "AAPL": 228.0,
        "600519": 1450.0,
    }
    return defaults.get(symbol, 100.0 * (1 + (hash(symbol) % 50) / 100))


def bootstrap_history(symbol: str, book: SymbolBook, bars: int = 120) -> None:
    """Fill history so indicators warm up immediately."""
    price = seed_prices(symbol)
    t = int(time.time())
    start = t - bars * 60
    for i in range(bars):
        price *= 1 + math.sin(i / 8) * 0.002 + random.gauss(0, 0.001)
        bucket = start + i * 60
        o = price * (1 - random.uniform(0, 0.002))
        c = price
        h = max(o, c) * (1 + random.uniform(0, 0.003))
        l = min(o, c) * (1 - random.uniform(0, 0.003))
        book.candles.append(
            Candle(time=bucket, open=o, high=h, low=l, close=c, volume=random.uniform(1, 20))
        )
    book.last_price = price


class MarketCollector:
    def __init__(self) -> None:
        self._books: dict[str, SymbolBook] = {}

    def book(self, symbol: str) -> SymbolBook:
        if symbol not in self._books:
            self._books[symbol] = SymbolBook(symbol=symbol)
            bootstrap_history(symbol, self._books[symbol])
        return self._books[symbol]

    async def watch(self, symbol: str) -> AsyncIterator[tuple[Candle, float]]:
        book = self.book(symbol)
        if DEMO_MODE:
            feed = DemoFeed(symbol, book.last_price)
        else:
            feed = DemoFeed(symbol, book.last_price)  # TODO: ccxt / yfinance / akshare

        async for price, vol in feed.stream():
            candle = book.update_tick(price, vol)
            yield candle, price