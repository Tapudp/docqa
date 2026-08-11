import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DocumentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    workspace_id: uuid.UUID
    uploaded_by: uuid.UUID
    filename: str
    file_size: int
    mime_type: str
    status: str
    total_pages: Optional[int]
    parsed_pages: int
    failed_pages: Optional[list[int]]
    chunk_count: int
    error_message: Optional[str]
    tags: list[str]
    created_at: datetime
    updated_at: datetime
