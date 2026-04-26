from typing import Any, Dict, List, Optional
from pydantic import BaseModel


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
    categories: Optional[List[str]] = None
    tags: Optional[List[str]] = None
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


class BulkProductItem(BaseModel):
    product: Dict[str, Any]   # mirrors ProductStore "product" key
    variations: Dict[str, Any] = {}  # mirrors ProductStore "variations" key
