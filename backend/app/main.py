"""FastAPI application: REST health + WebSocket market broadcast."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect

from .quotes import fetch_quotes
from fastapi.middleware.cors import CORSMiddleware

from .collector import MarketCollector
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
    return {"status": "ok"}


@app.get("/quotes")
async def quotes(symbols: str = Query(..., description="Comma-separated symbols")) -> dict:
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    return await fetch_quotes(sym_list)


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
    symbol: str = Query("BTC/USDT"),
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
            await websocket.receive_text()
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