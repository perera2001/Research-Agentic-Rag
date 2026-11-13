from app.config import get_settings
from app.rag.bm25_store import get_bm25_store
from app.rag.schemas import RetrievedChunk
from app.rag.vector_store import get_vector_store


RRF_OFFSET = 60


class HybridRetriever:
    def search(
        self,
        query: str,
        *,
        user_id: int,
        document_ids: list[int] | None = None,
        limit: int | None = None,
    ) -> list[RetrievedChunk]:
        top_k = limit if limit is not None else get_settings().retrieval_top_k
        if top_k < 1 or document_ids == [] or not query.strip():
            return []

        candidate_limit = top_k * 2
        vector_results = get_vector_store().search(
            query,
            user_id=user_id,
            document_ids=document_ids,
            limit=candidate_limit,
        )
        keyword_results = get_bm25_store().search(
            query,
            user_id=user_id,
            document_ids=document_ids,
            limit=candidate_limit,
        )

        merged: dict[str, tuple[RetrievedChunk, float, set[str]]] = {}
        for source, results in (("vector", vector_results), ("bm25", keyword_results)):
            for rank, chunk in enumerate(results, start=1):
                previous = merged.get(chunk.chunk_id)
                score = 1.0 / (RRF_OFFSET + rank)
                if previous is None:
                    merged[chunk.chunk_id] = (chunk, score, {source})
                else:
                    original, previous_score, sources = previous
                    merged[chunk.chunk_id] = (original, previous_score + score, sources | {source})

        ranked = sorted(
            merged.values(),
            key=lambda item: (-item[1], item[0].chunk_id),
        )
        return [
            RetrievedChunk(
                chunk_id=chunk.chunk_id,
                text=chunk.text,
                metadata=chunk.metadata,
                score=score,
                retrievers=tuple(sorted(sources)),
            )
            for chunk, score, sources in ranked[:top_k]
        ]


def hybrid_search(
    query: str,
    *,
    user_id: int,
    document_ids: list[int] | None = None,
    limit: int | None = None,
) -> list[RetrievedChunk]:
    return HybridRetriever().search(
        query,
        user_id=user_id,
        document_ids=document_ids,
        limit=limit,
    )
