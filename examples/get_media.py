import base64

import requests

from utils.config import Config

username = Config.get_param("WP_USER")
password = Config.get_param("WP_PASSWORD")
WC_URL = "http://localhost:7575"

creds = username + ":" + password
cred_token = base64.b64encode(creds.encode())

header = {"Authorization": "Basic " + cred_token.decode("utf-8")}

url = f"{WC_URL}/wp-json/wp/v2/media"

res = requests.get(url, headers=header)
print(res)
