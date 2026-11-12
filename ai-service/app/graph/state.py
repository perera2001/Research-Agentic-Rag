from typing import Literal, TypedDict

from app.internal.schemas import AvailableDocument, ChatMessage, ChatSource
from app.rag.schemas import RetrievedChunk


class ResearchState(TypedDict, total=False):
    user_id: int
    question: str
    chat_history: list[ChatMessage]
    available_documents: list[AvailableDocument]
    selected_document_ids: list[int] | None
    retrieval_query: str
    retrieved_documents: list[RetrievedChunk]
    answer: str
    retry_count: int
    documents_relevant: bool
    grounded: bool
    sources: list[ChatSource]
    route: Literal["retrieve", "conversation", "authors"]
