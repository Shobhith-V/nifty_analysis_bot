"""
Historical and live market data fetcher for Angel One SmartAPI.
Historical API has ~5s delay; live candle built from WebSocket ticks.
"""

import logging
import time
import asyncio
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any
import pytz
import pandas as pd

from auth import get_session, is_authenticated, authenticate
from rate_limiter import historical_limiter, general_limiter, with_retry
from instruments import (
    NIFTY_INDEX_TOKEN,
    is_market_open,
    IST,
    download_instrument_master,
)

logger = logging.getLogger(__name__)

HISTORICAL_BASE_URL = (
    "https://apiconnect.angelbroking.com/rest/secure/angelbroking/historical/v1/getCandleData"
)

VALID_INTERVALS = {
    "1m": "ONE_MINUTE",
    "3m": "THREE_MINUTE",
    "5m": "FIVE_MINUTE",
    "10m": "TEN_MINUTE",
    "15m": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE",
    "1h": "ONE_HOUR",
    "1d": "ONE_DAY",
}

MAX_CANDLES = 8000  # Angel One hard limit


def _smartapi_obj():
    session = get_session()
    obj = session.get("_obj")
    if obj is None:
        raise RuntimeError("SmartConnect object not in session. Re-authenticate.")
    return obj


def _parse_candles(raw: list) -> List[Dict]:
    """Convert Angel One candle array [timestamp, O, H, L, C, V] to dicts."""
    candles = []
    for row in raw:
        if len(row) < 6:
            continue
        ts_str = row[0]
        try:
            # Timestamp format: "2024-05-01T09:15:00+05:30"
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = IST.localize(ts)
            candles.append({
                "time": int(ts.timestamp()),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": int(row[5]),
            })
        except Exception as e:
            logger.warning(f"Failed to parse candle row {row}: {e}")
    return candles


async def fetch_historical(
    token: str = NIFTY_INDEX_TOKEN,
    exchange: str = "NSE",
    interval: str = "1m",
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    days: int = 1,
) -> List[Dict]:
    """
    Fetch historical candles. Splits requests if range > MAX_CANDLES.
    """
    if not is_authenticated():
        await authenticate()

    api_interval = VALID_INTERVALS.get(interval, "ONE_MINUTE")

    now_ist = datetime.now(IST)
    if to_dt is None:
        to_dt = now_ist
    if from_dt is None:
        from_dt = now_ist - timedelta(days=days)

    # Ensure timezone aware
    if from_dt.tzinfo is None:
        from_dt = IST.localize(from_dt)
    if to_dt.tzinfo is None:
        to_dt = IST.localize(to_dt)

    logger.info(
        f"Fetching {interval} candles for token={token} "
        f"from {from_dt.isoformat()} to {to_dt.isoformat()}"
    )

    async def _fetch_chunk(f: datetime, t: datetime) -> list:
        await historical_limiter.acquire()
        start = time.monotonic()

        try:
            obj = _smartapi_obj()
            params = {
                "exchange": exchange,
                "symboltoken": token,
                "interval": api_interval,
                "fromdate": f.strftime("%Y-%m-%d %H:%M"),
                "todate": t.strftime("%Y-%m-%d %H:%M"),
            }
            raw = obj.getCandleData(params)
            latency = (time.monotonic() - start) * 1000
            logger.debug(f"Historical API call latency: {latency:.1f}ms")

            if isinstance(raw, dict):
                if raw.get("status") is False:
                    err = raw.get("errorcode", "")
                    msg = raw.get("message", "")
                    logger.error(f"Historical API error [{err}]: {msg}")
                    from auth import handle_api_error
                    if await handle_api_error(err):
                        return await _fetch_chunk(f, t)
                    return []
                return raw.get("data", []) or []
            return raw or []

        except Exception as e:
            logger.error(f"Error fetching historical data: {e}", exc_info=True)
            return []

    # If interval is 1m, check if range is too large (> MAX_CANDLES minutes)
    total_minutes = int((to_dt - from_dt).total_seconds() / 60)
    interval_minutes = {
        "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
        "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
        "ONE_HOUR": 60, "ONE_DAY": 1440,
    }.get(api_interval, 1)

    total_candles = total_minutes // interval_minutes

    if total_candles <= MAX_CANDLES:
        raw = await _fetch_chunk(from_dt, to_dt)
        return _parse_candles(raw)

    # Split into chunks
    all_candles = []
    chunk_minutes = MAX_CANDLES * interval_minutes
    chunk_delta = timedelta(minutes=chunk_minutes)
    current = from_dt
    while current < to_dt:
        chunk_end = min(current + chunk_delta, to_dt)
        raw = await _fetch_chunk(current, chunk_end)
        all_candles.extend(_parse_candles(raw))
        current = chunk_end
        await asyncio.sleep(0.4)  # respect 3/sec limit

    return all_candles


async def fetch_today_candles(interval: str = "1m") -> List[Dict]:
    """Fetch today's candles from 9:15 AM IST."""
    now = datetime.now(IST)
    from_dt = now.replace(hour=9, minute=15, second=0, microsecond=0)
    return await fetch_historical(
        from_dt=from_dt, to_dt=now, interval=interval, days=0
    )


async def fetch_previous_day_ohlc() -> Optional[Dict]:
    """
    Fetch previous trading day's OHLC for NIFTY 50.
    Used for CPR calculation.
    """
    now = datetime.now(IST)
    from_dt = now - timedelta(days=5)  # go back 5 days to handle weekends/holidays
    to_dt = now - timedelta(days=1)

    candles = await fetch_historical(
        interval="1d",
        from_dt=from_dt.replace(hour=9, minute=0),
        to_dt=to_dt.replace(hour=15, minute=30),
    )

    if not candles:
        logger.warning("No previous day candles found")
        return None

    # Return the most recent completed day
    last = candles[-1]
    logger.info(
        f"Previous day OHLC: O={last['open']} H={last['high']} "
        f"L={last['low']} C={last['close']}"
    )
    return last


async def fetch_historical_days(days: int = 30) -> List[Dict]:
    """Fetch N days of daily OHLC for historical CPR analysis."""
    now = datetime.now(IST)
    return await fetch_historical(
        interval="1d",
        from_dt=(now - timedelta(days=days + 5)).replace(hour=9, minute=0),
        to_dt=now.replace(hour=15, minute=30),
        days=days + 5,
    )
