"""FastAPI application: REST health + WebSocket market broadcast."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .collector import MarketCollector
from .config import WS_HOST, WS_PORT
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


@app.websocket("/ws")
async def market_ws(websocket: WebSocket, symbol: str = Query("BTC/USDT")) -> None:
    await websocket.accept()
    task: asyncio.Task | None = None

    async def pump() -> None:
        async for candle, price in collector.watch(symbol):
            candle_dict = candle.to_dict()
            book = collector.book(symbol)
            history = [c.to_dict() for c in book.candles]
            indicators = compute_indicators(history)
            signals = scan_signals(symbol, price, history, indicators)

            packet: dict[str, Any] = {
                "type": "market",
                "symbol": symbol,
                "price": price,
                "candle": candle_dict,
                "indicators": indicators,
                "signals": signals,
            }
            await websocket.send_json(packet)
            await save_kline_cache(symbol, "1m", history)

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