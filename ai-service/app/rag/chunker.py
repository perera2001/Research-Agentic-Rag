from functools import lru_cache

from langchain_core.documents import Document
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

from app.config import get_settings
from app.rag.schemas import IndexedChunk


@lru_cache(maxsize=1)
def get_embeddings() -> OpenAIEmbeddings:
    settings = get_settings()
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key.get_secret_value(),
    )


def create_semantic_chunks(pages: list[Document]) -> list[IndexedChunk]:
    text_pages = [page for page in pages if page.page_content.strip()]
    if not text_pages:
        return []

    splitter = SemanticChunker(get_embeddings())
    chunks = []
    for chunk in splitter.split_documents(text_pages):
        text = chunk.page_content.strip()
        if not text:
            continue

        metadata = dict(chunk.metadata)
        chunk_index = len(chunks)
        metadata["chunk_index"] = chunk_index
        chunks.append(
            IndexedChunk(
                chunk_id=f"{metadata['user_id']}:{metadata['document_id']}:{chunk_index}",
                text=text,
                metadata=metadata,
            )
        )
    return chunks
