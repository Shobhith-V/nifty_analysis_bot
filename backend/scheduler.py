"""
APScheduler jobs for timed data pulls.
- Global markets: every 5 minutes during market hours
- Token refresh: every 23 hours
- Instrument master: daily at 8:00 AM IST
"""

import logging
from datetime import datetime
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from global_markets import fetch_global_markets
from instruments import download_instrument_master, is_market_open
from auth import should_refresh, refresh_token

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

_scheduler: AsyncIOScheduler = None


async def _job_global_markets():
    if is_market_open():
        logger.debug("Scheduler: fetching global markets")
        await fetch_global_markets()


async def _job_instrument_master():
    logger.info("Scheduler: downloading instrument master")
    await download_instrument_master(force=True)


async def _job_token_refresh():
    if should_refresh():
        logger.info("Scheduler: refreshing auth token")
        await refresh_token()


def start_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return

    _scheduler = AsyncIOScheduler(timezone=IST)

    # Global markets every 5 minutes
    _scheduler.add_job(
        _job_global_markets,
        IntervalTrigger(minutes=5, timezone=IST),
        id="global_markets",
        replace_existing=True,
        max_instances=1,
    )

    # Instrument master daily at 8:00 AM IST
    _scheduler.add_job(
        _job_instrument_master,
        CronTrigger(hour=8, minute=0, timezone=IST),
        id="instrument_master",
        replace_existing=True,
        max_instances=1,
    )

    # Token refresh check every hour
    _scheduler.add_job(
        _job_token_refresh,
        IntervalTrigger(hours=1, timezone=IST),
        id="token_refresh",
        replace_existing=True,
        max_instances=1,
    )

    _scheduler.start()
    logger.info("APScheduler started with jobs: global_markets, instrument_master, token_refresh")


def register_state_refresh(coro_fn):
    """Register a coroutine to run every 2 minutes during market hours."""
    if _scheduler is None or not _scheduler.running:
        logger.warning("Scheduler not running — cannot register state refresh")
        return

    async def _job():
        if is_market_open():
            await coro_fn()

    _scheduler.add_job(
        _job,
        IntervalTrigger(minutes=2, timezone=IST),
        id="state_refresh",
        replace_existing=True,
        max_instances=1,
    )
    logger.info("Registered state_refresh job (every 2 min during market hours)")


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
