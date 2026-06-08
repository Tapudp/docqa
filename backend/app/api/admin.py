import logging
import uuid as _uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.auth.password import hash_password
from app.config import settings
from app.database import get_db
from app.models.system_config import SystemConfig
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember

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
    role: str


class UserCreate(BaseModel):
    email: str
    display_name: str = ""
    password: str
    role: str = "member"


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        email=u.email,
        display_name=u.display_name,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at.isoformat(),
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return [_user_out(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, member, or viewer")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        display_name=body.display_name or body.email.split("@")[0],
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _user_out(user)


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
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
    return _user_out(target)


@router.patch("/users/{user_id}/active", response_model=UserOut)
async def set_user_active(
    user_id: str,
    active: bool,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = await db.get(User, _uuid.UUID(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    target.is_active = active
    await db.commit()
    await db.refresh(target)
    return _user_out(target)


# ── Per-workspace LLM config ──────────────────────────────────

@router.get("/workspaces/{workspace_id}/llm", response_model=LLMConfigOut)
async def get_workspace_llm_config(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    cfg = ws.llm_config or {}
    return LLMConfigOut(
        provider=cfg.get("provider", ""),
        base_url=cfg.get("base_url", ""),
        model=cfg.get("model", ""),
        api_key=_mask_key(cfg.get("api_key", "")),
    )


@router.patch("/workspaces/{workspace_id}/llm", response_model=LLMConfigOut)
async def update_workspace_llm_config(
    workspace_id: str,
    body: LLMConfigIn,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    existing_key = (ws.llm_config or {}).get("api_key", "")
    api_key = existing_key if (body.api_key and "•" in body.api_key) else body.api_key

    ws.llm_config = {
        "provider": body.provider,
        "base_url": body.base_url,
        "model": body.model,
        "api_key": api_key,
    }
    await db.commit()
    await db.refresh(ws)
    cfg = ws.llm_config
    return LLMConfigOut(
        provider=cfg["provider"],
        base_url=cfg["base_url"],
        model=cfg["model"],
        api_key=_mask_key(cfg.get("api_key", "")),
    )


@router.delete("/workspaces/{workspace_id}/llm", status_code=204)
async def clear_workspace_llm_config(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.llm_config = {}
    await db.commit()


# ── Workspace membership ───────────────────────────────────────

class MemberOut(BaseModel):
    user_id: str
    email: str
    display_name: str | None
    role: str
    joined_at: str


class MemberAdd(BaseModel):
    user_id: str
    role: str = "member"


class MemberRoleUpdate(BaseModel):
    role: str


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_workspace_members(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == _uuid.UUID(workspace_id))
        .order_by(WorkspaceMember.joined_at.asc())
    )
    return [
        MemberOut(
            user_id=str(m.user_id),
            email=u.email,
            display_name=u.display_name,
            role=m.role,
            joined_at=m.joined_at.isoformat(),
        )
        for m, u in result.all()
    ]


@router.post("/workspaces/{workspace_id}/members", response_model=MemberOut, status_code=201)
async def add_workspace_member(
    workspace_id: str,
    body: MemberAdd,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, member, or viewer")

    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    user = await db.get(User, _uuid.UUID(body.user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == _uuid.UUID(workspace_id),
            WorkspaceMember.user_id == _uuid.UUID(body.user_id),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    member = WorkspaceMember(
        workspace_id=_uuid.UUID(workspace_id),
        user_id=_uuid.UUID(body.user_id),
        role=body.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return MemberOut(
        user_id=str(member.user_id),
        email=user.email,
        display_name=user.display_name,
        role=member.role,
        joined_at=member.joined_at.isoformat(),
    )


@router.patch("/workspaces/{workspace_id}/members/{user_id}", response_model=MemberOut)
async def update_workspace_member_role(
    workspace_id: str,
    user_id: str,
    body: MemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=422, detail="role must be admin, member, or viewer")

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == _uuid.UUID(workspace_id),
            WorkspaceMember.user_id == _uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    user = await db.get(User, _uuid.UUID(user_id))
    member.role = body.role
    await db.commit()
    await db.refresh(member)

    return MemberOut(
        user_id=str(member.user_id),
        email=user.email,
        display_name=user.display_name,
        role=member.role,
        joined_at=member.joined_at.isoformat(),
    )


@router.delete("/workspaces/{workspace_id}/members/{user_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == _uuid.UUID(workspace_id),
            WorkspaceMember.user_id == _uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(member)
    await db.commit()
