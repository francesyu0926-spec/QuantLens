from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from .config import KLINE_WINDOW


@dataclass
class Candle:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    def to_dict(self) -> dict:
        return {
            "time": self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


@dataclass
class SymbolBook:
    symbol: str
    candles: deque[Candle] = field(default_factory=lambda: deque(maxlen=KLINE_WINDOW))
    last_price: float = 0.0