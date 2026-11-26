"""Post-close batch indicator library for full-market technical screening."""

from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .akshare_a import fetch_bars, normalize_a_share_code
from .indicators import compute_indicators
from .market_mode import A_SHARE_ONLY
from .rate_limit import AKSHARE_FETCH_LIMITER
from .screener import market_universe_rows
from .storage import (
    get_universe_indicator_build_meta,
    save_universe_indicator_row,
    save_universe_indicator_build_meta,
    universe_indicators_filter,
)

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="univ-ind")

_build_lock = asyncio.Lock()
_build_state: dict[str, Any] = {
    "running": False,
    "built_at": 0.0,
    "processed": 0,
    "total": 0,
    "last_error": None,
}


def _macd_golden_cross(candles: list[dict[str, Any]]) -> bool:
    if len(candles) < 40:
        return False
    prev = compute_indicators(candles[:-1])
    curr = compute_indicators(candles)
    m0, s0 = prev.get("macd"), prev.get("macd_signal")
    m1, s1 = curr.get("macd"), curr.get("macd_signal")
    if None in (m0, s0, m1, s1):
        return False
    return m0 <= s0 and m1 > s1


def _snapshot_one(symbol: str) -> dict[str, Any] | None:
    code = normalize_a_share_code(symbol)
    try:
        AKSHARE_FETCH_LIMITER.acquire(1.0)
        raw = fetch_bars(code, "1d")
    except Exception as exc:
        logger.debug("daily fetch failed %s: %s", code, exc)
        return None
    if len(raw) < 35:
        return None
    candles = [
        {
            "time": c.time,
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in raw
    ]
    ind = compute_indicators(candles)
    close = candles[-1]["close"]
    rsi = ind.get("rsi")
    ema20 = ind.get("ema20")
    flags = {
        "oversold": bool(rsi is not None and rsi < 30),
        "macd_cross": _macd_golden_cross(candles),
        "above_ema20": bool(
            ema20 is not None and close > ema20
        ),
    }
    return {
        "symbol": code,
        "close": close,
        "rsi": rsi,
        "ema20": ema20,
        "macd": ind.get("macd"),
        "macd_signal": ind.get("macd_signal"),
        "flags": flags,
    }


def _rank_symbols(rows: list[dict[str, Any]], max_symbols: int) -> list[str]:
    ranked = []
    for row in rows:
        code = str(row.get("symbol") or "")
        if len(code) != 6:
            continue
        vol = float(row.get("turnover") or row.get("amount") or 0)
        ranked.append((vol, code))
    ranked.sort(key=lambda x: x[0], reverse=True)
    if not ranked:
        return [str(r["symbol"]) for r in rows[:max_symbols] if r.get("symbol")]
    return [code for _, code in ranked[:max_symbols]]


async def rebuild_universe_indicators(max_symbols: int = 400) -> dict[str, Any]:
    if not A_SHARE_ONLY:
        return {"ok": False, "reason": "a_share_only"}

    async with _build_lock:
        if _build_state["running"]:
            return {"ok": False, "reason": "already_running"}
        _build_state["running"] = True
        _build_state["processed"] = 0
        _build_state["last_error"] = None

    try:
        rows = await asyncio.to_thread(market_universe_rows)
        symbols = _rank_symbols(rows, max(50, min(max_symbols, 800)))
        _build_state["total"] = len(symbols)
        loop = asyncio.get_running_loop()
        saved = 0
        for sym in symbols:
            snap = await loop.run_in_executor(_executor, _snapshot_one, sym)
            _build_state["processed"] += 1
            if not snap:
                continue
            await save_universe_indicator_row(
                snap["symbol"],
                snap["close"],
                snap.get("rsi"),
                snap.get("ema20"),
                snap.get("macd"),
                snap.get("macd_signal"),
                snap["flags"],
            )
            saved += 1

        built_at = time.time()
        await save_universe_indicator_build_meta(built_at, saved, "ok")
        _build_state["built_at"] = built_at
        return {"ok": True, "symbols": saved, "built_at": built_at}
    except Exception as exc:
        logger.exception("universe indicator rebuild failed: %s", exc)
        _build_state["last_error"] = str(exc)
        await save_universe_indicator_build_meta(time.time(), 0, "error")
        return {"ok": False, "error": str(exc)}
    finally:
        _build_state["running"] = False


async def universe_build_status() -> dict[str, Any]:
    meta = await get_universe_indicator_build_meta()
    return {
        "running": _build_state["running"],
        "processed": _build_state["processed"],
        "total": _build_state["total"],
        "built_at": meta.get("built_at") or _build_state["built_at"],
        "symbol_count": meta.get("symbol_count", 0),
        "status": meta.get("status", "idle"),
        "last_error": _build_state["last_error"],
    }


async def filter_universe_technical(preset: str, limit: int) -> list[str]:
    flag_key = {
        "oversold": "oversold",
        "macd_cross": "macd_cross",
        "above_ema20": "above_ema20",
    }.get(preset)
    if not flag_key:
        return []
    return await universe_indicators_filter(flag_key, limit=limit)


async def ensure_universe_indicators_fresh(max_age_sec: float = 86_400) -> None:
    meta = await get_universe_indicator_build_meta()
    built = float(meta.get("built_at") or 0)
    count = int(meta.get("symbol_count") or 0)
    if count > 0 and time.time() - built < max_age_sec:
        return
    if _build_state["running"]:
        return
    asyncio.create_task(rebuild_universe_indicators(400))