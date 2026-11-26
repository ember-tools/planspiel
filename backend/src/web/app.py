from fastapi import APIRouter

router = APIRouter()

api = APIRouter(prefix="/api")

router.include_router(api)
