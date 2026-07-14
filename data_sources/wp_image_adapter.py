import base64
import os
import re

import requests

from utils.config import Config

"""for the WooCommerce Image Adapter to work, application passrods must be enabled in the WordPress settings.
You can create an application password in the WordPress admin panel under Users > Profile > Application Passwords.
Make sure to set the correct permissions for the application password, such as 'read' and 'upload_files'.
This adapter is designed to work with the WooCommerce REST API for media management."""


class WPImageAdapter:
    # Configuration
    IMAGES_FOLDER = "images"

    def __init__(
        self,
        url: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ):
        self.wc_url   = url      or Config.get_param("WC_URL")      or ""
        self.username = username or Config.get_param("WP_USER")     or ""
        self.password = password or Config.get_param("WP_PASSWORD") or ""
        self.creds = self.username + ":" + self.password
        self.cred_token = base64.b64encode(self.creds.encode())
        self.headers = {"Authorization": "Basic " + self.cred_token.decode("utf-8")}

        self.all_media = self.list_all_media()

    def get_image_id_by_filename(self, filename: str) -> int | None:
        """Get the ID of an image by its filename (extension-agnostic)."""
        stem = os.path.splitext(filename)[0]
        for med in self.all_media:
            med_filename = med["filename"].split("/")[-1]
            med_stem = os.path.splitext(med_filename)[0]
            if med_stem == stem or med_filename == filename:
                return med["id"]
        raise ValueError(f"Image with filename '{filename}' not found in media library.")

    def search_media_by_filename(self, filename: str):
        for file in self.all_media or []:
            if filename in file["filename"]:
                # print(f"Found media file: {file['filename']} with URL: {file['url']}")
                return file
        return None

    def find_media_by_filename(self, filename: str):
        """Return the media item matching `filename` (extension-agnostic), or None.

        Non-raising counterpart to get_image_id_by_filename. Used to de-duplicate
        uploads so WordPress does not create 101_1.webp when 101.webp already exists.
        Also tolerates WordPress' own dedupe suffix (101_1 matches 101).
        """
        if not filename:
            return None
        stem = os.path.splitext(filename)[0].lower()
        for med in self.all_media or []:
            med_filename = med["filename"].split("/")[-1]
            med_stem = os.path.splitext(med_filename)[0].lower()
            base_stem = re.sub(r"-\d+$", "", re.sub(r"_\d+$", "", med_stem))
            if stem in (med_stem, base_stem) or med_filename.lower() == filename.lower():
                return med
        return None

    def list_all_media(self):
        print("Fetching all media files from WordPress...")
        all_media = []
        page = 1
        while True:
            params = {"per_page": 100, "page": page}
            r = requests.get(f"{self.wc_url}/wp-json/wp/v2/media", headers=self.headers, params=params)
            if r.status_code == 400 or not r.json():
                break
            r.raise_for_status()
            media_items = r.json()
            for item in media_items:
                _id = item.get("id")
                filename = item.get("media_details", {}).get("file")
                url = item.get("source_url")
                _alt_name = url.split("/")[-1]
                title = item.get("title", {}).get("rendered", "") or ""
                alt_text = item.get("alt_text", "") or ""
                all_media.append({
                    "id": _id,
                    "filename": filename if filename else _alt_name,
                    "url": url,
                    "title": title,
                    "alt_text": alt_text,
                })
            if len(media_items) < 100:
                break
            page += 1
        return all_media

    def upload_image(self, image_path, filename=None):
        url = f"{self.wc_url}/wp-json/wp/v2/media"
        name = filename or image_path.split("/")[-1]
        self.headers["Content-Disposition"] = f'attachment; filename="{name}"'
        import mimetypes
        ext = os.path.splitext(name)[1].lower()
        content_type = (
            mimetypes.types_map.get(ext)
            or {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
                "pdf": "application/pdf"}.get(ext.lstrip("."), "application/octet-stream")
        )
        self.headers["Content-Type"] = content_type
        with open(image_path, "rb") as img_file:
            img_data = img_file.read()
        r = requests.post(url, headers=self.headers, data=img_data)
        r.raise_for_status()
        return r.json()["source_url"]

    def upload_image_if_not_exists(self, image_path) -> None:
        filename = image_path.split("/")[-1]
        existing_media = self.search_media_by_filename(filename)
        if existing_media:
            print(f"Media file '{filename}' already exists with ID {existing_media['id']}. Ignoring upload.")
        else:
            print(f"Media file '{filename}' not found, uploading...")
            return self.upload_image(image_path)

        return None

    def upload_all_images(self):
        for filename in os.listdir(self.IMAGES_FOLDER):
            file_path = os.path.join(self.IMAGES_FOLDER, filename)
            if os.path.isfile(file_path) and filename.lower().endswith((".png", ".jpg", ".jpeg", ".gif")):
                # print(file_path)
                self.upload_image_if_not_exists(file_path)


if __name__ == "__main__":
    wc_image_adapter = WPImageAdapter()

    # file = wc_image_adapter.search_media_by_filename("pennant-1.jpg")
    # if file:
    #     print(file)
    # else:
    # print("Media file not found")
    # wc_image_adapter.list_all_media()
    wc_image_adapter.upload_all_images()
