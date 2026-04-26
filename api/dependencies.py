import sys
import os

# Ensure the project root is on sys.path so existing modules are importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data_sources.wc_products_adapter import WCProductsAdapter
from data_sources.wp_image_adapter import WPImageAdapter
from interactors.create_product_interactor import CreateProductInteractor

_wc_adapter: WCProductsAdapter | None = None
_wp_image_adapter: WPImageAdapter | None = None
_create_interactor: CreateProductInteractor | None = None


def get_wc_adapter() -> WCProductsAdapter:
    global _wc_adapter
    if _wc_adapter is None:
        _wc_adapter = WCProductsAdapter()
    return _wc_adapter


def get_wp_image_adapter() -> WPImageAdapter:
    global _wp_image_adapter
    if _wp_image_adapter is None:
        _wp_image_adapter = WPImageAdapter()
    return _wp_image_adapter


def get_create_interactor() -> CreateProductInteractor:
    global _create_interactor
    if _create_interactor is None:
        _create_interactor = CreateProductInteractor(
            wc_products_adapter=get_wc_adapter(),
            wp_image_adapter=get_wp_image_adapter(),
        )
    return _create_interactor


def reset_wc_adapter():
    """Force refresh the cached WC adapter (re-fetches products/categories/tags)."""
    global _wc_adapter, _create_interactor
    _wc_adapter = None
    _create_interactor = None
