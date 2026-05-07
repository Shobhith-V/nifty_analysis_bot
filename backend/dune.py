"""
Dune Analytics integration — Polymarket insider signals.
Free tier: add DUNE_API_KEY to .env (dune.com → account settings → API keys).
Configure query IDs via DUNE_QUERY_* env vars after saving queries on Dune.
"""

import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

DUNE_BASE    = "https://api.dune.com/api/v1"
CACHE_TTL    = 1800  # 30 min — free tier rate limited

_cache: Dict[str, Any] = {}
_last_fetch: float = 0.0


def _api_key() -> str:
    return os.getenv("DUNE_API_KEY", "")


async def _fetch_query(client: httpx.AsyncClient, query_id: str) -> Optional[Dict]:
    """Fetch latest results for a saved Dune query."""
    try:
        resp = await client.get(
            f"{DUNE_BASE}/query/{query_id}/results",
            headers={"X-DUNE-API-KEY": _api_key()},
            timeout=30,
        )
        if resp.status_code == 402:
            logger.warning("Dune: plan limit hit — upgrade or reduce polling")
            return None
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"Dune query {query_id} failed: {e}")
        return None


async def _execute_query(client: httpx.AsyncClient, query_id: str) -> Optional[Dict]:
    """
    Trigger execution of a query (needed when cached results are stale).
    Free tier: use cached results endpoint first, execute only if needed.
    """
    try:
        resp = await client.post(
            f"{DUNE_BASE}/query/{query_id}/execute",
            headers={"X-DUNE-API-KEY": _api_key()},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"Dune execute {query_id} failed: {e}")
        return None


def _parse_large_bets(rows: List[Dict]) -> List[Dict]:
    """Parse large pre-resolution bets from a Dune result set."""
    out = []
    for r in rows[:20]:
        try:
            out.append({
                "market":    r.get("market_question", r.get("market", r.get("question", ""))),
                "wallet":    r.get("wallet", r.get("trader", r.get("address", "")))[:10] + "…",
                "amount_usd": float(r.get("amount_usd", r.get("usdc_amount", r.get("amount", 0))) or 0),
                "outcome":   r.get("outcome", r.get("side", "")),
                "timestamp": r.get("ts", r.get("block_time", r.get("timestamp", ""))),
            })
        except Exception:
            continue
    return out


def _parse_win_rate_wallets(rows: List[Dict]) -> List[Dict]:
    """Parse high win-rate wallet data."""
    out = []
    for r in rows[:10]:
        try:
            out.append({
                "wallet":     r.get("wallet", r.get("trader", ""))[:10] + "…",
                "win_rate":   float(r.get("win_rate", r.get("pct_correct", 0)) or 0),
                "total_bets": int(r.get("total_bets", r.get("n_trades", 0)) or 0),
                "profit_usd": float(r.get("profit_usd", r.get("pnl", 0)) or 0),
            })
        except Exception:
            continue
    return out


async def fetch_polymarket_signals() -> Dict[str, Any]:
    """
    Fetch Dune analytics signals. Configure query IDs in .env:
      DUNE_QUERY_LARGE_BETS=<query_id>
      DUNE_QUERY_WIN_WALLETS=<query_id>
      DUNE_QUERY_USDC_FLOWS=<query_id>
    Find or fork public queries at dune.com/queries
    """
    global _cache, _last_fetch

    api_key = _api_key()
    if not api_key:
        return {
            "signals": [],
            "win_wallets": [],
            "usdc_flows": [],
            "has_live_feed": False,
            "note": "Add DUNE_API_KEY to .env (free at dune.com) to enable on-chain Polymarket signals",
            "last_updated": datetime.now(IST).isoformat(),
        }

    if _cache and (time.time() - _last_fetch) < CACHE_TTL:
        return _cache

    large_bets_id  = os.getenv("DUNE_QUERY_LARGE_BETS", "")
    win_wallets_id = os.getenv("DUNE_QUERY_WIN_WALLETS", "")
    usdc_flows_id  = os.getenv("DUNE_QUERY_USDC_FLOWS", "")

    if not any([large_bets_id, win_wallets_id, usdc_flows_id]):
        return {
            "signals": [],
            "win_wallets": [],
            "usdc_flows": [],
            "has_live_feed": True,
            "note": (
                "DUNE_API_KEY set but no query IDs configured. "
                "Find Polymarket queries at dune.com and set "
                "DUNE_QUERY_LARGE_BETS, DUNE_QUERY_WIN_WALLETS, DUNE_QUERY_USDC_FLOWS in .env"
            ),
            "last_updated": datetime.now(IST).isoformat(),
        }

    async with httpx.AsyncClient(timeout=35) as client:
        signals    = []
        win_wallets = []
        usdc_flows  = []

        if large_bets_id:
            data = await _fetch_query(client, large_bets_id)
            if data:
                rows = data.get("result", {}).get("rows", [])
                signals = _parse_large_bets(rows)

        if win_wallets_id:
            data = await _fetch_query(client, win_wallets_id)
            if data:
                rows = data.get("result", {}).get("rows", [])
                win_wallets = _parse_win_rate_wallets(rows)

        if usdc_flows_id:
            data = await _fetch_query(client, usdc_flows_id)
            if data:
                rows = data.get("result", {}).get("rows", [])
                usdc_flows = rows[:10]  # pass raw rows, shape varies per query

    result = {
        "signals":     signals,
        "win_wallets": win_wallets,
        "usdc_flows":  usdc_flows,
        "has_live_feed": True,
        "last_updated": datetime.now(IST).isoformat(),
    }
    _cache = result
    _last_fetch = time.time()
    logger.info(f"Dune: {len(signals)} large-bet signals, {len(win_wallets)} win-wallets")
    return result
