#!/usr/bin/env python3
"""Export blog posts from cranky.cranky.gr and import them to cranky.gr.

Usage:
  python export_import_blog.py export   # fetch posts → blog_export.json
  python export_import_blog.py import   # read blog_export.json → cranky.gr
  python export_import_blog.py          # both steps in sequence
"""

import json
import sys

import requests

from utils.config import Config

# ── Configuration ────────────────────────────────────────────────────────────

SOURCE_URL  = (Config.get_param("CRANKY_CRANKY_URL") or "https://cranky.cranky.gr").rstrip("/")
SOURCE_KEY  = Config.get_param("CRANKY_CRANKY_CONSUMER_KEY")
SOURCE_SEC  = Config.get_param("CRANKY_CRANKY_SECRET")

TARGET_URL  = (Config.get_param("WC_URL") or "https://cranky.gr").rstrip("/")
TARGET_USER = Config.get_param("WP_USER")
TARGET_PASS = Config.get_param("WP_PASSWORD")

EXPORT_FILE = "blog_export.json"

_source_auth = (SOURCE_KEY, SOURCE_SEC) if SOURCE_KEY and SOURCE_SEC else None
_target_auth = (TARGET_USER, TARGET_PASS) if TARGET_USER and TARGET_PASS else None


# ── Low-level helpers ────────────────────────────────────────────────────────

def _wp_get_all(base_url: str, path: str, auth, **extra_params) -> list:
    results, page = [], 1
    while True:
        r = requests.get(
            f"{base_url}/wp-json/wp/v2/{path}",
            auth=auth,
            params={"per_page": 100, "page": page, **extra_params},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        results.extend(batch)
        if len(batch) < 100:
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
    existing = _wp_get_all(base_url, taxonomy, auth, search=name)
    for t in existing:
        if t.get("slug") == slug or t.get("name") == name:
            return t["id"]
    created = _wp_post(base_url, taxonomy, auth, {"name": name, "slug": slug})
    return created["id"]


# ── Export ───────────────────────────────────────────────────────────────────

def export_posts() -> None:
    print(f"Fetching posts from {SOURCE_URL} …")
    posts = _wp_get_all(
        SOURCE_URL, "posts", _source_auth,
        status="any",
    )

    cats_map = {c["id"]: c for c in _wp_get_all(SOURCE_URL, "categories", _source_auth)}
    tags_map = {t["id"]: t for t in _wp_get_all(SOURCE_URL, "tags", _source_auth)}

    for post in posts:
        post["_categories_detail"] = [
            cats_map.get(cid, {"id": cid, "name": str(cid), "slug": str(cid)})
            for cid in post.get("categories", [])
        ]
        post["_tags_detail"] = [
            tags_map.get(tid, {"id": tid, "name": str(tid), "slug": str(tid)})
            for tid in post.get("tags", [])
        ]

    with open(EXPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

    print(f"✅ Exported {len(posts)} posts → {EXPORT_FILE}")


# ── Import ───────────────────────────────────────────────────────────────────

def import_posts() -> None:
    with open(EXPORT_FILE, encoding="utf-8") as f:
        posts = json.load(f)

    print(f"Fetching existing slugs from {TARGET_URL} …")
    existing = _wp_get_all(TARGET_URL, "posts", _target_auth, status="any", _fields="id,slug")
    existing_slugs = {p["slug"] for p in existing}

    created = skipped = errors = 0

    for post in posts:
        slug = post.get("slug", "")

        if slug in existing_slugs:
            print(f"  skip   {slug}")
            skipped += 1
            continue

        cat_ids = []
        for cat in post.get("_categories_detail", []):
            try:
                cat_ids.append(_get_or_create_term(TARGET_URL, _target_auth, "categories", cat["name"], cat["slug"]))
            except Exception as exc:
                print(f"  warn   category '{cat['name']}': {exc}")

        tag_ids = []
        for tag in post.get("_tags_detail", []):
            try:
                tag_ids.append(_get_or_create_term(TARGET_URL, _target_auth, "tags", tag["name"], tag["slug"]))
            except Exception as exc:
                print(f"  warn   tag '{tag['name']}': {exc}")

        payload = {
            "slug":       slug,
            "status":     post.get("status", "draft"),
            "date":       post.get("date"),
            "title":      post["title"]["rendered"],
            "content":    post["content"]["rendered"],
            "excerpt":    post["excerpt"]["rendered"],
            "categories": cat_ids,
            "tags":       tag_ids,
            "format":     post.get("format", "standard"),
        }

        try:
            new_post = _wp_post(TARGET_URL, "posts", _target_auth, payload)
            print(f"  ✅ created #{new_post['id']} — {slug}")
            existing_slugs.add(slug)
            created += 1
        except Exception as exc:
            print(f"  ❌ {slug}: {exc}")
            errors += 1

    print(f"\nDone.  {created} created,  {skipped} skipped,  {errors} errors.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "both"
    if cmd not in ("export", "import", "both"):
        print("Usage: python export_import_blog.py [export|import|both]")
        sys.exit(1)
    if cmd in ("export", "both"):
        export_posts()
    if cmd in ("import", "both"):
        import_posts()
