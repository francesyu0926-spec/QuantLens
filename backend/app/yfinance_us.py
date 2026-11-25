"""US equity OHLCV via yfinance."""

from __future__ import annotations

import asyncio
import logging
from zoneinfo import ZoneInfo

import pandas as pd

from .akshare_a import merge_candles
from .config import US_POLL_SEC
from .intervals import normalize_interval, yfinance_params
from .models import Candle, SymbolBook

logger = logging.getLogger(__name__)
US_EASTERN = ZoneInfo("America/New_York")


def fetch_us_bars(symbol: str, interval: str = "1m") -> list[Candle]:
    import yfinance as yf

    iv = normalize_interval(interval)
    yf_interval, period = yfinance_params(iv)
    ticker = yf.Ticker(symbol.upper())
    df = ticker.history(period=period, interval=yf_interval, auto_adjust=True)
    if df is None or df.empty:
        return []

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

    candles: list[Candle] = []
    for ts, row in df.iterrows():
        if pd.isna(row.get("Close")):
            continue
        t = int(ts.timestamp())
        if ts.tzinfo is None:
            t = int(ts.replace(tzinfo=US_EASTERN).timestamp())
        candles.append(
            Candle(
                time=t,
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row.get("Volume") or 0),
            )
        )
    return candles[-500:]


def fetch_us_minute_bars(symbol: str) -> list[Candle]:
    return fetch_us_bars(symbol, "1m")


class YfinanceUSFeed:
    def __init__(self, symbol: str, book: SymbolBook, interval: str = "1m") -> None:
        self.symbol = symbol.upper()
        self.interval = normalize_interval(interval)
        self.book = book

    async def bootstrap(self) -> None:
        candles = await asyncio.to_thread(fetch_us_bars, self.symbol, self.interval)
        merge_candles(self.book, candles)

    async def stream(self):
        if not self.book.candles:
            await self.bootstrap()

        while True:
            try:
                candles = await asyncio.to_thread(fetch_us_bars, self.symbol, self.interval)
                latest = merge_candles(self.book, candles)
                if latest is not None:
                    yield latest, latest.close
            except Exception as exc:
                logger.exception("US equity poll error %s: %s", self.symbol, exc)
                if self.book.candles:
                    c = self.book.candles[-1]
                    yield c, c.close

            await asyncio.sleep(US_POLL_SEC)