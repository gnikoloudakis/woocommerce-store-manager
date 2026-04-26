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


@router.get("")
def list_products(
    page: int = 1,
    per_page: int = 20,
    search: str = "",
    wc: WCProductsAdapter = Depends(get_wc_adapter),
):
    params = {"page": page, "per_page": per_page}
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
        p = item.product
        v = item.variations
        product_name = p.get("product_name", "(unknown)")

        try:
            enriched_product = interactor.enrich_product_obj(dict(p))
            enriched_variations = interactor.enrich_variations_obj(dict(v)) if v else {}

            colors = enriched_product.get("colors", [])
            sizes = enriched_product.get("sizes", [])
            base_price = enriched_product.get("base_price", _product_domain.BASE_PRICE)
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

            product_result = interactor.create_product(main_payload)
            if not product_result:
                results.append({"product_name": product_name, "status": "skipped", "reason": "already exists"})
                continue

            secret_tags = p.get("secret_tags") or []
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

    reset_wc_adapter()
    return results


@router.get("/categories")
def list_categories(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    return wc.all_categories


@router.get("/tags")
def list_tags(wc: WCProductsAdapter = Depends(get_wc_adapter)):
    return wc.all_tags


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
    reset_wc_adapter()
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
        for slug in body.categories:
            try:
                cat_id = wc.get_category_id_by_name(slug)
                enriched_cats.append({"id": cat_id})
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        payload["categories"] = enriched_cats

    if body.tags is not None:
        enriched_tags = []
        for slug in body.tags:
            try:
                tag_id = wc.get_tag_id_by_name(slug)
                enriched_tags.append({"id": tag_id})
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        payload["tags"] = enriched_tags

    if body.main_image_ids is not None:
        payload["images"] = [{"id": img_id} for img_id in body.main_image_ids]

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        _, updated = wc.update_product(product_id, payload)
        reset_wc_adapter()
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{product_id}")
def delete_product(product_id: int, wc: WCProductsAdapter = Depends(get_wc_adapter)):
    try:
        wc.delete_product(product_id)
        reset_wc_adapter()
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
