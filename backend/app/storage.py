import json
import time
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
            CREATE TABLE IF NOT EXISTS universe_indicators (
                symbol TEXT PRIMARY KEY,
                close REAL,
                rsi REAL,
                ema20 REAL,
                macd REAL,
                macd_signal REAL,
                flags TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS universe_indicators_meta (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                built_at REAL NOT NULL,
                symbol_count INTEGER NOT NULL,
                status TEXT NOT NULL
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


async def load_kline_cache(
    symbol: str, timeframe: str, max_age_sec: float = 86_400 * 3
) -> list[dict[str, Any]] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT payload, updated_at FROM kline_cache
            WHERE symbol = ? AND timeframe = ?
            """,
            (symbol, timeframe),
        )
        row = await cur.fetchone()
        if not row:
            return None
        age = time.time() - float(row["updated_at"] or 0)
        if age > max_age_sec:
            return None
        try:
            data = json.loads(row["payload"])
            return data if isinstance(data, list) else None
        except json.JSONDecodeError:
            return None


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


async def save_universe_indicator_row(
    symbol: str,
    close: float,
    rsi: float | None,
    ema20: float | None,
    macd: float | None,
    macd_signal: float | None,
    flags: dict[str, bool],
) -> None:
    import json

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO universe_indicators
                (symbol, close, rsi, ema20, macd, macd_signal, flags, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                close = excluded.close,
                rsi = excluded.rsi,
                ema20 = excluded.ema20,
                macd = excluded.macd,
                macd_signal = excluded.macd_signal,
                flags = excluded.flags,
                updated_at = excluded.updated_at
            """,
            (
                symbol,
                close,
                rsi,
                ema20,
                macd,
                macd_signal,
                json.dumps(flags, ensure_ascii=False),
                time.time(),
            ),
        )
        await db.commit()


async def save_universe_indicator_build_meta(
    built_at: float, symbol_count: int, status: str
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO universe_indicators_meta (id, built_at, symbol_count, status)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                built_at = excluded.built_at,
                symbol_count = excluded.symbol_count,
                status = excluded.status
            """,
            (built_at, symbol_count, status),
        )
        await db.commit()


async def get_universe_indicator_build_meta() -> dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT built_at, symbol_count, status FROM universe_indicators_meta WHERE id = 1"
        )
        row = await cur.fetchone()
        if not row:
            return {}
        return {
            "built_at": float(row["built_at"]),
            "symbol_count": int(row["symbol_count"]),
            "status": str(row["status"]),
        }


async def universe_indicators_filter(flag_key: str, limit: int = 80) -> list[str]:
    import json

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT symbol, flags FROM universe_indicators ORDER BY symbol"
        )
        rows = await cur.fetchall()
    hits: list[str] = []
    for row in rows:
        try:
            flags = json.loads(row["flags"])
        except json.JSONDecodeError:
            continue
        if flags.get(flag_key):
            hits.append(str(row["symbol"]))
        if len(hits) >= limit:
            break
    return hits


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