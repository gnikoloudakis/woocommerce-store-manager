import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import Depends, Query

from data_sources.wc_products_adapter import WCProductsAdapter
from data_sources.wp_image_adapter import WPImageAdapter
from interactors.create_product_interactor import CreateProductInteractor

# Per-site adapter caches — keyed by site id
_wc_adapters:  dict[str, WCProductsAdapter] = {}
_wp_adapters:  dict[str, WPImageAdapter]    = {}


def _resolve_site_id(site: str | None) -> str:
    from api.site_registry import default_site_id
    return site or default_site_id()


def get_wc_adapter(site: str = Query(default=None)) -> WCProductsAdapter:
    """
    FastAPI dependency — injects a WCProductsAdapter for the requested site.
    Callers pass ?site=<id> as a query param; omitting it uses the first site
    in sites.json as the default.
    """
    from api.site_registry import get_site
    site_id = _resolve_site_id(site)
    if _wc_adapters.get(site_id) is None:
        s = get_site(site_id, require_wc=True)
        adapter = WCProductsAdapter(
            url=s["url"],
            consumer_key=s["wc_key"],
            consumer_secret=s["wc_secret"],
        )
        adapter._site_id = site_id
        _wc_adapters[site_id] = adapter
    return _wc_adapters[site_id]


def get_wp_image_adapter(site: str = Query(default=None)) -> WPImageAdapter:
    from api.site_registry import get_site
    site_id = _resolve_site_id(site)
    if _wp_adapters.get(site_id) is None:
        s = get_site(site_id)
        adapter = WPImageAdapter(
            url=s["url"],
            username=s["wp_user"],
            password=s["wp_password"],
        )
        adapter._site_id = site_id
        _wp_adapters[site_id] = adapter
    return _wp_adapters[site_id]


def get_create_interactor(
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    wp: WPImageAdapter    = Depends(get_wp_image_adapter),
) -> CreateProductInteractor:
    return CreateProductInteractor(
        wc_products_adapter=wc,
        wp_image_adapter=wp,
    )


def reset_wc_adapter(adapter: WCProductsAdapter | None = None) -> None:
    """
    Invalidate the cached adapter so the next request re-fetches from WC.
    Pass the adapter instance (from Depends) to reset only that site;
    call without arguments to reset all sites.
    """
    global _wc_adapters
    if adapter is not None and hasattr(adapter, "_site_id"):
        _wc_adapters.pop(adapter._site_id, None)
    else:
        _wc_adapters.clear()
