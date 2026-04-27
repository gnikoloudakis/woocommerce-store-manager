from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_wc_adapter
from data_sources.wc_products_adapter import WCProductsAdapter

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# WooCommerce statuses that represent "money in" (default for revenue calculation)
DEFAULT_PAID_STATUSES = ["completed", "processing"]


def _period_range(period: str):
    """Return (after, before) datetimes for a named period.
    'all' returns (None, None) — no date filter, fetches every order."""
    now = datetime.now(timezone.utc)
    if period == "all":
        return None, None
    if period == "week":
        return now - timedelta(days=7), None
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), None
    if period == "last_month":
        first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_of_prev = first_of_this - timedelta(seconds=1)
        return last_of_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0), first_of_this
    if period == "year":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), None
    return now - timedelta(days=30), None


def _add_month(d: datetime) -> datetime:
    """Return d advanced by one month (handles year boundary)."""
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1)
    return d.replace(month=d.month + 1)


def _fetch_orders(wc: WCProductsAdapter, after=None, before=None, statuses=None) -> list:
    """Paginate through orders in a date range, optionally filtered by status(es)."""
    all_orders = []
    page = 1
    while True:
        params = {"per_page": 100, "page": page, "orderby": "date", "order": "desc"}
        if after:
            params["after"] = after.isoformat()
        if before:
            params["before"] = before.isoformat()
        if statuses:
            params["status"] = ",".join(statuses) if isinstance(statuses, (list, tuple)) else statuses
        r = wc.wc_api.get("orders", params=params)
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        all_orders.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    return all_orders


def _count_products(wc: WCProductsAdapter, params: dict) -> int:
    """Cheap count via X-WP-Total header — fetches one product, only the header is meaningful."""
    response = wc.wc_api.get("products", params={**params, "per_page": 1})
    response.raise_for_status()
    return int(response.headers.get("X-WP-Total", 0))


@router.get("/overview")
def overview(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    return {
        "by_status": {
            "publish": _count_products(wc, {"status": "publish"}),
            "draft":   _count_products(wc, {"status": "draft"}),
            "private": _count_products(wc, {"status": "private"}),
            "pending": _count_products(wc, {"status": "pending"}),
        },
        "by_type": {
            "simple":   _count_products(wc, {"type": "simple"}),
            "variable": _count_products(wc, {"type": "variable"}),
            "grouped":  _count_products(wc, {"type": "grouped"}),
            "external": _count_products(wc, {"type": "external"}),
        },
        "by_stock": {
            "instock":     _count_products(wc, {"stock_status": "instock"}),
            "outofstock":  _count_products(wc, {"stock_status": "outofstock"}),
            "onbackorder": _count_products(wc, {"stock_status": "onbackorder"}),
        },
    }


@router.get("/top-sellers")
def top_sellers(limit: int = 10, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """WooCommerce's `orderby=popularity` sorts by total_sales descending."""
    response = wc.wc_api.get("products", params={
        "orderby": "popularity",
        "order": "desc",
        "per_page": limit,
        "status": "publish",
    })
    response.raise_for_status()
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "total_sales": int(p.get("total_sales") or 0),
            "image": p["images"][0]["src"] if p.get("images") else None,
            "permalink": p.get("permalink"),
            "price": p.get("price"),
            "type": p.get("type"),
        }
        for p in response.json()
    ]


@router.get("/by-category")
def by_category(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    response = wc.wc_api.get("products/categories", params={
        "per_page": 100, "orderby": "count", "order": "desc", "hide_empty": True,
    })
    response.raise_for_status()
    return [
        {"id": c["id"], "name": c["name"], "slug": c["slug"], "count": c["count"]}
        for c in response.json() if c["count"] > 0
    ]


@router.get("/by-tag")
def by_tag(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    response = wc.wc_api.get("products/tags", params={
        "per_page": 100, "orderby": "count", "order": "desc", "hide_empty": True,
    })
    response.raise_for_status()
    return [
        {"id": t["id"], "name": t["name"], "slug": t["slug"], "count": t["count"]}
        for t in response.json() if t["count"] > 0
    ]


@router.get("/by-secret-tag")
def by_secret_tag(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """Scans every product and parses hidden span tags — can be slow on large stores."""
    counts: dict[str, int] = {}
    page = 1
    while True:
        response = wc.wc_api.get("products", params={"page": page, "per_page": 100})
        response.raise_for_status()
        products = response.json()
        if not products:
            break
        for p in products:
            for tag in wc.get_secret_tags(p):
                counts[tag] = counts.get(tag, 0) + 1
        if len(products) < 100:
            break
        page += 1
    return [{"tag": t, "count": c} for t, c in sorted(counts.items(), key=lambda x: -x[1])]


@router.get("/orders/overview")
def orders_overview(period: str = "month", wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """Headline order numbers, computed by summing /orders directly.
    period: 'week' | 'month' | 'last_month' | 'year'

    Revenue includes orders with status 'completed' OR 'processing' (paid orders) —
    this matches what most shop owners think of as revenue, unlike WC's legacy reports
    which exclude 'processing' and often return 0.
    """
    after, before = _period_range(period)

    result = {
        "by_status": {},
        "total_orders": 0,
        "total_sales": 0.0,
        "avg_order_value": 0.0,
        "currency": "EUR",
        "period": period,
    }

    # All-time order counts by status
    try:
        r = wc.wc_api.get("reports/orders/totals")
        r.raise_for_status()
        result["by_status"] = {item["slug"]: item["total"] for item in r.json()}
    except Exception as e:
        print(f"⚠️  reports/orders/totals failed: {e}")

    # Period revenue: sum paid orders directly
    try:
        paid_orders = _fetch_orders(wc, after=after, before=before, statuses=DEFAULT_PAID_STATUSES)
        total_sales = sum(float(o.get("total") or 0) for o in paid_orders)
        n = len(paid_orders)
        result["total_orders"]    = n
        result["total_sales"]     = round(total_sales, 2)
        result["avg_order_value"] = round(total_sales / n, 2) if n else 0.0
        if paid_orders:
            result["currency"] = paid_orders[0].get("currency") or result["currency"]
    except Exception as e:
        print(f"⚠️  /orders fetch failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not fetch orders: {e}")

    return result


@router.get("/orders/recent")
def orders_recent(limit: int = 10, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        r = wc.wc_api.get("orders", params={"per_page": limit, "orderby": "date", "order": "desc"})
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch orders: {e}")

    out = []
    for o in r.json():
        billing = o.get("billing") or {}
        name = f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip() or "(guest)"
        out.append({
            "id": o["id"],
            "number": o.get("number"),
            "status": o.get("status"),
            "total": o.get("total"),
            "currency": o.get("currency"),
            "date_created": o.get("date_created"),
            "customer_name": name,
            "items_count": len(o.get("line_items") or []),
        })
    return out


@router.get("/orders/sales-trend")
def orders_sales_trend(period: str = "month", wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """Order totals for charting, computed from /orders directly.
    Buckets by day for short periods (week/month/last_month) and by month for long ones (year/all)."""
    after, before = _period_range(period)
    granularity = "month" if period in ("year", "all") else "day"
    key_fmt = "%Y-%m" if granularity == "month" else "%Y-%m-%d"

    try:
        orders = _fetch_orders(wc, after=after, before=before, statuses=DEFAULT_PAID_STATUSES)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch orders: {e}")

    bucket: dict[str, dict] = {}
    currency = "EUR"
    for o in orders:
        iso = (o.get("date_created") or "")
        if len(iso) < 7:
            continue
        key = iso[:7] if granularity == "month" else iso[:10]
        if key not in bucket:
            bucket[key] = {"sales": 0.0, "orders": 0}
        bucket[key]["sales"] += float(o.get("total") or 0)
        bucket[key]["orders"] += 1
        if o.get("currency"):
            currency = o["currency"]

    # Fill gaps so the chart spans the full requested range
    if after:
        end = before or datetime.now(timezone.utc)
        cur = after.replace(hour=0, minute=0, second=0, microsecond=0)
        if granularity == "month":
            cur = cur.replace(day=1)
        while cur <= end:
            key = cur.strftime(key_fmt)
            if key not in bucket:
                bucket[key] = {"sales": 0.0, "orders": 0}
            cur = _add_month(cur) if granularity == "month" else cur + timedelta(days=1)

    daily = [
        {"date": k, "sales": round(info["sales"], 2), "orders": info["orders"]}
        for k, info in sorted(bucket.items())
    ]
    return {"daily": daily, "currency": currency, "granularity": granularity}


@router.get("/orders/monthly-trend")
def orders_monthly_trend(months: int = 12, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    """Orders aggregated by calendar month for the last N months (default 12).
    Designed for the dashboard's line chart of orders per month."""
    now = datetime.now(timezone.utc)
    # Walk back N months from the start of the current month
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(months - 1):
        # subtract one month
        if start_month.month == 1:
            start_month = start_month.replace(year=start_month.year - 1, month=12)
        else:
            start_month = start_month.replace(month=start_month.month - 1)

    try:
        orders = _fetch_orders(wc, after=start_month, before=None, statuses=DEFAULT_PAID_STATUSES)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch orders: {e}")

    bucket: dict[str, dict] = {}
    currency = "EUR"
    for o in orders:
        iso = o.get("date_created") or ""
        if len(iso) < 7:
            continue
        key = iso[:7]
        if key not in bucket:
            bucket[key] = {"sales": 0.0, "orders": 0}
        bucket[key]["sales"] += float(o.get("total") or 0)
        bucket[key]["orders"] += 1
        if o.get("currency"):
            currency = o["currency"]

    # Fill all months in range
    cur = start_month
    while cur <= now:
        key = cur.strftime("%Y-%m")
        if key not in bucket:
            bucket[key] = {"sales": 0.0, "orders": 0}
        cur = _add_month(cur)

    monthly = [
        {"month": k, "sales": round(info["sales"], 2), "orders": info["orders"]}
        for k, info in sorted(bucket.items())
    ]
    return {"monthly": monthly, "currency": currency}


@router.get("/out-of-stock")
def out_of_stock(limit: int = 50, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    response = wc.wc_api.get("products", params={
        "stock_status": "outofstock",
        "per_page": limit,
        "status": "publish",
    })
    response.raise_for_status()
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "image": p["images"][0]["src"] if p.get("images") else None,
            "type": p.get("type"),
            "permalink": p.get("permalink"),
        }
        for p in response.json()
    ]
