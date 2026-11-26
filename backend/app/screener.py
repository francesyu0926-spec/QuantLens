"""Post-close / on-demand A-share universe scan with in-memory cache."""

from __future__ import annotations

import logging
import time
from typing import Any

from .rate_limit import AKSHARE_FETCH_LIMITER

logger = logging.getLogger(__name__)

_CACHE_TTL_SEC = 35 * 60
_cache: tuple[float, list[dict[str, Any]]] | None = None


def _load_spot_rows() -> list[dict[str, Any]]:
    import akshare as ak

    AKSHARE_FETCH_LIMITER.acquire(2.0)
    df = ak.stock_zh_a_spot_em()
    if df is None or df.empty:
        return []
    rows: list[dict[str, Any]] = []
    for row in df.to_dict(orient="records"):
        try:
            code = str(row.get("代码") or row.get("symbol") or "").strip()
            if len(code) != 6 or not code.isdigit():
                continue
            name = str(row.get("名称") or code)
            pct = float(row.get("涨跌幅") or row.get("changepercent") or 0)
            price = float(row.get("最新价") or row.get("trade") or 0)
            turnover = float(
                row.get("成交额")
                or row.get("成交量")
                or row.get("amount")
                or 0
            )
            rows.append(
                {
                    "symbol": code,
                    "name": name,
                    "change_pct": pct,
                    "price": price,
                    "turnover": turnover,
                }
            )
        except (TypeError, ValueError):
            continue
    return rows


def market_universe_rows() -> list[dict[str, Any]]:
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < _CACHE_TTL_SEC:
        return _cache[1]
    try:
        rows = _load_spot_rows()
    except Exception as exc:
        logger.warning("universe spot load failed: %s", exc)
        rows = _cache[1] if _cache else []
    _cache = (now, rows)
    return rows


def apply_preset(
    preset: str,
    rows: list[dict[str, Any]],
    limit: int = 80,
) -> list[str]:
    if preset == "momentum":
        hits = [r for r in rows if r.get("change_pct", 0) > 3]
        hits.sort(key=lambda r: r["change_pct"], reverse=True)
    elif preset == "pullback":
        hits = [r for r in rows if -5 <= r.get("change_pct", 0) <= -1]
        hits.sort(key=lambda r: r["change_pct"])
    elif preset == "liquid":
        hits = [r for r in rows if (r.get("price") or 0) > 0]
        hits.sort(key=lambda r: abs(r.get("change_pct", 0)), reverse=True)
    else:
        hits = list(rows)
    return [str(r["symbol"]) for r in hits[:limit]]