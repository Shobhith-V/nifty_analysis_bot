"""
Intraday backtest engine for Nifty 50.
Runs a CPR-Bias + VWAP-Reclaim strategy on historical daily data.
Supports a simple English-like DSL for rule overrides.
"""

import logging
import re
from datetime import datetime, timedelta, date
from typing import List, Dict, Optional, Any
import pytz
import pandas as pd
import numpy as np

from cpr import calculate_cpr
from indicators import calculate_vwap, calculate_rsi, calculate_ema, candles_to_df

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

DEFAULT_CAPITAL = 100_000
NIFTY_LOT = 1          # analyse in index points (not lot-based)
COMMISSION_PTS = 1.0   # round-trip slippage + brokerage in index points


# ── DSL parser ────────────────────────────────────────────────────────────────

class StrategyConfig:
    """Parsed strategy parameters extracted from the DSL text."""

    def __init__(self):
        self.entry_after_minutes = 15          # enter after N minutes of session
        self.long_if_above_cpr = True          # go long if price > CPR pivot
        self.short_if_below_cpr = True
        self.gap_filter_min = -0.75            # min gap % to allow trades
        self.gap_filter_max = 0.75             # max gap %
        self.use_orb = True                    # wait for ORB breakout to enter
        self.orb_minutes = 15
        self.target_level = "r1"               # 'r1', 'r2', 'vwap', or float pts
        self.stop_level = "s1"                 # 's1', 'pivot', or float pts
        self.require_vwap_cross = False        # only enter on VWAP cross
        self.max_trades_per_day = 2
        self.rsi_filter = None                 # None or (min, max)

    def apply_dsl(self, dsl_text: str):
        """Naively scan the DSL text for common patterns and override defaults."""
        t = dsl_text.lower()

        # Entry timing
        m = re.search(r'session\.time\s*==\s*"(\d+):(\d+)"', t)
        if m:
            self.entry_after_minutes = int(m.group(1)) * 60 + int(m.group(2)) - 9 * 60 - 15

        # ORB minutes
        m = re.search(r'orb[-_]?(\d+)', t)
        if m:
            self.orb_minutes = int(m.group(1))

        # Gap filter
        m = re.search(r'gap\.pct\s+between\s+([-\d.]+)\s+and\s+([-\d.]+)', t)
        if m:
            self.gap_filter_min = float(m.group(1))
            self.gap_filter_max = float(m.group(2))

        # Target / stop
        for k in ["r1", "r2", "r3", "s1", "s2", "s3", "pivot", "vwap"]:
            if f"target.*{k}" in t or f"target = cpr.{k}" in t:
                self.target_level = k
            if f"stop.*{k}" in t or f"stop = cpr.{k}" in t or f"stop = vwap" in t:
                self.stop_level = k

        # VWAP reclaim signal
        if "crosses_above(vwap)" in t or "vwap_reclaim" in t:
            self.require_vwap_cross = True

        # Max trades
        m = re.search(r'max\s+(\d+)\s+concurrent', t)
        if m:
            self.max_trades_per_day = int(m.group(1))

        # RSI filter
        m = re.search(r'rsi\(14\)\s*>\s*(\d+)', t)
        if m:
            self.rsi_filter = (int(m.group(1)), 100)

        return self


# ── Backtest engine ───────────────────────────────────────────────────────────

def _get_cpr_level(cpr: Dict, name: str, fallback: float) -> float:
    return cpr.get(name, fallback)


def run_backtest(
    daily_candles: List[Dict],
    dsl_text: str = "",
    initial_capital: float = DEFAULT_CAPITAL,
) -> Dict[str, Any]:
    """
    Run a day-by-day simulation on daily OHLC candles.
    Uses yesterday's OHLC → CPR for today's trade decisions.
    Returns equity curve, trade log, and summary statistics.
    """
    cfg = StrategyConfig().apply_dsl(dsl_text)

    if len(daily_candles) < 5:
        return {"error": "Need at least 5 days of daily data for backtest"}

    daily_candles = sorted(daily_candles, key=lambda c: c["time"])

    equity = initial_capital
    equity_curve = []
    trades = []
    days_processed = 0

    for i in range(1, len(daily_candles)):
        prev = daily_candles[i - 1]
        today = daily_candles[i]

        # CPR from previous day
        cpr = calculate_cpr(prev["high"], prev["low"], prev["close"])

        # Gap analysis
        gap_pct = ((today["open"] - prev["close"]) / prev["close"]) * 100
        if not (cfg.gap_filter_min <= gap_pct <= cfg.gap_filter_max):
            equity_curve.append({"day": i, "equity": equity, "trade": None})
            continue

        # Determine bias
        above_cpr = today["open"] > cpr["pivot"]
        long_bias = above_cpr and cfg.long_if_above_cpr and gap_pct >= -0.3
        short_bias = (not above_cpr) and cfg.short_if_below_cpr and gap_pct <= 0.3

        if not (long_bias or short_bias):
            equity_curve.append({"day": i, "equity": equity, "trade": None})
            continue

        # Simulate trade: entry = open + small slippage
        direction = "LONG" if long_bias else "SHORT"
        entry = today["open"] + (0.5 if direction == "LONG" else -0.5)

        # Target and stop from CPR levels
        if direction == "LONG":
            target = _get_cpr_level(cpr, cfg.target_level, cpr["r1"])
            stop = _get_cpr_level(cpr, cfg.stop_level, cpr["s1"])
            if stop >= entry:
                stop = entry - (entry - cpr["pivot"]) * 0.5
        else:
            target = _get_cpr_level(cpr, cfg.target_level, cpr["s1"])
            stop = _get_cpr_level(cpr, cfg.stop_level, cpr["r1"])
            if stop <= entry:
                stop = entry + (cpr["pivot"] - entry) * 0.5

        # Simulate: check if today's H/L hits target or stop first
        if direction == "LONG":
            hit_target = today["high"] >= target
            hit_stop = today["low"] <= stop
        else:
            hit_target = today["low"] <= target
            hit_stop = today["high"] >= stop

        if hit_target and hit_stop:
            # Assume stop hit first on losing days (conservative)
            exit_price = stop
            pnl = (exit_price - entry) * (1 if direction == "LONG" else -1) - COMMISSION_PTS
        elif hit_target:
            exit_price = target
            pnl = (exit_price - entry) * (1 if direction == "LONG" else -1) - COMMISSION_PTS
        elif hit_stop:
            exit_price = stop
            pnl = (exit_price - entry) * (1 if direction == "LONG" else -1) - COMMISSION_PTS
        else:
            # EOD exit at close
            exit_price = today["close"]
            pnl = (exit_price - entry) * (1 if direction == "LONG" else -1) - COMMISSION_PTS

        equity += pnl
        days_processed += 1

        ts = datetime.fromtimestamp(today["time"], tz=IST)
        signal_type = "CPR_BREAKOUT" if (above_cpr and long_bias) else (
            "VWAP_RECLAIM_LONG" if direction == "LONG" else "CPR_BREAKDOWN"
        )

        trade = {
            "num": len(trades) + 1,
            "date": ts.strftime("%d %b"),
            "direction": direction[0],  # "L" or "S"
            "signal": signal_type,
            "entry": round(entry, 2),
            "exit": round(exit_price, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl / entry * 100, 2),
            "r_multiple": round(pnl / max(0.1, abs(entry - stop)), 2),
            "outcome": "WIN" if pnl > 0 else "LOSS",
        }
        trades.append(trade)
        equity_curve.append({"day": i, "equity": round(equity, 0), "trade": trade})

    if not trades:
        return {
            "error": "No trades generated — check gap filter or data range",
            "equity_curve": equity_curve,
            "trades": [],
            "stats": {},
        }

    # Stats
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))

    pnl_series = pd.Series([t["pnl"] for t in trades])
    max_dd = _max_drawdown(equity_curve, initial_capital)

    daily_rets = pnl_series / initial_capital
    sharpe = float(daily_rets.mean() / daily_rets.std() * (252 ** 0.5)) if daily_rets.std() > 0 else 0

    first_day = datetime.fromtimestamp(daily_candles[1]["time"], tz=IST)
    last_day = datetime.fromtimestamp(daily_candles[-1]["time"], tz=IST)

    stats = {
        "strategy": _extract_strategy_name(dsl_text),
        "period": f"{first_day.strftime('%d %b %Y')} — {last_day.strftime('%d %b %Y')}",
        "trades": len(trades),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "avg_win_pct": round(sum(t["pnl_pct"] for t in wins) / max(1, len(wins)), 2),
        "avg_loss_pct": round(sum(t["pnl_pct"] for t in losses) / max(1, len(losses)), 2),
        "profit_factor": round(gross_win / max(0.01, gross_loss), 2),
        "max_drawdown_pct": round(max_dd, 2),
        "sharpe": round(sharpe, 2),
        "net_return_pct": round((equity - initial_capital) / initial_capital * 100, 1),
        "final_equity": round(equity, 0),
        "initial_capital": initial_capital,
    }

    return {
        "equity_curve": equity_curve,
        "trades": trades[-20:][::-1],  # last 20, newest first
        "stats": stats,
    }


def _max_drawdown(equity_curve: List[Dict], initial_capital: float) -> float:
    """Calculate maximum drawdown percentage."""
    if not equity_curve:
        return 0.0
    equities = [e["equity"] for e in equity_curve]
    peak = initial_capital
    max_dd = 0.0
    for eq in equities:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _extract_strategy_name(dsl_text: str) -> str:
    """Try to extract strategy name from first comment line."""
    for line in dsl_text.strip().splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("# ").strip()
    return "Custom Strategy"
