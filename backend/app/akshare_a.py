"""A-share market data via AKShare (Eastmoney / Sina fallbacks)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from .config import AKSHARE_POLL_SEC
from .intervals import akshare_minute_period, normalize_interval
from .models import Candle, SymbolBook

logger = logging.getLogger(__name__)
CN_TZ = ZoneInfo("Asia/Shanghai")


def is_a_share(symbol: str) -> bool:
    s = symbol.upper().strip()
    if s.startswith(("SH", "SZ")):
        s = s[2:]
    if len(s) != 6 or not s.isdigit():
        return False
    return s[0] in "0368"


def normalize_a_share_code(symbol: str) -> str:
    s = symbol.upper().strip()
    if s.startswith(("SH", "SZ")):
        return s[2:]
    return s


def sina_prefix(code: str) -> str:
    return f"sh{code}" if code.startswith("6") else f"sz{code}"


def _parse_bar_time(value: str) -> int:
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(text, fmt).replace(tzinfo=CN_TZ)
            return int(dt.timestamp())
        except ValueError:
            continue
    raise ValueError(f"unrecognized time: {value!r}")


def _df_to_candles(df: pd.DataFrame) -> list[Candle]:
    if df is None or df.empty:
        return []

    time_col = next((c for c in df.columns if "时间" in str(c) or c == "day"), None)
    if time_col is None:
        return []

    col_map = {str(c): c for c in df.columns}
    open_c = next((col_map[k] for k in col_map if "开盘" in k or k == "open"), None)
    high_c = next((col_map[k] for k in col_map if "最高" in k or k == "high"), None)
    low_c = next((col_map[k] for k in col_map if "最低" in k or k == "low"), None)
    close_c = next((col_map[k] for k in col_map if "收盘" in k or k == "close"), None)
    vol_c = next((col_map[k] for k in col_map if "成交量" in k or k == "volume"), None)

    if not all([open_c, high_c, low_c, close_c]):
        return []

    candles: list[Candle] = []
    for row in df.to_dict(orient="records"):
        try:
            t = _parse_bar_time(row[time_col])
            vol_raw = row.get(vol_c, 0) if vol_c else 0
            vol = float(vol_raw) if vol_raw is not None and pd.notna(vol_raw) else 0.0
            candles.append(
                Candle(
                    time=t,
                    open=float(row[open_c]),
                    high=float(row[high_c]),
                    low=float(row[low_c]),
                    close=float(row[close_c]),
                    volume=vol,
                )
            )
        except (ValueError, TypeError, KeyError):
            continue
    return candles


def _resample_candles(candles: list[Candle], bucket_sec: int) -> list[Candle]:
    if not candles:
        return []
    buckets: dict[int, Candle] = {}
    for c in candles:
        t = (c.time // bucket_sec) * bucket_sec
        if t not in buckets:
            buckets[t] = Candle(t, c.open, c.high, c.low, c.close, c.volume)
        else:
            b = buckets[t]
            b.high = max(b.high, c.high)
            b.low = min(b.low, c.low)
            b.close = c.close
            b.volume += c.volume
    return [buckets[k] for k in sorted(buckets)]


def _fetch_daily(code: str) -> list[Candle]:
    import akshare as ak

    df = ak.stock_zh_a_hist(
        symbol=code,
        period="daily",
        start_date="20220101",
        adjust="qfq",
    )
    if df is None or df.empty:
        return []

    candles: list[Candle] = []
    for row in df.to_dict(orient="records"):
        try:
            day = str(row.get("日期", "")).strip()
            dt = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=CN_TZ)
            candles.append(
                Candle(
                    time=int(dt.timestamp()),
                    open=float(row["开盘"]),
                    high=float(row["最高"]),
                    low=float(row["最低"]),
                    close=float(row["收盘"]),
                    volume=float(row.get("成交量") or 0),
                )
            )
        except (ValueError, KeyError, TypeError):
            continue
    return candles[-500:]


def fetch_bars(code: str, interval: str = "1m") -> list[Candle]:
    iv = normalize_interval(interval)
    if iv == "1d":
        try:
            return _fetch_daily(code)
        except Exception as exc:
            logger.warning("AKShare daily fetch failed %s: %s", code, exc)
            return []

    period = akshare_minute_period(iv)
    if period is None:
        return []

    import akshare as ak

    errors: list[str] = []
    candles: list[Candle] = []

    try:
        df = ak.stock_zh_a_hist_min_em(symbol=code, period=period, adjust="")
        candles = _df_to_candles(df)
    except Exception as exc:
        errors.append(f"eastmoney: {exc}")

    if not candles:
        try:
            df = ak.stock_zh_a_minute(symbol=sina_prefix(code), period=period, adjust="")
            candles = _df_to_candles(df)
        except Exception as exc:
            errors.append(f"sina: {exc}")

    if not candles and errors:
        logger.warning("AKShare fetch failed for %s@%s: %s", code, iv, "; ".join(errors))
        return []

    candles = candles[-800:]
    if iv == "4h":
        candles = _resample_candles(candles, 4 * 3600)
    return candles[-500:]


def fetch_minute_bars(code: str) -> list[Candle]:
    return fetch_bars(code, "1m")


def _normalize_time(t: int) -> int:
    if t > 2_000_000_000:
        return t // 1000
    return int(t)


def merge_candles(book: SymbolBook, incoming: list[Candle]) -> Candle | None:
    if not incoming:
        return book.candles[-1] if book.candles else None

    for raw in incoming:
        candle = Candle(
            time=_normalize_time(raw.time),
            open=raw.open,
            high=raw.high,
            low=raw.low,
            close=raw.close,
            volume=raw.volume,
        )
        if book.candles and book.candles[-1].time == candle.time:
            book.candles[-1] = candle
        elif not book.candles or book.candles[-1].time < candle.time:
            book.candles.append(candle)

    if book.candles:
        book.last_price = book.candles[-1].close
    return book.candles[-1] if book.candles else None


class AkshareAShareFeed:
    def __init__(self, symbol: str, book: SymbolBook, interval: str = "1m") -> None:
        self.symbol = symbol
        self.code = normalize_a_share_code(symbol)
        self.interval = normalize_interval(interval)
        self.book = book
        self._last_bar_time: int | None = None

    async def bootstrap(self) -> None:
        candles = await asyncio.to_thread(fetch_bars, self.code, self.interval)
        merge_candles(self.book, candles)
        if self.book.candles:
            self._last_bar_time = self.book.candles[-1].time

    async def stream(self):
        if not self.book.candles:
            await self.bootstrap()

        while True:
            try:
                candles = await asyncio.to_thread(fetch_bars, self.code, self.interval)
                latest = merge_candles(self.book, candles)
                if latest is not None:
                    yield latest, latest.close
            except Exception as exc:
                logger.exception("A-share poll error %s: %s", self.code, exc)
                if self.book.candles:
                    c = self.book.candles[-1]
                    yield c, c.close

            await asyncio.sleep(AKSHARE_POLL_SEC)