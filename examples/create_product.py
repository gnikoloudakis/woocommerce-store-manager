from woocommerce import API

from utils.config import Config

SIZES = ["S", "M", "L", "XL", "2XL"]
COLORS = ["Black", "White"]
product_object = {
    "name": "test_product",
    "slug": "test-product",
    "type": "variable",  # This is key - makes it a variable product
    "status": "publish",
    "featured": False,
    "catalog_visibility": "visible",
    "description": "This is a test product description.",
    "short_description": "This is a short description for the test product.",
    "sku": "TEST-001",
    "manage_stock": False,
    "stock_status": "instock",
    "virtual": False,
    "downloadable": False,
    "tax_status": "taxable",
    "tax_class": "standard",
    "weight": "0.20",
    "dimensions": {"length": "69", "width": "51", "height": "1"},
    "shipping_required": True,
    "shipping_taxable": True,
    "reviews_allowed": True,
    "categories": [
        {"id": 16},
        {"id": 17},
    ],
    "tags": [{"id": 30}],  # organic
    "images": [{"id": 174}],  # 52.jpg
    # Define attributes that will be used for variations
    "attributes": [
        {
            "id": 0,  # 0 means create new product-specific attribute
            "name": "Size",
            "slug": "size",
            "position": 0,
            "visible": True,
            "variation": True,  # CRITICAL: Must be True for variations
            "options": SIZES,
        },
        {
            "id": 0,
            "name": "Color",
            "slug": "color",
            "position": 1,
            "visible": True,
            "variation": True,  # CRITICAL: Must be True for variations
            "options": COLORS,
        },
        {"id": 0, "name": "Material", "slug": "material", "visible": True, "variation": False, "options": ["100% Organic Cotton"]},
    ],
    "default_attributes": [
        {"id": 0, "name": "Size", "slug": "size", "option": "M"},
        {"id": 0, "name": "Color", "slug": "color", "option": "Black"},
    ],
    "meta_data": [{"key": "_expected_variations", "value": str(len(SIZES) * len(COLORS))}],
}

wc_api = API(
    url=Config.get_param("WC_URL"),
    consumer_key=Config.get_param("CONSUMER_KEY"),
    consumer_secret=Config.get_param("CONSUMER_SECRET"),
    version="wc/v3",
    wp_api=True,
    query_string_auth=True,  # Set to True if you want to force HTTP Basic Authentication. Set to False for HTTPS
)

print(wc_api.post("products", product_object).json())
