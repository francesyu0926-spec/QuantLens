"""FastAPI application: REST health + WebSocket market broadcast."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .catalog import search_symbols
from .depth import fetch_depth_sync
from .diagnose import build_diagnosis
from .quotes import fetch_quotes
from .radar import fetch_radar
from .webhook import post_webhook
from fastapi.middleware.cors import CORSMiddleware

from .collector import MarketCollector
from .market_mode import A_SHARE_ONLY
from .config import WS_HOST, WS_PORT
from .intervals import normalize_interval
from .indicators import compute_indicators
from .rules import scan_signals
from .fundamentals import fetch_capital_flow_sync, fetch_fundamentals_sync
from .storage import init_db, save_kline_cache
from .user_data import (
    DRAWING_PREFIX,
    SYNC_KEYS,
    export_journal_csv,
    export_trades_csv,
    user_data_bulk_set,
    user_data_get,
    user_data_list,
    user_data_set,
)

collector = MarketCollector()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="QuantLens Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "market": "a_share" if A_SHARE_ONLY else "multi",
    }


@app.get("/quotes")
async def quotes(symbols: str = Query(..., description="Comma-separated symbols")) -> dict:
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(sym_list) > 250:
        sym_list = sym_list[:250]
    return await fetch_quotes(sym_list)


@app.get("/catalog/search")
async def catalog_search(
    q: str = Query("", min_length=1),
    limit: int = Query(40, ge=1, le=100),
) -> dict:
    return {"items": search_symbols(q, limit=limit)}


class WebhookRelay(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    title: str = ""
    text: str = ""
    payload: dict[str, Any] | None = None


@app.post("/webhook/relay")
async def webhook_relay(body: WebhookRelay) -> dict[str, bool]:
    data = body.payload or {
        "title": body.title or "QuantLens",
        "text": body.text,
    }
    ok = await post_webhook(body.url, data)
    return {"ok": ok}


@app.get("/radar")
async def radar(symbol: str = Query(...)) -> dict[str, Any]:
    rows = await fetch_radar(collector, symbol)
    return {"symbol": symbol, "frames": rows}


@app.get("/depth")
async def depth(
    symbol: str = Query(...),
    levels: int = Query(10, ge=1, le=25),
) -> dict[str, Any]:
    import asyncio

    return await asyncio.to_thread(fetch_depth_sync, symbol, levels=levels)


@app.get("/fundamentals")
async def fundamentals(symbol: str = Query(...)) -> dict[str, Any]:
    import asyncio

    return await asyncio.to_thread(fetch_fundamentals_sync, symbol)


@app.get("/capital_flow")
async def capital_flow(symbol: str = Query(...)) -> dict[str, Any]:
    import asyncio

    return await asyncio.to_thread(fetch_capital_flow_sync, symbol)


class UserDataPut(BaseModel):
    payload: Any


class UserDataBulk(BaseModel):
    entries: dict[str, Any] = Field(default_factory=dict)


@app.get("/sync")
async def sync_get(all_keys: bool = Query(False)) -> dict[str, Any]:
    if all_keys:
        return await user_data_list(None)
    data = await user_data_list(None)
    entries = {
        k: v
        for k, v in data["entries"].items()
        if k in SYNC_KEYS or k.startswith(DRAWING_PREFIX)
    }
    meta = {k: data["updated_at"][k] for k in entries if k in data["updated_at"]}
    return {"entries": entries, "updated_at": meta}


@app.put("/sync/{key:path}")
async def sync_put_key(key: str, body: UserDataPut) -> dict[str, Any]:
    if key not in SYNC_KEYS and not key.startswith(DRAWING_PREFIX):
        return {"ok": False, "error": "key not allowed"}
    ts = await user_data_set(key, body.payload)
    return {"ok": True, "key": key, "updated_at": ts}


@app.post("/sync/bulk")
async def sync_bulk(body: UserDataBulk) -> dict[str, Any]:
    filtered = {
        k: v
        for k, v in body.entries.items()
        if k in SYNC_KEYS or k.startswith(DRAWING_PREFIX)
    }
    ts_map = await user_data_bulk_set(filtered)
    return {"ok": True, "updated_at": ts_map}


@app.get("/sync/item/{key:path}")
async def sync_get_key(key: str) -> dict[str, Any]:
    row = await user_data_get(key)
    if row is None:
        return {"ok": False, "key": key}
    return {"ok": True, **row}


@app.get("/export/trades.csv")
async def export_trades() -> PlainTextResponse:
    data = await user_data_list(None)
    text = export_trades_csv(data["entries"])
    return PlainTextResponse(
        text, media_type="text/csv; charset=utf-8"
    )


@app.get("/export/journal.csv")
async def export_journal() -> PlainTextResponse:
    data = await user_data_list(None)
    text = export_journal_csv(data["entries"])
    return PlainTextResponse(
        text, media_type="text/csv; charset=utf-8"
    )


@app.get("/diagnose")
async def diagnose(symbol: str = Query(...), interval: str = Query("1m")) -> dict:
    iv = normalize_interval(interval)
    book = await collector.ensure_history(symbol, iv)
    history = [c.to_dict() for c in book.candles]
    indicators = compute_indicators(history)
    signals = scan_signals(symbol, book.last_price, history, indicators)
    text = build_diagnosis(symbol, history[-30:], indicators, signals[-5:])
    return {"symbol": symbol, "text": text, "indicators": indicators}


@app.get("/klines")
async def klines(
    symbol: str = Query(...),
    interval: str = Query("1m"),
) -> dict[str, Any]:
    iv = normalize_interval(interval)
    book = await collector.ensure_history(symbol, iv)
    history = sorted(
        [c.to_dict() for c in book.candles], key=lambda x: x["time"]
    )
    return {
        "symbol": symbol,
        "interval": iv,
        "price": book.last_price,
        "candles": history,
        "ok": len(history) > 0,
    }


@app.websocket("/ws")
async def market_ws(
    websocket: WebSocket,
    symbol: str = Query("600519"),
    interval: str = Query("1m"),
) -> None:
    await websocket.accept()
    iv = normalize_interval(interval)
    task: asyncio.Task | None = None

    async def pump() -> None:
        await websocket.send_json(
            {
                "type": "status",
                "symbol": symbol,
                "interval": iv,
                "loading": True,
                "message": f"正在加载 {symbol} {iv} K 线…",
            }
        )
        await collector.ensure_history(symbol, iv)
        book = collector.book(symbol, iv)
        if not book.candles:
            await websocket.send_json(
                {
                    "type": "status",
                    "symbol": symbol,
                    "interval": iv,
                    "loading": False,
                    "error": "未拉到 K 线，请检查网络或点击重试",
                }
            )
        async for candle, price in collector.watch(symbol, iv):
            candle_dict = candle.to_dict()
            book = collector.book(symbol, iv)
            history = [c.to_dict() for c in book.candles]
            history.sort(key=lambda x: x["time"])
            indicators = compute_indicators(history)
            signals = scan_signals(symbol, price, history, indicators)

            packet: dict[str, Any] = {
                "type": "market",
                "symbol": symbol,
                "interval": iv,
                "price": price,
                "candle": candle_dict,
                "candles": history,
                "indicators": indicators,
                "signals": signals,
            }
            await websocket.send_json(packet)
            await save_kline_cache(symbol, iv, history)

    try:
        task = asyncio.create_task(pump())
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "ping":
                now_ms = int(time.time() * 1000)
                await websocket.send_json(
                    {
                        "type": "pong",
                        "ts": msg.get("ts", now_ms),
                        "server_ts": now_ms,
                    }
                )
    except WebSocketDisconnect:
        pass
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=WS_HOST,
        port=WS_PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    run()