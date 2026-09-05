import asyncio
import json
import logging
import re
import uuid
from typing import AsyncIterator

# Patterns that indicate the user is chatting, not asking about documents.
_CONVERSATIONAL_RE = re.compile(
    r"^\s*("
    r"hi\b|hello\b|hey\b|greetings?\b|howdy\b|"
    r"good\s+(morning|afternoon|evening|day|night)\b|"
    r"thanks?\b|thank\s+you\b|ty\b|thx\b|cheers\b|"
    r"ok\b|okay\b|got\s+it\b|great\b|nice\b|cool\b|awesome\b|perfect\b|"
    r"bye\b|goodbye\b|see\s+you\b|"
    r"yes\b|no\b|sure\b|nope\b|yep\b|yup\b|"
    r"who\s+are\s+you\b|what\s+are\s+you\b|what\s+can\s+you\s+do\b|"
    r"what\s+is\s+your\s+name\b|what('s|\s+is)\s+your\s+purpose\b|"
    r"how\s+are\s+you\b|how\s+do\s+you\s+do\b|how\s+can\s+you\s+help\b"
    r")\s*[?!.,]?\s*$",
    re.IGNORECASE,
)
_DOMAIN_MARKERS = frozenset({
    "what", "how", "where", "when", "which", "who", "why",
    "compare", "difference", "explain", "describe", "list",
    "find", "show", "tell", "define", "summarize", "summary",
    "rule", "section", "clause", "article", "chapter", "policy",
    "document", "file", "page", "report", "data",
})


_GREETING_PREFIX_RE = re.compile(
    r"^\s*(hi|hello|hey|greetings?|howdy|namaste)[\s,!.]+", re.IGNORECASE
)


def _is_conversational(text: str) -> bool:
    """True for greetings and short chit-chat that don't need RAG."""
    stripped = text.strip()
    if _CONVERSATIONAL_RE.match(stripped):
        return True
    # "hi who are you?" — strip a leading greeting and re-test, so a greeting
    # followed by an identity/chit-chat phrase still bypasses retrieval.
    without_greeting = _GREETING_PREFIX_RE.sub("", stripped)
    if without_greeting != stripped and _CONVERSATIONAL_RE.match(without_greeting):
        return True
    words = without_greeting.split()
    return len(words) <= 4 and not any(w.lower() in _DOMAIN_MARKERS for w in words)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.models.system_config import SystemConfig
from app.models.workspace import Workspace
from app.retrieval.search import hybrid_search, SearchResult
from app.llm.client import stream_chat, LLMConfig

router = APIRouter()


# ── Multi-query retrieval ─────────────────────────────────────

async def retrieve(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    question: str,
    top_k: int = 15,
    inner_k_multiplier: int = 5,
    multi_query: bool = True,
) -> list[SearchResult]:
    """
    When a question references multiple numbered entities (e.g. "compare rules 155
    and 166"), a single embedding splits attention and may miss both chunks.
    We detect this, fire one targeted search per entity in parallel, then merge.
    """
    if multi_query:
        entity_match = re.search(
            r'\b(rule|section|clause|article|chapter|para)s?\b',
            question,
            re.IGNORECASE,
        )
        if entity_match:
            label = entity_match.group(1).lower()
            numbers = re.findall(r'\b(\d{1,4}(?:\.\d+)*)\b', question)
            if len(numbers) >= 2:
                sub_queries = [f"{label} {n}" for n in numbers] + [question]
                per_k = max(top_k // len(sub_queries), 6)
                all_results = await asyncio.gather(*[
                    hybrid_search(db, workspace_id, q, top_k=per_k, inner_k_multiplier=inner_k_multiplier)
                    for q in sub_queries
                ])
                seen: set[str] = set()
                merged: list[SearchResult] = []
                for results in all_results:
                    for r in results:
                        if r.chunk_id not in seen:
                            seen.add(r.chunk_id)
                            merged.append(r)
                return merged[:top_k]

    return await hybrid_search(db, workspace_id, question, top_k=top_k, inner_k_multiplier=inner_k_multiplier)


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


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    conv = await db.get(Conversation, uuid.UUID(conversation_id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user.role != "admin" and str(conv.created_by) != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this conversation")
    await db.delete(conv)
    await db.commit()


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

    # Per-workspace LLM config overrides global system config
    ws = await db.get(Workspace, conv.workspace_id)
    if ws and ws.llm_config:
        llm_config: LLMConfig = ws.llm_config
    else:
        cfg_row = await db.get(SystemConfig, "llm")
        llm_config: LLMConfig = cfg_row.value if cfg_row else {}

    # Load retrieval config (workspace override → global → hardcoded defaults)
    ret_row = await db.get(SystemConfig, "retrieval")
    ret_cfg = ret_row.value if ret_row else {}
    r_top_k = int(ret_cfg.get("top_k", 15))
    r_multiplier = int(ret_cfg.get("inner_k_multiplier", 5))
    r_multi_query = bool(ret_cfg.get("multi_query", True))

    # Skip retrieval for greetings / small talk — no document context needed
    is_conv = _is_conversational(body.question)

    if is_conv:
        hits = []
        citations = []
    else:
        # Retrieve relevant chunks — uses multi-query when question references multiple entities
        hits = await retrieve(
            db, conv.workspace_id, body.question,
            top_k=r_top_k,
            inner_k_multiplier=r_multiplier,
            multi_query=r_multi_query,
        )

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

    # Group chunks by document so the LLM sees clear document boundaries.
    # This prevents cross-document attribution errors (e.g. answering about
    # doc A with content from doc B that happens to have a similar score).
    doc_order: list[str] = []
    doc_map: dict[str, tuple[str, list]] = {}  # doc_id -> (filename, [hits])
    for h in hits:
        if h.document_id not in doc_map:
            doc_map[h.document_id] = (h.filename, [])
            doc_order.append(h.document_id)
        doc_map[h.document_id][1].append(h)

    context_parts: list[str] = []
    for doc_id in doc_order:
        filename, doc_hits = doc_map[doc_id]
        header = f"{'=' * 56}\nDOCUMENT: {filename}\n{'=' * 56}"
        chunk_strs = [
            f"[Page{'s' if len(h.page_numbers) > 1 else ''} "
            f"{', '.join(str(p) for p in h.page_numbers)}]\n{h.text}"
            for h in doc_hits
        ]
        context_parts.append(header + "\n\n" + "\n\n".join(chunk_strs))

    context_chunks = ["\n\n\n".join(context_parts)]

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

            async for token in stream_chat(history, context_chunks, llm_config, conversational=is_conv):
                full_response.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n".encode()

            # Deduplicate retrieved docs by document_id and merge all page numbers.
            # We show every doc that retrieval surfaced — filtering by whether the LLM
            # happened to spell the exact filename is too fragile and drops real sources.
            assistant_content = "".join(full_response)
            seen_docs: set[str] = set()
            final_citations = []
            for c in citations:
                if c["document_id"] not in seen_docs:
                    seen_docs.add(c["document_id"])
                    all_pages = sorted({
                        p for cc in citations
                        if cc["document_id"] == c["document_id"]
                        for p in cc["page_numbers"]
                    })
                    final_citations.append({**c, "page_numbers": all_pages})

            # A "no answer" response cites nothing — showing sources under
            # "this information is not available" just confuses the reader.
            if "not available in the uploaded documents" in assistant_content.lower():
                final_citations = []

            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=assistant_content,
                citations=final_citations,
            )
            db.add(assistant_msg)
            await db.commit()

            yield f"data: {json.dumps({'type': 'done', 'citations': final_citations})}\n\n".encode()

        except Exception as exc:
            logger.exception("stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n".encode()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
