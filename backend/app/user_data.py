"""SQLite-backed user data blobs (watchlist, trades, notes, drawings)."""

from __future__ import annotations

import csv
import io
import json
import time
from typing import Any

import aiosqlite

from .config import DB_PATH

SYNC_KEYS = frozenset(
    {
        "quantlens.watchlist.extra",
        "quantlens-paper-trades",
        "quantlens-trading-journal",
        "quantlens-alert-rules",
        "quantlens-price-color-mode",
        "quantlens-novice-assist",
    }
)

DRAWING_PREFIX = "quantlens.priceLines."


async def ensure_user_data_schema() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS user_data (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        await db.commit()


async def user_data_get(key: str) -> dict[str, Any] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT key, payload, updated_at FROM user_data WHERE key = ?",
            (key,),
        )
        row = await cur.fetchone()
        if not row:
            return None
        try:
            payload = json.loads(row["payload"])
        except json.JSONDecodeError:
            payload = row["payload"]
        return {
            "key": row["key"],
            "payload": payload,
            "updated_at": row["updated_at"],
        }


async def user_data_set(key: str, payload: Any) -> float:
    ts = time.time()
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO user_data (key, payload, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (key, text, ts),
        )
        await db.commit()
    return ts


async def user_data_list(prefix: str | None = None) -> dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if prefix:
            cur = await db.execute(
                "SELECT key, payload, updated_at FROM user_data WHERE key LIKE ?",
                (f"{prefix}%",),
            )
        else:
            cur = await db.execute(
                "SELECT key, payload, updated_at FROM user_data"
            )
        rows = await cur.fetchall()
    entries: dict[str, Any] = {}
    meta: dict[str, float] = {}
    for row in rows:
        key = row["key"]
        try:
            entries[key] = json.loads(row["payload"])
        except json.JSONDecodeError:
            entries[key] = row["payload"]
        meta[key] = float(row["updated_at"])
    return {"entries": entries, "updated_at": meta}


async def user_data_bulk_set(entries: dict[str, Any]) -> dict[str, float]:
    ts_map: dict[str, float] = {}
    async with aiosqlite.connect(DB_PATH) as db:
        for key, payload in entries.items():
            ts = time.time()
            text = (
                payload
                if isinstance(payload, str)
                else json.dumps(payload, ensure_ascii=False)
            )
            await db.execute(
                """
                INSERT INTO user_data (key, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (key, text, ts),
            )
            ts_map[key] = ts
        await db.commit()
    return ts_map


def export_trades_csv(entries: dict[str, Any]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["symbol", "side", "price", "qty", "time"])
    trades = entries.get("quantlens-paper-trades")
    if isinstance(trades, dict):
        for sym, rows in trades.items():
            if not isinstance(rows, list):
                continue
            for t in rows:
                if not isinstance(t, dict):
                    continue
                w.writerow(
                    [
                        sym,
                        t.get("side", ""),
                        t.get("price", ""),
                        t.get("qty", ""),
                        t.get("time", ""),
                    ]
                )
    return buf.getvalue()


def export_journal_csv(entries: dict[str, Any]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["symbol", "interval", "price", "note", "tags", "ts"])
    journal = entries.get("quantlens-trading-journal")
    if isinstance(journal, list):
        for e in journal:
            if not isinstance(e, dict):
                continue
            tags = e.get("tags")
            w.writerow(
                [
                    e.get("symbol", ""),
                    e.get("interval", ""),
                    e.get("price", ""),
                    e.get("note", ""),
                    "|".join(tags) if isinstance(tags, list) else "",
                    e.get("ts", ""),
                ]
            )
    return buf.getvalue()