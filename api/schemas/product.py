from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class CreateProductRequest(BaseModel):
    name: str
    short_description: str = ""
    type: str = "variable"  # "variable" or "simple"
    status: str = "publish"
    categories: List[str] = []       # category slugs or names
    tags: List[str] = []             # tag slugs or names
    main_image_ids: List[int] = []   # WP media IDs
    colors: List[str] = []
    sizes: List[str] = []
    base_price: str = "18.00"
    variation_image_mapping: Dict[str, int] = {}   # "S-Black": media_id
    price_overrides: Dict[str, str] = {}            # "S-Black": "19.00"
    sale_prices: Dict[str, str] = {}
    related_ids: List[int] = []
    meta_data: List[Dict[str, Any]] = []
    # Simple product fields
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None


class UpdateProductRequest(BaseModel):
    name: Optional[str] = None
    short_description: Optional[str] = None
    status: Optional[str] = None
    categories: Optional[List[Any]] = None   # str (name) OR {"id": int}
    tags: Optional[List[Any]] = None          # str (name) OR {"id": int}
    main_image_ids: Optional[List[int]] = None
    colors: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    meta_data: Optional[List[Dict[str, Any]]] = None


class CreateVariationRequest(BaseModel):
    size: str
    color: str
    regular_price: str
    sale_price: str = ""
    image_id: Optional[int] = None
    sku: Optional[str] = None


class UpdateVariationRequest(BaseModel):
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    image_id: Optional[int] = None
    status: Optional[str] = None


class SecretTagsRequest(BaseModel):
    tags: List[str]


# ─── Structured ProductStore schema ────────────────────────────────────────
# Mirrors the implicit dict shape used in data_sources/data/products_data.py
# (the original ProductStore class). Used by the bulk import endpoint.

# Image refs: WP media ID (int) OR filename without extension (str).
# Same for category/tag refs: WC term ID (int) OR slug/name (str).
ImageRef = Union[int, str]
TaxonomyRef = Union[int, str]


class TaxonomyTerm(BaseModel):
    """A category or tag reference. `id` is either the WC numeric ID
    or a string slug/name that gets resolved by the enricher."""
    id: TaxonomyRef


class MetaDataItem(BaseModel):
    key: str
    value: Any


class ProductDefinition(BaseModel):
    """The 'product' half of a ProductStore entry."""
    product_name: str = Field(..., min_length=1)
    product_slug: Optional[str] = None
    short_description: str = ""
    main_image_ids: List[ImageRef] = []
    categories: List[TaxonomyTerm] = []
    tags: List[TaxonomyTerm] = []
    colors: List[str] = []
    sizes: List[str] = []
    base_price: Optional[str] = None
    secret_tags: List[str] = []
    related_ids: List[int] = []
    meta_data: List[MetaDataItem] = []


class VariationsDefinition(BaseModel):
    """The 'variations' half of a ProductStore entry. Keys are 'Size-Color' strings."""
    variation_image_mapping: Dict[str, ImageRef] = {}
    price_overrides: Dict[str, str] = {}
    sale_prices: Dict[str, str] = {}
    stock_quantities: Dict[str, int] = {}


class BulkProductItem(BaseModel):
    """One product bundle for bulk import. Same shape as a ProductStore entry."""
    product: ProductDefinition
    variations: VariationsDefinition = VariationsDefinition()
