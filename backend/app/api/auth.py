from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.schemas.workspace import slugify

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not settings.allow_registration:
        # Check if any user exists — allow the very first account even when closed
        count = await db.execute(select(User).limit(1))
        if count.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Open registration is disabled. Contact your administrator.",
            )

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # First user ever becomes admin; subsequent self-registrations are members
    user_count_result = await db.execute(select(User).limit(1))
    is_first_user = user_count_result.scalar_one_or_none() is None

    user = User(
        email=body.email,
        display_name=body.display_name or body.email.split("@")[0],
        password_hash=hash_password(body.password),
        role="admin" if is_first_user else "member",
    )
    db.add(user)
    await db.flush()

    if is_first_user:
        # Give the first user a default workspace to get started
        workspace_name = f"{user.display_name}'s Workspace"
        workspace = Workspace(
            name=workspace_name,
            slug=_unique_slug(slugify(workspace_name)),
            description="My default workspace",
            created_by=user.id,
        )
        db.add(workspace)
        await db.flush()
        member = WorkspaceMember(user_id=user.id, workspace_id=workspace.id, role="admin")
        db.add(member)

    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


def _unique_slug(base: str) -> str:
    """Append a short random suffix to avoid collisions on concurrent registrations."""
    import uuid
    return f"{base}-{str(uuid.uuid4())[:8]}"
