from app.config import get_settings
from app.rag.compressor import compress_chunks
from app.rag.hybrid_retriever import hybrid_search
from app.rag.schemas import RetrievedChunk


def search_research_papers(
    question: str,
    *,
    user_id: int,
    document_ids: list[int] | None = None,
    limit: int | None = None,
) -> list[RetrievedChunk]:
    """Retrieve only this user's selected papers and compress their evidence."""
    if document_ids == []:
        return []
    chunks = hybrid_search(
        question,
        user_id=user_id,
        document_ids=document_ids,
        limit=limit or get_settings().retrieval_top_k,
    )
    return compress_chunks(question, chunks)
