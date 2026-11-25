"""Outbound webhook relay (ServerChan / DingTalk / custom POST)."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


async def post_webhook(url: str, payload: dict) -> bool:
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code < 400
    except Exception as exc:
        logger.warning("webhook failed: %s", exc)
        return False