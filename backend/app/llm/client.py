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
        "You are DocQA, an enterprise document assistant.\n\n"
        "RULES — follow these strictly:\n"
        "1. Answer using ONLY the context provided below. Never use prior knowledge as facts.\n"
        "2. The context is grouped by DOCUMENT. Each document section begins with a "
        "line showing its filename.\n"
        "3. Cite the exact document name and page number for every factual claim you make.\n"
        "4. When the same topic appears in multiple documents, you MUST cite every "
        "document that contains relevant information — do not pick just one. Address "
        "each document separately and note agreements, contradictions, or additions.\n"
        "5. Never attribute content from one document to another. Keep each document's "
        "information distinct.\n"
        "6. If the answer is not present in any document, say exactly: "
        "'This information is not available in the uploaded documents.'\n"
        "7. When you see context from multiple DOCUMENT sections, your answer must "
        "reference all sections that are relevant — never silently ignore a document.\n\n"
        "CONTEXT:\n"
        + "\n\n".join(context_chunks)
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
