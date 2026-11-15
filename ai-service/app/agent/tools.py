from dataclasses import asdict

from langchain.tools import tool

from app.config import get_settings
from app.rag.hybrid_retriever import hybrid_search
from app.rag.schemas import RetrievedChunk


def search_research_papers(
    question: str,
    *,
    user_id: int,
    document_ids: list[int] | None = None,
    limit: int | None = None,
) -> list[RetrievedChunk]:
    """Retrieve only this user's selected papers."""
    if document_ids == []:
        return []
    return hybrid_search(
        question,
        user_id=user_id,
        document_ids=document_ids,
        limit=limit or get_settings().retrieval_top_k,
    )


@tool
def retrieve_research_papers(query: str, user_id: int, document_ids: list[int]) -> dict:
    """Retrieve evidence from the selected user's indexed research papers."""
    if user_id < 1 or not document_ids or any(document_id < 1 for document_id in document_ids):
        return {"chunks": []}
    chunks = search_research_papers(query, user_id=user_id, document_ids=document_ids)
    return {"chunks": [asdict(chunk) for chunk in chunks]}
