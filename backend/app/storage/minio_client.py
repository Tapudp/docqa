import asyncio
import io
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.config import settings

_client: Optional[Minio] = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
    return _client


async def ensure_bucket() -> None:
    loop = asyncio.get_event_loop()
    client = _get_client()
    exists = await loop.run_in_executor(None, client.bucket_exists, settings.minio_bucket)
    if not exists:
        await loop.run_in_executor(None, client.make_bucket, settings.minio_bucket)


async def upload_object(key: str, data: bytes, content_type: str) -> None:
    loop = asyncio.get_event_loop()
    client = _get_client()
    stream = io.BytesIO(data)

    def _put():
        client.put_object(
            settings.minio_bucket,
            key,
            stream,
            length=len(data),
            content_type=content_type,
        )

    await loop.run_in_executor(None, _put)


async def download_object(key: str) -> bytes:
    loop = asyncio.get_event_loop()
    client = _get_client()

    def _get() -> bytes:
        response = client.get_object(settings.minio_bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    return await loop.run_in_executor(None, _get)


async def delete_object(key: str) -> None:
    loop = asyncio.get_event_loop()
    client = _get_client()
    await loop.run_in_executor(None, client.remove_object, settings.minio_bucket, key)
