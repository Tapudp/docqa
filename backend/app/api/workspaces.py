from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_admin
from app.database import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, slugify

router = APIRouter()


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == current_user.id,
            Workspace.is_active == True,  # noqa: E712
        )
        .order_by(Workspace.created_at.asc())
    )
    rows = result.all()

    out = []
    for workspace, role in rows:
        ws_out = WorkspaceOut.model_validate(workspace)
        ws_out.member_role = role
        out.append(ws_out)
    return out


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: WorkspaceCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid

    slug = f"{slugify(body.name)}-{str(_uuid.uuid4())[:8]}"
    workspace = Workspace(
        name=body.name,
        slug=slug,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(workspace)
    await db.flush()

    member = WorkspaceMember(
        user_id=current_user.id,
        workspace_id=workspace.id,
        role="admin",
    )
    db.add(member)
    await db.commit()
    await db.refresh(workspace)

    ws_out = WorkspaceOut.model_validate(workspace)
    ws_out.member_role = "admin"
    return ws_out


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid

    try:
        ws_id = _uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            Workspace.id == ws_id,
            WorkspaceMember.user_id == current_user.id,
            Workspace.is_active == True,  # noqa: E712
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    workspace, role = row
    ws_out = WorkspaceOut.model_validate(workspace)
    ws_out.member_role = role
    return ws_out
