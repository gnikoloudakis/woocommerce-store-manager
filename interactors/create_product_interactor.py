from data_sources.data.products_data import ProductStore
from data_sources.wc_products_adapter import WCProductsAdapter
from data_sources.wp_image_adapter import WPImageAdapter
from domains.product_domain import Product


class CreateProductInteractor:
    def __init__(self, wc_products_adapter: WCProductsAdapter, wp_image_adapter: WPImageAdapter):
        self.wc_products_adapter = wc_products_adapter
        self.wp_image_adapter = wp_image_adapter

    def create_product(self, product_payload) -> dict | None:
        """Create a main product object in WooCommerce No variations here"""
        success, product_obj = self.wc_products_adapter.create_product(product_payload)
        if not success:
            print(f"❗ Failed to create product: {product_payload['name']}")
            return None
        return product_obj

    def create_variation(self, product_id: int, variation_payload: dict) -> int | None:
        """Create a variation for a product in WooCommerce"""
        success, variation_obj = self.wc_products_adapter.create_product_variation(product_id, variation_payload)
        if not success:
            print(f"❗ Failed to create variation for product ID {product_id}")
            return None
        return variation_obj

    def enrich_product_obj(self, product_obj: dict) -> dict:
        # change category names to IDs
        if "categories" in product_obj:
            for cat in product_obj["categories"]:
                cat["id"] = self.wc_products_adapter.get_category_id_by_name(cat["id"])
        # change tag names to IDs
        if "tags" in product_obj:
            for tag in product_obj["tags"]:
                tag["id"] = self.wc_products_adapter.get_tag_id_by_name(tag["id"])
        # change main image names to IDs
        if "main_image_ids" in product_obj:
            product_obj["main_image_ids"] = [self.wp_image_adapter.get_image_id_by_filename(img_id) for img_id in product_obj["main_image_ids"]]
        return product_obj

    def enrich_variations_obj(self, variations_obj: dict) -> dict:
        if "variation_image_mapping" in variations_obj:
            for k, v in variations_obj["variation_image_mapping"].items():
                variations_obj["variation_image_mapping"][k] = self.wp_image_adapter.get_image_id_by_filename(v)
                print(f'{variations_obj["variation_image_mapping"][k]=}')
        return variations_obj


if __name__ == "__main__":
    pr_interactor = CreateProductInteractor(wc_products_adapter=WCProductsAdapter(), wp_image_adapter=WPImageAdapter())
    _products_store = ProductStore()
    _product_domain = Product()
    for p in _products_store:
        p["product"] = pr_interactor.enrich_product_obj(p["product"])
        p["variations"] = pr_interactor.enrich_variations_obj(p["variations"])
        # print(f"{p['variations']=}")

        main_p = _product_domain.get_main_variable_product_object(
            variable=True,
            product_name=p["product"]["product_name"],
            short_description=p["product"]["short_description"],
            main_image_ids=p["product"]["main_image_ids"],
            categories=p["product"]["categories"],
            tags=p["product"].get("tags", []),
            price=None,
            regular_price=None,
            related_ids=[],
            colors=p["product"]["colors"],
            sizes=p["product"]["sizes"],
            meta_data=p["product"].get("meta_data", []),
        )

        _product_obj = pr_interactor.create_product(main_p)
        # print(f"{main_p=}")
        if not _product_obj:
            continue
        variations = _product_domain._get_all_variation_objects(
            base_sku=_product_obj["sku"],
            variation_image_mapping=p["variations"]["variation_image_mapping"],
            price_overrides=p.get("variations", {}).get("price_overrides", {}),
            sale_prices=p.get("variations", {}).get("sale_prices", {}),
            stock_quantities=p.get("variations", {}).get("stock_quantities", {}),
            colors=p["product"]["colors"],
            sizes=p["product"]["sizes"],
        )
        for var in variations:
            print(var)
            pr_interactor.create_variation(product_id=_product_obj["id"], variation_payload=var)
