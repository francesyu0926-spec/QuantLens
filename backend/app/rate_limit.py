"""Simple token-bucket limiter for outbound market data requests."""

from __future__ import annotations

import threading
import time


class SyncTokenBucket:
    def __init__(self, rate_per_sec: float, capacity: float) -> None:
        self._rate = max(rate_per_sec, 0.05)
        self._capacity = max(capacity, 1.0)
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self, tokens: float = 1.0) -> None:
        with self._lock:
            while True:
                now = time.monotonic()
                elapsed = now - self._updated
                self._tokens = min(
                    self._capacity, self._tokens + elapsed * self._rate
                )
                self._updated = now
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                wait = (tokens - self._tokens) / self._rate
                self._lock.release()
                try:
                    time.sleep(min(wait, 2.0))
                finally:
                    self._lock.acquire()


# Eastmoney is rate-sensitive — smooth bursty ETF switches
AKSHARE_FETCH_LIMITER = SyncTokenBucket(rate_per_sec=0.55, capacity=4.0)