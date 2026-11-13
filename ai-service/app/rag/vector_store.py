from functools import lru_cache
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import get_settings
from app.rag.chunker import get_embeddings
from app.rag.schemas import IndexedChunk, RetrievedChunk


COLLECTION_NAME = "researchmind_documents"
BATCH_SIZE = 100
SERVICE_ROOT = Path(__file__).resolve().parents[2]


def document_filter(user_id: int, document_ids: list[int] | None = None) -> dict:
    owner = {"user_id": user_id}
    if document_ids is None:
        return owner
    if not document_ids:
        raise ValueError("An empty document_ids filter cannot be queried")
    return {"$and": [owner, {"document_id": {"$in": document_ids}}]}


class VectorStore:
    def __init__(self) -> None:
        configured_path = get_settings().chroma_db_path
        db_path = configured_path if configured_path.is_absolute() else SERVICE_ROOT / configured_path
        db_path = db_path.resolve()
        db_path.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(
            path=str(db_path),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=None,
        )

    def add_chunks(self, chunks: list[IndexedChunk]) -> None:
        for start in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[start : start + BATCH_SIZE]
            embeddings = get_embeddings().embed_documents([chunk.text for chunk in batch])
            if len(embeddings) != len(batch):
                raise RuntimeError("Embedding count did not match chunk count")
            self.collection.add(
                ids=[chunk.chunk_id for chunk in batch],
                documents=[chunk.text for chunk in batch],
                metadatas=[chunk.metadata for chunk in batch],
                embeddings=embeddings,
            )

    def search(
        self,
        query: str,
        *,
        user_id: int,
        document_ids: list[int] | None = None,
        limit: int = 5,
    ) -> list[RetrievedChunk]:
        if limit < 1 or document_ids == [] or not query.strip():
            return []
        where = document_filter(user_id, document_ids)
        if not self.collection.get(where=where, limit=1, include=[])["ids"]:
            return []

        query_embedding = get_embeddings().embed_query(query)
        response = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        ids = response["ids"][0]
        documents = response["documents"][0]
        metadatas = response["metadatas"][0]
        distances = response["distances"][0]
        return [
            RetrievedChunk(
                chunk_id=chunk_id,
                text=text,
                metadata=metadata,
                score=1.0 / (1.0 + max(0.0, distance)),
                retrievers=("vector",),
            )
            for chunk_id, text, metadata, distance in zip(ids, documents, metadatas, distances)
            if text is not None and metadata is not None and distance is not None
        ]

    def iter_all_chunks(self) -> list[IndexedChunk]:
        chunks = []
        offset = 0
        while True:
            response = self.collection.get(
                limit=500,
                offset=offset,
                include=["documents", "metadatas"],
            )
            ids = response["ids"]
            if not ids:
                break
            for chunk_id, text, metadata in zip(ids, response["documents"], response["metadatas"]):
                if text is not None and metadata is not None:
                    chunks.append(IndexedChunk(chunk_id=chunk_id, text=text, metadata=metadata))
            offset += len(ids)
        return chunks

    def delete_document(self, *, user_id: int, document_id: int) -> None:
        self.collection.delete(where=document_filter(user_id, [document_id]))


@lru_cache(maxsize=1)
def get_vector_store() -> VectorStore:
    return VectorStore()
