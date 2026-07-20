import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from api.dependencies import get_wp_image_adapter
from data_sources.wp_image_adapter import WPImageAdapter, WPImageError

router = APIRouter(prefix="/media", tags=["media"])


@router.get("")
def list_media(wp: WPImageAdapter = Depends(get_wp_image_adapter)):
    try:
        return wp.ensure_media_loaded(force=True)
    except WPImageError as e:
        # 502: we reached WordPress but it refused / was unreachable — not our bug.
        raise HTTPException(status_code=502, detail=str(e))


@router.post("")
async def upload_media(
    file: UploadFile = File(...),
    wp: WPImageAdapter = Depends(get_wp_image_adapter),
):
    # De-duplicate by filename: if an image with the same name already exists,
    # reuse it instead of letting WordPress create a copy (101.webp -> 101_1.webp).
    try:
        wp.ensure_media_loaded(force=True)
    except WPImageError as e:
        raise HTTPException(status_code=502, detail=str(e))

    existing = wp.find_media_by_filename(file.filename)
    if existing:
        return {**existing, "deduped": True}

    suffix = os.path.splitext(file.filename or "upload.bin")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        url = wp.upload_image(tmp_path, filename=file.filename)
        # Refresh media cache
        wp.all_media = wp.ensure_media_loaded(force=True)
        # Find the newly uploaded item
        for item in wp.all_media:
            if item["url"] == url:
                return item
        return {"url": url}
    except WPImageError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)
