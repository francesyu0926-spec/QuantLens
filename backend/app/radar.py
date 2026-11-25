"""Multi-timeframe trend + RSI snapshot."""

from __future__ import annotations

import asyncio
from typing import Any

from .collector import MarketCollector
from .indicators import compute_indicators

RADAR_INTERVALS = ("5m", "15m", "1h", "1d", "1m", "4h")


def _trend_from(indicators: dict[str, float]) -> str:
    e20 = indicators.get("ema20")
    e50 = indicators.get("ema50")
    if e20 is None or e50 is None:
        return "neutral"
    if e20 > e50 * 1.0002:
        return "bull"
    if e20 < e50 * 0.9998:
        return "bear"
    return "neutral"


async def fetch_radar(collector: MarketCollector, symbol: str) -> list[dict[str, Any]]:
    async def one(interval: str) -> dict[str, Any]:
        book = await collector.ensure_history(symbol, interval)
        candles = [c.to_dict() for c in book.candles]
        indicators = compute_indicators(candles)
        rsi = indicators.get("rsi")
        return {
            "interval": interval,
            "trend": _trend_from(indicators),
            "rsi": round(rsi, 1) if rsi is not None else None,
            "bars": len(candles),
        }

    rows = await asyncio.gather(
        *[one(iv) for iv in RADAR_INTERVALS],
        return_exceptions=True,
    )
    out: list[dict[str, Any]] = []
    for iv, row in zip(RADAR_INTERVALS, rows):
        if isinstance(row, Exception):
            out.append({"interval": iv, "trend": "neutral", "rsi": None, "bars": 0})
        else:
            out.append(row)
    return out