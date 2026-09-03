import io
import logging
import uuid as _uuid
import zipfile
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_admin
from app.auth.password import hash_password
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.system_config import SystemConfig
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.document import DocumentOut
from app.schemas.workspace import WorkspaceOut
from app.storage import minio_client
from app.worker.tasks import parse_document

_MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024  # 10 GB (admin bulk upload)
_MIME_MAP: dict[str, str] = {
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "png":  "image/png",
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "tiff": "image/tiff",
}
_ALLOWED_MIME_TYPES = set(_MIME_MAP.values())

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
    provider = cfg.get("provider") or settings.llm_provider

    if not base_url:
        raise HTTPException(status_code=400, detail="No LLM base URL configured")

    server_url = base_url.rstrip("/")

    # vLLM (and any plain OpenAI-compatible server) lists models at /v1/models;
    # Ollama has its native /api/tags with richer metadata.
    if provider == "vllm":
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(f"{server_url}/v1/models")
                resp.raise_for_status()
                data = resp.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail=f"Cannot reach vLLM at {server_url}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"vLLM error: {e.response.status_code}")
        except Exception as e:
            logger.exception("vLLM models error: %s", e)
            raise HTTPException(status_code=502, detail=str(e))

        return [
            OllamaModel(name=m["id"], size=0, family=None, parameter_size=None)
            for m in data.get("data", [])
        ]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{server_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Cannot reach Ollama at {server_url}")
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


# ── Retrieval config endpoints ────────────────────────────────

class RetrievalConfigIn(BaseModel):
    top_k: int = 15
    inner_k_multiplier: int = 5
    chunk_size: int = 1500
    chunk_overlap: int = 300
    multi_query: bool = True


class RetrievalConfigOut(RetrievalConfigIn):
    pass


def _default_retrieval() -> dict:
    return {
        "top_k": 15,
        "inner_k_multiplier": 5,
        "chunk_size": 1500,
        "chunk_overlap": 300,
        "multi_query": True,
    }


@router.get("/retrieval/config", response_model=RetrievalConfigOut)
async def get_retrieval_config(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    row = await db.get(SystemConfig, "retrieval")
    cfg = {**_default_retrieval(), **(row.value if row else {})}
    return RetrievalConfigOut(**cfg)


@router.patch("/retrieval/config", response_model=RetrievalConfigOut)
async def update_retrieval_config(
    body: RetrievalConfigIn,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.top_k < 1 or body.top_k > 200:
        raise HTTPException(status_code=422, detail="top_k must be between 1 and 200")
    if body.inner_k_multiplier < 1 or body.inner_k_multiplier > 50:
        raise HTTPException(status_code=422, detail="inner_k_multiplier must be between 1 and 50")
    if body.chunk_size < 200 or body.chunk_size > 8000:
        raise HTTPException(status_code=422, detail="chunk_size must be between 200 and 8000")
    if body.chunk_overlap < 0 or body.chunk_overlap >= body.chunk_size:
        raise HTTPException(status_code=422, detail="chunk_overlap must be less than chunk_size")

    new_value = body.model_dump()
    row = await db.get(SystemConfig, "retrieval")
    if row:
        row.value = new_value
        row.updated_at = datetime.now(timezone.utc)
        row.updated_by = admin.id
    else:
        row = SystemConfig(key="retrieval", value=new_value, updated_by=admin.id)
        db.add(row)

    await db.commit()
    await db.refresh(row)
    return RetrievalConfigOut(**row.value)


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


# ── Bulk upload ───────────────────────────────────────────────

@router.get("/workspaces", response_model=list[WorkspaceOut])
async def list_all_workspaces(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """All workspaces — admin sees every workspace regardless of membership."""
    result = await db.execute(
        select(Workspace).where(Workspace.is_active == True).order_by(Workspace.created_at.asc())  # noqa: E712
    )
    out = []
    for ws in result.scalars().all():
        ws_out = WorkspaceOut.model_validate(ws)
        ws_out.member_role = "admin"
        out.append(ws_out)
    return out


@router.post("/workspaces/{workspace_id}/documents", response_model=DocumentOut, status_code=201)
async def admin_upload_document(
    workspace_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Upload a single file to any workspace — bypasses membership check."""
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=422, detail=f"File type '{content_type}' is not supported.")

    data = await file.read()
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds the 200 MB limit.")

    doc_id = _uuid.uuid4()
    storage_key = f"workspaces/{workspace_id}/documents/{doc_id}/{file.filename}"
    await minio_client.upload_object(storage_key, data, content_type)

    doc = Document(
        id=doc_id,
        workspace_id=_uuid.UUID(workspace_id),
        uploaded_by=admin.id,
        filename=file.filename or "untitled",
        file_size=len(data),
        mime_type=content_type,
        storage_key=storage_key,
        status="received",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    parse_document.delay(str(doc.id))
    return doc


class BulkFileResult(BaseModel):
    filename: str
    status: str          # "queued" | "skipped" | "error"
    document_id: str | None = None
    reason: str | None = None


@router.post("/workspaces/{workspace_id}/bulk-upload-zip", response_model=list[BulkFileResult])
async def admin_bulk_upload_zip(
    workspace_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Extract a .zip archive and queue every supported file inside it."""
    ws = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=422, detail="File must be a .zip archive.")

    data = await file.read()
    results: list[BulkFileResult] = []

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                if name.endswith("/") or "__MACOSX" in name:
                    continue
                filename = name.split("/")[-1]
                if not filename or filename.startswith("."):
                    continue

                ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
                content_type = _MIME_MAP.get(ext)
                if not content_type:
                    results.append(BulkFileResult(filename=filename, status="skipped", reason=f"Unsupported format .{ext}"))
                    continue

                file_data = zf.read(name)
                if len(file_data) > _MAX_FILE_SIZE:
                    results.append(BulkFileResult(filename=filename, status="error", reason="Exceeds 200 MB limit"))
                    continue

                try:
                    doc_id = _uuid.uuid4()
                    storage_key = f"workspaces/{workspace_id}/documents/{doc_id}/{filename}"
                    await minio_client.upload_object(storage_key, file_data, content_type)

                    doc = Document(
                        id=doc_id,
                        workspace_id=_uuid.UUID(workspace_id),
                        uploaded_by=admin.id,
                        filename=filename,
                        file_size=len(file_data),
                        mime_type=content_type,
                        storage_key=storage_key,
                        status="received",
                    )
                    db.add(doc)
                    await db.flush()
                    parse_document.delay(str(doc.id))
                    results.append(BulkFileResult(filename=filename, status="queued", document_id=str(doc_id)))
                except Exception as exc:
                    results.append(BulkFileResult(filename=filename, status="error", reason=str(exc)))

    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Invalid or corrupted .zip file.")

    await db.commit()
    return results


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


# ── Bulk tag import via Excel ─────────────────────────────────
# Excel format: row 1 = headers (ignored), col A = filename,
# col B onward = tag values. One file per row, multiple tags per row.
# Empty cells are skipped. Tags are lowercased and deduplicated.

class TagImportResult(BaseModel):
    filename: str
    status: str        # "updated" | "not_found" | "error"
    tags: list[str] = []
    reason: str | None = None


_ROLE_RANK: dict[str, int] = {"viewer": 0, "member": 1, "admin": 2}


@router.post("/workspaces/{workspace_id}/documents/tags/bulk", response_model=list[TagImportResult])
async def admin_bulk_import_tags(
    workspace_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an Excel (.xlsx) file to set tags in bulk.
    Requires global admin OR workspace-level admin role.

    Format:
      - Row 1: header row (skipped)
      - Column A: filename (must match an existing document in this workspace)
      - Column B+: tag values (one tag per cell; empty cells ignored)

    Tags are lowercased, stripped, and deduplicated before saving.
    Existing tags on a document are replaced entirely.
    """
    import openpyxl  # noqa: PLC0415

    # Allow global admins or workspace-level admins
    if current_user.role != "admin":
        membership = await db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == _uuid.UUID(workspace_id),
                WorkspaceMember.user_id == current_user.id,
            )
        )
        if not membership or _ROLE_RANK.get(membership.role, 0) < _ROLE_RANK["admin"]:
            raise HTTPException(status_code=403, detail="Workspace admin role required")

    ws_obj = await db.get(Workspace, _uuid.UUID(workspace_id))
    if not ws_obj:
        raise HTTPException(status_code=404, detail="Workspace not found")

    fname = (file.filename or "").lower()
    if not fname.endswith(".xlsx"):
        raise HTTPException(status_code=422, detail="File must be an .xlsx spreadsheet.")

    data = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws_sheet = wb.active
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read Excel file: {exc}")

    # Build filename → document map for this workspace (case-insensitive key)
    doc_result = await db.execute(
        select(Document).where(Document.workspace_id == _uuid.UUID(workspace_id))
    )
    docs_by_name: dict[str, Document] = {
        d.filename.lower(): d for d in doc_result.scalars().all()
    }

    results: list[TagImportResult] = []
    rows = list(ws_sheet.iter_rows(min_row=2, values_only=True))  # skip header

    for row in rows:
        if not row or row[0] is None:
            continue
        filename = str(row[0]).strip()
        if not filename:
            continue

        # Collect tags from all columns after the first
        raw_tags = [str(cell).strip() for cell in row[1:] if cell is not None and str(cell).strip()]
        normalized = list(dict.fromkeys(t.lower() for t in raw_tags))

        doc = docs_by_name.get(filename.lower())
        if not doc:
            results.append(TagImportResult(filename=filename, status="not_found", reason="No document with this filename in the workspace"))
            continue

        try:
            doc.tags = normalized
            results.append(TagImportResult(filename=filename, status="updated", tags=normalized))
        except Exception as exc:
            results.append(TagImportResult(filename=filename, status="error", reason=str(exc)))

    await db.commit()
    return results
