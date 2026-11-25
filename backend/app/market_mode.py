"""Deployment market scope (A-share only vs multi-market)."""

from __future__ import annotations

import os

from .akshare_a import is_a_share

_RAW = os.getenv("QUANTLENS_MARKET", "a_share").strip().lower()
A_SHARE_ONLY = _RAW in ("a_share", "ashare", "cn", "china", "1", "true")


def reject_unless_allowed(symbol: str) -> None:
    if A_SHARE_ONLY and not is_a_share(symbol):
        raise ValueError(
            f"当前服务仅接入 A 股，不支持标的 {symbol!r}（6 位代码或 ETF）"
        )