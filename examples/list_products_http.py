from woocommerce import API

from utils.config import Config

wcapi = API(
    url="http://0.0.0.0:7575",
    consumer_key="xxx",
    consumer_secret="xxx",
    version="wc/v3",
    query_string_auth=True,
)

# List products
response = wcapi.get("products")
print(response.status_code, response.json())
