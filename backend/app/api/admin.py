import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.config import settings
from app.database import get_db
from app.models.system_config import SystemConfig
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class OllamaModel(BaseModel):
    name: str
    size: int
    family: str | None = None
    parameter_size: str | None = None


class LLMConfigIn(BaseModel):
    provider: str           # "ollama" | "openai" | "groq" | etc.
    base_url: str = ""
    model: str
    api_key: str = ""


class LLMConfigOut(BaseModel):
    provider: str
    base_url: str
    model: str
    api_key: str            # returned masked


# ── Helpers ───────────────────────────────────────────────────

def _default_config() -> dict:
    return {
        "provider": settings.llm_provider,
        "base_url": settings.llm_base_url,
        "model": settings.llm_model,
        "api_key": settings.llm_api_key,
    }


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return key[:4] + "•" * (len(key) - 8) + key[-4:]


# ── LLM config endpoints ──────────────────────────────────────

@router.get("/llm/config", response_model=LLMConfigOut)
async def get_llm_config(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    row = await db.get(SystemConfig, "llm")
    cfg = row.value if row else _default_config()
    return LLMConfigOut(
        provider=cfg.get("provider", settings.llm_provider),
        base_url=cfg.get("base_url", settings.llm_base_url),
        model=cfg.get("model", settings.llm_model),
        api_key=_mask_key(cfg.get("api_key", settings.llm_api_key)),
    )


@router.patch("/llm/config", response_model=LLMConfigOut)
async def update_llm_config(
    body: LLMConfigIn,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    row = await db.get(SystemConfig, "llm")
    new_value = {
        "provider": body.provider,
        "base_url": body.base_url,
        "model": body.model,
        "api_key": body.api_key,
    }
    if row:
        # Preserve existing API key if client sent a masked value
        if body.api_key and "•" in body.api_key:
            new_value["api_key"] = row.value.get("api_key", "")
        row.value = new_value
        row.updated_at = datetime.now(timezone.utc)
        row.updated_by = admin.id
    else:
        row = SystemConfig(key="llm", value=new_value, updated_by=admin.id)
        db.add(row)

    await db.commit()
    await db.refresh(row)

    return LLMConfigOut(
        provider=row.value["provider"],
        base_url=row.value["base_url"],
        model=row.value["model"],
        api_key=_mask_key(row.value.get("api_key", "")),
    )


# ── Ollama model discovery ─────────────────────────────────────

@router.get("/llm/models", response_model=list[OllamaModel])
async def list_ollama_models(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    row = await db.get(SystemConfig, "llm")
    cfg = row.value if row else _default_config()
    base_url = cfg.get("base_url") or settings.llm_base_url

    if not base_url:
        raise HTTPException(status_code=400, detail="No Ollama base URL configured")

    ollama_url = base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Cannot reach Ollama at {ollama_url}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e.response.status_code}")
    except Exception as e:
        logger.exception("Ollama tags error: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    models = []
    for m in data.get("models", []):
        details = m.get("details", {})
        models.append(OllamaModel(
            name=m["name"],
            size=m.get("size", 0),
            family=details.get("family"),
            parameter_size=details.get("parameter_size"),
        ))
    return models


# ── User management ───────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    is_active: bool
    created_at: str


class UserRoleUpdate(BaseModel):
    role: str   # "admin" | "member" | "viewer"


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from sqlalchemy import select
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    users = result.scalars().all()
    return [
        UserOut(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    import uuid as _uuid
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, member, or viewer")

    target = await db.get(User, _uuid.UUID(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    target.role = body.role
    await db.commit()
    await db.refresh(target)

    return UserOut(
        id=str(target.id),
        email=target.email,
        display_name=target.display_name,
        role=target.role,
        is_active=target.is_active,
        created_at=target.created_at.isoformat(),
    )
