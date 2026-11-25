"""Market data collector: routes symbols to live data feeds."""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from .akshare_a import AkshareAShareFeed, fetch_bars, merge_candles, normalize_a_share_code
from .ccxt_crypto import CcxtCryptoFeed, fetch_crypto_bars
from .intervals import normalize_interval
from .models import Candle, SymbolBook
from .symbols import classify_market
from .yfinance_us import YfinanceUSFeed, fetch_us_bars

logger = logging.getLogger(__name__)


class MarketCollector:
    def __init__(self) -> None:
        self._books: dict[str, SymbolBook] = {}
        self._bootstrap_locks: dict[str, asyncio.Lock] = {}

    @staticmethod
    def _key(symbol: str, interval: str) -> str:
        return f"{symbol}@{normalize_interval(interval)}"

    def book(self, symbol: str, interval: str = "1m") -> SymbolBook:
        key = self._key(symbol, interval)
        if key not in self._books:
            self._books[key] = SymbolBook(symbol=symbol)
        return self._books[key]

    def _lock(self, key: str) -> asyncio.Lock:
        if key not in self._bootstrap_locks:
            self._bootstrap_locks[key] = asyncio.Lock()
        return self._bootstrap_locks[key]

    async def ensure_history(self, symbol: str, interval: str = "1m") -> SymbolBook:
        iv = normalize_interval(interval)
        key = self._key(symbol, iv)
        book = self.book(symbol, iv)
        if book.candles:
            return book

        async with self._lock(key):
            if book.candles:
                return book
            kind = classify_market(symbol)

            def load_sync() -> list[Candle]:
                if kind == "a_share":
                    code = normalize_a_share_code(symbol)
                    bars = fetch_bars(code, iv)
                    if not bars and iv != "1d":
                        bars = fetch_bars(code, "1d")
                    return bars
                if kind == "crypto":
                    return fetch_crypto_bars(symbol, iv)
                if kind == "us_equity":
                    return fetch_us_bars(symbol, iv)
                return []

            try:
                candles = await asyncio.wait_for(
                    asyncio.to_thread(load_sync), timeout=45.0
                )
                merge_candles(book, candles)
            except Exception as exc:
                logger.exception("ensure_history failed %s@%s: %s", symbol, iv, exc)
            return book

    async def watch(
        self, symbol: str, interval: str = "1m"
    ) -> AsyncIterator[tuple[Candle, float]]:
        iv = normalize_interval(interval)
        book = await self.ensure_history(symbol, iv)
        kind = classify_market(symbol)

        if kind == "a_share":
            feed = AkshareAShareFeed(symbol, book, iv)
        elif kind == "crypto":
            feed = CcxtCryptoFeed(symbol, book, iv)
        elif kind == "us_equity":
            feed = YfinanceUSFeed(symbol, book, iv)
        else:
            logger.error("Unsupported symbol %s", symbol)
            raise ValueError(f"Unsupported symbol: {symbol}")

        async for candle, price in feed.stream():
            yield candle, price