import requests
from itertools import product
from typing import List, Dict, Optional, Any
import time


class WCVariableProductGenerator:

    def __init__(self, wc_api_url: str, consumer_key: str, consumer_secret: str):
        self.WC_API_URL = wc_api_url
        self.API_AUTH = (consumer_key, consumer_secret)

        # Default configuration
        self.COLORS = ["Black", "White"]
        self.SIZES = ["S", "M", "L", "XL", "2XL"]
        self.BASE_PRICE = "18.00"

        # Size specifications for realistic dimensions/weights
        self.SIZE_SPECS = {
            "S": {"length": "66", "width": "46", "weight": "0.15"},
            "M": {"length": "69", "width": "51", "weight": "0.18"},
            "L": {"length": "72", "width": "56", "weight": "0.20"},
            "XL": {"length": "75", "width": "61", "weight": "0.22"},
            "2XL": {"length": "78", "width": "66", "weight": "0.25"},
        }
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

    def create_variable_product_with_variations(
        self,
        product_name: str,
        product_slug: str,
        short_description: str,
        base_sku: str,
        main_image_ids: List[int],
        variation_image_mapping: Dict[str, int],
        categories: Optional[List[Dict]] = None,
        tags: Optional[List[Dict]] = None,
        price_overrides: Optional[Dict[str, str]] = None,
        sale_prices: Optional[Dict[str, str]] = None,
        stock_quantities: Optional[Dict[str, int]] = None,
    ) -> Dict[str, Any]:
        """
        Create a complete variable product with all variations using the correct WooCommerce API workflow

        Step 1: Create variable product with attributes (no variations)
        Step 2: Create each variation separately using /products/{product_id}/variations endpoint

        Args:
            product_name (str): Display name of the product
                Example: "Premium Cotton T-Shirt"

            product_slug (str): URL-friendly version of product name (used in URLs)
                Example: "premium-cotton-t-shirt"
                Note: Should be lowercase, hyphen-separated, no spaces

            description (str): Full HTML description for product page
                Example: "<h2>Premium Quality</h2><p>Made from 100% cotton...</p><ul><li>Feature 1</li></ul>"
                Note: Can include HTML tags for formatting

            short_description (str): Brief HTML description shown in product listings
                Example: "<p>Premium cotton t-shirt - Available in multiple sizes - €18.00</p>"
                Note: Keep under 200 characters for best display

            base_sku (str): Base SKU code (variations will append size-color)
                Example: "PREMIUM-TEE-001"
                Result: Variations will be "PREMIUM-TEE-001-S-BLACK", "PREMIUM-TEE-001-M-WHITE", etc.
                Note: Must be unique across your entire store

            main_image_ids (List[int]): WordPress media library image IDs for main product gallery
                Example: [123, 124, 125]
                Note: These show in main product gallery before customer selects variation
                Get IDs from: wp-admin → Media Library → click image → look at URL (?item=123)

            variation_image_mapping (Dict[str, int]): Maps each size-color combo to specific image ID
                Example: {
                    "S-Black": 301,     # Small Black t-shirt image ID
                    "S-White": 302,     # Small White t-shirt image ID
                    "M-Black": 303,     # Medium Black t-shirt image ID
                    "M-White": 304,     # Medium White t-shirt image ID
                    "L-Black": 305,     # Large Black t-shirt image ID
                    "L-White": 306,     # Large White t-shirt image ID
                    "XL-Black": 307,    # X-Large Black t-shirt image ID
                    "XL-White": 308,    # X-Large White t-shirt image ID
                    "2XL-Black": 309,   # 2X-Large Black t-shirt image ID
                    "2XL-White": 310    # 2X-Large White t-shirt image ID
                }
                Note: Format is always "SIZE-COLOR" (case-sensitive)
                Note: If image ID not provided for a variation, no specific image will be set

            categories (Optional[List[Dict]]): WooCommerce product categories
                Example: [
                    {"id": 15, "name": "Clothing", "slug": "clothing"},
                    {"id": 25, "name": "T-Shirts", "slug": "t-shirts"},
                    {"id": 30, "name": "Men's Apparel", "slug": "mens-apparel"}
                ]
                Note: Category IDs must exist in your WooCommerce store
                Get IDs from: wp-admin → Products → Categories

            tags (Optional[List[Dict]]): WooCommerce product tags for SEO/filtering
                Example: [
                    {"id": 34, "name": "Premium", "slug": "premium"},
                    {"id": 35, "name": "Cotton", "slug": "cotton"},
                    {"id": 36, "name": "Organic", "slug": "organic"},
                    {"id": 37, "name": "Comfortable", "slug": "comfortable"}
                ]
                Note: Tag IDs must exist in your WooCommerce store
                Get IDs from: wp-admin → Products → Tags

            price_overrides (Optional[Dict[str, str]]): Custom prices for specific variations
                Example: {
                    "XL-Black": "20.00",    # X-Large costs €2 more
                    "XL-White": "20.00",    # X-Large costs €2 more
                    "2XL-Black": "22.00",   # 2X-Large costs €4 more
                    "2XL-White": "22.00"    # 2X-Large costs €4 more
                }
                Note: Format is "SIZE-COLOR": "price" (always strings)
                Note: If not specified, uses self.BASE_PRICE (€18.00)

            sale_prices (Optional[Dict[str, str]]): Sale prices for specific variations
                Example: {
                    "S-Black": "15.00",     # Small Black on sale (was €18, now €15)
                    "M-White": "16.00",     # Medium White on sale (was €18, now €16)
                    "L-Black": "17.00"      # Large Black on sale (was €18, now €17)
                }
                Note: Sale price should be lower than regular price
                Note: Automatically sets sale date range (2024-01-01 to 2024-12-31)

            stock_quantities (Optional[Dict[str, int]]): Stock levels for each variation
                Example: {
                    "S-Black": 50,      # 50 units in stock
                    "S-White": 30,      # 30 units in stock
                    "M-Black": 75,      # 75 units in stock
                    "M-White": 60,      # 60 units in stock
                    "L-Black": 80,      # 80 units in stock
                    "L-White": 70,      # 70 units in stock
                    "XL-Black": 40,     # 40 units in stock
                    "XL-White": 35,     # 35 units in stock
                    "2XL-Black": 20,    # 20 units in stock
                    "2XL-White": 15     # 15 units in stock
                }
                Note: If not specified, defaults to 100 units per variation
                Note: Set to 0 for "out of stock" variations

        Returns:
            Dict[str, Any]: Complete result containing:
                {
                    'main_product': {...},      # Main product data from WooCommerce
                    'variations': [{...}],      # List of all created variations
                    'total_variations': 10,     # Number of variations created
                    'product_id': 123           # Main product ID for future reference
                }

        Example Usage:
            result = generator.create_variable_product_with_variations(
                product_name="Premium Cotton T-Shirt",
                product_slug="premium-cotton-t-shirt",
                description="<h2>Premium Quality</h2><p>100% cotton comfort</p>",
                short_description="<p>Premium cotton t-shirt - €18.00</p>",
                base_sku="PREMIUM-TEE-001",
                main_image_ids=[123, 124],
                variation_image_mapping={
                    "S-Black": 301, "S-White": 302,
                    "M-Black": 303, "M-White": 304,
                    # ... etc for all combinations
                },
                categories=[{"id": 15, "name": "Clothing", "slug": "clothing"}],
                price_overrides={"XL-Black": "20.00", "2XL-Black": "22.00"}
            )
        """

        print(f"🚀 Creating variable product: {product_name}")

        # Step 1: Create the main variable product (without variations)
        main_product = self._create_main_variable_product(
            product_name=product_name,
            product_slug=product_slug,
            description=self.org_tee_description,
            short_description=short_description,
            base_sku=base_sku,
            main_image_ids=main_image_ids,
            categories=categories or [],
            tags=tags or [],
        )

        if not main_product:
            raise Exception("Failed to create main variable product")

        product_id = main_product["id"]
        print(f"✅ Created main product with ID: {product_id}")

        # Step 2: Create all variations separately
        variations = self._create_all_variations(
            product_id=product_id,
            base_sku=base_sku,
            variation_image_mapping=variation_image_mapping,
            price_overrides=price_overrides or {},
            sale_prices=sale_prices or {},
            stock_quantities=stock_quantities or {},
        )

        print(f"✅ Successfully created {len(variations)} variations")

        # Return complete product data
        return {"main_product": main_product, "variations": variations, "total_variations": len(variations), "product_id": product_id}

    def _create_main_variable_product(
        self,
        product_name: str,
        product_slug: str,
        description: str,
        short_description: str,
        base_sku: str,
        main_image_ids: List[int],
        categories: List[Dict],
        tags: List[Dict],
    ):
        """Create the main variable product (without variations)"""

        # Build main product images
        main_images = []
        for img_id in main_image_ids:
            main_images.append({"id": img_id, "name": f"{product_name} - Main Image", "alt": f"{product_name} product image"})

        # Main product payload - NO VARIATIONS HERE
        product_payload = {
            "name": product_name,
            "slug": product_slug,
            "type": "variable",  # This is key - makes it a variable product
            "status": "publish",
            "featured": False,
            "catalog_visibility": "visible",
            "description": description,
            "short_description": short_description,
            "sku": base_sku,
            "manage_stock": False,
            "stock_status": "instock",
            "virtual": False,
            "downloadable": False,
            "tax_status": "taxable",
            "tax_class": "",
            "weight": "0.20",
            "dimensions": {"length": "69", "width": "51", "height": "1"},
            "shipping_required": True,
            "shipping_taxable": True,
            "reviews_allowed": True,
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
                    "options": self.SIZES,
                },
                {
                    "id": 0,
                    "name": "Color",
                    "slug": "color",
                    "position": 1,
                    "visible": True,
                    "variation": True,  # CRITICAL: Must be True for variations
                    "options": self.COLORS,
                },
                {"id": 0, "name": "Material", "slug": "material", "visible": True, "variation": False, "options": ["100% Organic Cotton"]},
            ],
            "default_attributes": [
                {"id": 0, "name": "Size", "slug": "size", "option": "M"},
                {"id": 0, "name": "Color", "slug": "color", "option": "Black"},
            ],
            "meta_data": [{"key": "_expected_variations", "value": str(len(self.SIZES) * len(self.COLORS))}],
        }

        # Create the main product
        url = f"{self.WC_API_URL}/products"
        response = requests.post(url, auth=self.API_AUTH, json=product_payload, headers={"Content-Type": "application/json"})

        if response.ok:
            return response.json()
        else:
            print(f"❌ Failed to create main product:")
            print(f"   Status: {response.status_code}")
            print(f"   Error: {response.text}")
            response.raise_for_status()

    def _create_all_variations(
        self,
        product_id: int,
        base_sku: str,
        variation_image_mapping: Dict[str, int],
        price_overrides: Dict[str, str],
        sale_prices: Dict[str, str],
        stock_quantities: Dict[str, int],
    ) -> List[Dict[str, Any]]:

        variations = []

        for size, color in product(self.SIZES, self.COLORS):
            variation_key = f"{size}-{color}"

            variation = self._create_single_variation(
                product_id=product_id,
                size=size,
                color=color,
                base_sku=base_sku,
                variation_image_mapping=variation_image_mapping,
                price_overrides=price_overrides or {},
                sale_prices=sale_prices or {},
                stock_quantities=stock_quantities or {},
            )

            if variation:
                variations.append(variation)
                print(f"   ✅ Created: {variation['sku']} - €{variation['price']}")
            else:
                print(f"   ❌ Failed to create variation: {variation_key}")

            # Small delay to avoid overwhelming the API
            time.sleep(0.1)

        return variations

    def _create_single_variation(
        self,
        product_id: int,
        size: str,
        color: str,
        base_sku: str,
        variation_image_mapping: Dict[str, int],
        price_overrides: Dict[str, str],
        sale_prices: Dict[str, str],
        stock_quantities: Dict[str, int],
    ) -> Optional[Dict[str, Any]]:
        """Create a single variation using the /products/{id}/variations endpoint"""

        variation_key = f"{size}-{color}"
        variation_sku = f"{base_sku}-{size}-{color.upper()}"

        # Get size specifications
        size_spec = self.SIZE_SPECS.get(size, self.SIZE_SPECS["M"])

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
            "manage_stock": True,
            "stock_quantity": stock_qty,
            "stock_status": "instock" if stock_qty > 0 else "outofstock",
            "weight": size_spec["weight"],
            "dimensions": {"length": size_spec["length"], "width": size_spec["width"], "height": "1"},
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

        # Create the variation using the correct endpoint
        url = f"{self.WC_API_URL}/products/{product_id}/variations"
        response = requests.post(url, auth=self.API_AUTH, json=variation_payload, headers={"Content-Type": "application/json"})

        if response.ok:
            return response.json()
        else:
            print(f"      ❌ Error creating variation {variation_key}:")
            print(f"         Status: {response.status_code}")
            print(f"         Error: {response.text[:200]}")
            return None

    def create_simple_example(self, product_name: str = "Premium Cotton T-Shirt", base_sku: str = "PREMIUM-TEE") -> Dict[str, Any]:
        """Create a simple example product with mock data"""

        # Mock image mapping - replace with real image IDs
        variation_images = {
            "S-Black": 301,
            "S-White": 302,
            "M-Black": 303,
            "M-White": 304,
            "L-Black": 305,
            "L-White": 306,
            "XL-Black": 307,
            "XL-White": 308,
            "2XL-Black": 309,
            "2XL-White": 310,
        }

        # Optional: Different prices for larger sizes
        price_overrides = {"XL-Black": "20.00", "XL-White": "20.00", "2XL-Black": "22.00", "2XL-White": "22.00"}

        # Optional: Sale prices
        sale_prices = {"S-Black": "15.00", "M-White": "16.00"}

        # Optional: Custom stock quantities
        stock_quantities = {
            "S-Black": 50,
            "S-White": 30,
            "M-Black": 75,
            "M-White": 60,
            "L-Black": 80,
            "L-White": 70,
            "XL-Black": 40,
            "XL-White": 35,
            "2XL-Black": 20,
            "2XL-White": 15,
        }

        return self.create_variable_product_with_variations(
            product_name=product_name,
            product_slug=f"{product_name.lower().replace(' ', '-')}",
            description=f"""
            <h2>Premium Quality {product_name}</h2>
            <p>Experience ultimate comfort with our {product_name.lower()}. Made from 100% premium cotton.</p>
            <ul>
                <li>100% Premium Cotton</li>
                <li>Pre-shrunk for perfect fit</li>
                <li>Available in {len(self.SIZES)} sizes and {len(self.COLORS)} colors</li>
                <li>Machine washable</li>
            </ul>
            """,
            short_description=f"<p>Premium cotton {product_name.lower()} - €{self.BASE_PRICE}</p>",
            base_sku=base_sku,
            main_image_ids=[123, 124],  # Replace with real image IDs
            variation_image_mapping=variation_images,
            categories=[{"id": 15, "name": "Clothing", "slug": "clothing"}, {"id": 25, "name": "T-Shirts", "slug": "t-shirts"}],
            tags=[{"id": 34, "name": "Premium", "slug": "premium"}, {"id": 35, "name": "Cotton", "slug": "cotton"}],
            price_overrides=price_overrides,
            sale_prices=sale_prices,
            stock_quantities=stock_quantities,
        )

    def batch_create_variations(self, product_id: int, variations_data: List[Dict]) -> List[Dict[str, Any]]:
        """Create multiple variations using batch endpoint (if supported)"""
        # Note: WooCommerce supports variations/batch endpoint for bulk operations
        url = f"{self.WC_API_URL}/products/{product_id}/variations/batch"

        batch_payload = {"create": variations_data}

        response = requests.post(url, auth=self.API_AUTH, json=batch_payload, headers={"Content-Type": "application/json"})

        if response.ok:
            result = response.json()
            return result.get("create", [])
        else:
            print(f"❌ Batch create failed: {response.text}")
            return []


# Usage Examples
if __name__ == "__main__":
    # Initialize the generator
    generator = WCVariableProductGenerator(
        wc_api_url="http://localhost:7575/wp-json/wc/v3", consumer_key="your_consumer_key", consumer_secret="your_consumer_secret"
    )

    # Create a complete variable product with all variations
    try:
        result = generator.create_simple_example(product_name="Premium Cotton T-Shirt", base_sku="PREMIUM-TEE-001")

        print(f"\n🎉 COMPLETE SUCCESS!")
        print(f"   Product ID: {result['product_id']}")
        print(f"   Total Variations: {result['total_variations']}")
        print(f"   Main Product: {result['main_product']['name']}")

    except Exception as e:
        print(f"❌ Error: {e}")
