"""Built-in alert rules with per-bar deduplication."""

from __future__ import annotations

import time
import uuid
from typing import Any

from .indicators import compute_indicators


class SignalGuard:
    """One alert per (symbol, rule, bar_time) — prevents tick-level spam."""

    def __init__(self, max_keys: int = 2000) -> None:
        self._seen: set[tuple[str, str, int]] = set()
        self._max_keys = max_keys

    def allow(self, symbol: str, rule: str, bar_time: int) -> bool:
        key = (symbol, rule, bar_time)
        if key in self._seen:
            return False
        if len(self._seen) >= self._max_keys:
            self._seen.clear()
        self._seen.add(key)
        return True


_guard = SignalGuard()


def scan_signals(
    symbol: str,
    price: float,
    candles: list[dict[str, Any]],
    indicators: dict[str, float],
) -> list[dict[str, Any]]:
    if not candles:
        return []

    bar_time = int(candles[-1]["time"])
    signals: list[dict[str, Any]] = []
    ts = int(time.time() * 1000)

    def emit(rule: str, message: str) -> None:
        if not _guard.allow(symbol, rule, bar_time):
            return
        signals.append(
            {
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "rule": rule,
                "message": f"[盘中预警] {message}",
                "price": price,
                "ts": ts,
                "bar_time": bar_time,
            }
        )

    rsi = indicators.get("rsi")
    if rsi is not None and rsi < 30:
        emit("rsi_oversold", f"RSI(14) = {rsi:.1f} < 30 超卖")

    bb_lower = indicators.get("bb_lower")
    if bb_lower is not None and price < bb_lower:
        emit("bb_break_lower", "价格跌破布林下轨")

    bb_upper = indicators.get("bb_upper")
    if bb_upper is not None and price > bb_upper:
        emit("bb_break_upper", "价格突破布林上轨")

    if rsi is not None and rsi > 70:
        emit("rsi_overbought", f"RSI(14) = {rsi:.1f} > 70 超买")

    ema20 = indicators.get("ema20")
    ema50 = indicators.get("ema50")
    if ema20 is not None and ema50 is not None and len(candles) >= 2:
        prev_ind = compute_indicators(candles[:-1])
        p20 = prev_ind.get("ema20")
        p50 = prev_ind.get("ema50")
        if p20 is not None and p50 is not None and p20 <= p50 and ema20 > ema50:
            emit("ema_golden_cross", "EMA20 上穿 EMA50")
        if p20 is not None and p50 is not None and p20 >= p50 and ema20 < ema50:
            emit("ema_death_cross", "EMA20 下穿 EMA50")

    return signals