from typing import List, Optional
from pydantic import BaseModel


# WC coupon discount types: 'percent', 'fixed_cart', 'fixed_product'
DiscountType = str


class CreateCouponRequest(BaseModel):
    code: str
    discount_type: DiscountType = "percent"
    amount: str = "0"
    description: str = ""
    date_expires: Optional[str] = None  # ISO 8601, e.g. "2026-12-31T23:59:59"
    individual_use: bool = False
    product_ids: List[int] = []
    excluded_product_ids: List[int] = []
    usage_limit: Optional[int] = None
    usage_limit_per_user: Optional[int] = None
    limit_usage_to_x_items: Optional[int] = None
    free_shipping: bool = False
    product_categories: List[int] = []
    excluded_product_categories: List[int] = []
    exclude_sale_items: bool = False
    minimum_amount: str = "0"
    maximum_amount: str = "0"
    email_restrictions: List[str] = []


class UpdateCouponRequest(BaseModel):
    code: Optional[str] = None
    discount_type: Optional[DiscountType] = None
    amount: Optional[str] = None
    description: Optional[str] = None
    date_expires: Optional[str] = None
    individual_use: Optional[bool] = None
    product_ids: Optional[List[int]] = None
    excluded_product_ids: Optional[List[int]] = None
    usage_limit: Optional[int] = None
    usage_limit_per_user: Optional[int] = None
    limit_usage_to_x_items: Optional[int] = None
    free_shipping: Optional[bool] = None
    product_categories: Optional[List[int]] = None
    excluded_product_categories: Optional[List[int]] = None
    exclude_sale_items: Optional[bool] = None
    minimum_amount: Optional[str] = None
    maximum_amount: Optional[str] = None
    email_restrictions: Optional[List[str]] = None
