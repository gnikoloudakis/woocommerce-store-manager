from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_wc_adapter
from api.schemas.coupon import CreateCouponRequest, UpdateCouponRequest
from data_sources.wc_products_adapter import WCProductsAdapter

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("")
def list_coupons(
    page: int = 1,
    per_page: int = 20,
    search: str = "",
    code: str = "",
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    params = {"page": page, "per_page": per_page, "orderby": "id", "order": "desc"}
    if search:
        params["search"] = search
    if code:
        params["code"] = code

    r = wc.wc_api.get("coupons", params=params)
    r.raise_for_status()
    return {
        "coupons": r.json(),
        "total": int(r.headers.get("X-WP-Total", 0)),
        "total_pages": int(r.headers.get("X-WP-TotalPages", 1)),
    }


@router.get("/{coupon_id}")
def get_coupon(coupon_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.get(f"coupons/{coupon_id}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Coupon not found")
    r.raise_for_status()
    return r.json()


@router.post("")
def create_coupon(body: CreateCouponRequest, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    payload = body.model_dump(exclude_none=True)
    # Strip empty-string fields WC treats as invalid
    for k in ("date_expires",):
        if payload.get(k) == "":
            payload.pop(k)

    r = wc.wc_api.post("coupons", payload)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=r.json().get("message", r.text))
    return r.json()


@router.put("/{coupon_id}")
def update_coupon(
    coupon_id: int,
    body: UpdateCouponRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    r = wc.wc_api.put(f"coupons/{coupon_id}", payload)
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=r.json().get("message", r.text))
    return r.json()


@router.delete("/{coupon_id}")
def delete_coupon(coupon_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.delete(f"coupons/{coupon_id}", params={"force": True})
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"deleted": True, "id": coupon_id}
