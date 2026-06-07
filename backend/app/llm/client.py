from typing import AsyncIterator
from openai import AsyncOpenAI
from app.config import settings


def _make_client() -> AsyncOpenAI:
    if settings.llm_provider == "ollama":
        return AsyncOpenAI(
            base_url=f"{settings.llm_base_url}/v1",
            api_key="ollama",
            timeout=300.0,  # 5 min — Ollama can be slow on first token
        )
    # anthropic and openai both speak the OpenAI wire format
    # (anthropic via their openai-compat endpoint, openai natively)
    return AsyncOpenAI(
        base_url=settings.llm_base_url if settings.llm_base_url else None,
        api_key=settings.llm_api_key,
    )


async def stream_chat(
    messages: list[dict],
    context_chunks: list[str],
) -> AsyncIterator[str]:
    system_prompt = (
        "You are DocQA, an enterprise document assistant. "
        "Answer the user's question using ONLY the context provided below. "
        "If the answer is not in the context, say so clearly. "
        "Be concise and cite which document/page your answer comes from.\n\n"
        "CONTEXT:\n"
        + "\n\n---\n\n".join(context_chunks)
    )

    client = _make_client()
    stream = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "system", "content": system_prompt}, *messages],
        stream=True,
        temperature=0.2,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
