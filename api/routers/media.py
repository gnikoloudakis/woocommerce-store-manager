import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from api.dependencies import get_wp_image_adapter
from data_sources.wp_image_adapter import WPImageAdapter

router = APIRouter(prefix="/media", tags=["media"])


@router.get("")
def list_media(wp: WPImageAdapter = Depends(get_wp_image_adapter)):
    return wp.all_media


@router.post("")
async def upload_media(
    file: UploadFile = File(...),
    wp: WPImageAdapter = Depends(get_wp_image_adapter),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        url = wp.upload_image(tmp_path)
        # Refresh media cache
        wp.all_media = wp.list_all_media()
        # Find the newly uploaded item
        for item in wp.all_media:
            if item["url"] == url:
                return item
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)
