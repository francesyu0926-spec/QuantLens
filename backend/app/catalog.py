"""Searchable symbol catalog (A-shares from AKShare, cached in memory)."""

from __future__ import annotations

import functools
import logging

from .market_mode import A_SHARE_ONLY

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=1)
def _a_share_rows() -> list[tuple[str, str]]:
    try:
        import akshare as ak

        df = ak.stock_info_a_code_name()
        if df is None or df.empty:
            return []
        code_col = "code" if "code" in df.columns else df.columns[0]
        name_col = "name" if "name" in df.columns else df.columns[1]
        rows: list[tuple[str, str]] = []
        for _, row in df.iterrows():
            code = str(row[code_col]).strip().zfill(6)
            name = str(row[name_col]).strip()
            if len(code) == 6 and code.isdigit():
                rows.append((code, name))
        logger.info("A-share catalog loaded: %s symbols", len(rows))
        return rows
    except Exception as exc:
        logger.warning("A-share catalog unavailable: %s", exc)
        return []


def search_symbols(query: str, *, limit: int = 40) -> list[dict[str, str]]:
    q = query.strip().lower()
    if not q or len(q) < 1:
        return []

    out: list[dict[str, str]] = []

    # A-share full universe
    for code, name in _a_share_rows():
        if q in code or q in name.lower():
            out.append({"symbol": code, "name": name, "market": "a_share"})
            if len(out) >= limit:
                return out

    if not A_SHARE_ONLY:
        _us_seed = (
            "AAPL MSFT NVDA GOOGL AMZN META TSLA AMD INTC NFLX CRM ORCL "
            "BABA JD PDD NIO XPEV LI BIDU"
        ).split()
        qu = q.upper()
        for sym in _us_seed:
            if qu in sym or sym.startswith(qu):
                out.append({"symbol": sym, "name": sym, "market": "us_equity"})
                if len(out) >= limit:
                    return out
        crypto_hints = [
            ("BTC/USDT", "Bitcoin"),
            ("ETH/USDT", "Ethereum"),
            ("SOL/USDT", "Solana"),
        ]
        for sym, name in crypto_hints:
            if q in sym.lower() or q in name.lower():
                out.append({"symbol": sym, "name": name, "market": "crypto"})
                if len(out) >= limit:
                    return out

    return out[:limit]