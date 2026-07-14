"""
Export all products as JSON for the project's bulk import endpoint.

Endpoint: POST /api/products/bulk
Schema:   Array of BulkProductItem  (see api/schemas/product.py)

Each item shape:
{
  "product": {
    "product_name": str,
    "product_slug": str | null,
    "short_description": str,
    "main_image_ids": [int | str],   // WP media ID or filename without extension
    "categories": [{"id": str}],     // category slug or WC term ID
    "tags":       [{"id": str}],     // tag slug or WC term ID
    "colors": [str],
    "sizes":  [str],
    "base_price": str | null,
    "secret_tags": [str],
    "related_ids": [int],
    "meta_data": [{"key": str, "value": any}]
  },
  "variations": {
    "variation_image_mapping": {"Size-Color": int | str},
    "price_overrides":         {"Size-Color": str},
    "sale_prices":             {"Size-Color": str},
    "stock_quantities":        {"Size-Color": int}
  }
}

The server resolves category/tag slugs → IDs and image filenames → media IDs.
No pre-processing is done here — the raw ProductStore data is serialised as-is.
"""

import json

from data_sources.data.products_data import ProductStore


def serialize(obj):
    """JSON serialiser that handles str-Enum values (Categories, Tags)."""
    if isinstance(obj, str):
        return obj  # str-Enums are already str subclasses; json handles them fine
    raise TypeError(f"Object of type {type(obj)} is not JSON serialisable")


def main():
    store = ProductStore()
    items = list(store)

    if not items:
        print("No products found in ProductStore.")
        return

    output = []
    for p in items:
        item = {
            "product": {
                "product_name":      p["product"]["product_name"],
                "product_slug":      p["product"].get("product_slug"),
                "short_description": p["product"].get("short_description", ""),
                "main_image_ids":    p["product"].get("main_image_ids", []),
                "categories":        p["product"].get("categories", []),
                "tags":              p["product"].get("tags", []),
                "colors":            p["product"].get("colors", []),
                "sizes":             p["product"].get("sizes", []),
                "base_price":        p["product"].get("base_price"),
                "secret_tags":       p["product"].get("secret_tags", []),
                "related_ids":       p["product"].get("related_ids", []),
                "meta_data":         p["product"].get("meta_data", []),
            },
            "variations": {
                "variation_image_mapping": p["variations"].get("variation_image_mapping", {}),
                "price_overrides":         p["variations"].get("price_overrides", {}),
                "sale_prices":             p["variations"].get("sale_prices", {}),
                "stock_quantities":        p["variations"].get("stock_quantities", {}),
            },
        }
        output.append(item)

    path = "bulk_import.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2, default=str)

    print(f"✅ {path} written — {len(output)} products")
    print(f"\nPOST to: /api/products/bulk")
    print(f"Body:     {path}")


if __name__ == "__main__":
    main()