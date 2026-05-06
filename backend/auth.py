"""
Angel One SmartAPI authentication module.
Supports both API-key+TOTP (current) and OAuth (future, toggled via USE_OAUTH env var).
"""

import os
import logging
import time
import asyncio
from typing import Optional
import pyotp
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# In-memory session store (never persisted to disk)
_session: dict = {
    "jwtToken": None,
    "refreshToken": None,
    "feedToken": None,
    "authenticated": False,
    "last_auth_time": None,
}

USE_OAUTH = os.getenv("USE_OAUTH", "false").lower() == "true"
ANGEL_API_KEY = os.getenv("ANGEL_API_KEY", "")
ANGEL_CLIENT_CODE = os.getenv("ANGEL_CLIENT_CODE", "")
ANGEL_PASSWORD = os.getenv("ANGEL_PASSWORD", "")
ANGEL_TOTP_SECRET = os.getenv("ANGEL_TOTP_SECRET", "")

# Token expiry: Angel One tokens expire after ~24h; refresh at 23h mark
TOKEN_REFRESH_INTERVAL = 23 * 3600


def _generate_totp() -> str:
    if not ANGEL_TOTP_SECRET:
        raise ValueError("ANGEL_TOTP_SECRET not set in .env")
    totp = pyotp.TOTP(ANGEL_TOTP_SECRET)
    return totp.now()


def _get_smartapi_obj():
    """Return a SmartConnect instance. Import here to allow optional dependency."""
    try:
        from SmartApi import SmartConnect
        return SmartConnect(api_key=ANGEL_API_KEY)
    except ImportError:
        raise RuntimeError("smartapi-python not installed. Run: pip install smartapi-python")


async def authenticate() -> dict:
    """
    Authenticate with Angel One. Uses TOTP flow (current) or OAuth (future).
    Returns session dict with tokens.
    """
    if USE_OAUTH:
        return await _oauth_authenticate()
    return await _totp_authenticate()


async def _totp_authenticate() -> dict:
    global _session

    if not all([ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD, ANGEL_TOTP_SECRET]):
        raise ValueError(
            "Missing Angel One credentials. Check ANGEL_API_KEY, ANGEL_CLIENT_CODE, "
            "ANGEL_PASSWORD, ANGEL_TOTP_SECRET in .env"
        )

    logger.info("Authenticating with Angel One via API key + TOTP...")
    start = time.monotonic()

    try:
        obj = _get_smartapi_obj()
        totp_code = _generate_totp()
        data = obj.generateSession(ANGEL_CLIENT_CODE, ANGEL_PASSWORD, totp_code)

        if data.get("status") is False:
            error_code = data.get("errorcode", "UNKNOWN")
            msg = data.get("message", "Auth failed")
            logger.error(f"Auth failed: [{error_code}] {msg}")
            raise RuntimeError(f"Authentication failed: [{error_code}] {msg}")

        session_data = data.get("data", {})
        _session.update({
            "jwtToken": session_data.get("jwtToken"),
            "refreshToken": session_data.get("refreshToken"),
            "feedToken": obj.getfeedToken(),
            "authenticated": True,
            "last_auth_time": time.time(),
            "_obj": obj,
        })

        latency = (time.monotonic() - start) * 1000
        logger.info(f"Authentication successful in {latency:.1f}ms")
        return _session

    except Exception as e:
        _session["authenticated"] = False
        logger.error(f"Authentication error: {e}", exc_info=True)
        raise


async def _oauth_authenticate() -> dict:
    """
    OAuth flow placeholder — will be required from August 2025.
    Structure is ready; implement OAuth redirect + callback when credentials available.
    """
    logger.warning(
        "OAuth authentication selected but not yet implemented. "
        "Set USE_OAUTH=false to use TOTP flow."
    )
    raise NotImplementedError(
        "OAuth flow not yet implemented. Set USE_OAUTH=false in .env to use TOTP."
    )


async def refresh_token() -> bool:
    """Refresh the JWT token using the stored refresh token."""
    global _session

    if not _session.get("refreshToken"):
        logger.warning("No refresh token available; triggering full re-auth")
        await authenticate()
        return True

    logger.info("Refreshing Angel One token...")
    try:
        obj = _session.get("_obj")
        if obj is None:
            obj = _get_smartapi_obj()
            obj.setAccessToken(_session["jwtToken"])

        data = obj.generateToken(_session["refreshToken"])
        if data.get("status") is False:
            logger.error(f"Token refresh failed: {data}")
            await authenticate()
            return True

        new_data = data.get("data", {})
        _session.update({
            "jwtToken": new_data.get("jwtToken", _session["jwtToken"]),
            "refreshToken": new_data.get("refreshToken", _session["refreshToken"]),
            "feedToken": new_data.get("feedToken", _session["feedToken"]),
            "last_auth_time": time.time(),
        })
        logger.info("Token refreshed successfully")
        return True

    except Exception as e:
        logger.error(f"Token refresh error: {e}", exc_info=True)
        try:
            await authenticate()
        except Exception:
            pass
        return False


def get_session() -> dict:
    return _session


def is_authenticated() -> bool:
    return _session.get("authenticated", False)


def get_jwt_token() -> Optional[str]:
    return _session.get("jwtToken")


def get_feed_token() -> Optional[str]:
    return _session.get("feedToken")


def should_refresh() -> bool:
    """Returns True if the token should be refreshed."""
    last = _session.get("last_auth_time")
    if not last:
        return True
    return (time.time() - last) > TOKEN_REFRESH_INTERVAL


async def handle_api_error(error_code: str) -> bool:
    """
    Handle Angel One specific error codes.
    Returns True if recovered (caller should retry), False if unrecoverable.
    """
    if error_code == "AB1010":
        logger.warning("AB1010: Invalid token — triggering re-auth")
        await authenticate()
        return True
    elif error_code == "AB1011":
        logger.warning("AB1011: Token expired — refreshing token")
        return await refresh_token()
    else:
        logger.error(f"Unhandled API error code: {error_code}")
        return False
