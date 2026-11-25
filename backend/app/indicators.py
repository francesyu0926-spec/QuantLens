from __future__ import annotations

from typing import Any

import pandas as pd

try:
    import pandas_ta as ta
except ImportError:
    ta = None


def compute_indicators(candles: list[dict[str, Any]]) -> dict[str, float]:
    if len(candles) < 30:
        return {}

    df = pd.DataFrame(candles)
    close = df["close"]
    high = df["high"]
    low = df["low"]

    out: dict[str, float] = {}

    out["ema20"] = float(close.ewm(span=20, adjust=False).mean().iloc[-1])
    out["ema50"] = float(close.ewm(span=50, adjust=False).mean().iloc[-1])

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    if not pd.isna(rsi.iloc[-1]):
        out["rsi"] = float(rsi.iloc[-1])

    if ta is not None:
        macd_df = ta.macd(close, fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            cols = macd_df.columns.tolist()
            out["macd"] = float(macd_df[cols[0]].iloc[-1])
            out["macd_signal"] = float(macd_df[cols[2]].iloc[-1])
            out["macd_hist"] = float(macd_df[cols[1]].iloc[-1])

        bb = ta.bbands(close, length=20, std=2)
        if bb is not None and not bb.empty:
            bcols = bb.columns.tolist()
            out["bb_lower"] = float(bb[bcols[0]].iloc[-1])
            out["bb_middle"] = float(bb[bcols[1]].iloc[-1])
            out["bb_upper"] = float(bb[bcols[2]].iloc[-1])

        atr_s = ta.atr(high, low, close, length=14)
        if atr_s is not None and len(atr_s):
            out["atr"] = float(atr_s.iloc[-1])
    else:
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal = macd_line.ewm(span=9, adjust=False).mean()
        out["macd"] = float(macd_line.iloc[-1])
        out["macd_signal"] = float(signal.iloc[-1])
        out["macd_hist"] = float(macd_line.iloc[-1] - signal.iloc[-1])

        mid = close.rolling(20).mean()
        std = close.rolling(20).std()
        out["bb_middle"] = float(mid.iloc[-1])
        out["bb_upper"] = float(mid.iloc[-1] + 2 * std.iloc[-1])
        out["bb_lower"] = float(mid.iloc[-1] - 2 * std.iloc[-1])

    return out