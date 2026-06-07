from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.config import settings

# NullPool: never reuse connections across asyncio.run() calls.
# Each Celery task gets its own event loop, so pooled connections
# from a previous loop can't be reused — NullPool avoids the hang.
_engine = create_async_engine(settings.database_url, poolclass=NullPool)
CelerySession = async_sessionmaker(_engine, expire_on_commit=False)
