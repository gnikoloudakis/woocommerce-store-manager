import json
import re
from typing import List

from woocommerce import API

from utils.config import Config

# Match a hidden span tolerantly: any quote style, optional spaces, optional semicolon, case-insensitive
_SECRET_TAG_RE = re.compile(
    r"""<span\s+style=['"]\s*display\s*:\s*none\s*;?\s*['"]\s*>([^<]*)</span>""",
    re.IGNORECASE,
)


class WCProductsAdapter:
    def __init__(self):
        self.wc_api = API(
            url=Config.get_param("WC_URL"),
            consumer_key=Config.get_param("CONSUMER_KEY"),
            consumer_secret=Config.get_param("CONSUMER_SECRET"),
            version="wc/v3",
            wp_api=True,
            query_string_auth=True,  # Set to True if you want to force HTTP Basic Authentication. Set to False for HTTPS
        )
        self.all_products = self.list_all_products()
        self.all_categories = self._list_all_categories()
        self.all_tags = self._list_all_tags()

    def get_category_id_by_name(self, category_name: str) -> int:
        """Get category ID by name"""
        for category in self.all_categories:
            if category["slug"] == category_name or category["name"] == category_name:
                return category["id"]
        raise ValueError(f"Category '{category_name}' not found in WooCommerce categories.")

    def get_tag_id_by_name(self, tag_name: str) -> int:
        """Get tag ID by name"""
        for tag in self.all_tags:
            if tag["slug"] == tag_name or tag["name"] == tag_name:
                return tag["id"]
        raise ValueError(f"Tag '{tag_name}' not found in WooCommerce tags.")

    def list_all_products(self) -> List[dict]:
        print("Fetching all products from WooCommerce...")
        _all_products = []
        _url = "products"
        page = 1
        per_page = 100

        while True:
            params = {"page": page, "per_page": per_page}

            response = self.wc_api.get(_url, params=params)
            response.raise_for_status()
            products = response.json()

            if not products:
                break
            for _product in products:
                _all_products.append(_product)

            page += 1

        # for product in products:
        #     _all_products.append({"id": product["id"], "name": product["name"], "permalink": product["permalink"]})
        return _all_products

    def _product_exists(self, product_name=None, product_id=None, product_slug=None) -> bool:
        """Check if a product exists by name, ID, or slug"""
        if product_name:
            for product in self.all_products:
                if product["name"] == product_name:
                    return True
        elif product_id:
            for product in self.all_products:
                if product["id"] == product_id:
                    return True
        elif product_slug:
            for product in self.all_products:
                if product["permalink"].endswith(product_slug):
                    return True
        return False

    def create_product(self, product_payload: dict) -> tuple:
        """Create a product in WooCommerce
        returns a tuple (success: bool, product: object or None)"""

        _url = "products"
        # Check if product already exists
        if self._product_exists(product_name=product_payload.get("name")):
            print(f"❗ Product already exists: {product_payload.get('name')}")
            return False, None
        response = self.wc_api.post(_url, product_payload)
        print(f"{response.text=}")
        response.raise_for_status()
        product = response.json()
        print(f'✅ Product created: {product["name"]} (ID: {product["id"]})')
        return True, product

    def create_product_variation(self, product_id: int, variation_payload: dict) -> tuple:
        """Create a variation for a product in WooCommerce
        returns a tuple (success: bool, variation: object or None)"""

        _url = f"products/{product_id}/variations"
        # Check if variation already exists
        if self._product_exists(product_slug=variation_payload.get("slug")):
            print(f"❗ Variation already exists: {variation_payload.get('slug')}")
            return False, None
        response = self.wc_api.post(_url, variation_payload)
        print(f"{response.text=}")
        response.raise_for_status()
        variation = response.json()
        print(f'✅ Variation created for product ID {product_id}: {variation["id"]}')
        return True, variation

    def _list_all_categories(self) -> List[dict]:
        print("Fetching all categories from WooCommerce...")
        """List all categories in WooCommerce
        Returns a list of dictionaries with category details."""
        _url = "products/categories"
        _all_categories = []
        page = 1
        per_page = 100

        while True:
            params = {"page": page, "per_page": per_page}

            response = self.wc_api.get(_url, params=params)
            response.raise_for_status()
            categories = response.json()

            if not categories:
                break

            for category in categories:
                _all_categories.append({"id": category["id"], "name": category["name"], "slug": category["slug"]})

            page += 1

        print(f"✅ Fetched {len(_all_categories)} total categories")
        return _all_categories

    def _list_all_tags(self) -> List[dict]:
        print("Fetching all tags from WooCommerce...")
        """List all tags in WooCommerce
        Returns a list of dictionaries with tag details."""
        _url = "products/tags"
        _all_tags = []
        page = 1
        per_page = 100

        while True:
            params = {"page": page, "per_page": per_page}

            response = self.wc_api.get(_url, params=params)
            response.raise_for_status()
            tags = response.json()

            if not tags:
                break

            for tag in tags:
                _all_tags.append({"id": tag["id"], "name": tag["name"], "slug": tag["slug"]})

            page += 1

        print(f"✅ Fetched {len(_all_tags)} total tags")
        return _all_tags

    def get_product(self, product_id: int) -> dict | None:
        response = self.wc_api.get(f"products/{product_id}")
        response.raise_for_status()
        return response.json()

    def get_product_by_name(self, name: str) -> dict | None:
        """Look up a product by exact name from the cached list.
        Returns None if not found. Cache is populated at adapter init and
        invalidated by reset_wc_adapter()."""
        for p in self.all_products:
            if p.get("name") == name:
                return p
        return None

    def update_product(self, product_id: int, payload: dict) -> tuple:
        response = self.wc_api.put(f"products/{product_id}", payload)
        response.raise_for_status()
        return True, response.json()

    def delete_product(self, product_id: int) -> bool:
        response = self.wc_api.delete(f"products/{product_id}", params={"force": True})
        response.raise_for_status()
        return True

    def list_product_variations(self, product_id: int) -> List[dict]:
        all_variations = []
        page = 1
        while True:
            response = self.wc_api.get(f"products/{product_id}/variations", params={"page": page, "per_page": 100})
            response.raise_for_status()
            items = response.json()
            if not items:
                break
            all_variations.extend(items)
            if len(items) < 100:
                break
            page += 1
        return all_variations

    def update_product_variation(self, product_id: int, variation_id: int, payload: dict) -> tuple:
        response = self.wc_api.put(f"products/{product_id}/variations/{variation_id}", payload)
        response.raise_for_status()
        return True, response.json()

    def delete_product_variation(self, product_id: int, variation_id: int) -> bool:
        response = self.wc_api.delete(f"products/{product_id}/variations/{variation_id}", params={"force": True})
        response.raise_for_status()
        return True

    def get_secret_tags(self, product: dict) -> list[str]:
        """Parse secret tags from the hidden span in the product description."""
        desc = product.get("description", "")
        match = _SECRET_TAG_RE.search(desc)
        if not match:
            return []
        return [t for t in match.group(1).split() if t]

    def set_secret_tags(self, product: dict, tags: list[str]) -> None:
        """Replace (not append) the hidden secret-tags span in the product description."""
        current_desc = product.get("description", "")
        clean_desc = _SECRET_TAG_RE.sub("", current_desc).rstrip()
        if tags:
            tag_string = " ".join(tags)
            new_desc = clean_desc + f'<span style="display:none;">{tag_string}</span>'
        else:
            new_desc = clean_desc
        response = self.wc_api.put(f"products/{product['id']}", {"description": new_desc})
        response.raise_for_status()
        print(f"✅ Set secret tags on product ID {product['id']}: {tags}")


if __name__ == "__main__":
    wc_adapter = WCProductsAdapter()
    # for product in wc_adapter.all_products:
    # print(json.dumps(product))
    dumped_data = json.dumps(wc_adapter.all_products, indent=4)
    with open("all_products.json", "w") as f:
        f.write(dumped_data)
    # print("All Products:", wc_adapter.all_products)
    # print("All Categories:", wc_adapter.all_categories)
    # print("All Tags:", wc_adapter.all_tags)
