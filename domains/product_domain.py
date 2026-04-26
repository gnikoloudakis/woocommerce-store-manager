import itertools
import string
from pprint import pprint
import random
from typing import List, Dict, Any

from data_sources.data.products_data import ProductStore


class Product:
    def __init__(
        self,
    ):
        # Default configuration
        # self.COLORS = ["Black", "White"]
        # self.SIZES = ["S", "M", "L", "XL", "2XL"]
        self.BASE_PRICE = "18.00"

        # Size specifications for realistic dimensions/weights
        self.SIZE_SPECS = {}
        # {"S": {"chest": "50", "length": "50", "sleeve": "16.50", "weight": "0.5Kg"},
        #     "M": {"chest": "53", "length": "50", "sleeve": "17", "weight": "0.5Kg"},
        #     "L": {"chest": "56", "length": "50", "sleeve": "17.50", "weight": "0.5Kg"},
        #     "XL": {"chest": "59", "length": "50", "sleeve": "18", "weight": "0.5Kg"},
        #     "2XL": {"chest": "62", "length": "50", "sleeve": "18.50", "weight": "0.5Kg"},
        # }
        self.org_tee_description = f"""
                            <ul>
                            <li>185 g/m²</li>
                            <li>100% οργανικό βαμβάκι</li>
                            <li>Όλες οι αποχρώσεις είναι κατασκευασμένες από βαμβάκι σε μεταβατικό στάδιο προς τη βιολογική καλλιέργεια</li>
                            <li>Σωληνωτή πλέξη (χωρίς πλαϊνές ραφές)</li>
                            <li>Ίσια γραμμή</li>
                            <li>Στρογγυλή λαιμόκοψη με ριμπ ύφανση και διπλή ραφή</li>
                            <li>Επένδυση λαιμού με ταιριαστή ταινία</li>
                            <li>Διπλή ραφή στα μανίκια και στο στρίφωμα</li>
                            """

    def get_main_variable_product_object(
        self,
        variable: bool,
        product_name: str,
        short_description: str,
        main_image_ids: List[int],
        categories: List[Dict],
        tags: List[Dict],
        colors: List[str],
        sizes: List[str],
        price=None,
        regular_price=None,
        related_ids=[],
        meta_data: List[Dict] = [],
    ) -> Dict:
        """Create the main variable product (without variations)"""

        # Build main product images
        main_images = []
        for img_id in main_image_ids:
            main_images.append({"id": img_id, "name": f"{product_name} - Main Image", "alt": f"{product_name} product image"})

        # Main product payload - NO VARIATIONS HERE
        product_object = {
            "name": product_name,
            "slug": self._create_slug(product_name),
            "type": "variable" if variable else "simple",  # This is key - makes it a variable product if True
            "status": "publish",
            "featured": False,
            "catalog_visibility": "visible",
            "description": self.org_tee_description,
            "short_description": short_description,
            "sku": self._create_base_sku(product_name),
            # "manage_stock": False,
            # "stock_status": "instock",
            "virtual": False,
            "downloadable": False,
            "tax_status": "taxable",
            "tax_class": "standard",
            # "weight": "0.20",
            # "dimensions": {"length": "69", "width": "51", "height": "1"},
            "shipping_required": True,
            "shipping_taxable": True,
            "reviews_allowed": False,
            "categories": categories,
            "tags": tags,
            "images": main_images,
            # Define attributes that will be used for variations
            "attributes": [
                {
                    "id": 0,  # 0 means create new product-specific attribute
                    "name": "Size",
                    "slug": "size",
                    "position": 0,
                    "visible": True,
                    "variation": True,  # CRITICAL: Must be True for variations
                    "options": sizes,
                },
                {
                    "id": 0,
                    "name": "Color",
                    "slug": "color",
                    "position": 1,
                    "visible": True,
                    "variation": True,  # CRITICAL: Must be True for variations
                    "options": colors,
                },
                {"id": 0, "name": "Material", "slug": "material", "visible": True, "variation": False, "options": ["100% Organic Cotton"]},
            ],
            "default_attributes": [
                {"id": 0, "name": "Size", "slug": "size", "option": "M"},
                {"id": 0, "name": "Color", "slug": "color", "option": "Black"},
            ],
            "meta_data": [{"key": "_expected_variations", "value": str(len(sizes) * len(colors))}, *meta_data],
            "price": price if variable is False else None,
            "regular_price": regular_price if variable is False else None,
            "related_ids": related_ids,
        }
        return product_object

    def _create_slug(self, product_name: str) -> str:
        """Create a slug from the product name"""
        return product_name.lower().replace(" ", "-").replace("'", "").replace(":", "").replace(",", "")

    def _create_base_sku(self, product_name: str) -> str:
        """Create a base SKU based on the product name and a random string"""
        rand_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        return f"{product_name[:3].upper()}-001-{rand_str}"

    def _create_sku(self, product_name: str, size: str, color: str) -> str:
        """Create a SKU based on product name, size, and color"""
        return f"{product_name[:3].upper()}-{size[:1].upper()}{color[:1].upper()}"

    def _get_single_variation_object(
        self,
        size: str,
        color: str,
        base_sku: str,
        variation_image_mapping: Dict[str, int],
        price_overrides: Dict[str, str],
        sale_prices: Dict[str, str],
        stock_quantities: Dict[str, int],
    ):
        """Create a single variation using the /products/{id}/variations endpoint"""

        variation_key = f"{size}-{color}"
        variation_sku = f"{base_sku}-{size}-{color.upper()}"

        # Get size specifications
        # size_spec = self.SIZE_SPECS.get(size, self.SIZE_SPECS["M"])
        size_spec = self.SIZE_SPECS.get(size, {})

        # Determine pricing
        regular_price = price_overrides.get(variation_key, self.BASE_PRICE)
        sale_price = sale_prices.get(variation_key, "")
        current_price = sale_price if sale_price else regular_price

        # Get stock quantity
        stock_qty = stock_quantities.get(variation_key, 100)

        # Build variation payload
        variation_payload = {
            "regular_price": regular_price,
            "price": current_price,
            "sku": variation_sku,
            "description": f"{size} size in {color} color",
            # "manage_stock": True,
            # "stock_quantity": None,  # stock_qty,
            # "stock_status": "instock" if stock_qty > 0 else "outofstock",
            # "weight": "0.5Kg",  # Default weight, can be adjusted per size
            # "dimensions": {"length": size_spec["length"], "width": size_spec["width"], "height": "1"},
            "dimensions": {},
            "attributes": [{"id": 0, "name": "Size", "slug": "size", "option": size}, {"id": 0, "name": "Color", "slug": "color", "option": color}],
        }

        # Add sale price if specified
        if sale_price:
            variation_payload["sale_price"] = sale_price
            variation_payload["date_on_sale_from"] = "2024-01-01T00:00:00"
            variation_payload["date_on_sale_to"] = "2024-12-31T23:59:59"

        # Add image if provided
        image_id = variation_image_mapping.get(variation_key)
        if image_id:
            variation_payload["image"] = {"id": image_id, "name": f"{size} {color} variation", "alt": f"{size} {color} product variation image"}

        return variation_payload

    def _get_all_variation_objects(
        self,
        base_sku: str,
        variation_image_mapping: Dict[str, int],
        price_overrides: Dict[str, str],
        sale_prices: Dict[str, str],
        stock_quantities: Dict[str, int],
        colors: List[str],
        sizes: List[str],
    ) -> List[Dict[str, Any]]:
        """Create all variations using separate API calls"""

        variations = []
        total_combinations = len(sizes) * len(colors)
        current = 0

        print(f"📦 Creating {total_combinations} variations...")

        for size, color in itertools.product(sizes, colors):
            current += 1
            variation_key = f"{size}-{color}"

            # print(f"   Creating variation {current}/{total_combinations}: {variation_key}")

            variation = self._get_single_variation_object(
                size=size,
                color=color,
                base_sku=base_sku,
                variation_image_mapping=variation_image_mapping,
                price_overrides=price_overrides,
                sale_prices=sale_prices,
                stock_quantities=stock_quantities,
            )

            if variation:
                variations.append(variation)
                # print(f"   ✅ Created: {variation['sku']} - €{variation['price']}")
            # else:
            # print(f"   ❌ Failed to create variation: {variation_key}")

        return variations


if __name__ == "__main__":
    products = ProductStore()
    _product = Product()
    for p in products:
        main_p = _product.get_main_variable_product_object(
            variable=True,
            product_name=p["product"]["product_name"],
            short_description=p["product"]["short_description"],
            main_image_ids=[175],
            categories=p["product"]["categories"],
            tags=p["product"].get("tags", []),
            price=None,
            regular_price=None,
            related_ids=[],
        )
        pprint(main_p)
        variations = _product._get_all_variation_objects(
            base_sku=p["product"]["base_sku"],
            variation_image_mapping=p["variations"]["variation_image_mapping"],
            price_overrides=p["variations"]["price_overrides"],
            sale_prices=p["variations"].get("sale_prices", {}),
            stock_quantities=p["variations"].get("stock_quantities", {}),
        )
        pprint(variations)
