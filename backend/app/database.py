from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables() -> None:
    # Import all models so SQLAlchemy knows about them before create_all
    import app.models.user  # noqa: F401
    import app.models.workspace  # noqa: F401
    import app.models.document  # noqa: F401
    import app.models.chunk  # noqa: F401
    import app.models.conversation  # noqa: F401
    import app.models.system_config  # noqa: F401

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
