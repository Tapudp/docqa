import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import ARRAY, ForeignKey, Integer, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.schema import Index

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)

    # Processing status: received → parsing → parsed → chunking → indexing → ready | error
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")
    total_pages: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    parsed_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_pages: Mapped[Optional[list]] = mapped_column(ARRAY(Integer), nullable=True, default=list)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Tags — TEXT[] with a GIN index for fast array containment/overlap queries.
    # Use @> (contains) or && (overlaps) operators to exploit the index.
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_documents_tags_gin", "tags", postgresql_using="gin"),
    )
