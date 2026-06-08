from typing import AsyncIterator, TypedDict

from openai import AsyncOpenAI

from app.config import settings


class LLMConfig(TypedDict, total=False):
    provider: str
    base_url: str
    model: str
    api_key: str


def _make_client(cfg: LLMConfig) -> AsyncOpenAI:
    provider = cfg.get("provider") or settings.llm_provider
    base_url = cfg.get("base_url") or settings.llm_base_url
    api_key = cfg.get("api_key") or settings.llm_api_key or "ollama"

    if provider == "ollama":
        return AsyncOpenAI(
            base_url=f"{base_url}/v1",
            api_key="ollama",
            timeout=300.0,
        )
    return AsyncOpenAI(
        base_url=base_url or None,
        api_key=api_key,
        timeout=120.0,
    )


async def stream_chat(
    messages: list[dict],
    context_chunks: list[str],
    llm_config: LLMConfig | None = None,
) -> AsyncIterator[str]:
    cfg: LLMConfig = llm_config or {}
    model = cfg.get("model") or settings.llm_model

    system_prompt = (
        "You are DocQA, an enterprise document assistant. "
        "Answer the user's question using ONLY the context provided below. "
        "If the answer is not in the context, say so clearly. "
        "Be concise and cite which document/page your answer comes from.\n\n"
        "CONTEXT:\n"
        + "\n\n---\n\n".join(context_chunks)
    )

    client = _make_client(cfg)
    stream = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, *messages],
        stream=True,
        temperature=0.2,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
