"""Cryptocurrency OHLCV via CCXT (Binance public API)."""

from __future__ import annotations

import asyncio
import logging

from .akshare_a import merge_candles
from .config import CRYPTO_POLL_SEC
from .intervals import ccxt_timeframe, normalize_interval
from .models import Candle, SymbolBook

logger = logging.getLogger(__name__)


def fetch_crypto_bars(symbol: str, interval: str = "1m") -> list[Candle]:
    from .crypto_exchange import fetch_ohlcv_with_fallback

    tf = ccxt_timeframe(normalize_interval(interval))
    rows = fetch_ohlcv_with_fallback(symbol, tf, limit=500)

    candles: list[Candle] = []
    for ts, o, h, l, c, v in rows:
        candles.append(
            Candle(
                time=int(ts // 1000),
                open=float(o),
                high=float(h),
                low=float(l),
                close=float(c),
                volume=float(v or 0),
            )
        )
    return candles


def fetch_crypto_minute_bars(symbol: str) -> list[Candle]:
    return fetch_crypto_bars(symbol, "1m")


class CcxtCryptoFeed:
    def __init__(self, symbol: str, book: SymbolBook, interval: str = "1m") -> None:
        self.symbol = symbol
        self.interval = normalize_interval(interval)
        self.book = book

    async def bootstrap(self) -> None:
        candles = await asyncio.to_thread(fetch_crypto_bars, self.symbol, self.interval)
        merge_candles(self.book, candles)

    async def stream(self):
        if not self.book.candles:
            await self.bootstrap()

        while True:
            try:
                candles = await asyncio.to_thread(
                    fetch_crypto_bars, self.symbol, self.interval
                )
                latest = merge_candles(self.book, candles)
                if latest is not None:
                    yield latest, latest.close
            except Exception as exc:
                logger.exception("Crypto poll error %s: %s", self.symbol, exc)
                if self.book.candles:
                    c = self.book.candles[-1]
                    yield c, c.close

            await asyncio.sleep(CRYPTO_POLL_SEC)