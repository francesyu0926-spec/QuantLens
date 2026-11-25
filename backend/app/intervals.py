from __future__ import annotations

SUPPORTED_INTERVALS = ("1m", "5m", "15m", "1h", "4h", "1d")


def normalize_interval(raw: str) -> str:
    i = (raw or "").strip().lower()
    if i in ("", "undefined", "null", "none"):
        return "1m"
    aliases = {"1d": "1d", "1day": "1d", "d": "1d"}
    return aliases.get(i, i if i in SUPPORTED_INTERVALS else "1m")


def ccxt_timeframe(interval: str) -> str:
    return {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
        "4h": "4h",
        "1d": "1d",
    }.get(interval, "1m")


def akshare_minute_period(interval: str) -> str | None:
    return {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "1h": "60",
        "4h": "60",
    }.get(interval)


def yfinance_params(interval: str) -> tuple[str, str]:
    mapping: dict[str, tuple[str, str]] = {
        "1m": ("1m", "5d"),
        "5m": ("5m", "1mo"),
        "15m": ("15m", "1mo"),
        "1h": ("1h", "3mo"),
        "4h": ("1h", "6mo"),
        "1d": ("1d", "2y"),
    }
    return mapping.get(interval, ("1m", "5d"))