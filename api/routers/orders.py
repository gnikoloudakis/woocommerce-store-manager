from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from api.dependencies import get_wc_adapter
from data_sources.wc_products_adapter import WCProductsAdapter
from data_sources.boxnow_adapter import (
    BoxNowAdapter,
    BoxNowError,
    extract_voucher_from_order,
    extract_locker_id_from_order,
    collect_boxnow_meta,
)
from utils.config import Config

router = APIRouter(prefix="/orders", tags=["orders"])

_boxnow: Optional[BoxNowAdapter] = None


def get_boxnow() -> BoxNowAdapter:
    global _boxnow
    if _boxnow is None:
        _boxnow = BoxNowAdapter()
    return _boxnow


class OrderStatusUpdate(BaseModel):
    status: str  # publish, processing, on-hold, completed, cancelled, refunded, failed


class OrderNoteCreate(BaseModel):
    note: str
    customer_note: bool = False


@router.get("")
def list_orders(
    page: int = 1,
    per_page: int = 20,
    status: str = "",      # comma-separated allowed
    search: str = "",
    after: str = "",       # ISO8601
    before: str = "",
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    params = {"page": page, "per_page": per_page, "orderby": "date", "order": "desc"}
    if status:  params["status"] = status
    if search:  params["search"] = search
    if after:   params["after"] = after
    if before:  params["before"] = before

    r = wc.wc_api.get("orders", params=params)
    r.raise_for_status()
    return {
        "orders": r.json(),
        "total": int(r.headers.get("X-WP-Total", 0)),
        "total_pages": int(r.headers.get("X-WP-TotalPages", 1)),
    }


@router.get("/{order_id}")
def get_order(order_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        r = wc.wc_api.get(f"orders/{order_id}")
        r.raise_for_status()
        order = r.json()
        order["_boxnow_voucher"] = extract_voucher_from_order(order)
        return order
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{order_id}/status")
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    try:
        r = wc.wc_api.put(f"orders/{order_id}", {"status": body.status})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{order_id}/notes")
def list_order_notes(order_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.get(f"orders/{order_id}/notes")
    r.raise_for_status()
    return r.json()


@router.post("/{order_id}/notes")
def add_order_note(
    order_id: int,
    body: OrderNoteCreate,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    r = wc.wc_api.post(f"orders/{order_id}/notes", body.model_dump())
    r.raise_for_status()
    return r.json()


# ─── BOX NOW voucher management ────────────────────────────────────────────


def _format_voucher_for_meta(meta_key: str, voucher_number: str) -> str:
    """The WordPress BoxNow plugins that use a plural key (e.g. `_boxnow_parcel_ids`)
    store the value as a Python-list repr like "['3809526764']". Singular keys
    (e.g. `_boxnow_voucher`) store a plain string. We match the convention based
    on whether the meta key ends in `_ids`/`s` so the plugin can still read it."""
    if meta_key.endswith("_ids") or meta_key.endswith("vouchers"):
        return f"['{voucher_number}']"
    return voucher_number


def _persist_voucher_to_order(wc: WCProductsAdapter, order_id: int, voucher_number: str) -> None:
    """Save the voucher number to WC order meta in the format the WP plugin expects,
    and add an order note for the audit trail."""
    meta_key = Config.get_param("BOXNOW_VOUCHER_META_KEY") or "_boxnow_parcel_ids"
    formatted = _format_voucher_for_meta(meta_key, voucher_number)
    wc.wc_api.put(f"orders/{order_id}", {
        "meta_data": [{"key": meta_key, "value": formatted}]
    }).raise_for_status()
    try:
        wc.wc_api.post(f"orders/{order_id}/notes", {
            "note": f"BOX NOW voucher created: {voucher_number}",
            "customer_note": False,
        })
    except Exception:
        pass  # Order note is best-effort


@router.get("/{order_id}/boxnow")
def get_boxnow_voucher(
    order_id: int,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    boxnow: BoxNowAdapter = Depends(get_boxnow),
):
    """Returns voucher info for an order. Reads the voucher number from
    order meta, optionally enriches it with current parcel state from BoxNow."""
    r = wc.wc_api.get(f"orders/{order_id}")
    r.raise_for_status()
    order = r.json()
    voucher_number = extract_voucher_from_order(order)
    locker_id = extract_locker_id_from_order(order)

    response = {
        "voucher_number": voucher_number,
        "locker_id": locker_id,
        "configured": boxnow.is_configured(),
        "tracking_url": boxnow.tracking_url(voucher_number) if voucher_number else None,
        # Diagnostic: every meta entry that mentions boxnow/voucher/locker/parcel/tracking/apm.
        # Helps the user identify the right BOXNOW_*_META_KEY when the voucher isn't auto-detected.
        "candidate_meta": collect_boxnow_meta(order),
    }

    if voucher_number and boxnow.is_configured():
        try:
            response["details"] = boxnow.get_voucher(voucher_number)
        except BoxNowError as e:
            response["details_error"] = str(e)

    return response


@router.post("/{order_id}/boxnow")
def create_boxnow_voucher(
    order_id: int,
    size: Optional[int] = Query(default=None, ge=1, le=3, description="Compartment size: 1=S, 2=M, 3=L"),
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    boxnow: BoxNowAdapter = Depends(get_boxnow),
):
    if not boxnow.is_configured():
        raise HTTPException(status_code=501, detail="BOX NOW credentials not configured. See data_sources/boxnow_adapter.py for required .env values.")

    r = wc.wc_api.get(f"orders/{order_id}")
    r.raise_for_status()
    order = r.json()

    if extract_voucher_from_order(order):
        raise HTTPException(status_code=409, detail="Order already has a BOX NOW voucher. Cancel it first.")

    try:
        result = boxnow.create_voucher(order, compartment_size=size)
    except BoxNowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _persist_voucher_to_order(wc, order_id, result["voucher_number"])
    return result


@router.delete("/{order_id}/boxnow")
def cancel_boxnow_voucher(
    order_id: int,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    boxnow: BoxNowAdapter = Depends(get_boxnow),
):
    if not boxnow.is_configured():
        raise HTTPException(status_code=501, detail="BOX NOW credentials not configured")

    r = wc.wc_api.get(f"orders/{order_id}")
    r.raise_for_status()
    voucher_number = extract_voucher_from_order(r.json())
    if not voucher_number:
        raise HTTPException(status_code=404, detail="No BOX NOW voucher attached to this order")

    try:
        result = boxnow.cancel_voucher(voucher_number)
    except BoxNowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Clear the voucher from WC meta so a new one can be created.
    # Match the on-disk format: empty list for plural keys, empty string otherwise.
    meta_key = Config.get_param("BOXNOW_VOUCHER_META_KEY") or "_boxnow_parcel_ids"
    cleared_value = "[]" if (meta_key.endswith("_ids") or meta_key.endswith("vouchers")) else ""
    try:
        wc.wc_api.put(f"orders/{order_id}", {"meta_data": [{"key": meta_key, "value": cleared_value}]})
        wc.wc_api.post(f"orders/{order_id}/notes", {
            "note": f"BOX NOW voucher cancelled: {voucher_number}",
            "customer_note": False,
        })
    except Exception:
        pass

    return result


@router.get("/{order_id}/boxnow/track")
def track_boxnow_parcel(
    order_id: int,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    boxnow: BoxNowAdapter = Depends(get_boxnow),
):
    r = wc.wc_api.get(f"orders/{order_id}")
    r.raise_for_status()
    voucher_number = extract_voucher_from_order(r.json())
    if not voucher_number:
        raise HTTPException(status_code=404, detail="No BOX NOW voucher attached to this order")

    if not boxnow.is_configured():
        # Still useful — return the public tracking URL even without API auth
        return {"voucher_number": voucher_number, "tracking_url": boxnow.tracking_url(voucher_number), "details": None}

    try:
        return boxnow.track_parcel(voucher_number)
    except BoxNowError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{order_id}/boxnow/label")
def get_boxnow_label(
    order_id: int,
    type: str = "pdf",
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    boxnow: BoxNowAdapter = Depends(get_boxnow),
):
    """Streams the BOX NOW shipping label as a PDF (or ZPL) attachment."""
    if not boxnow.is_configured():
        raise HTTPException(status_code=501, detail="BOX NOW credentials not configured")

    r = wc.wc_api.get(f"orders/{order_id}")
    r.raise_for_status()
    voucher_number = extract_voucher_from_order(r.json())
    if not voucher_number:
        raise HTTPException(status_code=404, detail="No BOX NOW voucher attached to this order")

    try:
        content = boxnow.get_label(voucher_number, type=type)
    except BoxNowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    media_type = "application/pdf" if type == "pdf" else "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="boxnow-{voucher_number}.{type}"'},
    )


# ─── Webhook receiver (parcel events) ─────────────────────────────────────


class ParcelEventWebhook(BaseModel):
    specversion: Optional[str] = None
    type: Optional[str] = None
    source: Optional[str] = None
    subject: Optional[str] = None
    id: Optional[str] = None
    time: Optional[str] = None
    datacontenttype: Optional[str] = None
    datasignature: Optional[str] = None
    data: Optional[dict] = None


@router.post("/boxnow/webhook")
def boxnow_webhook(body: ParcelEventWebhook, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """Receives BOX NOW parcel event webhooks and adds an order note.
    Configure your BoxNow account to push events to:
        POST <your-public-host>/api/orders/boxnow/webhook
    Events: new, accepted-to-locker, in-depot, final-destination, delivered,
            expired, returned, canceled, accepted-for-return, missing.
    """
    data = body.data or {}
    voucher = data.get("parcelId")
    order_number = data.get("orderNumber")
    state = data.get("parcelState") or data.get("event") or "?"

    # Find the WC order — prefer orderNumber, fall back to scanning meta for voucher
    order = None
    if order_number:
        try:
            r = wc.wc_api.get("orders", params={"search": order_number, "per_page": 1})
            r.raise_for_status()
            results = r.json()
            if results:
                order = results[0]
        except Exception:
            pass

    if order:
        try:
            wc.wc_api.post(f"orders/{order['id']}/notes", {
                "note": f"BOX NOW: parcel {voucher} → {state}",
                "customer_note": False,
            })
        except Exception:
            pass

    return {"received": True, "voucher": voucher, "state": state, "matched_order_id": order["id"] if order else None}
