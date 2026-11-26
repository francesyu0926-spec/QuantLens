"""Peers in the same industry using Eastmoney spot board."""

from __future__ import annotations

import logging
from typing import Any

from .rate_limit import AKSHARE_FETCH_LIMITER
from .screener import market_universe_rows

logger = logging.getLogger(__name__)


def peers_by_industry(industry: str, limit: int = 24) -> list[dict[str, Any]]:
    needle = industry.strip()
    if not needle:
        return []
    rows = market_universe_rows()
    hits: list[dict[str, Any]] = []
    try:
        import akshare as ak

        AKSHARE_FETCH_LIMITER.acquire(2.0)
        df = ak.stock_zh_a_spot_em()
        if df is None or df.empty:
            return []
        for row in df.to_dict(orient="records"):
            ind = str(
                row.get("行业")
                or row.get("所属行业")
                or row.get("板块")
                or ""
            )
            if needle not in ind and ind not in needle:
                continue
            code = str(row.get("代码") or "").strip()
            if len(code) != 6:
                continue
            name = str(row.get("名称") or code)
            pct = float(row.get("涨跌幅") or 0)
            price = float(row.get("最新价") or 0)
            hits.append(
                {
                    "symbol": code,
                    "name": name,
                    "change_pct": pct,
                    "price": price,
                    "industry": ind,
                }
            )
        hits.sort(key=lambda r: r.get("change_pct", 0), reverse=True)
        return hits[:limit]
    except Exception as exc:
        logger.warning("sector peers failed %s: %s", needle, exc)
        spot = {r["symbol"]: r for r in rows if r.get("symbol")}
        return list(spot.values())[:limit]