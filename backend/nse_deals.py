"""
NSE Block Deals, Bulk Deals, FII/DII Activity, and Unusual Volume detection.

NSE blocks plain requests — session must mimic a browser (headers + cookies).
All I/O is sync (requests) wrapped in run_in_executor to stay non-blocking.
"""

import asyncio
import logging
import time
from datetime import datetime
from functools import partial
from typing import Any, Dict, List, Optional

import pytz
import requests

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

# ── NSE session ────────────────────────────────────────────────────────────

NSE_BASE   = "https://www.nseindia.com"
NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    # Accept-Encoding intentionally omitted — requests handles gzip automatically.
    # Adding 'br' here causes raw gzip bytes since requests doesn't decode brotli.
    "Referer":         "https://www.nseindia.com",
}

_session: Optional[requests.Session] = None
_session_ts: float = 0.0
SESSION_TTL = 600  # refresh session every 10 min


def _get_session() -> requests.Session:
    global _session, _session_ts
    now = time.time()
    if _session is None or (now - _session_ts) > SESSION_TTL:
        logger.info("Initialising NSE session…")
        s = requests.Session()
        s.headers.update(NSE_HEADERS)
        try:
            # Homepage may return 403 but still sets some cookies; OK to ignore error
            s.get(NSE_BASE, timeout=12)
        except Exception as e:
            logger.debug(f"NSE homepage warm-up: {e}")
        _session = s
        _session_ts = now
    return _session


def _nse_get(path: str, retries: int = 2) -> Optional[Any]:
    """Synchronous NSE GET. Refreshes session on 401/403."""
    global _session, _session_ts
    for attempt in range(retries):
        try:
            s = _get_session()
            url = f"{NSE_BASE}{path}"
            resp = s.get(url, timeout=15)
            if resp.status_code in (401, 403):
                logger.warning(f"NSE {resp.status_code} on {path} — resetting session")
                _session = None
                _session_ts = 0.0
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(f"NSE request {path} attempt {attempt+1} failed: {e}")
    return None


async def _async_nse_get(path: str) -> Optional[Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, partial(_nse_get, path))


# ── Caches ─────────────────────────────────────────────────────────────────

_block_cache: List[Dict] = []
_bulk_cache:  List[Dict] = []
_fiidii_cache: List[Dict] = []
_vol_cache: List[Dict] = []
_last_fetch: Dict[str, float] = {}
CACHE_TTL = 900  # 15 min


def _stale(key: str, ttl: float = CACHE_TTL) -> bool:
    return (time.time() - _last_fetch.get(key, 0)) > ttl


# ── Block deals ────────────────────────────────────────────────────────────

def _parse_block_deal(item: dict) -> dict:
    vol = int(item.get("totalTradedVolume", 0) or 0)
    price = float(item.get("lastPrice", item.get("price", 0)) or 0)
    return {
        "symbol":       item.get("symbol", ""),
        "session":      item.get("session", ""),
        "series":       item.get("series", "BL"),
        "price":        price,
        "open":         float(item.get("open", 0) or 0),
        "high":         float(item.get("dayHigh", 0) or 0),
        "low":          float(item.get("dayLow", 0) or 0),
        "prev_close":   float(item.get("previousClose", 0) or 0),
        "change_pct":   float(item.get("pchange", 0) or 0),
        "volume":       vol,
        "value_cr":     round(float(item.get("totalTradedValue", 0) or 0) / 1e7, 2),
        "date":         item.get("lastUpdateTime", ""),
    }


async def fetch_block_deals() -> List[Dict]:
    global _block_cache
    if not _stale("block"):
        return _block_cache

    raw = await _async_nse_get("/api/block-deal")
    if raw:
        data = raw if isinstance(raw, list) else raw.get("data", [])
        _block_cache = [_parse_block_deal(d) for d in data if d.get("symbol") or d.get("sym")]
        _last_fetch["block"] = time.time()
        logger.info(f"NSE block deals: {len(_block_cache)} entries")
    return _block_cache


async def fetch_bulk_deals() -> List[Dict]:
    global _bulk_cache
    if not _stale("bulk"):
        return _bulk_cache

    raw = await _async_nse_get("/api/bulk-deals")
    if raw:
        data = raw if isinstance(raw, list) else raw.get("data", [])
        _bulk_cache = [_parse_block_deal(d) for d in data if d.get("symbol") or d.get("sym")]
        _last_fetch["bulk"] = time.time()
        logger.info(f"NSE bulk deals: {len(_bulk_cache)} entries")
    return _bulk_cache


# ── FII / DII ──────────────────────────────────────────────────────────────

def _f(v) -> float:
    try: return round(float(str(v).replace(",", "")), 2)
    except: return 0.0


def _parse_fiidii_row(item: dict) -> dict:
    """Parse a single FII or DII row from the list response."""
    return {
        "category":  item.get("category", ""),
        "date":      item.get("date", ""),
        "buy_cr":    _f(item.get("buyValue", 0)),
        "sell_cr":   _f(item.get("sellValue", 0)),
        "net_cr":    _f(item.get("netValue", 0)),
    }


async def fetch_fii_dii() -> Dict[str, Any]:
    """Returns FII and DII rows grouped and a combined per-date summary."""
    global _fiidii_cache
    if not _stale("fiidii"):
        return _fiidii_cache

    raw = await _async_nse_get("/api/fiidiiTradeReact")
    if raw:
        rows = raw if isinstance(raw, list) else raw.get("data", [])
        parsed = [_parse_fiidii_row(r) for r in rows]

        # Group by date — category can be "FII/FPI" or "DII"
        from collections import defaultdict
        by_date: dict = defaultdict(dict)
        for r in parsed:
            d = r["date"]
            cat = "FII" if "FII" in r["category"].upper() else "DII"
            by_date[d][cat] = r

        summary = []
        for d in sorted(by_date.keys(), reverse=True)[:10]:
            fii = by_date[d].get("FII", {})
            dii = by_date[d].get("DII", {})
            summary.append({
                "date":      d,
                "fii_buy":   fii.get("buy_cr", 0),
                "fii_sell":  fii.get("sell_cr", 0),
                "fii_net":   fii.get("net_cr", 0),
                "dii_buy":   dii.get("buy_cr", 0),
                "dii_sell":  dii.get("sell_cr", 0),
                "dii_net":   dii.get("net_cr", 0),
            })

        _fiidii_cache = summary
        _last_fetch["fiidii"] = time.time()
        logger.info(f"NSE FII/DII: {len(_fiidii_cache)} daily rows")
    return _fiidii_cache


# ── Unusual volume ──────────────────────────────────────────────────────────

WATCHLIST = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "SBIN", "KOTAKBANK", "BAJFINANCE", "BHARTIARTL", "LT",
    "AXISBANK", "MARUTI", "ITC", "WIPRO", "HCLTECH",
    "NTPC", "POWERGRID", "TATAMOTORS", "TATASTEEL", "ADANIPORTS",
]
VOL_SURGE_THRESHOLD = 3.0   # flag if today > 3× 20-day avg


def _check_unusual_volume_sync() -> List[Dict]:
    try:
        import yfinance as yf
        tickers = [f"{sym}.NS" for sym in WATCHLIST]
        hist = yf.download(
            tickers, period="22d", interval="1d",
            auto_adjust=True, progress=False, threads=True,
        )
        if hist.empty:
            return []

        vol = hist["Volume"]
        results = []
        for t in tickers:
            sym = t.replace(".NS", "")
            if t not in vol.columns:
                continue
            series = vol[t].dropna()
            if len(series) < 5:
                continue
            avg20 = float(series.iloc[:-1].tail(20).mean())
            today = float(series.iloc[-1])
            if avg20 <= 0:
                continue
            ratio = today / avg20
            if ratio >= VOL_SURGE_THRESHOLD:
                results.append({
                    "symbol":    sym,
                    "today_vol": int(today),
                    "avg_vol":   int(avg20),
                    "ratio":     round(ratio, 2),
                    "flag":      "HIGH" if ratio >= 5 else "ELEVATED",
                })
        results.sort(key=lambda x: x["ratio"], reverse=True)
        return results
    except Exception as e:
        logger.warning(f"Unusual volume fetch error: {e}")
        return []


async def fetch_unusual_volume() -> List[Dict]:
    global _vol_cache
    if not _stale("vol", ttl=900):
        return _vol_cache

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _check_unusual_volume_sync)
    if result is not None:
        _vol_cache = result
        _last_fetch["vol"] = time.time()
        logger.info(f"Unusual volume: {len(_vol_cache)} flagged stocks")
    return _vol_cache


# ── Aggregate refresh ──────────────────────────────────────────────────────

async def refresh_all():
    """Refresh all NSE data. Called by scheduler during market hours."""
    await asyncio.gather(
        fetch_block_deals(),
        fetch_bulk_deals(),
        fetch_fii_dii(),
        fetch_unusual_volume(),
        return_exceptions=True,
    )


def get_cached() -> Dict[str, Any]:
    return {
        "block_deals":    _block_cache,
        "bulk_deals":     _bulk_cache,
        "fii_dii":        _fiidii_cache,
        "unusual_volume": _vol_cache,
        "last_updated":   datetime.now(IST).isoformat(),
    }
