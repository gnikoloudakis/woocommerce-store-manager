from data_sources.woocommerce_adapter import WoocommerceAdapter
from products import products


class ProductInteractor:
    def __init__(self, woocommerce_adapter: WoocommerceAdapter):
        self.woocommerce_adapter = woocommerce_adapter

    def create_products(self):
        for product in products:
            # check if product already exists
            if self.product_exists(product["data"]["name"]):
                # print(f"❗ Product already exists: {product['data']['name']}")
                continue

            success, product_id = self.woocommerce_adapter.create_product(products[0]["data"])
            for v in products[0]["variations"]:
                self.woocommerce_adapter.add_product_variations(product_id, v)
            break  # TODO: remove this break to create all products

    def product_exists(self, product_name):
        existing_product = self.woocommerce_adapter.get_product_by_name(product_name)
        return existing_product is not None

    def inject_image_ids(self, product):
        image_ids = []
        for image in product["data"]["images"]:
            image_id = self.woocommerce_adapter.get_image_id_by_filename(image["src"])
            image_ids.append({"id": image_id})
            for v in product["variations"]:
                v["image"]["id"] = self.woocommerce_adapter.get_image_id_by_filename(v["image"]["src"])
        product["data"]["images"] = image_ids


if __name__ == "__main__":
    # Initialize the WooCommerce adapter
    woocommerce_adapter = WoocommerceAdapter()

    # Create an instance of ProductInteractor
    product_interactor = ProductInteractor(woocommerce_adapter)

    # Create products
    product_interactor.create_products()
