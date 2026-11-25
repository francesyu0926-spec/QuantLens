"""FastAPI application: REST health + WebSocket market broadcast."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
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
from .storage import init_db, save_kline_cache

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