"""
Central registry for multi-site configuration.

Sites are defined in sites.json at the project root.
Each site maps field names to .env variable names — credentials are never
stored in sites.json itself, only the key names that should be read from .env.

To add a new site:
  1. Add an entry to sites.json
  2. Add the corresponding env vars to .env
"""

import json
import os

from dotenv import dotenv_values
from fastapi import HTTPException

_SITES_PATH  = os.path.join(os.path.dirname(__file__), "..", "sites.json")
_DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def _load() -> list[dict]:
    with open(_SITES_PATH) as f:
        return json.load(f)


def list_sites() -> list[dict]:
    return [{"id": s["id"], "label": s["label"]} for s in _load()]


def default_site_id() -> str:
    sites = _load()
    return sites[0]["id"] if sites else ""


def get_site(site_id: str, require_wc: bool = False, require_wp: bool = False) -> dict:
    """
    Resolve a site definition to its actual credentials (read from .env).

    Returns a dict with keys:
        id, label, url,
        wc_key, wc_secret, wc_auth (tuple or None),
        wp_user, wp_password, auth (tuple or None)
    """
    sites = _load()
    defn  = next((s for s in sites if s["id"] == site_id), None)
    if defn is None:
        ids = [s["id"] for s in sites]
        raise HTTPException(
            status_code=400,
            detail=f"Unknown site '{site_id}'. Valid: {ids}",
        )

    env = dotenv_values(_DOTENV_PATH)
    e   = defn["env"]

    url        = (env.get(e.get("wc_url", ""))      or "").strip().rstrip("/")
    wp_user    = (env.get(e.get("wp_user", ""))      or "").strip()
    wp_pass    = (env.get(e.get("wp_password", ""))  or "").strip()
    wc_key     = (env.get(e.get("wc_key", ""))       or "").strip()
    wc_secret  = (env.get(e.get("wc_secret", ""))    or "").strip()

    wc_auth = (wc_key, wc_secret) if wc_key and wc_secret else None
    wp_auth = (wp_user, wp_pass)  if wp_user and wp_pass  else None

    if require_wc and wc_auth is None:
        raise HTTPException(
            status_code=500,
            detail=f"No WooCommerce credentials configured for site '{site_id}'. "
                   f"Set {e.get('wc_key')} and {e.get('wc_secret')} in .env",
        )
    if require_wp and wp_auth is None:
        raise HTTPException(
            status_code=500,
            detail=f"No WordPress credentials configured for site '{site_id}'. "
                   f"Set {e.get('wp_user')} and {e.get('wp_password')} in .env",
        )

    return {
        "id":          defn["id"],
        "label":       defn["label"],
        "url":         url,
        "wc_key":      wc_key,
        "wc_secret":   wc_secret,
        "wc_auth":     wc_auth,
        "wp_user":     wp_user,
        "wp_password": wp_pass,
        "auth":        wp_auth,
    }
