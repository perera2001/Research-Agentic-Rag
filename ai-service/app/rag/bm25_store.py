import re
from threading import Lock, RLock

from rank_bm25 import BM25Okapi

from app.rag.schemas import IndexedChunk, RetrievedChunk
from app.rag.vector_store import get_vector_store


TOKEN_PATTERN = re.compile(r"\b\w+\b", re.UNICODE)
_store_lock = Lock()
_store: "BM25Store | None" = None


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


class BM25Store:
    """RAM-only keyword index; rebuildable from Chroma's saved text and metadata."""

    def __init__(self) -> None:
        self._chunks: dict[str, IndexedChunk] = {}
        self._lock = RLock()

    def rebuild_from_chroma(self) -> int:
        # Run after process startup (or after a restart) before keyword retrieval.
        persisted = get_vector_store().iter_all_chunks()
        with self._lock:
            self._chunks = {chunk.chunk_id: chunk for chunk in persisted}
            return len(self._chunks)

    def add_chunks(self, chunks: list[IndexedChunk]) -> None:
        with self._lock:
            self._chunks.update({chunk.chunk_id: chunk for chunk in chunks})

    def delete_document(self, *, user_id: int, document_id: int) -> None:
        with self._lock:
            self._chunks = {
                chunk_id: chunk
                for chunk_id, chunk in self._chunks.items()
                if not (
                    chunk.metadata["user_id"] == user_id
                    and chunk.metadata["document_id"] == document_id
                )
            }

    def search(
        self,
        query: str,
        *,
        user_id: int,
        document_ids: list[int] | None = None,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        query_tokens = tokenize(query)
        if limit < 1 or not query_tokens or document_ids == []:
            return []

        allowed_documents = set(document_ids) if document_ids is not None else None
        with self._lock:
            candidates = [
                chunk
                for chunk in self._chunks.values()
                if chunk.metadata["user_id"] == user_id
                and (
                    allowed_documents is None
                    or chunk.metadata["document_id"] in allowed_documents
                )
            ]

        tokenized = [tokenize(chunk.text) for chunk in candidates]
        matching = [
            (chunk, tokens)
            for chunk, tokens in zip(candidates, tokenized)
            if set(query_tokens).intersection(tokens)
        ]
        if not matching:
            return []

        corpus = [tokens for _, tokens in matching]
        scores = BM25Okapi(corpus).get_scores(query_tokens)
        ranked = sorted(
            zip(matching, scores),
            key=lambda item: (-float(item[1]), item[0][0].chunk_id),
        )
        return [
            RetrievedChunk(
                chunk_id=chunk.chunk_id,
                text=chunk.text,
                metadata=chunk.metadata,
                score=float(score),
                retrievers=("bm25",),
            )
            for (chunk, _), score in ranked[:limit]
        ]


def get_bm25_store() -> BM25Store:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                store = BM25Store()
                store.rebuild_from_chroma()
                _store = store
    return _store
