"""Lightweight last-price quotes for watchlist symbols."""

from __future__ import annotations

import asyncio

from .akshare_a import fetch_minute_bars, normalize_a_share_code
from .ccxt_crypto import fetch_crypto_minute_bars
from .market_mode import A_SHARE_ONLY
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


def _crypto_ticker_quote(symbol: str) -> dict[str, float | None]:
    from .crypto_exchange import create_crypto_exchange

    exchange = create_crypto_exchange()
    try:
        ticker = exchange.fetch_ticker(symbol)
        price = ticker.get("last") or ticker.get("close")
        if price is None:
            return {"price": None, "changePct": None, "sparkline": []}
        pct = ticker.get("percentage")
        return {
            "price": float(price),
            "changePct": float(pct) if pct is not None else None,
            "sparkline": [],
        }
    finally:
        exchange.close()


def fetch_quote_sync(symbol: str) -> dict[str, float | None]:
    kind = classify_market(symbol)
    if A_SHARE_ONLY and kind != "a_share":
        return {"price": None, "changePct": None, "sparkline": []}
    try:
        if kind == "crypto":
            return _crypto_ticker_quote(symbol)
        if kind == "a_share":
            code = normalize_a_share_code(symbol)
            from .akshare_a import fetch_bars

            candles = fetch_bars(code, "1m")
            if not candles:
                candles = fetch_bars(code, "1d")
        elif kind == "us_equity":
            candles = fetch_us_minute_bars(symbol)
        else:
            return {"price": None, "changePct": None, "sparkline": []}
        return _quote_from_candles(candles)
    except Exception:
        return {"price": None, "changePct": None, "sparkline": []}


async def fetch_quotes(symbols: list[str]) -> dict[str, dict[str, float | None]]:
    sem = asyncio.Semaphore(12)

    async def one(sym: str):
        async with sem:
            return await asyncio.to_thread(fetch_quote_sync, sym)

    async def keyed(sym: str) -> tuple[str, dict[str, float | None]]:
        key = sym.strip()
        if not key:
            return "", {"price": None, "changePct": None, "sparkline": []}
        try:
            row = await one(key)
            return key, row
        except Exception:
            return key, {"price": None, "changePct": None, "sparkline": []}

    rows = await asyncio.gather(*(keyed(sym) for sym in symbols))
    out: dict[str, dict[str, float | None]] = {}
    for key, row in rows:
        if key:
            out[key] = row
    return out