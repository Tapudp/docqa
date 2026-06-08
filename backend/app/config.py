from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://docqa:docqa@localhost:5432/docqa"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_days: int = 7

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "docqa"

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"

    # LLM
    llm_provider: str = "ollama"          # ollama | anthropic | openai
    llm_base_url: str = "http://host.docker.internal:11434"
    llm_model: str = "llama3.2"
    llm_api_key: str = ""                 # for anthropic/openai

    # App
    app_name: str = "NpuDen DocQA"
    debug: bool = False
    allow_registration: bool = True   # set False to require admin-created accounts only


settings = Settings()
