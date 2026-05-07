"""
Nifty 50 Analysis Bot — FastAPI entry point.
ANALYSIS ONLY. No order placement.
"""

import asyncio
import json
import logging
import math
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel
from pathlib import Path

import pytz
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse


class _SafeJSONResponse(JSONResponse):
    """JSONResponse that converts NaN/Inf to null instead of crashing."""
    def render(self, content: Any) -> bytes:
        return json.dumps(
            _sanitize(content),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")


def _sanitize(obj: Any) -> Any:
    """Recursively replace NaN/Inf floats with None."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

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
from news import get_news_summary, refresh_news
from polymarket import get_polymarket_summary
from nse_deals import (
    fetch_block_deals, fetch_bulk_deals,
    fetch_fii_dii, fetch_unusual_volume, refresh_all as refresh_nse,
)
from dune import fetch_polymarket_signals
from websocket_handler import (
    subscribe_to_stream,
    unsubscribe_from_stream,
    get_live_candle,
    get_latest_ltp,
    connect_market_data,
)
from scheduler import start_scheduler, stop_scheduler, register_state_refresh
from backtest import run_backtest


async def _startup_aux():
    """Non-critical startup tasks — run in background so they don't delay boot."""
    try:
        await refresh_news()
    except Exception as e:
        logger.warning(f"Startup news fetch failed: {e}")
    try:
        await refresh_nse()
    except Exception as e:
        logger.warning(f"Startup NSE fetch failed: {e}")


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
        await _refresh_state(force=True)   # startup always fetches fresh
    except Exception as e:
        logger.error(f"Initial data fetch failed: {e}")

    try:
        _state["global_markets"] = await fetch_global_markets()
    except Exception as e:
        logger.error(f"Global markets fetch failed: {e}")

    # Kick off news and NSE in background — non-blocking at startup
    asyncio.create_task(_startup_aux())

    asyncio.create_task(connect_market_data())
    start_scheduler()
    register_state_refresh(_refresh_state)   # RSI/MACD/signals refresh every 2 min
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
    default_response_class=_SafeJSONResponse,
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

# Minimum gap between historical API candle fetches (Angel One rate limits)
_CANDLE_FETCH_COOLDOWN = 55  # seconds — 1m candles don't change faster than this
_last_candle_fetch: float = 0.0


async def _refresh_state(force: bool = False):
    """Refresh all derived state. Skips historical API call if fetched recently."""
    global _last_candle_fetch
    try:
        now_ts = time.time()
        if force or (now_ts - _last_candle_fetch) >= _CANDLE_FETCH_COOLDOWN:
            candles = await fetch_today_candles("1m")
            if candles:                        # keep stale candles if fetch returned empty
                _state["today_candles"] = candles
                _last_candle_fetch = now_ts
        else:
            candles = _state["today_candles"]  # use cached

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


# ── NSE institutional data ─────────────────────────────────────────────────
@app.get("/api/block-deals")
async def block_deals():
    return {"data": await fetch_block_deals(), "count": len(await fetch_block_deals())}


@app.get("/api/bulk-deals")
async def bulk_deals():
    data = await fetch_bulk_deals()
    return {"data": data, "count": len(data)}


@app.get("/api/fii-dii")
async def fii_dii():
    data = await fetch_fii_dii()
    today = data[0] if data else {}
    fii_net = today.get("fii_net", 0) or 0
    return {
        "data": data,
        "today": today,
        "fii_net_today": fii_net,
        "dii_net_today": today.get("dii_net", 0),
        "bias": "FII_BUYING" if fii_net > 0 else ("FII_SELLING" if fii_net < 0 else "NEUTRAL"),
    }


@app.get("/api/unusual-volume")
async def unusual_volume():
    data = await fetch_unusual_volume()
    return {"data": data, "count": len(data), "threshold": "3× 20-day avg"}


@app.get("/api/nse/all")
async def nse_all():
    """Single endpoint for all NSE institutional data."""
    blocks = await fetch_block_deals()
    bulks  = await fetch_bulk_deals()
    fiidii = await fetch_fii_dii()
    uvol   = await fetch_unusual_volume()
    return {
        "block_deals":    blocks,
        "bulk_deals":     bulks,
        "fii_dii":        fiidii,
        "unusual_volume": uvol,
        "last_updated":   datetime.now(IST).isoformat(),
    }


# ── Dune Analytics ─────────────────────────────────────────────────────────
@app.get("/api/polymarket-signals")
async def polymarket_signals():
    return await fetch_polymarket_signals()


# ── Chat — multi-provider LLM ─────────────────────────────────────────────
# Priority: Ollama (local, free) → Groq (free cloud) → Anthropic → error

class ChatRequest(BaseModel):
    question: str
    history: List[dict] = []   # [{role, content}, ...] for multi-turn


def _build_market_context() -> str:
    ltp = get_latest_ltp() or (_state["today_candles"][-1]["close"] if _state["today_candles"] else "N/A")
    cpr_d = _state.get("cpr", {}).get("daily", {})
    ind   = _state.get("indicators", {})
    gap   = _state.get("gap_info", {})
    expiry = get_expiry_info()
    sgx = get_cached_global_markets().get("SGX_NIFTY") or get_cached_global_markets().get("^NSEI", {})
    recent_signals = [s.get("type") for s in _state.get("signals", [])[:3]]

    return f"""You are an expert Nifty 50 intraday analyst assistant. Be concise (2-4 sentences). Only give analysis, never place orders.

Live market context:
- NIFTY 50 LTP: {ltp} | Session: {get_session_status()} | Market open: {is_market_open()}
- Gap: {gap.get('gap_type','N/A')} {gap.get('gap_pct',0):.2f}% | Fill: {gap.get('fill',{}).get('fill_pct','N/A')}%
- CPR: Pivot={cpr_d.get('pivot','N/A')} BC={cpr_d.get('bc','N/A')} TC={cpr_d.get('tc','N/A')} [{_state.get('cpr',{}).get('cpr_type','N/A')}]
- Price vs CPR: {_state.get('cpr',{}).get('price_position','N/A')} | Virgin: {_state.get('cpr',{}).get('is_virgin','N/A')}
- RSI(14): {ind.get('rsi14','N/A')} | VWAP: {ind.get('vwap','N/A')} | Above VWAP: {ind.get('above_vwap','N/A')}
- EMA 9/21: {ind.get('ema9','N/A')} / {ind.get('ema21','N/A')} | MACD hist: {ind.get('macd_hist','N/A')}
- ORB-15: {_state.get('orb_15',{}).get('status','N/A') if _state.get('orb_15') else 'N/A'}
- GIFT Nifty: {sgx.get('price','N/A')} ({sgx.get('change_pct',0):+.2f}%)
- Expiry: {expiry['expiry_type']} in {expiry['days_to_expiry']} days
- Recent signals: {recent_signals}"""


async def _chat_ollama(system: str, messages: List[dict]) -> tuple[str, str]:
    url   = os.getenv("OLLAMA_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.1")
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{url}/api/chat", json={
            "model": model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": False,
            "options": {"temperature": 0.4, "num_predict": 300},
        })
        resp.raise_for_status()
        return resp.json()["message"]["content"], f"ollama/{model}"


async def _chat_groq(system: str, messages: List[dict]) -> tuple[str, str]:
    api_key = os.getenv("GROQ_API_KEY", "")
    model = "llama-3.1-8b-instant"
    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": system}] + messages,
                "max_tokens": 300,
                "temperature": 0.4,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"], f"groq/{model}"


async def _chat_anthropic(system: str, messages: List[dict]) -> tuple[str, str]:
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system,
        messages=messages,
    )
    return msg.content[0].text, "claude-haiku"


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Multi-turn market analysis chat. Auto-selects best available free LLM."""
    system  = _build_market_context()
    history = req.history[-10:]  # keep last 10 turns to stay within context limits
    messages = history + [{"role": "user", "content": req.question}]

    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    groq_key   = os.getenv("GROQ_API_KEY", "")
    claude_key = os.getenv("ANTHROPIC_API_KEY", "")

    providers = []
    providers.append(("Ollama", _chat_ollama))
    if groq_key:
        providers.append(("Groq", _chat_groq))
    if claude_key:
        providers.append(("Claude", _chat_anthropic))

    for name, fn in providers:
        try:
            answer, model = await fn(system, messages)
            return {
                "answer": answer,
                "model":  model,
                "provider": name,
                "time": datetime.now(IST).strftime("%H:%M:%S"),
            }
        except Exception as e:
            logger.warning(f"Chat provider {name} failed: {e}")
            continue

    return {
        "answer": "No LLM available. Ollama is not running — start it with `ollama serve`, or add GROQ_API_KEY to .env (free at groq.com).",
        "model": "none",
        "provider": "none",
    }


# ── Backtest ───────────────────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    dsl: str = ""
    days: int = 60
    capital: float = 100000


@app.post("/api/backtest")
async def backtest(req: BacktestRequest):
    """Run backtest on historical daily candles with the given strategy DSL."""
    try:
        candles = _state.get("daily_history", [])
        if not candles or len(candles) < 5:
            # Try to fetch fresh
            candles = await fetch_historical_days(max(req.days, 30))

        # Limit to requested period
        if len(candles) > req.days:
            candles = candles[-req.days:]

        result = run_backtest(candles, dsl_text=req.dsl, initial_capital=req.capital)
        return result
    except Exception as e:
        logger.error(f"Backtest error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Dashboard summary ──────────────────────────────────────────────────────
@app.get("/api/dashboard")
async def dashboard_summary():
    """Single endpoint returning everything needed for initial dashboard load."""
    await _refresh_state()   # respects 55s cooldown — won't hammer historical API
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


# ── Serve frontend static files ────────────────────────────────────────────
# Production: built Vite dist/ takes priority.
# Development: serve raw frontend/ folder directly (pure HTML+CDN React setup).
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
frontend_raw  = Path(__file__).parent.parent / "frontend"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
elif frontend_raw.exists():
    app.mount("/", StaticFiles(directory=str(frontend_raw), html=True), name="frontend")


if __name__ == "__main__":
    port = int(os.getenv("BACKEND_PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
