"""
SmartWebSocketV2 handler for live tick streaming + OHLC candle aggregation.
Hard limit: 3 WebSocket connections per client code.
Implements exponential backoff reconnection: 1s, 2s, 4s, 8s, max 60s.
"""

import asyncio
import json
import logging
import time
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Set, Callable
import pytz

import os
from auth import get_session, is_authenticated, get_feed_token, authenticate
from instruments import NIFTY_INDEX_TOKEN

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

WS_URL = "wss://smartapisocket.angelone.in/smart-stream"
MAX_WS_CONNECTIONS = 3

# Subscription modes
MODE_LTP = 1
MODE_QUOTE = 2
MODE_SNAP_QUOTE = 3  # Full OHLCV

# Exchange codes for WebSocket
EXCHANGE_NSE_CM = 1   # NSE Cash
EXCHANGE_NSE_FO = 2   # NSE F&O
EXCHANGE_BSE_CM = 3

_ws_connections: Dict[str, any] = {}  # name → ws object
_connection_count = 0
_live_ticks: List[Dict] = []
_live_candle: Optional[Dict] = None  # Current incomplete candle
_closed_candles: List[Dict] = []    # Confirmed closed candles from WebSocket
_subscribers: Set[asyncio.Queue] = set()

# Tokens to subscribe
_default_tokens = [
    {"exchangeType": EXCHANGE_NSE_CM, "tokens": [NIFTY_INDEX_TOKEN]},
]


class CandleAggregator:
    """Builds OHLC candles from raw tick data (1-minute candles)."""

    def __init__(self, interval_seconds: int = 60):
        self.interval_seconds = interval_seconds
        self._current: Optional[Dict] = None
        self._completed: List[Dict] = []

    def _candle_start(self, ts: float) -> float:
        """Snap timestamp to candle start (floor to interval boundary)."""
        return ts - (ts % self.interval_seconds)

    def on_tick(self, tick: Dict) -> Optional[Dict]:
        """
        Process a tick. Returns completed candle if a new one started.
        Tick format: {time, ltp, volume, open, high, low, close} (from SmartWebSocketV2)
        """
        ts = float(tick.get("time", time.time()))
        ltp = float(tick.get("ltp", tick.get("last_traded_price", 0)))
        vol = int(tick.get("volume", 0))

        if ltp <= 0:
            return None

        candle_start = self._candle_start(ts)
        completed = None

        if self._current is None:
            self._current = {
                "time": int(candle_start),
                "open": ltp,
                "high": ltp,
                "low": ltp,
                "close": ltp,
                "volume": vol,
            }
        elif candle_start > self._current["time"]:
            # New candle started — finalize previous
            completed = dict(self._current)
            self._completed.append(completed)
            self._current = {
                "time": int(candle_start),
                "open": ltp,
                "high": ltp,
                "low": ltp,
                "close": ltp,
                "volume": vol,
            }
        else:
            # Update current candle
            self._current["high"] = max(self._current["high"], ltp)
            self._current["low"] = min(self._current["low"], ltp)
            self._current["close"] = ltp
            self._current["volume"] = max(self._current["volume"], vol)

        return completed

    def get_live_candle(self) -> Optional[Dict]:
        return dict(self._current) if self._current else None

    def get_completed_candles(self) -> List[Dict]:
        return list(self._completed)


_aggregator = CandleAggregator(interval_seconds=60)


def _parse_tick(raw_data: dict) -> Optional[Dict]:
    """Parse raw SmartWebSocketV2 tick into normalized format."""
    try:
        if not isinstance(raw_data, dict):
            return None

        token = str(raw_data.get("token", ""))
        ltp = raw_data.get("last_traded_price", raw_data.get("ltp", 0)) or 0
        # SmartAPI sends prices in paise for equity — divide by 100
        if ltp > 100_000:
            ltp = ltp / 100

        # best_5 lists can be empty — use `or [{}]` to handle both None and []
        buy_list  = raw_data.get("best_5_buy_data")  or [{}]
        sell_list = raw_data.get("best_5_sell_data") or [{}]

        return {
            "token":  token,
            "time":   raw_data.get("exchange_timestamp", time.time()),
            "ltp":    float(ltp),
            "open":   float(raw_data.get("open_price_of_the_day",  0) or 0) / 100,
            "high":   float(raw_data.get("high_price_of_the_day",  0) or 0) / 100,
            "low":    float(raw_data.get("low_price_of_the_day",   0) or 0) / 100,
            "close":  float(raw_data.get("closed_price",           0) or 0) / 100,
            "volume": int(raw_data.get("volume_trade_for_the_day", 0) or 0),
            "bid":    float(buy_list[0].get("price",  0) or 0) / 100,
            "ask":    float(sell_list[0].get("price", 0) or 0) / 100,
        }
    except Exception as e:
        logger.warning(f"Failed to parse tick: {e} | data keys: {list(raw_data.keys()) if isinstance(raw_data, dict) else type(raw_data)}")
        return None


async def _broadcast(message: dict):
    """Broadcast tick/candle update to all subscribed frontend WebSocket connections."""
    dead = set()
    for q in _subscribers:
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            dead.add(q)
    for q in dead:
        _subscribers.discard(q)


async def connect_market_data():
    """
    Connect to SmartWebSocketV2 for NIFTY market data.
    Implements exponential backoff reconnection.
    """
    global _connection_count

    if _connection_count >= MAX_WS_CONNECTIONS:
        logger.error(f"Max WebSocket connections ({MAX_WS_CONNECTIONS}) reached")
        return

    delay = 1.0
    max_delay = 60.0
    auth_fail_delay = 30.0   # wait 30s between auth attempts to avoid rate limits

    while True:
        try:
            if not is_authenticated():
                logger.info("Not authenticated — authenticating before WS connect")
                try:
                    await authenticate()
                except Exception as auth_err:
                    logger.error(f"Auth failed in WS loop: {auth_err}. Waiting {auth_fail_delay}s before retry.")
                    await asyncio.sleep(auth_fail_delay)
                    auth_fail_delay = min(auth_fail_delay * 2, 300)  # back off up to 5 min
                    continue
                auth_fail_delay = 30.0  # reset on success

            try:
                from SmartApi.smartWebSocketV2 import SmartWebSocketV2
            except ImportError:
                from SmartApi.SmartWebSocketV2 import SmartWebSocketV2

            session = get_session()
            feed_token = get_feed_token()
            jwt_token = session.get("jwtToken")
            obj = session.get("_obj")

            # Resolve api_key and client_code from session obj or env fallback
            api_key = getattr(obj, "api_key", None) or os.getenv("ANGEL_API_KEY", "")
            client_code = (
                getattr(obj, "client_code", None)
                or getattr(obj, "userId", None)
                or os.getenv("ANGEL_CLIENT_CODE", "")
            )

            if not all([jwt_token, feed_token, api_key]):
                logger.error("Missing tokens for WebSocket connection")
                await asyncio.sleep(delay)
                continue

            sws = SmartWebSocketV2(
                auth_token=jwt_token,
                api_key=api_key,
                client_code=client_code,
                feed_token=feed_token,
                max_retry_attempt=3,
                retry_delay=5,
            )

            # Capture running loop now (in async context) before thread callbacks use it
            _loop = asyncio.get_running_loop()

            def on_open(wsapp):
                logger.info("SmartWebSocketV2 connected — subscribing to NIFTY")
                nonlocal delay
                delay = 1.0  # Reset backoff on successful connect
                sws.subscribe("market_data", MODE_SNAP_QUOTE, _default_tokens)

            def on_data(wsapp, message):
                # v1.5.x passes already-parsed dict; _handle_tick handles both dict and raw
                asyncio.run_coroutine_threadsafe(
                    _handle_tick(message), _loop
                )

            def on_error(error_type, error_msg):
                # v1.5.x signature: (error_type_str, error_msg_str) — no wsapp
                logger.error(f"WebSocket error [{error_type}]: {error_msg}")

            def on_close(wsapp):
                # v1.5.x signature: (wsapp,) — no close_status/close_msg
                logger.warning("WebSocket closed by server")
                global _connection_count
                _connection_count = max(0, _connection_count - 1)

            sws.on_open  = on_open
            sws.on_data  = on_data
            sws.on_error = on_error
            sws.on_close = on_close

            _connection_count += 1
            logger.info(f"Opening WebSocket connection ({_connection_count}/{MAX_WS_CONNECTIONS})")

            # Run in thread to avoid blocking event loop
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, sws.connect)

        except ImportError as ie:
            logger.error(f"SmartApi WebSocket import failed: {ie} — WebSocket disabled")
            return
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}", exc_info=True)

        _connection_count = max(0, _connection_count - 1)
        logger.info(f"Reconnecting in {delay:.1f}s...")
        await asyncio.sleep(delay)
        delay = min(delay * 2, max_delay)


async def _handle_tick(raw):
    """Process incoming WebSocket tick."""
    global _live_ticks, _live_candle

    if isinstance(raw, dict):
        tick_data = raw
    elif isinstance(raw, (bytes, str)):
        try:
            tick_data = json.loads(raw)
        except Exception:
            return
    else:
        return

    tick = _parse_tick(tick_data)
    if tick is None:
        return

    _live_ticks.append(tick)
    if len(_live_ticks) > 10000:
        _live_ticks = _live_ticks[-5000:]

    completed = _aggregator.on_tick(tick)
    if completed:
        _closed_candles.append(completed)
        await _broadcast({"type": "candle_closed", "data": completed})

    _live_candle = _aggregator.get_live_candle()
    await _broadcast({
        "type": "tick",
        "data": {
            "ltp": tick["ltp"],
            "volume": tick["volume"],
            "time": tick["time"],
            "live_candle": _live_candle,
        }
    })


def subscribe_to_stream() -> asyncio.Queue:
    """Register a queue to receive live tick/candle events."""
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _subscribers.add(q)
    return q


def unsubscribe_from_stream(q: asyncio.Queue):
    _subscribers.discard(q)


def get_live_candle() -> Optional[Dict]:
    return _live_candle


def get_ws_closed_candles() -> List[Dict]:
    return list(_closed_candles)


def get_latest_ltp() -> Optional[float]:
    if _live_ticks:
        return _live_ticks[-1].get("ltp")
    return None
