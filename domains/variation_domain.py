from typing import Dict, Optional, Any

from woocommerce import API

from utils.config import Config


class Variation:
    def __init__(self):
        pass

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

    @staticmethod
    def _create_variation_sku(product_name: str, size: str, color: str) -> str:
        """Create a SKU for the variation based on product name, size, and color"""
        return f"{product_name[:3].upper()}-{size[:1].upper()}{color[:1].upper()}"


if __name__ == "__main__":
    variation = Variation()
    product_example = {"name": "Premium Cotton T-Shirt", "default_attributes": [{"option": "M"}, {"option": "Black"}]}
    variation_object = variation.create_variation_object(product_example, price="19.99")
    print(variation_object)
    wc_api = API(
        url=Config.get_param("WC_URL"),
        consumer_key=Config.get_param("CONSUMER_KEY"),
        consumer_secret=Config.get_param("CONSUMER_SECRET"),
        version="wc/v3",
        wp_api=True,
        query_string_auth=True,  # Set to True if you want to force HTTP Basic Authentication. Set to False for HTTPS
    )
    print(wc_api.post("products/190/variations", variation_object).json())
    # This will create a variation for the product with ID 190
