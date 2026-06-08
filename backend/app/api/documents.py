import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.database import get_db
from app.models.document import Document
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.document import DocumentOut
from app.storage import minio_client
from app.worker.tasks import parse_document

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
    "image/tiff",
}

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB


_ROLE_RANK: dict[str, int] = {"viewer": 0, "member": 1, "admin": 2}


async def _require_workspace_role(
    workspace_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    min_role: str = "viewer",
) -> str:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    if _ROLE_RANK.get(membership.role, 0) < _ROLE_RANK.get(min_role, 0):
        raise HTTPException(status_code=403, detail=f"Requires {min_role} role or higher")
    return membership.role


@router.post(
    "/workspaces/{workspace_id}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_workspace_role(workspace_id, current_user, db, min_role="member")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"File type '{content_type}' is not supported.",
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds the 200 MB limit.")

    doc_id = uuid.uuid4()
    storage_key = f"workspaces/{workspace_id}/documents/{doc_id}/{file.filename}"

    await minio_client.upload_object(storage_key, data, content_type)

    doc = Document(
        id=doc_id,
        workspace_id=workspace_id,
        uploaded_by=current_user.id,
        filename=file.filename or "untitled",
        file_size=len(data),
        mime_type=content_type,
        storage_key=storage_key,
        status="received",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Kick off async parsing — runs in the Celery worker
    parse_document.delay(str(doc.id))

    return doc


@router.get("/workspaces/{workspace_id}/documents", response_model=list[DocumentOut])
async def list_documents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_workspace_role(workspace_id, current_user, db, min_role="viewer")

    result = await db.execute(
        select(Document)
        .where(Document.workspace_id == workspace_id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.get("/documents/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await _require_workspace_role(doc.workspace_id, current_user, db)
    return doc


@router.get("/documents/{document_id}/file")
async def get_document_file(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await _require_workspace_role(doc.workspace_id, current_user, db)

    data = await minio_client.download_object(doc.storage_key)
    return Response(
        content=data,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'inline; filename="{doc.filename}"'},
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await _require_workspace_role(doc.workspace_id, current_user, db, min_role="member")

    # Delete from MinIO — ignore if already gone
    try:
        await minio_client.delete_object(doc.storage_key)
        # Also clean up parsed pages if they exist
        pages_key = f"workspaces/{doc.workspace_id}/documents/{doc.id}/pages.json"
        await minio_client.delete_object(pages_key)
    except Exception:
        pass

    await db.delete(doc)
    await db.commit()
