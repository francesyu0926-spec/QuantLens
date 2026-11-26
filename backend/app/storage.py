import json
from typing import Any

import aiosqlite

from .config import DATA_DIR, DB_PATH


async def init_db() -> None:
    from .user_data import ensure_user_data_schema

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                name TEXT NOT NULL,
                expression TEXT NOT NULL,
                enabled INTEGER DEFAULT 1
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS kline_cache (
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at REAL,
                PRIMARY KEY (symbol, timeframe)
            )
            """
        )
        await db.commit()
    await ensure_user_data_schema()


async def save_kline_cache(symbol: str, timeframe: str, rows: list[dict[str, Any]]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO kline_cache (symbol, timeframe, payload, updated_at)
            VALUES (?, ?, ?, unixepoch('now'))
            ON CONFLICT(symbol, timeframe) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (symbol, timeframe, json.dumps(rows[-200:])),
        )
        await db.commit()


async def list_alert_rules(symbol: str | None = None) -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if symbol:
            cur = await db.execute(
                "SELECT * FROM alert_rules WHERE enabled = 1 AND symbol = ?",
                (symbol,),
            )
        else:
            cur = await db.execute("SELECT * FROM alert_rules WHERE enabled = 1")
        rows = await cur.fetchall()
        return [dict(r) for r in rows]