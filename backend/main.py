"""
Nifty 50 Analysis Bot — FastAPI entry point.
ANALYSIS ONLY. No order placement.
"""

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from pathlib import Path

import pytz
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv()

# ── Logging setup ──────────────────────────────────────────────────────────
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s:%(funcName)s — %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("bot.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("main")

# ── Imports ────────────────────────────────────────────────────────────────
from auth import authenticate, is_authenticated, get_session
from instruments import (
    download_instrument_master,
    get_expiry_info,
    is_market_open,
    get_session_status,
    IST,
)
from market_data import (
    fetch_today_candles,
    fetch_previous_day_ohlc,
    fetch_historical_days,
)
from cpr import build_cpr_response
from indicators import get_current_indicators, calculate_all_indicators, candles_to_df, get_vwap_series, calculate_volume_profile
from signals import analyze_gap, check_gap_fill, calculate_orb, build_signals, analyze_volume, calculate_bias
from global_markets import fetch_global_markets, get_cached_global_markets
from news import get_news_summary
from polymarket import get_polymarket_summary
from websocket_handler import (
    subscribe_to_stream,
    unsubscribe_from_stream,
    get_live_candle,
    get_latest_ltp,
    connect_market_data,
)
from scheduler import start_scheduler, stop_scheduler

# ── Lifespan ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logger.info("=" * 60)
    logger.info("Nifty Analysis Bot starting up")
    logger.info("ANALYSIS ONLY — No order placement")
    logger.info("=" * 60)

    if not STATIC_IP_REGISTERED:
        logger.warning(
            "STATIC_IP_REGISTERED=false. From Aug 2025 Angel One requires "
            "static IP for order APIs."
        )

    await download_instrument_master()

    try:
        await authenticate()
        logger.info("Authentication successful")
    except Exception as e:
        logger.error(f"Auth failed at startup: {e}. Continuing without Angel One data.")

    try:
        _state["prev_day"] = await fetch_previous_day_ohlc()
        _state["daily_history"] = await fetch_historical_days(30)
        await _refresh_state()
    except Exception as e:
        logger.error(f"Initial data fetch failed: {e}")

    try:
        _state["global_markets"] = await fetch_global_markets()
    except Exception as e:
        logger.error(f"Global markets fetch failed: {e}")

    asyncio.create_task(connect_market_data())
    start_scheduler()
    logger.info("Startup complete. Dashboard ready.")

    yield  # ← application runs here

    # ── Shutdown ──
    stop_scheduler()
    logger.info("Nifty Analysis Bot shut down")


# ── App setup ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Nifty 50 Analysis Bot",
    version="1.0.0",
    description="Professional trading dashboard — ANALYSIS ONLY",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_IP_REGISTERED = os.getenv("STATIC_IP_REGISTERED", "false").lower() == "true"

# In-memory state cache (refreshed on each request or scheduled)
_state = {
    "today_candles": [],
    "prev_day": None,
    "daily_history": [],
    "gap_info": {},
    "cpr": {},
    "indicators": {},
    "orb_15": None,
    "orb_30": None,
    "orb_60": None,
    "signals": [],
    "global_markets": {},
    "last_refresh": None,
}


async def _refresh_state():
    """Refresh all derived state from latest candle data."""
    try:
        candles = await fetch_today_candles("1m")
        _state["today_candles"] = candles

        prev = _state.get("prev_day")
        if not prev:
            return

        ltp = get_latest_ltp() or (candles[-1]["close"] if candles else None)
        _state["cpr"] = build_cpr_response(prev, candles, _state["daily_history"], ltp)

        if candles:
            today_open = candles[0]["open"]
            _state["gap_info"] = analyze_gap(prev["close"], today_open)
            _state["gap_info"]["fill"] = check_gap_fill(_state["gap_info"], candles)
            _state["orb_15"] = calculate_orb(candles, 15)
            _state["orb_30"] = calculate_orb(candles, 30)
            _state["orb_60"] = calculate_orb(candles, 60)

        _state["indicators"] = get_current_indicators(candles)
        _state["signals"] = build_signals(candles, _state["cpr"].get("daily", {}), _state["gap_info"], _state["orb_15"])
        _state["last_refresh"] = datetime.now(IST).isoformat()
    except Exception as e:
        logger.error(f"State refresh error: {e}", exc_info=True)


# ── Health ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "authenticated": is_authenticated(),
        "market_open": is_market_open(),
        "session": get_session_status(),
        "time_ist": datetime.now(IST).isoformat(),
    }


# ── Auth endpoints ─────────────────────────────────────────────────────────
@app.get("/api/auth/status")
async def auth_status():
    session = get_session()
    return {
        "authenticated": is_authenticated(),
        "last_auth": session.get("last_auth_time"),
        "static_ip_registered": STATIC_IP_REGISTERED,
        "static_ip_warning": not STATIC_IP_REGISTERED,
        "use_oauth": os.getenv("USE_OAUTH", "false"),
    }


@app.post("/api/auth/login")
async def login():
    try:
        await authenticate()
        return {"status": "success", "authenticated": True}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


# ── Market data endpoints ──────────────────────────────────────────────────
@app.get("/api/market/nifty/today")
async def nifty_today(interval: str = Query("1m", enum=["1m", "3m", "5m", "15m"])):
    candles = await fetch_today_candles(interval)
    live = get_live_candle()
    return {
        "candles": candles,
        "live_candle": live,
        "count": len(candles),
        "interval": interval,
        "session": get_session_status(),
    }


@app.get("/api/market/nifty/historical")
async def nifty_historical(days: int = Query(30, ge=1, le=365)):
    candles = await fetch_historical_days(days)
    return {"candles": candles, "count": len(candles), "days": days}


# ── CPR endpoints ──────────────────────────────────────────────────────────
@app.get("/api/cpr/today")
async def cpr_today():
    if not _state["prev_day"]:
        raise HTTPException(status_code=503, detail="Previous day data not available")
    ltp = get_latest_ltp() or (_state["today_candles"][-1]["close"] if _state["today_candles"] else None)
    return build_cpr_response(
        _state["prev_day"],
        _state["today_candles"],
        _state["daily_history"],
        ltp,
    )


@app.get("/api/cpr/weekly")
async def cpr_weekly():
    from cpr import calculate_weekly_cpr
    weekly = calculate_weekly_cpr(_state["daily_history"])
    if not weekly:
        raise HTTPException(status_code=503, detail="Insufficient data for weekly CPR")
    return weekly


# ── Gap analysis ───────────────────────────────────────────────────────────
@app.get("/api/gap/analysis")
async def gap_analysis():
    if not _state["gap_info"]:
        raise HTTPException(status_code=503, detail="Gap data not available")
    return {
        **_state["gap_info"],
        "orb_15": _state.get("orb_15"),
        "orb_30": _state.get("orb_30"),
        "orb_60": _state.get("orb_60"),
    }


# ── Signals ────────────────────────────────────────────────────────────────
@app.get("/api/signals/latest")
async def signals_latest():
    global_data = get_cached_global_markets()
    bias = calculate_bias(
        cpr=_state.get("cpr", {}),
        gap_info=_state.get("gap_info", {}),
        indicators=_state.get("indicators", {}),
        global_markets=global_data,
        is_expiry=get_expiry_info()["is_today_expiry"],
    )
    return {
        "signals": _state["signals"],
        "bias": bias,
        "indicators": _state["indicators"],
        "volume": analyze_volume(_state["today_candles"]),
    }


# ── Global markets ─────────────────────────────────────────────────────────
@app.get("/api/global")
async def global_markets():
    data = await fetch_global_markets()
    return data


# ── VWAP ───────────────────────────────────────────────────────────────────
@app.get("/api/volume/vwap")
async def volume_vwap():
    candles = _state["today_candles"]
    return {
        "vwap_series": get_vwap_series(candles),
        "volume_profile": calculate_volume_profile(candles),
        "volume_analysis": analyze_volume(candles),
    }


# ── Indicators ─────────────────────────────────────────────────────────────
@app.get("/api/indicators")
async def indicators():
    candles = _state["today_candles"]
    df = candles_to_df(candles)
    return calculate_all_indicators(df)


# ── Instruments / Expiry ───────────────────────────────────────────────────
@app.get("/api/instruments/expiry")
async def expiry_info():
    return get_expiry_info()


# ── News ───────────────────────────────────────────────────────────────────
@app.get("/api/news")
async def news():
    return await get_news_summary()


# ── Polymarket ─────────────────────────────────────────────────────────────
@app.get("/api/polymarket")
async def polymarket():
    return await get_polymarket_summary()


# ── Dashboard summary ──────────────────────────────────────────────────────
@app.get("/api/dashboard")
async def dashboard_summary():
    """Single endpoint returning everything needed for initial dashboard load."""
    await _refresh_state()
    global_data = get_cached_global_markets()

    expiry = get_expiry_info()
    bias = calculate_bias(
        cpr=_state.get("cpr", {}),
        gap_info=_state.get("gap_info", {}),
        indicators=_state.get("indicators", {}),
        global_markets=global_data,
        is_expiry=expiry["is_today_expiry"],
    )

    return {
        "session_status": get_session_status(),
        "market_open": is_market_open(),
        "time_ist": datetime.now(IST).isoformat(),
        "expiry": expiry,
        "cpr": _state.get("cpr"),
        "gap": _state.get("gap_info"),
        "orb": {
            "15m": _state.get("orb_15"),
            "30m": _state.get("orb_30"),
            "60m": _state.get("orb_60"),
        },
        "indicators": _state.get("indicators"),
        "signals": _state.get("signals", [])[:10],
        "bias": bias,
        "global_markets": global_data,
        "candle_count": len(_state.get("today_candles", [])),
        "static_ip_warning": not STATIC_IP_REGISTERED,
        "disclaimer": "ANALYSIS ONLY — No orders placed by this bot.",
    }


# ── WebSocket relay to frontend ────────────────────────────────────────────
@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    queue = subscribe_to_stream()
    logger.info(f"Frontend WebSocket connected: {websocket.client}")
    try:
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({
                    "type": "heartbeat",
                    "time": datetime.now(IST).isoformat(),
                    "session": get_session_status(),
                })
    except WebSocketDisconnect:
        logger.info(f"Frontend WebSocket disconnected: {websocket.client}")
    except Exception as e:
        logger.error(f"WebSocket relay error: {e}")
    finally:
        unsubscribe_from_stream(queue)


# ── Serve frontend static files (production) ──────────────────────────────
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    port = int(os.getenv("BACKEND_PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
