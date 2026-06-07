import json
import logging
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.models.workspace import Workspace
from app.retrieval.search import hybrid_search
from app.llm.client import stream_chat

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class ConversationOut(BaseModel):
    id: str
    workspace_id: str
    title: str | None
    created_at: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: list | None
    created_at: str


class ChatRequest(BaseModel):
    question: str


# ── Helpers ───────────────────────────────────────────────────

async def _get_workspace_or_404(workspace_id: str, user_id: uuid.UUID, db: AsyncSession) -> Workspace:
    ws = await db.get(Workspace, uuid.UUID(workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/workspaces/{workspace_id}/conversations", response_model=ConversationOut)
async def create_conversation(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _get_workspace_or_404(workspace_id, user.id, db)
    conv = Conversation(
        workspace_id=uuid.UUID(workspace_id),
        created_by=user.id,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationOut(
        id=str(conv.id),
        workspace_id=str(conv.workspace_id),
        title=conv.title,
        created_at=conv.created_at.isoformat(),
    )


@router.get("/workspaces/{workspace_id}/conversations", response_model=list[ConversationOut])
async def list_conversations(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _get_workspace_or_404(workspace_id, user.id, db)
    result = await db.execute(
        select(Conversation)
        .where(Conversation.workspace_id == uuid.UUID(workspace_id))
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()
    return [
        ConversationOut(
            id=str(c.id),
            workspace_id=str(c.workspace_id),
            title=c.title,
            created_at=c.created_at.isoformat(),
        )
        for c in convs
    ]


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    conv = await db.get(Conversation, uuid.UUID(conversation_id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == uuid.UUID(conversation_id))
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        MessageOut(
            id=str(m.id),
            conversation_id=str(m.conversation_id),
            role=m.role,
            content=m.content,
            citations=m.citations,
            created_at=m.created_at.isoformat(),
        )
        for m in msgs
    ]


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    conversation_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    conv = await db.get(Conversation, uuid.UUID(conversation_id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=body.question,
    )
    db.add(user_msg)
    await db.commit()

    # Auto-title on first message
    if not conv.title:
        conv.title = body.question[:80]
        await db.commit()

    # Retrieve relevant chunks
    hits = await hybrid_search(db, conv.workspace_id, body.question)

    citations = [
        {
            "chunk_id": h.chunk_id,
            "document_id": h.document_id,
            "filename": h.filename,
            "page_numbers": h.page_numbers,
            "snippet": h.text[:200],
        }
        for h in hits
    ]

    context_chunks = [
        f"[{h.filename}, p.{','.join(str(p) for p in h.page_numbers)}]\n{h.text}"
        for h in hits
    ]

    # Load conversation history (last 10 exchanges)
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.asc())
        .limit(20)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in history_result.scalars().all()
    ]

    async def event_stream() -> AsyncIterator[bytes]:
        full_response = []
        try:
            yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n".encode()

            async for token in stream_chat(history, context_chunks):
                full_response.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n".encode()

            # Filter citations to only docs the LLM actually referenced
            assistant_content = "".join(full_response)
            content_lower = assistant_content.lower()
            seen_docs: set[str] = set()
            final_citations = []
            for c in citations:
                stem = c["filename"].rsplit(".", 1)[0].lower()
                if stem in content_lower or c["filename"].lower() in content_lower:
                    if c["document_id"] not in seen_docs:
                        seen_docs.add(c["document_id"])
                        # Merge all page numbers retrieved for this doc
                        all_pages = sorted({
                            p for cc in citations
                            if cc["document_id"] == c["document_id"]
                            for p in cc["page_numbers"]
                        })
                        final_citations.append({**c, "page_numbers": all_pages})

            # Fallback: if LLM cited no known doc, keep top result
            if not final_citations and citations:
                final_citations = [citations[0]]

            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=assistant_content,
                citations=final_citations,
            )
            db.add(assistant_msg)
            await db.commit()

            yield f"data: {json.dumps({'type': 'done'})}\n\n".encode()

        except Exception as exc:
            logger.exception("stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n".encode()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
