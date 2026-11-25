"""CCXT exchange factory with regional fallbacks."""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_CRYPTO_EXCHANGE = os.getenv("QUANTLENS_CRYPTO_EXCHANGE", "kucoin")
FALLBACK_EXCHANGES = ("kucoin", "okx", "binance", "bybit")


def create_crypto_exchange(exchange_id: str | None = None):
    import ccxt

    ex_id = exchange_id or DEFAULT_CRYPTO_EXCHANGE
    if not hasattr(ccxt, ex_id):
        logger.warning("Unknown exchange %s, falling back to kucoin", ex_id)
        ex_id = "kucoin"
    return getattr(ccxt, ex_id)({"enableRateLimit": True})


def fetch_ohlcv_with_fallback(symbol: str, timeframe: str, limit: int = 500) -> list[Any]:
    chain = [DEFAULT_CRYPTO_EXCHANGE] + [
        e for e in FALLBACK_EXCHANGES if e != DEFAULT_CRYPTO_EXCHANGE
    ]
    last_err: Exception | None = None
    for ex_id in chain:
        exchange = create_crypto_exchange(ex_id)
        try:
            rows = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
            if rows:
                logger.info("Crypto OHLCV %s via %s (%s bars)", symbol, ex_id, len(rows))
                return rows
        except Exception as exc:
            last_err = exc
            logger.warning("Exchange %s failed for %s: %s", ex_id, symbol, exc)
        finally:
            exchange.close()
    if last_err:
        raise last_err
    return []