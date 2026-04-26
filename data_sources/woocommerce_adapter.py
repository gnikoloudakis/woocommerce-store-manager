import requests

from products import products
from utils.config import Config


class WoocommerceAdapter:
    def __init__(self):
        self.woocommerce_url = Config.get_param("BASE_URL")
        self.consumer_key = Config.get_param("CONSUMER_KEY")
        self.consumer_secret = Config.get_param("CONSUMER_SECRET")
        self.auth = (self.consumer_key, self.consumer_secret)

    def get_product_by_name(self, product_name):
        search_url = f"{self.woocommerce_url}/wp-json/wc/v3/products?search={product_name}"
        search_response = requests.get(search_url, auth=(self.consumer_key, self.consumer_secret))
        search_response.raise_for_status()

        if search_response.status_code == 200:
            existing = search_response.json()
            if existing:
                print(f"❗ Product already exists: {existing[0]['id']} — {existing[0]['name']}")
                return existing
            else:
                print(f"❗ No product found with name: {product_name}")
                return None

    def get_products(self):
        response = requests.get(f"{self.woocommerce_url}/wp-json/wc/v3/products", auth=(self.consumer_key, self.consumer_secret))

        if response.status_code == 200:
            products = response.json()
            print(f"{len(products)=} products found.")
            for product in products:
                print(f"{product=}")
        else:
            print(f"Error: {response.status_code} - {response.text}")

    def create_product(self, product_data) -> (bool, str):
        success = False
        try:
            products_url = f"{self.woocommerce_url}/wp-json/wc/v3/products"
            response = requests.post(products_url, auth=(self.consumer_key, self.consumer_secret), json=product_data)
            response.raise_for_status()

            product = response.json()
            product_id = product["id"]

            if response.status_code == 201:
                success = True
                print(f"✅ Created product: {product['name']} (ID: {product_id})")
            else:
                print(f"❌ Failed to create product: {product['name']}")
                print(response.text)
            return success, product_id
        except Exception as e:
            print(f"❌ Error creating product: {e}")
            return success, None

    def upload_image(self, image_path):
        media_url = f"{self.woocommerce_url}/wp-json/wc/v2/media"
        print(f"{media_url=}")
        with open(image_path, "rb") as img:
            headers = {"Content-Disposition": "attachment; filename=image.jpg", "Content-Type": "image/jpeg"}
            response = requests.post(media_url, headers=headers, data=img, auth=(self.consumer_key, self.consumer_secret))

        # Result
        if response.status_code in (200, 201):
            media = response.json()
            print("✅ Uploaded:", media["source_url"])
        else:
            print("❌ Failed:", response.status_code, response.text)

    def add_product_variations(self, product_id, variation_data):
        variations_url = f"{self.woocommerce_url}/wp-json/wc/v3/products/{product_id}/variations"
        r = requests.post(variations_url, auth=(self.consumer_key, self.consumer_secret), json=variation_data)
        if r.status_code == 201:
            print(f"✅ Created variation: {variation_data['attributes']} for product: {product_id}")
        else:
            print(f"❌ Failed to create variation {variation_data['attributes']} for product: {product_id}: {r.text}")

    def get_image_id_by_filename(self, filename):
        """
        Returns the media ID of an image in WordPress if it exists by filename.

        Args:
            filename (str): Just the filename, e.g. "81.jpg"
            site_url (str): Base URL, e.g. "https://yourstore.com"
            auth (HTTPBasicAuth): WordPress username + application password

        Returns:
            int or None: Media ID if found, else None
        """
        media_url = f"{self.woocommerce_url}/wp-json/wp/v2/media"
        params = {"search": filename, "per_page": 100}

        try:
            response = requests.get(media_url, auth=(self.consumer_key, self.consumer_secret), params=params)
            response.raise_for_status()
            items = response.json()

            for item in items:
                if filename in item["source_url"]:
                    return item["id"]

            return None  # Not found

        except requests.RequestException as e:
            print(f"❌ Error searching media: {e}")
            return None


if __name__ == "__main__":
    wc_adapter = WoocommerceAdapter()
    # wc_adapter.get_products()
    # wc_adapter.get_orders()
    # wc_adapter.upload_image("../images/125.jpg")

    # success, product_id = wc_adapter.create_product(
    #     products[0]["data"])  # Example product creation, replace with actual product data
    # for v in products[0]["variations"]:
    #     wc_adapter.add_product_variations(product_id, v)  # Example variation addition, replace with actual variation data
    # wc_adapter.get_product_by_name('name')
    print(wc_adapter.get_image_id_by_filename("81.jpg"))
