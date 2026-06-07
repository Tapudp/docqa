import asyncio
import json
import uuid

from app.worker.celery_app import celery_app
from app.worker.db import CelerySession
from app.models.document import Document
from app.models.chunk import Chunk
from app.storage import minio_client
from app.parser import get_parser
from app.indexer.chunker import chunk_document
from app.indexer.embedder import embed_texts


# ── Parse ────────────────────────────────────────────────────

@celery_app.task(name="app.worker.tasks.parse_document")
def parse_document(document_id: str) -> None:
    asyncio.run(_parse_async(document_id))


async def _parse_async(document_id: str) -> None:
    async with CelerySession() as db:
        doc = await db.get(Document, uuid.UUID(document_id))
        if not doc or doc.status != "received":
            return

        doc.status = "parsing"
        await db.commit()

        try:
            data = await minio_client.download_object(doc.storage_key)
            parser = get_parser(doc.mime_type)
            result = await parser.parse(data, doc.mime_type)

            pages_key = f"workspaces/{doc.workspace_id}/documents/{doc.id}/pages.json"
            await minio_client.upload_object(
                pages_key,
                json.dumps(result.page_texts).encode("utf-8"),
                "application/json",
            )

            doc.status = "parsed"
            doc.total_pages = result.total_pages
            doc.parsed_pages = result.total_pages - len(result.failed_pages)
            doc.failed_pages = result.failed_pages if result.failed_pages else None

        except Exception as exc:
            doc.status = "error"
            doc.error_message = str(exc)[:500]
            await db.commit()
            return

        await db.commit()

    # Chain to indexing after successful parse
    chunk_and_index_document.delay(document_id)


# ── Chunk + Index ─────────────────────────────────────────────

@celery_app.task(name="app.worker.tasks.chunk_and_index_document")
def chunk_and_index_document(document_id: str) -> None:
    asyncio.run(_chunk_and_index_async(document_id))


async def _chunk_and_index_async(document_id: str) -> None:
    async with CelerySession() as db:
        doc = await db.get(Document, uuid.UUID(document_id))
        if not doc or doc.status != "parsed":
            return

        doc.status = "chunking"
        await db.commit()

        try:
            # Download extracted page texts
            pages_key = f"workspaces/{doc.workspace_id}/documents/{doc.id}/pages.json"
            pages_data = await minio_client.download_object(pages_key)
            page_texts: list[str] = json.loads(pages_data.decode("utf-8"))

            # Chunk
            raw_chunks = chunk_document(page_texts)
            if not raw_chunks:
                doc.status = "ready"
                doc.chunk_count = 0
                await db.commit()
                return

            doc.status = "indexing"
            await db.commit()

            # Embed all chunks in one batch
            texts = [c.text for c in raw_chunks]
            embeddings = embed_texts(texts)

            # Persist to DB
            doc_id = uuid.UUID(document_id)
            for chunk, embedding in zip(raw_chunks, embeddings):
                db.add(Chunk(
                    document_id=doc_id,
                    workspace_id=doc.workspace_id,
                    chunk_index=chunk.chunk_index,
                    text=chunk.text,
                    page_numbers=chunk.page_numbers,
                    embedding=embedding,
                    char_count=len(chunk.text),
                ))

            doc.status = "ready"
            doc.chunk_count = len(raw_chunks)
            await db.commit()

        except Exception as exc:
            doc.status = "error"
            doc.error_message = str(exc)[:500]
            await db.commit()
