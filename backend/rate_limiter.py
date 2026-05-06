"""
Token-bucket rate limiters for Angel One API endpoints.
All limits enforced per Angel One SmartAPI documentation.
"""

import asyncio
import time
import logging
import random
from collections import deque
from functools import wraps

logger = logging.getLogger(__name__)


class RateLimiter:
    """Sliding-window rate limiter (calls per second)."""

    def __init__(self, calls_per_second: int, name: str = ""):
        self.calls_per_second = calls_per_second
        self.name = name
        self.call_times: deque = deque()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            while self.call_times and now - self.call_times[0] > 1.0:
                self.call_times.popleft()

            if len(self.call_times) >= self.calls_per_second:
                sleep_time = 1.0 - (now - self.call_times[0])
                if sleep_time > 0:
                    logger.debug(
                        f"RateLimiter[{self.name}]: throttling for {sleep_time:.3f}s"
                    )
                    await asyncio.sleep(sleep_time)

            self.call_times.append(time.monotonic())


# Named limiters for each API category
historical_limiter = RateLimiter(3, "historical")   # 3/sec
order_limiter = RateLimiter(10, "order")            # 10 orders/sec (SEBI Aug 2025)
general_limiter = RateLimiter(10, "general")        # 10/sec general


async def with_retry(coro_fn, limiter: RateLimiter, max_retries: int = 5):
    """
    Execute an async callable with rate limiting and exponential backoff+jitter
    on 429 / rate-limit errors.
    """
    delay = 1.0
    for attempt in range(max_retries):
        await limiter.acquire()
        try:
            return await coro_fn()
        except Exception as e:
            err_str = str(e).lower()
            is_rate_limit = "429" in err_str or "rate limit" in err_str or "too many" in err_str
            if is_rate_limit and attempt < max_retries - 1:
                jitter = random.uniform(0, delay * 0.3)
                sleep = min(delay + jitter, 60.0)
                logger.warning(
                    f"Rate limited (attempt {attempt+1}/{max_retries}). "
                    f"Backing off {sleep:.2f}s"
                )
                await asyncio.sleep(sleep)
                delay = min(delay * 2, 60.0)
            else:
                raise
    raise RuntimeError(f"Max retries ({max_retries}) exceeded")
