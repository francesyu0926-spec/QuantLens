"""A-share fundamentals and capital flow via AKShare."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from .akshare_a import is_a_share, is_listed_etf, normalize_a_share_code

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL_SEC = 90.0


def _market_for_code(code: str) -> str:
    if code.startswith(("4", "8")):
        return "bj"
    if code.startswith(("5", "6", "9")):
        return "sh"
    return "sz"


def _parse_number(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip().replace(",", "")
    if not text or text in {"-", "—", "--", "nan"}:
        return None
    m = re.search(r"-?[\d.]+", text)
    if not m:
        return None
    try:
        val = float(m.group())
        if "亿" in text:
            val *= 1e8
        elif "万" in text:
            val *= 1e4
        return val
    except ValueError:
        return None


def _info_map(code: str) -> dict[str, str]:
    import akshare as ak

    df = ak.stock_individual_info_em(symbol=code)
    out: dict[str, str] = {}
    for row in df.to_dict(orient="records"):
        key = str(row.get("item", row.get("项目", ""))).strip()
        val = row.get("value", row.get("值", ""))
        if key:
            out[key] = str(val).strip()
    return out


def _spot_valuation(code: str) -> dict[str, float | None]:
    """Try EastMoney spot row for PE/PB."""
    import akshare as ak

    try:
        df = ak.stock_zh_a_spot_em()
        row = df[df["代码"].astype(str).str.zfill(6) == code.zfill(6)]
        if row.empty:
            return {"pe_ttm": None, "pb": None}
        r = row.iloc[0]
        return {
            "pe_ttm": _parse_number(r.get("市盈率-动态", r.get("市盈率"))),
            "pb": _parse_number(r.get("市净率")),
        }
    except Exception as exc:  # noqa: BLE001
        logger.debug("spot valuation failed %s: %s", code, exc)
        return {"pe_ttm": None, "pb": None}


def fetch_fundamentals_sync(symbol: str) -> dict[str, Any]:
    code = normalize_a_share_code(symbol)
    if not is_a_share(symbol):
        return {"ok": False, "symbol": code, "reason": "not_a_share"}
    if is_listed_etf(code):
        return {"ok": False, "symbol": code, "reason": "etf"}

    now = time.time()
    hit = _CACHE.get(f"f:{code}")
    if hit and now - hit[0] < _TTL_SEC:
        return hit[1]

    try:
        info = _info_map(code)
        val = _spot_valuation(code)
        market_cap = _parse_number(
            info.get("总市值") or info.get("流通市值")
        )
        payload: dict[str, Any] = {
            "ok": True,
            "symbol": code,
            "name": info.get("股票简称") or info.get("证券简称"),
            "industry": info.get("行业"),
            "market_cap": market_cap,
            "pe_ttm": val.get("pe_ttm"),
            "pb": val.get("pb"),
            "listing_date": info.get("上市时间"),
            "warnings": [],
            "ts": int(now),
        }
        if payload["pe_ttm"] is None:
            payload["pe_ttm"] = _parse_number(info.get("市盈率") or info.get("PE"))
        _CACHE[f"f:{code}"] = (now, payload)
        return payload
    except Exception as exc:  # noqa: BLE001
        logger.warning("fundamentals %s: %s", code, exc)
        return {"ok": False, "symbol": code, "reason": str(exc)}


def fetch_capital_flow_sync(symbol: str) -> dict[str, Any]:
    code = normalize_a_share_code(symbol)
    if not is_a_share(symbol) or is_listed_etf(code):
        return {"ok": False, "symbol": code, "reason": "unsupported"}

    now = time.time()
    hit = _CACHE.get(f"c:{code}")
    if hit and now - hit[0] < _TTL_SEC:
        return hit[1]

    import akshare as ak

    market = _market_for_code(code)
    try:
        df = ak.stock_individual_fund_flow(stock=code, market=market)
    except TypeError:
        df = ak.stock_fund_flow_individual_hist_em(symbol=code, market=market)
    except Exception as exc:  # noqa: BLE001
        logger.warning("capital flow %s: %s", code, exc)
        return {"ok": False, "symbol": code, "reason": str(exc)}

    if df is None or df.empty:
        return {"ok": False, "symbol": code, "reason": "empty"}

    row = df.iloc[-1]
    main_net = _parse_number(
        row.get("主力净流入-净额", row.get("主力净流入"))
    )
    main_pct = _parse_number(row.get("主力净流入-净占比"))
    super_net = _parse_number(row.get("超大单净流入-净额"))
    large_net = _parse_number(row.get("大单净流入-净额"))

    cap = 5e8
    if main_net is not None:
        cap = max(cap, abs(main_net) * 2.5)
    score = 0.0
    if main_net is not None and cap > 0:
        score = max(-1.0, min(1.0, main_net / cap))

    payload = {
        "ok": True,
        "symbol": code,
        "date": str(row.get("日期", "")),
        "main_net_inflow": main_net,
        "main_net_pct": main_pct,
        "super_large_net": super_net,
        "large_net": large_net,
        "flow_score": score,
        "ts": int(now),
    }
    _CACHE[f"c:{code}"] = (now, payload)
    return payload