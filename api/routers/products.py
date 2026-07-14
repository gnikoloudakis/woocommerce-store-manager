from fastapi import APIRouter, HTTPException, Depends
from typing import List

from api.dependencies import get_wc_adapter, get_wp_image_adapter, get_create_interactor, reset_wc_adapter
from api.schemas.product import (
    CreateProductRequest,
    UpdateProductRequest,
    CreateVariationRequest,
    UpdateVariationRequest,
    SecretTagsRequest,
    BulkProductItem,
)
from typing import List
from data_sources.wc_products_adapter import WCProductsAdapter
from data_sources.wp_image_adapter import WPImageAdapter
from interactors.create_product_interactor import CreateProductInteractor
from domains.product_domain import Product

router = APIRouter(prefix="/products", tags=["products"])

_product_domain = Product()


def _build_filter_params(status: str, type: str, category: str, tag: str, stock_status: str) -> dict:
    params = {}
    if status:       params["status"] = status
    if type:         params["type"] = type
    if category:     params["category"] = category
    if tag:          params["tag"] = tag
    if stock_status: params["stock_status"] = stock_status
    return params


_WC_SORT_FIELDS = {"id", "title", "price", "date", "popularity", "rating", "menu_order", "slug"}


@router.get("")
def list_products(
    page: int = 1,
    per_page: int = 20,        # pass -1 to fetch every product across all pages
    search: str = "",
    status: str = "",
    type: str = "",
    category: str = "",        # WC category ID
    tag: str = "",             # WC tag ID
    stock_status: str = "",
    orderby: str = "date",
    order: str = "desc",
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    filter_params = _build_filter_params(status, type, category, tag, stock_status)
    sort_params = {}
    if orderby in _WC_SORT_FIELDS:
        sort_params["orderby"] = orderby
        sort_params["order"] = order if order in ("asc", "desc") else "desc"

    # "All" mode — paginate the WC API internally and return everything in one response
    if per_page == -1:
        all_products = []
        wc_page = 1
        total = 0
        while True:
            params = {"page": wc_page, "per_page": 100, **filter_params, **sort_params}
            if search:
                params["search"] = search
            response = wc.wc_api.get("products", params=params)
            response.raise_for_status()
            chunk = response.json()
            if wc_page == 1:
                total = int(response.headers.get("X-WP-Total", 0))
            if not chunk:
                break
            all_products.extend(chunk)
            if len(chunk) < 100:
                break
            wc_page += 1
        return {"products": all_products, "total": total or len(all_products), "total_pages": 1}

    params = {"page": page, "per_page": per_page, **filter_params, **sort_params}
    if search:
        params["search"] = search
    response = wc.wc_api.get("products", params=params)
    response.raise_for_status()
    total = int(response.headers.get("X-WP-Total", 0))
    total_pages = int(response.headers.get("X-WP-TotalPages", 1))
    return {"products": response.json(), "total": total, "total_pages": total_pages}


@router.post("/bulk")
def bulk_create_products(
    body: List[BulkProductItem],
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    wp: WPImageAdapter = Depends(get_wp_image_adapter),
    interactor: CreateProductInteractor = Depends(get_create_interactor),
):
    results = []

    for item in body:
        # Convert validated Pydantic models back to dicts for the existing
        # enrich/create pipeline (which works on dicts).
        p_dict = item.product.model_dump()
        v_dict = item.variations.model_dump()
        product_name = item.product.product_name
        secret_tags = item.product.secret_tags

        try:
            enriched_product = interactor.enrich_product_obj(p_dict)
            enriched_variations = interactor.enrich_variations_obj(v_dict)

            colors = enriched_product.get("colors", [])
            sizes = enriched_product.get("sizes", [])
            base_price = enriched_product.get("base_price") or _product_domain.BASE_PRICE
            _product_domain.BASE_PRICE = base_price

            main_payload = _product_domain.get_main_variable_product_object(
                variable=True,
                product_name=enriched_product["product_name"],
                short_description=enriched_product.get("short_description", ""),
                main_image_ids=enriched_product.get("main_image_ids", []),
                categories=enriched_product.get("categories", []),
                tags=enriched_product.get("tags", []),
                colors=colors,
                sizes=sizes,
                related_ids=enriched_product.get("related_ids", []),
                meta_data=enriched_product.get("meta_data", []),
            )

            # UPSERT: if a product with this name already exists, update it instead of creating a duplicate
            existing = wc.get_product_by_name(product_name)

            if existing:
                # Update only the safely re-importable fields. We deliberately leave alone:
                # - type, sku, attributes (changing these breaks existing variations)
                # - variations (preserves any per-variation pricing/stock the user set)
                # - description (preserves user edits / rich content). set_secret_tags below
                #   reads the current description from the API, so the secret-tag span is updated
                #   without wiping anything else.
                update_payload = {
                    "short_description": main_payload["short_description"],
                    "categories":        main_payload["categories"],
                    "tags":              main_payload["tags"],
                    "images":            main_payload["images"],
                    "meta_data":         main_payload["meta_data"],
                    "related_ids":       main_payload.get("related_ids", []),
                }
                _, updated_product = wc.update_product(existing["id"], update_payload)

                if secret_tags:
                    try:
                        # Re-fetch to get the latest description before rewriting the hidden span
                        current = wc.get_product(existing["id"])
                        wc.set_secret_tags(current, secret_tags)
                    except Exception as e:
                        print(f"⚠️  Failed to set secret tags on {product_name}: {e}")

                # Create variations only if the product currently has none (e.g. first import
                # created the product shell but variations were never generated).
                existing_variations = wc.list_product_variations(existing["id"])
                variations_created = 0
                if not existing_variations:
                    variation_objects = _product_domain._get_all_variation_objects(
                        base_sku=existing["sku"],
                        variation_image_mapping=enriched_variations.get("variation_image_mapping", {}),
                        price_overrides=enriched_variations.get("price_overrides", {}),
                        sale_prices=enriched_variations.get("sale_prices", {}),
                        stock_quantities=enriched_variations.get("stock_quantities", {}),
                        colors=colors,
                        sizes=sizes,
                    )
                    for var in variation_objects:
                        interactor.create_variation(product_id=existing["id"], variation_payload=var)
                    variations_created = len(variation_objects)

                results.append({
                    "product_name": product_name,
                    "status": "updated",
                    "product_id": existing["id"],
                    "secret_tags_count": len(secret_tags),
                    "variations_count": variations_created,
                    "note": "Variations created" if variations_created else "Variations preserved",
                })
                continue

            # CREATE PATH — product didn't exist
            product_result = interactor.create_product(main_payload)
            if not product_result:
                results.append({"product_name": product_name, "status": "error", "reason": "creation failed"})
                continue

            if secret_tags:
                try:
                    wc.set_secret_tags(product_result, secret_tags)
                except Exception as e:
                    print(f"⚠️  Failed to set secret tags on {product_name}: {e}")

            variation_objects = _product_domain._get_all_variation_objects(
                base_sku=product_result["sku"],
                variation_image_mapping=enriched_variations.get("variation_image_mapping", {}),
                price_overrides=enriched_variations.get("price_overrides", {}),
                sale_prices=enriched_variations.get("sale_prices", {}),
                stock_quantities=enriched_variations.get("stock_quantities", {}),
                colors=colors,
                sizes=sizes,
            )
            for var in variation_objects:
                interactor.create_variation(product_id=product_result["id"], variation_payload=var)

            results.append({
                "product_name": product_name,
                "status": "created",
                "product_id": product_result["id"],
                "variations_count": len(variation_objects),
                "secret_tags_count": len(secret_tags),
            })

        except Exception as e:
            results.append({"product_name": product_name, "status": "error", "reason": str(e)})

    reset_wc_adapter(wc)
    return results


@router.get("/categories")
def list_categories(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    # Serve the adapter's cached list (populated on init, invalidated by
    # reset_wc_adapter after any category mutation) — same as /tags. Avoids
    # re-fetching every category page from WooCommerce on every request.
    if not getattr(wc, "all_categories", None):
        wc.all_categories = wc._list_all_categories()
    return wc.all_categories


@router.post("/categories")
def create_category(body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.post("products/categories", body)
    r.raise_for_status()
    reset_wc_adapter(wc)
    return r.json()


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.put(f"products/categories/{cat_id}", body)
    r.raise_for_status()
    reset_wc_adapter(wc)
    return r.json()


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.delete(f"products/categories/{cat_id}", params={"force": True})
    r.raise_for_status()
    reset_wc_adapter(wc)
    return {"deleted": True, "id": cat_id}


@router.get("/tags")
def list_tags(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    return wc.all_tags


@router.post("/tags")
def create_tag(body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.post("products/tags", body)
    r.raise_for_status()
    reset_wc_adapter(wc)
    return r.json()


@router.put("/tags/{tag_id}")
def update_tag(tag_id: int, body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.put(f"products/tags/{tag_id}", body)
    r.raise_for_status()
    reset_wc_adapter(wc)
    return r.json()


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.delete(f"products/tags/{tag_id}", params={"force": True})
    r.raise_for_status()
    reset_wc_adapter(wc)
    return {"deleted": True, "id": tag_id}


@router.get("/attributes")
def list_attributes(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    page, results = 1, []
    while True:
        r = wc.wc_api.get("products/attributes", params={"page": page, "per_page": 100})
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        results.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    return results


@router.post("/attributes")
def create_attribute(body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.post("products/attributes", body)
    r.raise_for_status()
    return r.json()


@router.put("/attributes/{attr_id}")
def update_attribute(attr_id: int, body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.put(f"products/attributes/{attr_id}", body)
    r.raise_for_status()
    return r.json()


@router.delete("/attributes/{attr_id}")
def delete_attribute(attr_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.delete(f"products/attributes/{attr_id}", params={"force": True})
    r.raise_for_status()
    return {"deleted": True, "id": attr_id}


@router.get("/attributes/{attr_id}/terms")
def list_attribute_terms(attr_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    page, results = 1, []
    while True:
        r = wc.wc_api.get(f"products/attributes/{attr_id}/terms", params={"page": page, "per_page": 100})
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        results.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    return results


@router.post("/attributes/{attr_id}/terms")
def create_attribute_term(attr_id: int, body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.post(f"products/attributes/{attr_id}/terms", body)
    r.raise_for_status()
    return r.json()


@router.put("/attributes/{attr_id}/terms/{term_id}")
def update_attribute_term(attr_id: int, term_id: int, body: dict, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.put(f"products/attributes/{attr_id}/terms/{term_id}", body)
    r.raise_for_status()
    return r.json()


@router.delete("/attributes/{attr_id}/terms/{term_id}")
def delete_attribute_term(attr_id: int, term_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    r = wc.wc_api.delete(f"products/attributes/{attr_id}/terms/{term_id}", params={"force": True})
    r.raise_for_status()
    return {"deleted": True, "id": term_id}


@router.get("/image-audit")
def image_audit(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    import re
    from concurrent.futures import ThreadPoolExecutor
    numeric_re = re.compile(r'^\d+(-\d+)+\.(jpg|jpeg|png|webp|gif)$', re.IGNORECASE)

    r0 = wc.wc_api.get("products", params={"page": 1, "per_page": 100, "status": "any"})
    r0.raise_for_status()
    total_pages = int(r0.headers.get("X-WP-TotalPages", 1))
    all_products = list(r0.json())

    def _fetch(page):
        r = wc.wc_api.get("products", params={"page": page, "per_page": 100, "status": "any"})
        r.raise_for_status()
        return r.json()

    if total_pages > 1:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for chunk in ex.map(_fetch, range(2, total_pages + 1)):
                all_products.extend(chunk)

    flagged = []
    for p in all_products:
        bad = [img["src"].split("/")[-1].split("?")[0]
               for img in p.get("images", [])
               if numeric_re.match(img.get("src", "").split("/")[-1].split("?")[0])]
        if bad:
            flagged.append({"id": p["id"], "name": p["name"], "images": bad})

    return {"total_scanned": len(all_products), "flagged_count": len(flagged), "products": flagged}


@router.get("/{product_id}")
def get_product(product_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        product = wc.get_product(product_id)
        return product
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("")
def create_product(
    body: CreateProductRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    wp: WPImageAdapter = Depends(get_wp_image_adapter),
    interactor: CreateProductInteractor = Depends(get_create_interactor),
):
    # Build categories/tags as {id: slug} then enrich to WC IDs
    product_obj = {
        "product_name": body.name,
        "short_description": body.short_description,
        "categories": [{"id": c} for c in body.categories],
        "tags": [{"id": t} for t in body.tags],
        "main_image_ids": body.main_image_ids,
        "colors": body.colors,
        "sizes": body.sizes,
        "meta_data": body.meta_data,
    }

    try:
        enriched = interactor.enrich_product_obj(product_obj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    main_product_payload = _product_domain.get_main_variable_product_object(
        variable=(body.type == "variable"),
        product_name=enriched["product_name"],
        short_description=enriched["short_description"],
        main_image_ids=enriched["main_image_ids"],
        categories=enriched["categories"],
        tags=enriched.get("tags", []),
        colors=enriched["colors"],
        sizes=enriched["sizes"],
        price=body.regular_price if body.type == "simple" else None,
        regular_price=body.regular_price if body.type == "simple" else None,
        related_ids=body.related_ids,
        meta_data=enriched.get("meta_data", []),
    )

    product_result = interactor.create_product(main_product_payload)
    if not product_result:
        raise HTTPException(status_code=409, detail="Product already exists or creation failed")

    if body.type == "variable" and body.colors and body.sizes:
        variations_data = {
            "variation_image_mapping": body.variation_image_mapping,
            "price_overrides": body.price_overrides,
            "sale_prices": body.sale_prices,
            "stock_quantities": {},
        }
        _product_domain.BASE_PRICE = body.base_price
        variation_objects = _product_domain._get_all_variation_objects(
            base_sku=product_result["sku"],
            variation_image_mapping=variations_data["variation_image_mapping"],
            price_overrides=variations_data["price_overrides"],
            sale_prices=variations_data["sale_prices"],
            stock_quantities=variations_data["stock_quantities"],
            colors=body.colors,
            sizes=body.sizes,
        )
        for var in variation_objects:
            interactor.create_variation(product_id=product_result["id"], variation_payload=var)

    # Bust the local product cache so the new product shows up immediately
    reset_wc_adapter(wc)
    return product_result


@router.put("/{product_id}")
def update_product(
    product_id: int,
    body: UpdateProductRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    payload: dict = {}

    if body.name is not None:
        payload["name"] = body.name
    if body.short_description is not None:
        payload["short_description"] = body.short_description
    if body.status is not None:
        payload["status"] = body.status
    if body.regular_price is not None:
        payload["regular_price"] = body.regular_price
    if body.sale_price is not None:
        payload["sale_price"] = body.sale_price
    if body.meta_data is not None:
        payload["meta_data"] = body.meta_data

    if body.categories is not None:
        enriched_cats = []
        for item in body.categories:
            if isinstance(item, dict) and "id" in item:
                enriched_cats.append({"id": item["id"]})
            else:
                try:
                    enriched_cats.append({"id": wc.get_category_id_by_name(str(item))})
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
        payload["categories"] = enriched_cats

    if body.tags is not None:
        enriched_tags = []
        for item in body.tags:
            if isinstance(item, dict) and "id" in item:
                enriched_tags.append({"id": item["id"]})
            else:
                try:
                    enriched_tags.append({"id": wc.get_tag_id_by_name(str(item))})
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
        payload["tags"] = enriched_tags

    if body.main_image_ids is not None:
        payload["images"] = [{"id": img_id} for img_id in body.main_image_ids]

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        _, updated = wc.update_product(product_id, payload)
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{product_id}/relink-images")
def relink_images(
    product_id: int,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
    wp: WPImageAdapter = Depends(get_wp_image_adapter),
):
    """
    Replace any external image src URLs on this product with local media IDs
    matched by filename. Prevents WooCommerce from sideloading on every update.
    """
    product = wc.get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    import re as _re
    media_by_filename = {m["url"].split("/")[-1].split("?")[0]: m["id"] for m in wp.all_media}
    # Also index by base name (strip WordPress's -N dedup suffix: "1-1.jpg" → "1.jpg")
    dedup_re = _re.compile(r'^(.*)-\d+(\.[^.]+)$')
    media_by_base: dict[str, int] = {}
    for fname, fid in media_by_filename.items():
        m = dedup_re.match(fname)
        if m:
            base = m.group(1) + m.group(2)
            media_by_base.setdefault(base, fid)

    local_host = wc.wc_api.url.rstrip("/").split("//")[-1].split("/")[0]

    fixed, skipped = [], []
    new_images = []
    changed = False
    for img in product.get("images", []):
        src = img.get("src", "")
        if not src:
            continue
        filename = src.split("/")[-1].split("?")[0]
        img_host = src.split("//")[-1].split("/")[0]

        # Already local — check if it's a -N duplicate we can improve
        if img_host == local_host:
            m = dedup_re.match(filename)
            if m:
                base = m.group(1) + m.group(2)
                better_id = media_by_filename.get(base)
                if better_id and better_id != img.get("id"):
                    new_images.append({"id": better_id})
                    fixed.append(f"{filename} → {base}")
                    changed = True
                    continue
            new_images.append({"id": img["id"]})
            continue

        # External URL — resolve to local
        local_id = media_by_filename.get(filename) or media_by_base.get(filename)
        if local_id:
            new_images.append({"id": local_id})
            fixed.append(filename)
            changed = True
        else:
            skipped.append(filename)

    if changed:
        r = wc.wc_api.put(f"products/{product_id}", {"images": new_images})
        r.raise_for_status()

    return {"fixed": fixed, "skipped": skipped}


@router.delete("/{product_id}")
def delete_product(product_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        wc.delete_product(product_id)
        reset_wc_adapter(wc)
        return {"deleted": True, "id": product_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{product_id}/secret-tags")
def get_secret_tags(product_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        product = wc.get_product(product_id)
        return {"tags": wc.get_secret_tags(product)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{product_id}/secret-tags")
def set_secret_tags(
    product_id: int,
    body: SecretTagsRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    try:
        product = wc.get_product(product_id)
        wc.set_secret_tags(product, body.tags)
        return {"tags": body.tags}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{product_id}/variations")
def list_variations(product_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        return wc.list_product_variations(product_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{product_id}/variations")
def create_variation(
    product_id: int,
    body: CreateVariationRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    import string, random
    sku = body.sku or f"VAR-{body.size[:1].upper()}{body.color[:1].upper()}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=4))}"
    payload = {
        "regular_price": body.regular_price,
        "sku": sku,
        "attributes": [
            {"id": 0, "name": "Size", "slug": "size", "option": body.size},
            {"id": 0, "name": "Color", "slug": "color", "option": body.color},
        ],
        "dimensions": {},
    }
    if body.sale_price:
        payload["sale_price"] = body.sale_price
    if body.image_id:
        payload["image"] = {"id": body.image_id}

    try:
        success, variation = wc.create_product_variation(product_id, payload)
        if not success:
            raise HTTPException(status_code=409, detail="Variation creation failed")
        return variation
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{product_id}/variations/{variation_id}")
def update_variation(
    product_id: int,
    variation_id: int,
    body: UpdateVariationRequest,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    payload: dict = {}
    if body.regular_price is not None:
        payload["regular_price"] = body.regular_price
    if body.sale_price is not None:
        payload["sale_price"] = body.sale_price
    if body.image_id is not None:
        payload["image"] = {"id": body.image_id}
    if body.status is not None:
        payload["status"] = body.status

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        _, updated = wc.update_product_variation(product_id, variation_id, payload)
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{product_id}/variations/{variation_id}")
def delete_variation(
    product_id: int,
    variation_id: int,
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    try:
        wc.delete_product_variation(product_id, variation_id)
        return {"deleted": True, "id": variation_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
