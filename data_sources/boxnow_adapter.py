"""BOX NOW Partner API integration.

Implements the endpoints documented in BoxNow API Manual v.7.2:
  - POST /api/v1/auth-sessions          (OAuth2 client credentials)
  - POST /api/v1/delivery-requests      (create voucher)
  - POST /api/v1/parcels/{id}:cancel    (cancel voucher; only when parcel state is "New")
  - GET  /api/v1/parcels/{id}/label.pdf (fetch shipping label)

The adapter caches the OAuth access token (3600s expiry) and reads
voucher / locker metadata from WooCommerce orders.

Required .env values:
  BOXNOW_API_URL                   # base URL provided by BoxNow (sandbox or production)
  BOXNOW_CLIENT_ID                 # OAuth2 client_id
  BOXNOW_CLIENT_SECRET             # OAuth2 client_secret
  BOXNOW_WAREHOUSE_ID              # locationId of your pickup point (warehouse)
  BOXNOW_WAREHOUSE_CONTACT_NAME
  BOXNOW_WAREHOUSE_CONTACT_EMAIL
  BOXNOW_WAREHOUSE_CONTACT_PHONE   # full international format, e.g. +306900000000

Optional .env values:
  BOXNOW_LOCKER_META_KEY=_boxnow_locker_id    # WC order meta key holding the destination locker
  BOXNOW_VOUCHER_META_KEY=_boxnow_voucher     # WC order meta key where we persist the voucher number
  BOXNOW_DEFAULT_COMPARTMENT_SIZE=1           # 1=small, 2=medium, 3=large
  BOXNOW_DEFAULT_WEIGHT=0                     # grams; 0 = unknown
  BOXNOW_TRACKING_URL_TEMPLATE=https://boxnow.gr/tracking?parcelId={voucher}
"""
import ast
import re
import time
from typing import Optional

import requests

from utils.config import Config


# WC order meta keys that BOX NOW WordPress plugins commonly use.
LOCKER_META_KEY_FALLBACKS = [
    "_boxnow_locker_id",
    "boxnow_locker_id",
    "_boxnow_destination",
    "_boxnow_locker",
    "_boxnow_lockerid",
    "_boxnow_lockerid_value",
    "boxnow_lockerid",
    "_boxnow_apm",
    "boxnow_apm",
]

VOUCHER_META_KEY_FALLBACKS = [
    "_boxnow_parcel_ids",      # used by the cranky.gr plugin (list-formatted: "['3809526764']")
    "_boxnow_voucher",
    "_boxnow_voucher_number",
    "_boxnow_parcel_id",
    "boxnow_voucher",
    "_boxnow_id",
    "_boxnow_tracking",
    "_boxnow_tracking_number",
    "_boxnow_parcel",
    "boxnow_parcel_id",
    "_boxnow_vouchers",
    "_boxnow_vouchers_created",
]


# BOX NOW voucher numbers are 10-digit numbers (e.g. 9219709201, 3809526764).
_VOUCHER_REGEX = re.compile(r"\d{10}")


def _coerce_voucher(raw) -> Optional[str]:
    """Normalize a raw meta value into a single voucher number string.
    Handles:
      - bare number: '9219709201'
      - python-list repr: "['3809526764']" or "['3809526764', '...']"
      - JSON list: '["3809526764"]'
      - actual list/tuple: ['3809526764']
      - free-form text containing a 10-digit number
    Returns None if no voucher pattern is found.
    """
    if raw is None:
        return None
    # Already a list/tuple from the API
    if isinstance(raw, (list, tuple)):
        for item in raw:
            v = _coerce_voucher(item)
            if v:
                return v
        return None
    s = str(raw).strip()
    if not s:
        return None
    # List-string form — try Python literal_eval (safely handles both Python and JSON list syntax)
    if s.startswith(("[", "(")):
        try:
            parsed = ast.literal_eval(s)
            v = _coerce_voucher(parsed)
            if v:
                return v
        except (ValueError, SyntaxError):
            pass
    # Last resort: pull the first 10-digit run out of the string
    m = _VOUCHER_REGEX.search(s)
    return m.group() if m else None


def _read_meta_exact(order: dict, keys: list[str]) -> Optional[str]:
    """Look up a meta value by exact key match against any of `keys`.
    Returns the raw string value (call _coerce_voucher to normalize it)."""
    for meta in order.get("meta_data") or []:
        if meta.get("key") in keys:
            value = meta.get("value")
            if value not in (None, "", 0, "0", [], "[]"):
                return value
    return None


def extract_voucher_from_order(order: dict) -> Optional[str]:
    """Find the BoxNow voucher number in WC order metadata.
    Values are run through _coerce_voucher, which handles bare numbers,
    Python/JSON list reprs (e.g. "['3809526764']"), and free-form text.
    Strategy:
      1) Configured BOXNOW_VOUCHER_META_KEY
      2) Common fallback keys
      3) Heuristic: any meta key containing 'boxnow'/'voucher'/'parcel'/'tracking'
    """
    primary = Config.get_param("BOXNOW_VOUCHER_META_KEY")
    if primary:
        raw = _read_meta_exact(order, [primary])
        v = _coerce_voucher(raw)
        if v:
            return v

    raw = _read_meta_exact(order, VOUCHER_META_KEY_FALLBACKS)
    v = _coerce_voucher(raw)
    if v:
        return v

    # Heuristic: scan all meta whose key hints at BoxNow, then coerce
    for meta in order.get("meta_data") or []:
        key = (meta.get("key") or "").lower()
        raw = meta.get("value")
        if raw in (None, "", 0, "0", [], "[]"):
            continue
        if any(t in key for t in ("boxnow", "voucher", "parcel", "tracking")):
            v = _coerce_voucher(raw)
            if v:
                return v
    return None


def extract_locker_id_from_order(order: dict) -> Optional[str]:
    primary = Config.get_param("BOXNOW_LOCKER_META_KEY")
    if primary:
        v = _read_meta_exact(order, [primary])
        if v:
            return v
    v = _read_meta_exact(order, LOCKER_META_KEY_FALLBACKS)
    if v:
        return v
    # Heuristic: any meta key with 'locker' or 'apm' that's purely numeric
    for meta in order.get("meta_data") or []:
        key = (meta.get("key") or "").lower()
        raw = meta.get("value")
        if raw in (None, "", 0, "0"):
            continue
        value = str(raw)
        if ("locker" in key or "apm" in key) and value.isdigit():
            return value
    return None


def collect_boxnow_meta(order: dict) -> list[dict]:
    """Diagnostic: return every meta entry whose key OR value mentions
    boxnow/voucher/locker/parcel/tracking/apm. Used by the UI when we can't
    find the voucher, so the user can see what's actually there."""
    out = []
    for meta in order.get("meta_data") or []:
        key = (meta.get("key") or "")
        raw = meta.get("value")
        try:
            value_str = str(raw) if raw is not None else ""
        except Exception:
            value_str = "<unserializable>"
        haystack = (key + " " + value_str).lower()
        if any(t in haystack for t in ("boxnow", "voucher", "locker", "parcel", "tracking", "apm")):
            out.append({"key": key, "value": value_str, "id": meta.get("id")})
    return out


class BoxNowError(Exception):
    pass


class BoxNowAdapter:
    def __init__(self):
        self.base_url      = (Config.get_param("BOXNOW_API_URL") or "").rstrip("/")
        self.client_id     = Config.get_param("BOXNOW_CLIENT_ID")
        self.client_secret = Config.get_param("BOXNOW_CLIENT_SECRET")
        self.warehouse_id    = Config.get_param("BOXNOW_WAREHOUSE_ID")
        self.warehouse_name  = Config.get_param("BOXNOW_WAREHOUSE_CONTACT_NAME") or ""
        self.warehouse_email = Config.get_param("BOXNOW_WAREHOUSE_CONTACT_EMAIL") or ""
        self.warehouse_phone = Config.get_param("BOXNOW_WAREHOUSE_CONTACT_PHONE") or ""
        self.default_compartment = int(Config.get_param("BOXNOW_DEFAULT_COMPARTMENT_SIZE") or 1)
        self.default_weight      = int(Config.get_param("BOXNOW_DEFAULT_WEIGHT") or 0)
        self.tracking_url_template = (
            Config.get_param("BOXNOW_TRACKING_URL_TEMPLATE")
            or "https://t.boxnow.gr/?track={voucher}"
        )

        self._token: Optional[str] = None
        self._token_expires_at: float = 0  # epoch seconds

    def is_configured(self) -> bool:
        return bool(self.base_url and self.client_id and self.client_secret and self.warehouse_id)

    # ── Auth ────────────────────────────────────────────────────────────

    def _ensure_token(self) -> str:
        """Fetch and cache an OAuth2 access token. Refreshes 60s before expiry."""
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        if not (self.base_url and self.client_id and self.client_secret):
            raise BoxNowError("BoxNow credentials not configured (BOXNOW_API_URL / CLIENT_ID / CLIENT_SECRET)")

        r = requests.post(
            f"{self.base_url}/api/v1/auth-sessions",
            json={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            timeout=15,
        )
        if not r.ok:
            raise BoxNowError(f"BoxNow auth failed: {r.status_code} {r.text}")
        data = r.json()
        self._token = data["access_token"]
        self._token_expires_at = time.time() + int(data.get("expires_in", 3600))
        return self._token

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "Authorization": f"Bearer {self._ensure_token()}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    # ── Voucher operations ──────────────────────────────────────────────

    def _build_delivery_request(self, order: dict, compartment_size: int | None = None) -> dict:
        locker_id = extract_locker_id_from_order(order)
        if not locker_id:
            raise BoxNowError(
                "No BoxNow locker ID in order metadata. Customer must pick a locker at checkout, "
                f"or set BOXNOW_LOCKER_META_KEY to the meta key your store uses."
            )

        billing = order.get("billing") or {}
        recipient_name = f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip() or "Customer"
        recipient_email = billing.get("email") or ""
        recipient_phone = billing.get("phone") or ""

        # Heuristic: if payment method is COD-like, switch payment mode and request collection
        payment_method = (order.get("payment_method") or "").lower()
        is_cod = "cod" in payment_method or "cash" in payment_method

        order_number = str(order.get("number") or order.get("id"))
        total = order.get("total") or "0.00"

        size = compartment_size if compartment_size in (1, 2, 3) else self.default_compartment

        return {
            "orderNumber": order_number,
            "invoiceValue": str(total),
            "paymentMode": "cod" if is_cod else "prepaid",
            "amountToBeCollected": str(total) if is_cod else "0.00",
            "origin": {
                "contactNumber": self.warehouse_phone,
                "contactEmail":  self.warehouse_email,
                "contactName":   self.warehouse_name,
                "locationId":    str(self.warehouse_id),
            },
            "destination": {
                "contactNumber": recipient_phone,
                "contactEmail":  recipient_email,
                "contactName":   recipient_name,
                "locationId":    str(locker_id),
            },
            "items": [{
                "id": "1",
                "name": f"Order {order_number}",
                "value": str(total),
                "compartmentSize": size,
                "weight": self.default_weight,
            }],
        }

    def create_voucher(self, order: dict, compartment_size: int | None = None) -> dict:
        """POST /api/v1/delivery-requests
        compartment_size: 1=S, 2=M, 3=L (falls back to BOXNOW_DEFAULT_COMPARTMENT_SIZE).
        Returns: {voucher_number, delivery_request_id, raw}"""
        payload = self._build_delivery_request(order, compartment_size=compartment_size)
        r = requests.post(
            f"{self.base_url}/api/v1/delivery-requests",
            headers=self._headers(),
            json=payload,
            timeout=20,
        )
        if not r.ok:
            raise BoxNowError(f"create_voucher failed: {r.status_code} {r.text}")
        data = r.json()
        parcels = data.get("parcels") or []
        if not parcels:
            raise BoxNowError(f"BoxNow response missing parcels: {data}")
        return {
            "voucher_number":      str(parcels[0]["id"]),
            "delivery_request_id": str(data.get("id", "")),
            "tracking_url":        self.tracking_url(str(parcels[0]["id"])),
            "raw":                 data,
        }

    def cancel_voucher(self, voucher_number: str) -> dict:
        """POST /api/v1/parcels/{id}:cancel — only works when parcel state is 'New'."""
        r = requests.post(
            f"{self.base_url}/api/v1/parcels/{voucher_number}:cancel",
            headers=self._headers(),
            timeout=15,
        )
        if not r.ok:
            raise BoxNowError(f"cancel_voucher failed: {r.status_code} {r.text}")
        return {"voucher_number": voucher_number, "cancelled": True, "raw": r.json() if r.text else {}}

    def get_voucher(self, voucher_number: str) -> dict:
        """GET /api/v1/parcels/{id} — fetches current parcel info/state."""
        r = requests.get(
            f"{self.base_url}/api/v1/parcels/{voucher_number}",
            headers=self._headers(),
            timeout=15,
        )
        if not r.ok:
            raise BoxNowError(f"get_voucher failed: {r.status_code} {r.text}")
        return r.json()

    def get_label(self, voucher_number: str, type: str = "pdf") -> bytes:
        """GET /api/v1/parcels/{id}/label.{pdf|zpl} — returns the raw label bytes."""
        if type not in ("pdf", "zpl"):
            raise BoxNowError("type must be 'pdf' or 'zpl'")
        accept = "application/pdf" if type == "pdf" else "application/octet-stream"
        r = requests.get(
            f"{self.base_url}/api/v1/parcels/{voucher_number}/label.{type}",
            headers=self._headers({"Accept": accept}),
            timeout=20,
        )
        if not r.ok:
            raise BoxNowError(f"get_label failed: {r.status_code} {r.text}")
        return r.content

    def track_parcel(self, voucher_number: str) -> dict:
        """BoxNow uses webhooks for real-time tracking, not polling — but /parcels/{id}
        returns the current state. We expose that plus the public tracking URL."""
        try:
            details = self.get_voucher(voucher_number)
        except BoxNowError:
            details = None
        return {
            "voucher_number": voucher_number,
            "tracking_url":   self.tracking_url(voucher_number),
            "details":        details,
        }

    def tracking_url(self, voucher_number: str) -> str:
        return self.tracking_url_template.format(voucher=voucher_number)
