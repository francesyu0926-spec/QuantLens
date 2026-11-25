"""Lightweight last-price quotes for watchlist symbols."""

from __future__ import annotations

import asyncio

from .akshare_a import fetch_minute_bars, normalize_a_share_code
from .ccxt_crypto import fetch_crypto_minute_bars
from .symbols import classify_market
from .yfinance_us import fetch_us_minute_bars


def _quote_from_candles(candles) -> dict:
    if not candles:
        return {"price": None, "changePct": None, "sparkline": []}
    spark = [float(c.close) for c in candles[-30:]]
    if len(candles) < 2:
        return {"price": float(candles[-1].close), "changePct": None, "sparkline": spark}
    last = candles[-1]
    prev = candles[-2]
    price = float(last.close)
    base = float(prev.close)
    change = ((price - base) / base * 100) if base else None
    return {"price": price, "changePct": change, "sparkline": spark}


def fetch_quote_sync(symbol: str) -> dict[str, float | None]:
    kind = classify_market(symbol)
    try:
        if kind == "a_share":
            code = normalize_a_share_code(symbol)
            from .akshare_a import fetch_bars

            candles = fetch_bars(code, "1m")
            if not candles:
                candles = fetch_bars(code, "1d")
        elif kind == "crypto":
            candles = fetch_crypto_minute_bars(symbol)
        elif kind == "us_equity":
            candles = fetch_us_minute_bars(symbol)
        else:
            return {"price": None, "changePct": None, "sparkline": []}
        return _quote_from_candles(candles)
    except Exception:
        return {"price": None, "changePct": None, "sparkline": []}


async def fetch_quotes(symbols: list[str]) -> dict[str, dict[str, float | None]]:
    tasks = [asyncio.to_thread(fetch_quote_sync, sym) for sym in symbols]
    rows = await asyncio.gather(*tasks, return_exceptions=True)
    out: dict[str, dict[str, float | None]] = {}
    for sym, row in zip(symbols, rows):
        if isinstance(row, Exception):
            out[sym] = {"price": None, "changePct": None, "sparkline": []}
        else:
            out[sym] = row
    return out