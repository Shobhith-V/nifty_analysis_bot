"""
Global markets data via yfinance.
Refreshed every 5 minutes during market hours via APScheduler.
"""

import asyncio
import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

# yfinance symbols → display labels
GLOBAL_SYMBOLS = {
    "^GSPC":    "S&P 500",
    "^DJI":     "Dow Jones",
    "^IXIC":    "NASDAQ",
    "^N225":    "Nikkei 225",
    "^HSI":     "Hang Seng",
    "^FTSE":    "FTSE 100",
    "^GDAXI":   "DAX",
    "CL=F":     "Crude Oil (WTI)",
    "BZ=F":     "Crude Oil (Brent)",
    "GC=F":     "Gold",
    "INR=X":    "USD/INR",
    "DX-Y.NYB": "DXY (Dollar Index)",
    "^VIX":     "VIX",
}

# SGX Nifty proxy — using Nifty futures listed on SGX (ticker may vary)
# Using ^NSEI as India index fallback when SGX not available
SGX_PROXY_SYMBOL = "^NSEI"

_cache: Dict[str, Any] = {}
_last_update: Optional[float] = None
CACHE_TTL = 300  # 5 minutes


async def fetch_global_markets() -> Dict[str, Any]:
    """Fetch all global market data using yfinance."""
    global _cache, _last_update

    now = time.time()
    if _last_update and (now - _last_update) < CACHE_TTL and _cache:
        logger.debug("Returning cached global markets data")
        return _cache

    logger.info("Fetching global markets data via yfinance...")
    try:
        import yfinance as yf

        result = {}
        fetched = 0
        for sym, label in GLOBAL_SYMBOLS.items():
            try:
                ticker = yf.Ticker(sym)
                # Use 30d to handle rate-limit retries and weekend gaps
                hist = ticker.history(period="30d", interval="1d")
                if hist.empty:
                    logger.warning(f"{sym}: empty history — skipping")
                    continue

                price = float(hist["Close"].iloc[-1])
                prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else price

                if price <= 0:
                    continue

                change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
                change_pts = price - prev_close if prev_close else 0

                result[sym] = {
                    "symbol": sym,
                    "label": label,
                    "price": round(price, 2),
                    "prev_close": round(prev_close, 2),
                    "change_pts": round(change_pts, 2),
                    "change_pct": round(change_pct, 3),
                    "direction": "UP" if change_pct >= 0 else "DOWN",
                }
                fetched += 1
                # Small delay between symbols to avoid Yahoo Finance rate limiting
                await asyncio.sleep(0.3)
            except Exception as e:
                logger.warning(f"Failed to fetch {sym}: {e}")
                continue

        if fetched == 0 and _cache:
            logger.warning("yfinance returned no data (likely rate-limited) — using cache")
            return _cache

        # SGX_NIFTY alias: used by signals.py bias engine
        if "^NSEI" in result:
            result["SGX_NIFTY"] = result["^NSEI"]

        # Build correlation insight
        result["insights"] = _build_insights(result)
        result["last_updated"] = datetime.now(IST).isoformat()

        _cache = result
        _last_update = now
        return result

    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return {"error": "yfinance not installed", "last_updated": datetime.now(IST).isoformat()}
    except Exception as e:
        logger.error(f"Global markets fetch error: {e}", exc_info=True)
        return _cache or {"error": str(e), "last_updated": datetime.now(IST).isoformat()}


def _build_insights(data: Dict) -> list:
    """Build correlation insight strings for display."""
    insights = []

    # SGX / Nifty futures
    nsei = data.get("^NSEI", {})
    if nsei:
        chg = nsei.get("change_pct", 0)
        if chg > 0.5:
            insights.append(f"India Index up {chg:.2f}% → Expect positive opening")
        elif chg < -0.5:
            insights.append(f"India Index down {abs(chg):.2f}% → Expect gap down opening")

    # US markets
    sp500 = data.get("^GSPC", {})
    if sp500:
        chg = sp500.get("change_pct", 0)
        if chg > 0.5:
            insights.append(f"S&P 500 up {chg:.2f}% — Global risk-on sentiment")
        elif chg < -0.5:
            insights.append(f"S&P 500 down {abs(chg):.2f}% — Global risk-off")

    # VIX
    vix = data.get("^VIX", {})
    if vix:
        vix_val = vix.get("price", 0)
        if vix_val > 25:
            insights.append(f"VIX at {vix_val:.1f} — High volatility expected")
        elif vix_val < 15:
            insights.append(f"VIX at {vix_val:.1f} — Low volatility, range-bound likely")

    # Gold
    gold = data.get("GC=F", {})
    usd_inr = data.get("INR=X", {})
    if gold and usd_inr:
        gold_chg = gold.get("change_pct", 0)
        inr_chg = usd_inr.get("change_pct", 0)
        if gold_chg > 0.5 and inr_chg > 0.3:
            insights.append("Gold & USD up → Safe-haven demand, watch for Nifty weakness")

    return insights[:5]  # top 5 insights


def get_cached_global_markets() -> Dict:
    return _cache or {}
