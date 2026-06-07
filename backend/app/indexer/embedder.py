from typing import Optional

# Lazy singleton — model is downloaded on first use (~50 MB)
_model: Optional[object] = None
MODEL_NAME = "BAAI/bge-small-en-v1.5"


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(MODEL_NAME)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a list of float vectors, one per input text."""
    model = _get_model()
    return [emb.tolist() for emb in model.embed(texts)]
