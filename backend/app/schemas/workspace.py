import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator
import re


class WorkspaceCreate(BaseModel):
    name: str
    description: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Workspace name cannot be empty")
        return v.strip()


class WorkspaceMemberOut(BaseModel):
    user_id: uuid.UUID
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    created_by: uuid.UUID | None
    parser_config: dict
    retrieval_config: dict
    is_active: bool
    created_at: datetime
    member_role: str | None = None  # caller's role in this workspace

    model_config = {"from_attributes": True}


def slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug
