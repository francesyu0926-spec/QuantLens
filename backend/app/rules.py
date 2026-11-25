"""Simple built-in alert rules (RSI oversold + BB break)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from .indicators import compute_indicators


def scan_signals(
    symbol: str,
    price: float,
    candles: list[dict[str, Any]],
    indicators: dict[str, float],
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    ts = int(time.time() * 1000)

    rsi = indicators.get("rsi")
    if rsi is not None and rsi < 30:
        signals.append(
            {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "rule": "rsi_oversold",
                "message": f"RSI(14) = {rsi:.1f} < 30 超卖",
                "price": price,
                "ts": ts,
            }
        )

    bb_lower = indicators.get("bb_lower")
    if bb_lower is not None and price < bb_lower:
        signals.append(
            {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "rule": "bb_break_lower",
                "message": "价格跌破布林下轨",
                "price": price,
                "ts": ts,
            }
        )

    ema20 = indicators.get("ema20")
    ema50 = indicators.get("ema50")
    if ema20 is not None and ema50 is not None and ema20 > ema50:
        if len(candles) >= 2:
            prev_ind = compute_indicators(candles[:-1])
            p20 = prev_ind.get("ema20")
            p50 = prev_ind.get("ema50")
            if p20 is not None and p50 is not None and p20 <= p50:
                signals.append(
                    {
                        "id": str(uuid.uuid4()),
                        "symbol": symbol,
                        "rule": "ema_golden_cross",
                        "message": "EMA20 上穿 EMA50",
                        "price": price,
                        "ts": ts,
                    }
                )

    return signals