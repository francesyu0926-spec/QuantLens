"""Top-of-book snapshot for crypto."""

from __future__ import annotations

import logging

from .crypto_exchange import create_crypto_exchange
from .symbols import classify_market

logger = logging.getLogger(__name__)


def fetch_depth_sync(symbol: str, *, levels: int = 10) -> dict:
    if classify_market(symbol) != "crypto":
        return {"ok": False, "bids": [], "asks": []}
    exchange = create_crypto_exchange()
    try:
        book = exchange.fetch_order_book(symbol, limit=levels)
        bids = [
            {"price": float(p), "amount": float(a)}
            for p, a in (book.get("bids") or [])[:levels]
        ]
        asks = [
            {"price": float(p), "amount": float(a)}
            for p, a in (book.get("asks") or [])[:levels]
        ]
        return {"ok": True, "bids": bids, "asks": asks, "symbol": symbol}
    except Exception as exc:
        logger.warning("depth %s: %s", symbol, exc)
        return {"ok": False, "bids": [], "asks": [], "error": str(exc)}
    finally:
        exchange.close()