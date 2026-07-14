import mimetypes
import os
import time
from typing import Any
from urllib.parse import unquote

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.site_registry import get_site, list_sites

router = APIRouter(tags=["Blog Migration"])


def _site(site_id: str, require_auth: bool = True) -> dict:
    """Thin wrapper kept for compatibility with the rest of this module."""
    s = get_site(site_id, require_wp=require_auth)
    return s


# ── WP REST helpers ───────────────────────────────────────────────────────────

def _wp_get_all(base_url: str, path: str, auth, **extra) -> list:
    results, page = [], 1
    while True:
        r = requests.get(
            f"{base_url}/wp-json/wp/v2/{path}",
            auth=auth,
            params={"per_page": 100, "page": page, **extra},
            timeout=30,
        )
        # Some WP installs return 400 for out-of-range pages instead of []
        if r.status_code == 400 and page > 1:
            break
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        results.extend(batch)
        total_pages = int(r.headers.get("X-WP-TotalPages", page))
        if page >= total_pages or len(batch) < 100:
            break
        page += 1
    return results


def _wp_post(base_url: str, path: str, auth, payload: dict) -> dict:
    r = requests.post(
        f"{base_url}/wp-json/wp/v2/{path}",
        auth=auth,
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def _get_or_create_term(base_url: str, auth, taxonomy: str, name: str, slug: str) -> int:
    for t in _wp_get_all(base_url, taxonomy, auth, search=name):
        if t.get("slug") == slug or t.get("name") == name:
            return t["id"]
    return _wp_post(base_url, taxonomy, auth, {"name": name, "slug": slug})["id"]


# ── Endpoints ─────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    source: str = "cranky_gr"


class ImportRequest(BaseModel):
    target:    str = "cranky_cranky_gr"
    overwrite: bool = False
    posts:     list[dict[str, Any]]
    source:    str = ""   # optional — used to rewrite image URLs in content


@router.get("/blog/sites")
def blog_list_sites():
    return list_sites()


@router.post("/blog/export")
def export_posts(body: ExportRequest):
    site = _site(body.source, require_auth=False)
    url, auth = site["url"], site["auth"]
    try:
        # _embed brings wp:featuredmedia inline so we get the featured image URL
        posts    = _wp_get_all(url, "posts", auth, status="publish", _embed="wp:featuredmedia")
        cats_map = {c["id"]: c for c in _wp_get_all(url, "categories", auth)}
        tags_map = {t["id"]: t for t in _wp_get_all(url, "tags", auth)}
        for post in posts:
            post["slug"]        = unquote(post.get("slug", ""))
            post["_source_url"] = url   # used during import to rewrite image URLs
            post["_categories_detail"] = [
                cats_map.get(cid, {"id": cid, "name": str(cid), "slug": str(cid)})
                for cid in post.get("categories", [])
            ]
            post["_tags_detail"] = [
                tags_map.get(tid, {"id": tid, "name": str(tid), "slug": str(tid)})
                for tid in post.get("tags", [])
            ]
            # Extract featured image URL from embedded data
            embedded_media = (post.get("_embedded") or {}).get("wp:featuredmedia", [])
            if embedded_media and isinstance(embedded_media, list) and embedded_media[0]:
                post["_featured_image_url"] = embedded_media[0].get("source_url", "")
            else:
                post["_featured_image_url"] = ""
        return {"posts": posts, "count": len(posts)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/blog/import")
def import_posts(body: ImportRequest):
    site = _site(body.target)
    url, auth = site["url"], site["auth"]

    # Determine source URL for content rewriting.
    # Posts exported with the new code carry _source_url; the body.source field
    # is used as a fallback when importing from an older JSON dump.
    def _source_url_for(post: dict) -> str:
        src = post.get("_source_url") or ""
        if not src and body.source:
            try:
                src = _site(body.source, require_auth=False)["url"]
            except Exception:
                pass
        return src.rstrip("/")

    try:
        existing = _wp_get_all(url, "posts", None, _fields="id,slug")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch existing posts: {exc}")

    existing_by_slug = {unquote(p["slug"]): p["id"] for p in existing}
    results: list[dict[str, Any]] = []

    for post in body.posts:
        slug = unquote(post.get("slug", ""))
        existing_id = existing_by_slug.get(slug)

        if existing_id and not body.overwrite:
            results.append({"slug": slug, "status": "skipped"})
            continue

        warnings: list[str] = []

        cat_ids = []
        for cat in post.get("_categories_detail", []):
            try:
                cat_ids.append(_get_or_create_term(url, auth, "categories", cat["name"], cat["slug"]))
            except Exception as exc:
                warnings.append(f"category '{cat['name']}': {exc}")

        tag_ids = []
        for tag in post.get("_tags_detail", []):
            try:
                tag_ids.append(_get_or_create_term(url, auth, "tags", tag["name"], tag["slug"]))
            except Exception as exc:
                warnings.append(f"tag '{tag['name']}': {exc}")

        # Rewrite image (and any internal link) URLs: replace source domain with target domain
        src_url = _source_url_for(post)
        def _rewrite(text: str) -> str:
            return text.replace(src_url, url) if src_url else text

        content = _rewrite(post["content"]["rendered"])
        excerpt = _rewrite(post["excerpt"]["rendered"])

        payload: dict[str, Any] = {
            "slug":       slug,
            "status":     post.get("status", "draft"),
            "date":       post.get("date"),
            "title":      post["title"]["rendered"],
            "content":    content,
            "excerpt":    excerpt,
            "categories": cat_ids,
            "tags":       tag_ids,
            "format":     post.get("format", "standard"),
        }

        # Re-attach featured image: find / upload it on the target site
        featured_url = post.get("_featured_image_url") or ""
        if featured_url:
            try:
                media_id = _reupload_image(featured_url, url, auth)
                if media_id:
                    payload["featured_media"] = media_id
                else:
                    warnings.append("featured image: could not upload")
            except Exception as exc:
                warnings.append(f"featured image: {exc}")

        try:
            if existing_id:
                r = requests.put(
                    f"{url}/wp-json/wp/v2/posts/{existing_id}",
                    auth=auth, json=payload, timeout=30,
                )
                r.raise_for_status()
                result_post = r.json()
                entry: dict[str, Any] = {"slug": slug, "status": "updated", "id": result_post["id"]}
            else:
                result_post = _wp_post(url, "posts", auth, payload)
                existing_by_slug[slug] = result_post["id"]
                entry = {"slug": slug, "status": "created", "id": result_post["id"]}
            if warnings:
                entry["warnings"] = warnings
            results.append(entry)
        except Exception as exc:
            results.append({"slug": slug, "status": "error", "error": str(exc)})

    return {
        "results": results,
        "created": sum(1 for r in results if r["status"] == "created"),
        "updated": sum(1 for r in results if r["status"] == "updated"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "errors":  sum(1 for r in results if r["status"] == "error"),
    }


# ── Media ─────────────────────────────────────────────────────────────────────

class MediaImportRequest(BaseModel):
    target: str = "cranky_cranky_gr"
    overwrite: bool = False
    items: list[dict[str, Any]]


@router.post("/media/export")
def export_media(body: ExportRequest):
    site = _site(body.source, require_auth=False)
    url, auth = site["url"], site["auth"]
    try:
        items = _wp_get_all(url, "media", auth)
        result = []
        for item in items:
            details = item.get("media_details", {})
            src = item.get("source_url", "")
            filename = src.split("/")[-1].split("?")[0]
            sizes = details.get("sizes", {})
            thumbnail = (
                sizes.get("thumbnail", {}).get("source_url")
                or (src if item.get("mime_type", "").startswith("image/") else None)
            )
            result.append({
                "id":         item["id"],
                "title":      item.get("title", {}).get("rendered", ""),
                "source_url": src,
                "filename":   filename,
                "mime_type":  item.get("mime_type", ""),
                "width":      details.get("width"),
                "height":     details.get("height"),
                "filesize":   details.get("filesize"),
                "thumbnail":  thumbnail,
            })
        return {"items": result, "count": len(result)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/media/import")
def import_media_items(body: MediaImportRequest):
    site = _site(body.target)
    url, auth = site["url"], site["auth"]

    try:
        existing = _wp_get_all(url, "media", auth)
        # Map both the on-disk filename and the title-based name to the media ID.
        # WordPress renames duplicates (1.jpg → 1-1.jpg) but preserves the title ("1"),
        # so indexing by title+ext lets us detect already-uploaded files reliably.
        existing_by_filename: dict[str, int] = {}
        for item in existing:
            src_filename = item.get("source_url", "").split("/")[-1].split("?")[0]
            existing_by_filename[src_filename] = item["id"]
            title = item.get("title", {}).get("rendered", "").strip()
            _, ext = os.path.splitext(src_filename)
            if title and ext:
                existing_by_filename[f"{title}{ext}"] = item["id"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch existing media: {exc}")

    results: list[dict[str, Any]] = []

    for item in body.items:
        filename   = item.get("filename", "")
        source_url = item.get("source_url", "")
        mime_type  = item.get("mime_type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        existing_id = existing_by_filename.get(filename)

        if existing_id and not body.overwrite:
            results.append({"filename": filename, "status": "skipped"})
            continue

        if existing_id and body.overwrite:
            # Delete the old item so WordPress can reuse the exact filename on disk.
            try:
                requests.delete(
                    f"{url}/wp-json/wp/v2/media/{existing_id}",
                    auth=auth,
                    params={"force": True},
                    timeout=30,
                )
            except Exception:
                pass

        try:
            dl = requests.get(source_url, timeout=60)
            dl.raise_for_status()
        except Exception as exc:
            results.append({"filename": filename, "status": "error", "error": f"Download failed: {exc}"})
            continue

        # Retry up to 3 times on transient server errors (rate limiting / 405 / 429)
        last_exc: Exception | None = None
        for attempt in range(3):
            if attempt:
                time.sleep(2 ** attempt)  # 2 s, 4 s
            try:
                r = requests.post(
                    f"{url}/wp-json/wp/v2/media",
                    auth=auth,
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Type": mime_type,
                    },
                    data=dl.content,
                    timeout=120,
                )
                if r.status_code in (405, 429, 503) and attempt < 2:
                    last_exc = Exception(f"{r.status_code} {r.reason}")
                    continue
                r.raise_for_status()
                new_item = r.json()
                results.append({"filename": filename, "status": "created", "id": new_item["id"]})
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc

        if last_exc is not None:
            results.append({"filename": filename, "status": "error", "error": str(last_exc)})

    return {
        "results": results,
        "created": sum(1 for r in results if r["status"] == "created"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "errors":  sum(1 for r in results if r["status"] == "error"),
    }


# ── WooCommerce products ───────────────────────────────────────────────────────

def _wc_get_all(base_url: str, path: str, wc_auth, **extra) -> list:
    results, page = [], 1
    while True:
        r = requests.get(
            f"{base_url}/wp-json/wc/v3/{path}",
            auth=wc_auth,
            params={"per_page": 100, "page": page, **extra},
            timeout=30,
        )
        if r.status_code == 400 and page > 1:
            break
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        results.extend(batch)
        total_pages = int(r.headers.get("X-WP-TotalPages", page))
        if page >= total_pages or len(batch) < 100:
            break
        page += 1
    return results


def _get_or_create_wc_term(base_url: str, wc_auth, taxonomy: str, name: str, slug: str) -> int:
    for t in _wc_get_all(base_url, taxonomy, wc_auth, search=name):
        if t.get("slug") == slug or t.get("name") == name:
            return t["id"]
    r = requests.post(
        f"{base_url}/wp-json/wc/v3/{taxonomy}",
        auth=wc_auth,
        json={"name": name, "slug": slug},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["id"]


def _reupload_image(src_url: str, target_url: str, target_wp_auth, media_map: dict | None = None) -> "int | None":
    try:
        filename  = src_url.split("/")[-1].split("?")[0]
        stem, ext = os.path.splitext(filename)
        mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        # Fast path: use the pre-built filename→id map when available.
        # This avoids unreliable WP full-text search and prevents race conditions
        # when multiple workers import concurrently.
        if media_map is not None:
            if filename in media_map:
                return media_map[filename]
            return None  # not in map → skip rather than risk creating a duplicate

        # Fallback: search WP media library (used when no map is provided)
        try:
            existing = _wp_get_all(target_url, "media", target_wp_auth, search=stem)
            for item in existing:
                item_filename = item.get("source_url", "").split("/")[-1].split("?")[0]
                item_title    = item.get("title", {}).get("rendered", "").strip()
                if item_filename == filename or f"{item_title}{ext}" == filename:
                    return item["id"]
        except Exception:
            pass

        dl = requests.get(src_url, timeout=60)
        dl.raise_for_status()
        for attempt in range(3):
            if attempt:
                time.sleep(2 ** attempt)
            try:
                r = requests.post(
                    f"{target_url}/wp-json/wp/v2/media",
                    auth=target_wp_auth,
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Type": mime_type,
                    },
                    data=dl.content,
                    timeout=120,
                )
                if r.status_code in (405, 429, 503) and attempt < 2:
                    continue
                r.raise_for_status()
                return r.json()["id"]
            except Exception:
                pass
    except Exception:
        pass
    return None


class WCExportRequest(BaseModel):
    source: str = "cranky_gr"
    page:   int = 1


class WCSyncTaxonomyRequest(BaseModel):
    source: str = "cranky_gr"
    target: str = "cranky_cranky_gr"


@router.post("/wc/sync-taxonomy")
def sync_wc_taxonomy(body: WCSyncTaxonomyRequest):
    src = _site(body.source, require_auth=False)
    tgt = _site(body.target)
    src_url, src_wc = src["url"], src["wc_auth"]
    tgt_url, tgt_wc = tgt["url"], tgt["wc_auth"]

    if not src_wc:
        raise HTTPException(status_code=500, detail=f"No WC credentials for '{body.source}'")
    if not tgt_wc:
        raise HTTPException(status_code=500, detail=f"No WC credentials for '{body.target}'")

    results: dict[str, Any] = {
        "attributes": [],
        "shipping_classes": [],
        "categories": [],
        "tags": [],
    }

    # ── Global product attributes + terms ────────────────────────────────────
    try:
        src_attrs   = _wc_get_all(src_url, "products/attributes", src_wc)
        tgt_attrs   = _wc_get_all(tgt_url, "products/attributes", tgt_wc)
        tgt_by_slug = {a["slug"]: a for a in tgt_attrs}

        for attr in src_attrs:
            entry: dict[str, Any] = {"name": attr["name"], "slug": attr["slug"], "terms_synced": 0}

            if attr["slug"] in tgt_by_slug:
                tgt_attr_id  = tgt_by_slug[attr["slug"]]["id"]
                entry["status"] = "exists"
            else:
                r = requests.post(
                    f"{tgt_url}/wp-json/wc/v3/products/attributes", auth=tgt_wc,
                    json={
                        "name":         attr["name"],
                        "slug":         attr["slug"],
                        "type":         attr.get("type", "select"),
                        "order_by":     attr.get("order_by", "menu_order"),
                        "has_archives": attr.get("has_archives", False),
                    },
                    timeout=30,
                )
                if r.ok:
                    tgt_attr_id  = r.json()["id"]
                    entry["status"] = "created"
                else:
                    entry["status"] = f"error: {r.status_code} {r.reason}"
                    results["attributes"].append(entry)
                    continue

            src_terms      = _wc_get_all(src_url, f"products/attributes/{attr['id']}/terms", src_wc)
            tgt_term_slugs = {t["slug"] for t in _wc_get_all(tgt_url, f"products/attributes/{tgt_attr_id}/terms", tgt_wc)}

            for term in src_terms:
                if term["slug"] not in tgt_term_slugs:
                    r = requests.post(
                        f"{tgt_url}/wp-json/wc/v3/products/attributes/{tgt_attr_id}/terms",
                        auth=tgt_wc,
                        json={
                            "name":       term["name"],
                            "slug":       term["slug"],
                            "description": term.get("description", ""),
                            "menu_order": term.get("menu_order", 0),
                        },
                        timeout=30,
                    )
                    if r.ok:
                        entry["terms_synced"] += 1

            results["attributes"].append(entry)
    except Exception as exc:
        results["attributes_error"] = str(exc)

    # ── Shipping classes ──────────────────────────────────────────────────────
    try:
        src_classes    = _wc_get_all(src_url, "shipping/classes", src_wc)
        tgt_class_slugs = {c["slug"] for c in _wc_get_all(tgt_url, "shipping/classes", tgt_wc)}

        for sc in src_classes:
            if sc["slug"] not in tgt_class_slugs:
                r = requests.post(
                    f"{tgt_url}/wp-json/wc/v3/shipping/classes", auth=tgt_wc,
                    json={"name": sc["name"], "slug": sc["slug"], "description": sc.get("description", "")},
                    timeout=30,
                )
                status = "created" if r.ok else f"error: {r.status_code} {r.reason}"
            else:
                status = "exists"
            results["shipping_classes"].append({"name": sc["name"], "slug": sc["slug"], "status": status})
    except Exception as exc:
        results["shipping_classes_error"] = str(exc)

    # ── Product categories ────────────────────────────────────────────────────
    try:
        src_cats    = _wc_get_all(src_url, "products/categories", src_wc)
        tgt_cat_slugs = {c["slug"] for c in _wc_get_all(tgt_url, "products/categories", tgt_wc)}

        for cat in src_cats:
            if cat["slug"] == "uncategorized":
                continue
            if cat["slug"] not in tgt_cat_slugs:
                r = requests.post(
                    f"{tgt_url}/wp-json/wc/v3/products/categories", auth=tgt_wc,
                    json={
                        "name":        cat["name"],
                        "slug":        cat["slug"],
                        "description": cat.get("description", ""),
                    },
                    timeout=30,
                )
                status = "created" if r.ok else f"error: {r.status_code} {r.reason}"
            else:
                status = "exists"
            results["categories"].append({"name": cat["name"], "slug": cat["slug"], "status": status})
    except Exception as exc:
        results["categories_error"] = str(exc)

    # ── Product tags ──────────────────────────────────────────────────────────
    try:
        src_tags    = _wc_get_all(src_url, "products/tags", src_wc)
        tgt_tag_slugs = {t["slug"] for t in _wc_get_all(tgt_url, "products/tags", tgt_wc)}

        for tag in src_tags:
            if tag["slug"] not in tgt_tag_slugs:
                r = requests.post(
                    f"{tgt_url}/wp-json/wc/v3/products/tags", auth=tgt_wc,
                    json={"name": tag["name"], "slug": tag["slug"], "description": tag.get("description", "")},
                    timeout=30,
                )
                status = "created" if r.ok else f"error: {r.status_code} {r.reason}"
            else:
                status = "exists"
            results["tags"].append({"name": tag["name"], "slug": tag["slug"], "status": status})
    except Exception as exc:
        results["tags_error"] = str(exc)

    return results


class WCImportOneRequest(BaseModel):
    target:         str = "cranky_cranky_gr"
    overwrite:      bool = False
    media_map:      dict[str, int] = {}
    include_fields: list[str] = [
        "pricing", "inventory", "images", "categories", "tags",
        "attributes", "shipping", "tax", "meta", "visibility", "downloads",
    ]
    product:        dict[str, Any]
    existing_id:    int | None = None


class WCVariationsRequest(BaseModel):
    source:     str
    product_id: int


@router.post("/wc/export")
def export_wc_products(body: WCExportRequest):
    site = _site(body.source, require_auth=False)
    url, wc_auth = site["url"], site["wc_auth"]
    if not wc_auth:
        raise HTTPException(status_code=500, detail=f"No WooCommerce credentials for '{body.source}'")
    try:
        r = requests.get(
            f"{url}/wp-json/wc/v3/products",
            auth=wc_auth,
            params={"per_page": 100, "page": body.page},
            timeout=30,
        )
        r.raise_for_status()
        products    = r.json()
        total       = int(r.headers.get("X-WP-Total", len(products)))
        total_pages = int(r.headers.get("X-WP-TotalPages", 1))
        # Variations are fetched separately via /wc/export-variations
        for p in products:
            p["_variations"] = []
        return {"products": products, "total": total, "total_pages": total_pages, "page": body.page}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/wc/export-variations")
def export_wc_variations(body: WCVariationsRequest):
    site = _site(body.source, require_auth=False)
    url, wc_auth = site["url"], site["wc_auth"]
    if not wc_auth:
        raise HTTPException(status_code=500, detail=f"No WooCommerce credentials for '{body.source}'")
    try:
        variations = _wc_get_all(url, f"products/{body.product_id}/variations", wc_auth)
        return {"variations": variations}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/wc/sku-map")
def get_wc_sku_map(body: WCExportRequest):
    """Pre-fetch every product on a site (all statuses including trash) and return sku→id + name→id maps."""
    site = _site(body.source, require_auth=False)
    url, wc_auth = site["url"], site["wc_auth"]
    if not wc_auth:
        raise HTTPException(status_code=500, detail=f"No WooCommerce credentials for '{body.source}'")
    try:
        # status=any covers publish/draft/pending/private but NOT trash — fetch both
        all_products: list[dict] = []
        for status in ("any", "trash"):
            try:
                all_products.extend(_wc_get_all(url, "products", wc_auth, status=status))
            except Exception:
                pass
        sku_map  = {p["sku"]: p["id"] for p in all_products if p.get("sku")}
        name_map = {p["name"]: p["id"] for p in all_products if p.get("name")}
        return {"sku_map": sku_map, "name_map": name_map}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/wc/import-one")
def import_wc_product(body: WCImportOneRequest):
    site = _site(body.target)
    url, auth, wc_auth = site["url"], site["auth"], site["wc_auth"]
    if not wc_auth:
        raise HTTPException(status_code=500, detail=f"No WooCommerce credentials for '{body.target}'")

    product = body.product
    sku     = product.get("sku", "")
    name    = product.get("name", "")

    # Dedup: use pre-fetched existing_id if the frontend provided one (most reliable).
    # Fall back to per-product WC search only when not provided.
    existing_id = body.existing_id
    if existing_id is None:
        try:
            if sku:
                for status in ("any", "publish", "trash"):
                    try:
                        m = _wc_get_all(url, "products", wc_auth, sku=sku, status=status)
                        if m:
                            existing_id = m[0]["id"]
                            break
                    except Exception:
                        continue
            if not existing_id:
                for m in _wc_get_all(url, "products", wc_auth, search=name, status="any"):
                    if m["name"] == name:
                        existing_id = m["id"]
                        break
        except Exception as exc:
            return {"name": name, "sku": sku, "status": "error", "error": f"Dedup check: {exc}"}

    if existing_id and not body.overwrite:
        return {"name": name, "sku": sku, "status": "skipped", "id": existing_id}

    warnings: list[str] = []

    # If the existing product is trashed, force-delete it first so we can POST fresh.
    # A PUT to a trashed WC product often fails to restore it and the SKU stays locked.
    if existing_id and body.overwrite:
        chk = requests.get(f"{url}/wp-json/wc/v3/products/{existing_id}",
                           auth=wc_auth, timeout=15)
        if chk.ok and chk.json().get("status") == "trash":
            requests.delete(f"{url}/wp-json/wc/v3/products/{existing_id}",
                            auth=wc_auth, params={"force": True}, timeout=30)
            existing_id = None  # will POST fresh

    def _resolve_image(img: dict) -> "dict | None":
        src = img.get("src", "")
        if not src:
            return None
        filename = src.split("/")[-1].split("?")[0]
        if filename in body.media_map:
            return {"id": body.media_map[filename]}
        if auth:
            new_id = _reupload_image(src, url, auth, media_map=body.media_map)
            if new_id:
                return {"id": new_id}
        warnings.append(f"image '{filename}': not in media map, skipped to avoid sideload")
        return None

    cat_ids = []
    for cat in product.get("categories", []):
        try:
            cat_ids.append(_get_or_create_wc_term(url, wc_auth, "products/categories", cat["name"], cat["slug"]))
        except Exception as e:
            warnings.append(f"category '{cat['name']}': {e}")

    tag_ids = []
    for tag in product.get("tags", []):
        try:
            tag_ids.append(_get_or_create_wc_term(url, wc_auth, "products/tags", tag["name"], tag["slug"]))
        except Exception as e:
            warnings.append(f"tag '{tag['name']}': {e}")

    images = [img for img in (_resolve_image(i) for i in product.get("images", [])) if img]

    clean_attrs = [
        {
            "name":      a.get("name", ""),
            "options":   a.get("options", []),
            "visible":   a.get("visible", True),
            "variation": a.get("variation", False),
        }
        for a in product.get("attributes", [])
    ]

    f = set(body.include_fields)

    # Always-included: identity fields
    payload: dict[str, Any] = {
        "name":              name,
        "slug":              product.get("slug", ""),
        "sku":               sku,
        "type":              product.get("type", "simple"),
        "status":            product.get("status", "publish"),
        "description":       product.get("description", ""),
        "short_description": product.get("short_description", ""),
        "virtual":           product.get("virtual", False),
        "downloadable":      product.get("downloadable", False),
        # External product fields (only meaningful for type=external)
        "external_url":      product.get("external_url", ""),
        "button_text":       product.get("button_text", ""),
    }

    if "pricing" in f:
        payload.update({
            "regular_price": product.get("regular_price", ""),
            "sale_price":    product.get("sale_price", ""),
        })
        if product.get("date_on_sale_from"):
            payload["date_on_sale_from"] = product["date_on_sale_from"]
        if product.get("date_on_sale_to"):
            payload["date_on_sale_to"] = product["date_on_sale_to"]
    if "inventory" in f:
        payload.update({
            "manage_stock":      product.get("manage_stock", False),
            "stock_quantity":    product.get("stock_quantity"),
            "stock_status":      product.get("stock_status", "instock"),
            "backorders":        product.get("backorders", "no"),
            "sold_individually": product.get("sold_individually", False),
            "low_stock_amount":  product.get("low_stock_amount"),
        })
    if "categories" in f:
        payload["categories"] = [{"id": cid} for cid in cat_ids]
    if "tags" in f:
        payload["tags"] = [{"id": tid} for tid in tag_ids]
    if "images" in f:
        payload["images"] = images
    if "attributes" in f:
        payload["attributes"] = clean_attrs
        # Strip source-site attribute IDs — target IDs differ; use name+option only
        payload["default_attributes"] = [
            {"id": 0, "name": da.get("name", ""), "option": da.get("option", "")}
            for da in product.get("default_attributes", [])
        ]
    if "shipping" in f:
        payload.update({
            "weight":         product.get("weight", ""),
            "dimensions":     product.get("dimensions", {}),
            "shipping_class": product.get("shipping_class", ""),
        })
    if "tax" in f:
        payload.update({
            "tax_status": product.get("tax_status", "taxable"),
            "tax_class":  product.get("tax_class", ""),
        })
    if "dates" in f:
        if product.get("date_created"):
            payload["date_created"] = product["date_created"]
        if product.get("date_modified"):
            payload["date_modified"] = product["date_modified"]
    if "meta" in f:
        payload["meta_data"] = product.get("meta_data", [])
    if "visibility" in f:
        payload.update({
            "featured":           product.get("featured", False),
            "catalog_visibility": product.get("catalog_visibility", "visible"),
            "reviews_allowed":    product.get("reviews_allowed", True),
            "purchase_note":      product.get("purchase_note", ""),
            "menu_order":         product.get("menu_order", 0),
        })
    if "downloads" in f:
        payload.update({
            "downloads":        product.get("downloads", []),
            "download_limit":   product.get("download_limit", -1),
            "download_expiry":  product.get("download_expiry", -1),
        })

    try:
        if existing_id:
            r = requests.put(f"{url}/wp-json/wc/v3/products/{existing_id}",
                             auth=wc_auth, json=payload, timeout=60)
        else:
            r = requests.post(f"{url}/wp-json/wc/v3/products",
                              auth=wc_auth, json=payload, timeout=60)
        if not r.ok:
            try:
                detail = r.json().get("message") or r.json().get("code") or r.text[:300]
            except Exception:
                detail = r.text[:300]
            return {"name": name, "sku": sku, "status": "error",
                    "error": f"{r.status_code}: {detail}"}
        created   = r.json()
        op_status = "updated" if existing_id else "created"

        new_id = created["id"]

        # Build SKU → variation ID map for existing variations (used to upsert)
        existing_vars     = _wc_get_all(url, f"products/{new_id}/variations", wc_auth)
        existing_var_by_sku = {v["sku"]: v["id"] for v in existing_vars if v.get("sku")}

        for var in product.get("_variations", []):
            var_img    = var.get("image") or {}
            var_image  = _resolve_image(var_img) if var_img.get("src") else None
            var_sku    = var.get("sku", "")
            var_payload: dict[str, Any] = {
                "sku":         var_sku,
                "status":      var.get("status", "publish"),
                "description": var.get("description", ""),
                "virtual":     var.get("virtual", False),
                "downloadable": var.get("downloadable", False),
                "attributes":  [{"name": a["name"], "option": a.get("option", "")}
                                for a in var.get("attributes", [])],
            }
            if "pricing" in f:
                var_payload.update({
                    "regular_price": var.get("regular_price", ""),
                    "sale_price":    var.get("sale_price", ""),
                })
                if var.get("date_on_sale_from"):
                    var_payload["date_on_sale_from"] = var["date_on_sale_from"]
                if var.get("date_on_sale_to"):
                    var_payload["date_on_sale_to"] = var["date_on_sale_to"]
            if "inventory" in f:
                var_payload.update({
                    "manage_stock":  var.get("manage_stock", False),
                    "stock_quantity": var.get("stock_quantity"),
                    "stock_status":  var.get("stock_status", "instock"),
                    "backorders":    var.get("backorders", "no"),
                })
            if "shipping" in f:
                var_payload.update({
                    "weight":         var.get("weight", ""),
                    "dimensions":     var.get("dimensions", {}),
                    "shipping_class": var.get("shipping_class", ""),
                })
            if "tax" in f:
                var_payload.update({
                    "tax_status": var.get("tax_status", "taxable"),
                    "tax_class":  var.get("tax_class", ""),
                })
            if "meta" in f:
                var_payload["meta_data"] = var.get("meta_data", [])
            if var_image:
                var_payload["image"] = var_image

            existing_var_id = existing_var_by_sku.get(var_sku)
            if existing_var_id:
                rv = requests.put(
                    f"{url}/wp-json/wc/v3/products/{new_id}/variations/{existing_var_id}",
                    auth=wc_auth, json=var_payload, timeout=30,
                )
            else:
                rv = requests.post(
                    f"{url}/wp-json/wc/v3/products/{new_id}/variations",
                    auth=wc_auth, json=var_payload, timeout=30,
                )
            if not rv.ok:
                warnings.append(f"variation '{var_sku or '?'}': {rv.status_code} {rv.reason}")

        entry: dict[str, Any] = {"name": name, "sku": sku, "status": op_status, "id": new_id}
        if warnings:
            entry["warnings"] = warnings
        return entry

    except Exception as exc:
        return {"name": name, "sku": sku, "status": "error", "error": str(exc)}


# ── WooCommerce coupons ────────────────────────────────────────────────────────

class WCExportCouponsRequest(BaseModel):
    source:   str
    search:   str = ""


class WCCouponCodeMapRequest(BaseModel):
    target: str


class WCImportCouponRequest(BaseModel):
    target:      str
    coupon:      dict[str, Any]
    overwrite:   bool = False
    existing_id: int | None = None


@router.post("/wc/export-coupons")
def export_wc_coupons(body: WCExportCouponsRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    extra = {"search": body.search} if body.search else {}
    coupons = _wc_get_all(url, "coupons", wc_auth, **extra)
    return {"coupons": coupons, "total": len(coupons)}


@router.post("/wc/coupon-code-map")
def wc_coupon_code_map(body: WCCouponCodeMapRequest):
    """Returns coupon code → ID map for the target site."""
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    coupons = _wc_get_all(url, "coupons", wc_auth)
    return {"map": {c["code"]: c["id"] for c in coupons if c.get("code")}}


@router.post("/wc/import-coupon")
def import_wc_coupon(body: WCImportCouponRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    coupon = body.coupon
    code   = coupon.get("code", "")

    payload: dict[str, Any] = {
        "code":                        code,
        "discount_type":               coupon.get("discount_type", "percent"),
        "amount":                      str(coupon.get("amount", "0")),
        "description":                 coupon.get("description", ""),
        "date_expires":                coupon.get("date_expires") or None,
        "individual_use":              coupon.get("individual_use", False),
        "product_ids":                 coupon.get("product_ids", []),
        "excluded_product_ids":        coupon.get("excluded_product_ids", []),
        "usage_limit":                 coupon.get("usage_limit") or None,
        "usage_limit_per_user":        coupon.get("usage_limit_per_user") or None,
        "free_shipping":               coupon.get("free_shipping", False),
        "product_categories":          coupon.get("product_categories", []),
        "excluded_product_categories": coupon.get("excluded_product_categories", []),
        "exclude_sale_items":          coupon.get("exclude_sale_items", False),
        "minimum_amount":              str(coupon.get("minimum_amount", "0")),
        "maximum_amount":              str(coupon.get("maximum_amount", "0")),
        "email_restrictions":          coupon.get("email_restrictions", []),
        "meta_data":                   coupon.get("meta_data", []),
    }
    # Strip None values — WC REST rejects null for some fields
    payload = {k: v for k, v in payload.items() if v is not None}

    existing_id = body.existing_id
    try:
        if existing_id and body.overwrite:
            r = requests.put(f"{url}/wp-json/wc/v3/coupons/{existing_id}", auth=wc_auth, json=payload, timeout=30)
            if not r.ok:
                return {"status": "error", "error": _wc_error(r), "code": code}
            return {"id": existing_id, "status": "updated", "code": code}
        elif existing_id:
            return {"id": existing_id, "status": "skipped", "code": code}
        else:
            r = requests.post(f"{url}/wp-json/wc/v3/coupons", auth=wc_auth, json=payload, timeout=30)
            if not r.ok:
                return {"status": "error", "error": _wc_error(r), "code": code}
            return {"id": r.json()["id"], "status": "created", "code": code}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "code": code}


# ── WooCommerce orders ─────────────────────────────────────────────────────────

class WCExportOrdersRequest(BaseModel):
    source:     str
    page:       int = 1
    per_page:   int = 50
    status:     str = "any"       # any | processing | completed | ...
    after:      str = ""          # ISO date string
    before:     str = ""          # ISO date string


class WCOrderIdMapRequest(BaseModel):
    target: str


class WCImportOrderRequest(BaseModel):
    target:      str
    order:       dict[str, Any]
    overwrite:   bool = False
    existing_id: int | None = None
    sku_map:     dict[str, int] = {}
    name_map:    dict[str, int] = {}


@router.post("/wc/export-orders")
def export_wc_orders(body: WCExportOrdersRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    params: dict[str, Any] = {
        "per_page": body.per_page,
        "page":     body.page,
        "status":   body.status,
    }
    if body.after:
        params["after"] = body.after
    if body.before:
        params["before"] = body.before

    r = requests.get(
        f"{url}/wp-json/wc/v3/orders",
        auth=wc_auth,
        params=params,
        timeout=60,
    )
    r.raise_for_status()
    orders = r.json()
    total        = int(r.headers.get("X-WP-Total", 0))
    total_pages  = int(r.headers.get("X-WP-TotalPages", 1))
    return {"orders": orders, "total": total, "total_pages": total_pages, "page": body.page}


@router.post("/wc/order-id-map")
def wc_order_id_map(body: WCOrderIdMapRequest):
    """Returns a map of _source_order_id meta value → existing target order ID."""
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    all_orders: list[dict] = []
    for status in ("any",):
        try:
            all_orders.extend(_wc_get_all(url, "orders", wc_auth, status=status))
        except Exception:
            pass
    id_map: dict[str, int] = {}
    for o in all_orders:
        for m in o.get("meta_data", []):
            if m.get("key") == "_source_order_id":
                id_map[str(m["value"])] = o["id"]
    return {"map": id_map}


@router.post("/wc/import-order")
def import_wc_order(body: WCImportOrderRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    order = body.order
    source_id = str(order.get("id", ""))

    # Build order payload — keep only fields safe to replicate
    payload: dict[str, Any] = {
        "status":          order.get("status", "pending"),
        "currency":        order.get("currency", "EUR"),
        "customer_id":     0,
        "billing":         order.get("billing", {}),
        "shipping":        order.get("shipping", {}),
        "payment_method":  order.get("payment_method", ""),
        "payment_method_title": order.get("payment_method_title", ""),
        "transaction_id":  order.get("transaction_id", ""),
        "customer_note":   order.get("customer_note", ""),
        "line_items":      [],
        "shipping_lines":  order.get("shipping_lines", []),
        "fee_lines":       order.get("fee_lines", []),
        "coupon_lines":    [],
        "meta_data": [
            m for m in order.get("meta_data", [])
            if not m.get("key", "").startswith("_wc_")
               and m.get("key") not in ("_edit_lock", "_edit_last")
        ] + [{"key": "_source_order_id", "value": source_id}],
    }

    # Strip internal WC ids from shipping/fee lines
    for line in payload["shipping_lines"]:
        line.pop("id", None)
    for line in payload["fee_lines"]:
        line.pop("id", None)

    # Line items — resolve product_id from sku_map/name_map; skip unresolvable
    sku_map  = body.sku_map
    name_map = body.name_map
    for li in order.get("line_items", []):
        sku  = li.get("sku") or ""
        name = li.get("name") or ""
        prod_id = sku_map.get(sku) or name_map.get(name) if (sku or name) else None
        item: dict[str, Any] = {
            "quantity": max(1, int(li.get("quantity") or 1)),
            "subtotal": str(li.get("subtotal") or "0"),
            "total":    str(li.get("total") or "0"),
        }
        if prod_id:
            item["product_id"] = prod_id
        elif sku:
            item["sku"] = sku  # let WC try to resolve by SKU
        else:
            item["name"] = name or "Unknown product"
            # Without product_id or sku WC will reject — item will be silently dropped
            # by the retry logic below if it causes a 400
        payload["line_items"].append(item)

    # Coupon lines — kept for first attempt; stripped on retry if coupons don't exist
    for cl in order.get("coupon_lines", []):
        payload["coupon_lines"].append({"code": cl.get("code", "")})

    # Dates
    if order.get("date_created"):
        payload["date_created"] = order["date_created"]

    existing_id: int | None = body.existing_id

    def _do_request(p: dict) -> "requests.Response":
        if existing_id and body.overwrite:
            return requests.put(f"{url}/wp-json/wc/v3/orders/{existing_id}", auth=wc_auth, json=p, timeout=30)
        return requests.post(f"{url}/wp-json/wc/v3/orders", auth=wc_auth, json=p, timeout=30)

    def _ok_result(r: "requests.Response") -> dict:
        rid = existing_id if (existing_id and body.overwrite) else r.json().get("id")
        status = "updated" if (existing_id and body.overwrite) else "created"
        return {"id": rid, "status": status, "order_number": order.get("number")}

    try:
        if existing_id and not body.overwrite:
            return {"id": existing_id, "status": "skipped", "order_number": order.get("number")}

        # Attempt 1: full payload
        r = _do_request(payload)
        if r.ok:
            return _ok_result(r)

        # Attempt 2: strip coupons if that's the error
        if r.status_code == 400 and "coupon" in r.text.lower():
            p2 = {**payload, "coupon_lines": []}
            r = _do_request(p2)
            if r.ok:
                return _ok_result(r)

        # Attempt 3: also strip unresolvable line items (no product_id, no sku)
        if r.status_code == 400 and ("product" in r.text.lower() or "line_item" in r.text.lower() or "line_items" in r.text.lower()):
            good_items = [li for li in payload["line_items"] if li.get("product_id") or li.get("sku")]
            p3 = {**payload, "coupon_lines": [], "line_items": good_items}
            r = _do_request(p3)
            if r.ok:
                return _ok_result(r)

        return {"status": "error", "error": _wc_error(r), "order_number": order.get("number")}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "order_number": order.get("number")}


# ── WooCommerce customers ──────────────────────────────────────────────────────

class WCExportCustomersRequest(BaseModel):
    source:   str
    page:     int = 1
    per_page: int = 50
    search:   str = ""
    role:     str = "customer"


class WCCustomerEmailMapRequest(BaseModel):
    target: str


class WCImportCustomerRequest(BaseModel):
    target:    str
    customer:  dict[str, Any]
    overwrite: bool = False


@router.post("/wc/export-customers")
def export_wc_customers(body: WCExportCustomersRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    if body.role == "all":
        # Fetch across all common WP roles and deduplicate by ID
        seen: set[int] = set()
        all_customers: list[dict] = []
        for role in ("customer", "subscriber", "editor", "author", "contributor", "administrator"):
            try:
                batch = _wc_get_all(url, "customers", wc_auth, **({ "search": body.search } if body.search else {}), role=role)
                for c in batch:
                    if c["id"] not in seen:
                        seen.add(c["id"])
                        all_customers.append(c)
            except Exception:
                pass
        return {"customers": all_customers, "total": len(all_customers), "total_pages": 1, "page": 1}

    params: dict[str, Any] = {
        "per_page": body.per_page,
        "page":     body.page,
        "role":     body.role,
    }
    if body.search:
        params["search"] = body.search

    r = requests.get(
        f"{url}/wp-json/wc/v3/customers",
        auth=wc_auth,
        params=params,
        timeout=60,
    )
    r.raise_for_status()
    customers   = r.json()
    total       = int(r.headers.get("X-WP-Total", 0))
    total_pages = int(r.headers.get("X-WP-TotalPages", 1))
    return {"customers": customers, "total": total, "total_pages": total_pages, "page": body.page}


@router.post("/wc/customer-email-map")
def wc_customer_email_map(body: WCCustomerEmailMapRequest):
    """Returns email → customer_id map for the target site."""
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    all_customers: list[dict] = []
    for role in ("customer", "subscriber", "administrator", "editor"):
        try:
            all_customers.extend(_wc_get_all(url, "customers", wc_auth, role=role))
        except Exception:
            pass
    email_map = {c["email"]: c["id"] for c in all_customers if c.get("email")}
    return {"map": email_map}


def _wc_error(r: requests.Response) -> str:
    """Extract a human-readable error from a WC REST API error response."""
    try:
        body = r.json()
        msg  = body.get("message") or body.get("code") or ""
        if msg:
            return f"{r.status_code}: {msg}"
    except Exception:
        pass
    return f"{r.status_code} {r.reason}"


_BILLING_FIELDS  = {"first_name", "last_name", "company", "address_1", "address_2",
                    "city", "state", "postcode", "country", "email", "phone"}
_SHIPPING_FIELDS = {"first_name", "last_name", "company", "address_1", "address_2",
                    "city", "state", "postcode", "country", "phone"}

# Fields to drop one-by-one when WC rejects billing/shipping
_BILLING_FALLBACK_DROPS  = ("state", "company", "phone", "address_2")
_SHIPPING_FALLBACK_DROPS = ("state", "company", "phone", "address_2")


def _sanitize_address(raw: dict, allowed: set) -> dict:
    return {k: str(v) if v is not None else "" for k, v in raw.items() if k in allowed and v is not None}


def _find_customer_by_email(url: str, wc_auth, email: str) -> "int | None":
    """Try to find a WC customer ID by email across all roles."""
    for role in ("customer", "subscriber", "administrator", "editor", "author", "contributor"):
        try:
            r = requests.get(
                f"{url}/wp-json/wc/v3/customers",
                auth=wc_auth,
                params={"email": email, "role": role, "per_page": 1},
                timeout=20,
            )
            if r.ok and r.json():
                return r.json()[0]["id"]
        except Exception:
            pass
    return None


@router.post("/wc/import-customer")
def import_wc_customer(body: WCImportCustomerRequest):
    import re
    import random
    import string
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]
    customer = body.customer
    email    = customer.get("email", "")

    existing_id = _find_customer_by_email(url, wc_auth, email)

    payload: dict[str, Any] = {
        "email":      email,
        "first_name": customer.get("first_name", ""),
        "last_name":  customer.get("last_name", ""),
        "username":   customer.get("username", ""),
        "role":       customer.get("role", "customer"),
        "billing":    _sanitize_address(customer.get("billing", {}), _BILLING_FIELDS),
        "shipping":   _sanitize_address(customer.get("shipping", {}), _SHIPPING_FIELDS),
        "meta_data":  [
            m for m in customer.get("meta_data", [])
            if not str(m.get("key", "")).startswith("_wc_")
               and m.get("key") not in (
                   "session_tokens", "_edit_lock", "_edit_last",
                   "wc_last_active", "_woocommerce_persistent_cart_1",
               )
        ],
    }

    def _try_put(p: dict) -> "requests.Response":
        return requests.put(
            f"{url}/wp-json/wc/v3/customers/{existing_id}",
            auth=wc_auth, json=p, timeout=30,
        )

    def _try_post(p: dict) -> "requests.Response":
        return requests.post(
            f"{url}/wp-json/wc/v3/customers",
            auth=wc_auth, json=p, timeout=30,
        )

    def _billing_fallbacks(p: dict) -> "list[dict]":
        """Yield progressively stripped copies of the payload for billing retries."""
        variants = [dict(p)]
        billing  = dict(p.get("billing",  {}))
        shipping = dict(p.get("shipping", {}))
        for drop_b, drop_s in zip(_BILLING_FALLBACK_DROPS, _SHIPPING_FALLBACK_DROPS):
            billing.pop(drop_b, None)
            shipping.pop(drop_s, None)
            v = dict(p)
            v["billing"]  = dict(billing)
            v["shipping"] = dict(shipping)
            variants.append(v)
        # Final fallback: empty address — account created without address data
        empty = dict(p)
        empty["billing"]  = {}
        empty["shipping"] = {}
        variants.append(empty)
        return variants

    def _is_billing_error(r: "requests.Response") -> bool:
        return r.status_code == 400 and "billing" in r.text.lower()

    try:
        if existing_id and body.overwrite:
            # Don't send username in PUT — WC doesn't allow changing it
            put_payload = {k: v for k, v in payload.items() if k != "username"}
            r = None
            for variant in _billing_fallbacks(put_payload):
                r = _try_put(variant)
                if r.ok:
                    return {"id": existing_id, "status": "updated", "email": email}
                if not _is_billing_error(r):
                    break
            return {"status": "error", "error": _wc_error(r), "email": email}

        elif existing_id:
            return {"id": existing_id, "status": "skipped", "email": email}

        else:
            rand_pw = "".join(random.choices(string.ascii_letters + string.digits, k=16))
            payload["password"] = rand_pw

            base       = customer.get("username", "") or ""
            email_stem = re.sub(r"[^a-z0-9._-]", "", email.split("@")[0].lower())
            suffix     = lambda: "".join(random.choices(string.digits, k=4))
            candidates = [base, f"{base}_{suffix()}", email_stem, f"{email_stem}_{suffix()}"]
            candidates = [c for c in candidates if c]

            r = None
            for variant in _billing_fallbacks(payload):
                for username in candidates:
                    variant["username"] = username
                    r = _try_post(variant)
                    if r.ok:
                        return {"id": r.json()["id"], "status": "created", "email": email}
                    if r.status_code == 400 and "already registered" in r.text.lower():
                        found = _find_customer_by_email(url, wc_auth, email)
                        if found:
                            if body.overwrite:
                                ru = _try_put({k: v for k, v in variant.items() if k not in ("username", "password")})
                                if ru.ok:
                                    return {"id": found, "status": "updated", "email": email}
                            return {"id": found, "status": "skipped", "email": email}
                    if r.status_code != 400 or "username" not in r.text.lower():
                        break  # username ok but other error — try next billing variant
                if r and r.ok:
                    break
                if r and not _is_billing_error(r):
                    break  # non-billing error — no point retrying with simpler billing

            return {"status": "error", "error": _wc_error(r), "email": email}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "email": email}


# ── Tax rates & classes ────────────────────────────────────────────────────────

class WCExportTaxRequest(BaseModel):
    source: str

class WCImportTaxRequest(BaseModel):
    target:    str
    classes:   list[dict[str, Any]] = []
    rates:     list[dict[str, Any]] = []
    overwrite: bool = False


@router.post("/wc/export-taxes")
def export_wc_taxes(body: WCExportTaxRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    rc = requests.get(f"{url}/wp-json/wc/v3/taxes/classes", auth=wc_auth, timeout=30)
    rc.raise_for_status()
    classes = [{"slug": c["slug"], "name": c["name"]} for c in rc.json()]

    rates, page = [], 1
    while True:
        rr = requests.get(f"{url}/wp-json/wc/v3/taxes", auth=wc_auth,
                          params={"per_page": 100, "page": page}, timeout=30)
        rr.raise_for_status()
        batch = rr.json()
        if not batch:
            break
        rates.extend(batch)
        if page >= int(rr.headers.get("X-WP-TotalPages", 1)):
            break
        page += 1

    _RATE_FIELDS = ("id","country","state","postcode","city","rate","name",
                    "priority","compound","shipping","order","class")
    return {
        "classes": classes,
        "rates":   [{k: r_.get(k, "") for k in _RATE_FIELDS} for r_ in rates],
    }


@router.post("/wc/import-taxes")
def import_wc_taxes(body: WCImportTaxRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    class_results: list[dict] = []
    rate_results:  list[dict] = []

    ec = requests.get(f"{url}/wp-json/wc/v3/taxes/classes", auth=wc_auth, timeout=30)
    existing_slugs = {c["slug"] for c in (ec.json() if ec.ok else [])}
    existing_slugs.update({"standard", "reduced-rate", "zero-rate"})

    for cls in body.classes:
        slug = cls["slug"]
        if slug in existing_slugs:
            class_results.append({"slug": slug, "status": "skipped"})
            continue
        try:
            r = requests.post(f"{url}/wp-json/wc/v3/taxes/classes",
                              auth=wc_auth, json={"name": cls["name"]}, timeout=30)
            r.raise_for_status()
            existing_slugs.add(slug)
            class_results.append({"slug": slug, "status": "created"})
        except Exception as exc:
            class_results.append({"slug": slug, "status": "error", "error": str(exc)})

    er = requests.get(f"{url}/wp-json/wc/v3/taxes", auth=wc_auth,
                      params={"per_page": 100}, timeout=30)
    existing_rates = er.json() if er.ok else []

    def _rkey(r_: dict) -> tuple:
        return (r_.get("country",""), r_.get("state",""), r_.get("rate",""),
                r_.get("name",""), r_.get("class",""))

    existing_map = {_rkey(r_): r_["id"] for r_ in existing_rates}
    _WRITE_FIELDS = ("country","state","postcode","city","rate","name",
                     "priority","compound","shipping","order","class")

    for rate in body.rates:
        key     = _rkey(rate)
        payload = {k: rate[k] for k in _WRITE_FIELDS if k in rate}
        name    = rate.get("name", "")
        try:
            if key in existing_map and body.overwrite:
                r = requests.put(f"{url}/wp-json/wc/v3/taxes/{existing_map[key]}",
                                 auth=wc_auth, json=payload, timeout=30)
                r.raise_for_status()
                rate_results.append({"name": name, "status": "updated"})
            elif key in existing_map:
                rate_results.append({"name": name, "status": "skipped"})
            else:
                r = requests.post(f"{url}/wp-json/wc/v3/taxes",
                                  auth=wc_auth, json=payload, timeout=30)
                r.raise_for_status()
                rate_results.append({"name": name, "status": "created"})
        except Exception as exc:
            rate_results.append({"name": name, "status": "error", "error": str(exc)})

    return {"classes": class_results, "rates": rate_results}


# ── Shipping zones, methods, rates ─────────────────────────────────────────────

class WCExportShippingRequest(BaseModel):
    source: str

class WCImportShippingRequest(BaseModel):
    target:    str
    zones:     list[dict[str, Any]]
    overwrite: bool = False


@router.post("/wc/export-shipping")
def export_wc_shipping(body: WCExportShippingRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    rz = requests.get(f"{url}/wp-json/wc/v3/shipping/zones", auth=wc_auth, timeout=30)
    rz.raise_for_status()

    result = []
    for zone in rz.json():
        zid = zone["id"]
        rl  = requests.get(f"{url}/wp-json/wc/v3/shipping/zones/{zid}/locations",
                           auth=wc_auth, timeout=30)
        rm  = requests.get(f"{url}/wp-json/wc/v3/shipping/zones/{zid}/methods",
                           auth=wc_auth, timeout=30)
        methods = []
        for m in (rm.json() if rm.ok else []):
            raw_settings = m.get("settings", {})
            if isinstance(raw_settings, list):
                settings = {s["id"]: s.get("value", "") for s in raw_settings}
            else:
                settings = {k: v.get("value", "") for k, v in raw_settings.items()}
            methods.append({
                "method_id": m["method_id"],
                "title":     m.get("title", ""),
                "order":     m.get("order", 1),
                "enabled":   m.get("enabled", True),
                "settings":  settings,
            })
        result.append({
            "id":        zid,
            "name":      zone["name"],
            "order":     zone.get("order", 0),
            "locations": [{"code": l.get("code",""), "type": l.get("type","country")}
                          for l in (rl.json() if rl.ok else [])],
            "methods":   methods,
        })

    return {"zones": result}


@router.post("/wc/import-shipping")
def import_wc_shipping(body: WCImportShippingRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    rz = requests.get(f"{url}/wp-json/wc/v3/shipping/zones", auth=wc_auth, timeout=30)
    rz.raise_for_status()
    existing_by_name = {z["name"]: z["id"] for z in rz.json()}

    results = []
    for zone in body.zones:
        name      = zone["name"]
        source_id = zone["id"]
        try:
            if source_id == 0:
                target_id, status = 0, "updated"
            elif name in existing_by_name and body.overwrite:
                target_id = existing_by_name[name]
                requests.put(f"{url}/wp-json/wc/v3/shipping/zones/{target_id}",
                             auth=wc_auth,
                             json={"name": name, "order": zone.get("order", 0)}, timeout=30)
                status = "updated"
            elif name in existing_by_name:
                results.append({"name": name, "status": "skipped"})
                continue
            else:
                rc = requests.post(f"{url}/wp-json/wc/v3/shipping/zones",
                                   auth=wc_auth,
                                   json={"name": name, "order": zone.get("order", 0)}, timeout=30)
                rc.raise_for_status()
                target_id, status = rc.json()["id"], "created"

            if source_id != 0 and zone.get("locations"):
                requests.put(f"{url}/wp-json/wc/v3/shipping/zones/{target_id}/locations",
                             auth=wc_auth, json=zone["locations"], timeout=30)

            method_results = []
            for m in zone.get("methods", []):
                try:
                    rmc = requests.post(
                        f"{url}/wp-json/wc/v3/shipping/zones/{target_id}/methods",
                        auth=wc_auth,
                        json={"method_id": m["method_id"], "enabled": m.get("enabled", True)},
                        timeout=30,
                    )
                    if rmc.ok:
                        inst = rmc.json()["instance_id"]
                        settings_payload = {k: {"value": v} for k, v in m.get("settings", {}).items()}
                        if settings_payload:
                            requests.put(
                                f"{url}/wp-json/wc/v3/shipping/zones/{target_id}/methods/{inst}",
                                auth=wc_auth,
                                json={"title": m.get("title",""), "settings": settings_payload},
                                timeout=30,
                            )
                        method_results.append({"method_id": m["method_id"], "status": "created"})
                    else:
                        method_results.append({"method_id": m["method_id"], "status": "error",
                                               "error": rmc.text[:120]})
                except Exception as me:
                    method_results.append({"method_id": m["method_id"], "status": "error",
                                           "error": str(me)})

            results.append({"name": name, "status": status, "methods": method_results})
        except Exception as exc:
            results.append({"name": name, "status": "error", "error": str(exc)})

    return {"results": results}


# ── WC store settings (General / Products / Tax / Checkout / Account) ──────────

_STORE_SETTING_GROUPS = {"general", "products", "tax", "shipping", "checkout", "account", "advanced"}

class WCStoreSettingsExportRequest(BaseModel):
    source: str

class WCStoreSettingsImportRequest(BaseModel):
    target: str
    groups: list[dict[str, Any]]


@router.post("/wc/export-store-settings")
def export_wc_store_settings(body: WCStoreSettingsExportRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    r = requests.get(f"{url}/wp-json/wc/v3/settings", auth=wc_auth, timeout=30)
    r.raise_for_status()

    result = []
    for group in r.json():
        if group.get("id") not in _STORE_SETTING_GROUPS:
            continue
        r2 = requests.get(f"{url}/wp-json/wc/v3/settings/{group['id']}", auth=wc_auth, timeout=30)
        if not r2.ok:
            continue
        result.append({
            "id":          group["id"],
            "label":       group.get("label", group["id"]),
            "description": group.get("description", ""),
            "settings": [
                {"id": s["id"], "label": s.get("label",""), "type": s.get("type","text"),
                 "value": s.get("value",""), "description": s.get("tip", s.get("description",""))}
                for s in r2.json() if s.get("type") not in ("title",)
            ],
        })

    return {"groups": result}


@router.post("/wc/import-store-settings")
def import_wc_store_settings(body: WCStoreSettingsImportRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    results = []
    for group in body.groups:
        updated, skipped, errors = 0, 0, []
        for s in group.get("settings", []):
            try:
                r = requests.put(f"{url}/wp-json/wc/v3/settings/{group['id']}/{s['id']}",
                                 auth=wc_auth, json={"value": s["value"]}, timeout=30)
                if r.status_code == 404:
                    skipped += 1
                    continue
                r.raise_for_status()
                updated += 1
            except Exception as exc:
                errors.append(f"{s['id']}: {exc}")
        results.append({"id": group["id"], "label": group.get("label", group["id"]),
                        "updated": updated, "skipped": skipped, "errors": errors})

    return {"results": results}


# ── Email settings ─────────────────────────────────────────────────────────────

class WCEmailSettingsExportRequest(BaseModel):
    source: str

class WCEmailSettingsImportRequest(BaseModel):
    target: str
    groups: list[dict[str, Any]]


@router.post("/wc/export-email-settings")
def export_wc_email_settings(body: WCEmailSettingsExportRequest):
    site = get_site(body.source, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    r = requests.get(f"{url}/wp-json/wc/v3/settings", auth=wc_auth, timeout=30)
    r.raise_for_status()
    all_groups = r.json()

    result = []
    for group in all_groups:
        if not group.get("id", "").startswith("email"):
            continue
        r2 = requests.get(f"{url}/wp-json/wc/v3/settings/{group['id']}", auth=wc_auth, timeout=30)
        if not r2.ok:
            continue
        settings = [
            {
                "id":          s["id"],
                "label":       s.get("label", ""),
                "description": s.get("tip", s.get("description", "")),
                "type":        s.get("type", "text"),
                "value":       s.get("value", ""),
                "options":     s.get("options", {}),
            }
            for s in r2.json()
            if s.get("type") not in ("title",)
        ]
        result.append({
            "id":          group["id"],
            "label":       group.get("label", group["id"]),
            "description": group.get("description", ""),
            "settings":    settings,
        })

    return {"groups": result}


@router.post("/wc/import-email-settings")
def import_wc_email_settings(body: WCEmailSettingsImportRequest):
    site = get_site(body.target, require_wc=True)
    url, wc_auth = site["url"], site["wc_auth"]

    results = []
    for group in body.groups:
        group_id = group["id"]
        updated, skipped, errors = 0, 0, []
        for s in group.get("settings", []):
            try:
                r = requests.put(
                    f"{url}/wp-json/wc/v3/settings/{group_id}/{s['id']}",
                    auth=wc_auth,
                    json={"value": s["value"]},
                    timeout=30,
                )
                if r.status_code == 404:
                    skipped += 1
                    continue
                r.raise_for_status()
                updated += 1
            except Exception as exc:
                errors.append(f"{s['id']}: {exc}")
        results.append({
            "id":      group_id,
            "label":   group.get("label", group_id),
            "updated": updated,
            "skipped": skipped,
            "errors":  errors,
        })

    return {"results": results}
