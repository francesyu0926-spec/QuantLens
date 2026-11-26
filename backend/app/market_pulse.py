"""Limit-up / limit-down stats and call-auction phase hint."""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from .rate_limit import AKSHARE_FETCH_LIMITER

logger = logging.getLogger(__name__)
CN = ZoneInfo("Asia/Shanghai")
_cache: tuple[float, dict[str, Any]] | None = None
_TTL = 45.0


def _auction_phase(now: datetime) -> str | None:
    mins = now.hour * 60 + now.minute
    if 9 * 60 + 15 <= mins < 9 * 60 + 25:
        return "call_auction"
    return None


def fetch_market_pulse() -> dict[str, Any]:
    global _cache
    now = datetime.now(CN)
    phase = _auction_phase(now)
    base: dict[str, Any] = {
        "phase": phase,
        "limit_up": None,
        "limit_down": None,
        "updated_at": time.time(),
    }
    if now.weekday() >= 5:
        base["note"] = "休市"
        return base

    t = time.time()
    if _cache and t - _cache[0] < _TTL:
        hit = dict(_cache[1])
        hit["phase"] = phase
        return hit

    up_n: int | None = None
    dn_n: int | None = None
    try:
        import akshare as ak

        AKSHARE_FETCH_LIMITER.acquire(2.0)
        zt = ak.stock_zt_pool_em(date=now.strftime("%Y%m%d"))
        if zt is not None and not zt.empty:
            up_n = len(zt)
        AKSHARE_FETCH_LIMITER.acquire(1.0)
        dt = ak.stock_dt_pool_em(date=now.strftime("%Y%m%d"))
        if dt is not None and not dt.empty:
            dn_n = len(dt)
    except Exception as exc:
        logger.debug("market pulse failed: %s", exc)

    base["limit_up"] = up_n
    base["limit_down"] = dn_n
    if phase == "call_auction":
        base["note"] = "集合竞价 9:15–9:25 · 关注量价与封单"
    _cache = (t, base)
    return base