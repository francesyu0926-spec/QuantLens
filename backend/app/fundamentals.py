"""A-share fundamentals and capital flow (East Money + Tencent fallback)."""

from __future__ import annotations

import logging
import re
import time
import urllib.error
import urllib.request
from typing import Any

from .akshare_a import is_a_share, is_listed_etf, normalize_a_share_code

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL_SEC = 90.0
_HTTP_TIMEOUT = 8.0


def _market_for_code(code: str) -> str:
    if code.startswith(("4", "8")):
        return "bj"
    if code.startswith(("5", "6", "9")):
        return "sh"
    return "sz"


def _tencent_prefix(code: str) -> str:
    if code.startswith(("5", "6", "9")):
        return f"sh{code}"
    return f"sz{code}"


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


def _http_get_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://finance.sina.com.cn",
        },
    )
    with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
        return resp.read().decode("gbk", "replace")


def _fetch_tencent_snapshot(code: str) -> dict[str, Any] | None:
    """Tencent qt.gtimg.cn — works when East Money TLS fails."""
    try:
        raw = _http_get_text(f"http://qt.gtimg.cn/q={_tencent_prefix(code)}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.debug("tencent quote %s: %s", code, exc)
        return None
    m = re.search(r'"(.*)"', raw)
    if not m:
        return None
    parts = m.group(1).split("~")
    if len(parts) < 47:
        return None
    cap_yi = _parse_number(parts[44])
    market_cap = cap_yi * 1e8 if cap_yi is not None else None
    return {
        "name": parts[1] if len(parts) > 1 else None,
        "pe_ttm": _parse_number(parts[39]) if len(parts) > 39 else None,
        "pb": _parse_number(parts[46]) if len(parts) > 46 else None,
        "market_cap": market_cap,
        "source": "tencent",
    }


def _info_map_em(code: str) -> dict[str, str]:
    import akshare as ak

    df = ak.stock_individual_info_em(symbol=code)
    out: dict[str, str] = {}
    for row in df.to_dict(orient="records"):
        key = str(row.get("item", row.get("项目", ""))).strip()
        val = row.get("value", row.get("值", ""))
        if key:
            out[key] = str(val).strip()
    return out


def fetch_fundamentals_sync(symbol: str) -> dict[str, Any]:
    code = normalize_a_share_code(symbol)
    if not is_a_share(symbol):
        return {"ok": False, "symbol": code, "reason": "not_a_share"}
    now = time.time()
    if is_listed_etf(code):
        hit = _CACHE.get(f"f:{code}")
        if hit and now - hit[0] < _TTL_SEC:
            return hit[1]
        snap = _fetch_tencent_snapshot(code)
        if not snap:
            payload = {
                "ok": False,
                "symbol": code,
                "reason": "unavailable",
                "is_etf": True,
            }
            return payload
        pe = snap.get("pe_ttm")
        pb = snap.get("pb")
        payload = {
            "ok": True,
            "symbol": code,
            "is_etf": True,
            "name": snap.get("name"),
            "industry": "ETF",
            "market_cap": snap.get("market_cap"),
            "pe_ttm": pe if pe and pe > 0 else None,
            "pb": pb if pb and pb > 0 else None,
            "listing_date": None,
            "warnings": [] if pe else ["etf_metrics_limited"],
            "source": snap.get("source", "tencent"),
            "ts": int(now),
        }
        _CACHE[f"f:{code}"] = (now, payload)
        return payload
    hit = _CACHE.get(f"f:{code}")
    if hit and now - hit[0] < _TTL_SEC:
        return hit[1]

    info: dict[str, str] = {}
    try:
        info = _info_map_em(code)
    except Exception as exc:  # noqa: BLE001
        logger.info("em info skipped %s: %s", code, exc)

    snap = _fetch_tencent_snapshot(code)
    if not snap and not info:
        payload = {"ok": False, "symbol": code, "reason": "unavailable"}
        return payload

    market_cap = snap.get("market_cap") if snap else None
    if market_cap is None and info:
        market_cap = _parse_number(info.get("总市值") or info.get("流通市值"))

    payload: dict[str, Any] = {
        "ok": True,
        "symbol": code,
        "name": (snap or {}).get("name")
        or info.get("股票简称")
        or info.get("证券简称"),
        "industry": info.get("行业") or info.get("所属行业"),
        "market_cap": market_cap,
        "pe_ttm": (snap or {}).get("pe_ttm")
        or _parse_number(info.get("市盈率") or info.get("PE")),
        "pb": (snap or {}).get("pb"),
        "listing_date": info.get("上市时间"),
        "warnings": [],
        "source": (snap or {}).get("source", "em"),
        "ts": int(now),
    }

    _CACHE[f"f:{code}"] = (now, payload)
    return payload


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
        try:
            df = ak.stock_fund_flow_individual_hist_em(symbol=code, market=market)
        except Exception as exc:  # noqa: BLE001
            logger.info("capital flow unavailable %s: %s", code, exc)
            return {"ok": False, "symbol": code, "reason": "unavailable"}
    except Exception as exc:  # noqa: BLE001
        logger.info("capital flow unavailable %s: %s", code, exc)
        return {"ok": False, "symbol": code, "reason": "unavailable"}

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