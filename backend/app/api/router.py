from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.workspaces import router as workspaces_router
from app.api.documents import router as documents_router
from app.api.chat import router as chat_router
from app.api.admin import router as admin_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(workspaces_router, prefix="/workspaces", tags=["workspaces"])
router.include_router(documents_router, tags=["documents"])
router.include_router(chat_router, tags=["chat"])
router.include_router(admin_router, prefix="/admin", tags=["admin"])
