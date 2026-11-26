from fastapi import APIRouter

from services.boards import router as boards_router

router = APIRouter()

api = APIRouter(prefix="/api")
api.include_router(boards_router)

router.include_router(api)
