from fastapi import APIRouter
from api.site_registry import list_sites

router = APIRouter(tags=["sites"])


@router.get("/sites")
def get_sites():
    return list_sites()
