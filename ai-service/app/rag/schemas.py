from dataclasses import dataclass


ChunkMetadata = dict[str, str | int]


@dataclass(frozen=True, slots=True)
class IndexedChunk:
    chunk_id: str
    text: str
    metadata: ChunkMetadata


@dataclass(frozen=True, slots=True)
class RetrievedChunk:
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    score: float
    retrievers: tuple[str, ...]
