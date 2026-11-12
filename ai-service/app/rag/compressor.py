import re

from app.rag.schemas import RetrievedChunk


MAX_EVIDENCE_CHARS = 1400
KEYWORD = re.compile(r"[a-z0-9]{3,}", re.IGNORECASE)
SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")


def compress_chunks(question: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Keep question-related passages while retaining each chunk's source metadata."""
    terms = set(KEYWORD.findall(question.lower()))
    compressed = []
    for chunk in chunks:
        sentences = [part.strip() for part in SENTENCE.split(chunk.text) if part.strip()]
        ranked = sorted(
            enumerate(sentences),
            key=lambda item: (-len(terms.intersection(KEYWORD.findall(item[1].lower()))), item[0]),
        )
        selected: list[tuple[int, str]] = []
        size = 0
        for index, sentence in ranked:
            if selected and size + len(sentence) > MAX_EVIDENCE_CHARS:
                continue
            selected.append((index, sentence[:MAX_EVIDENCE_CHARS - size]))
            size += len(selected[-1][1])
            if size >= MAX_EVIDENCE_CHARS:
                break
        text = " ".join(sentence for _, sentence in sorted(selected)) or chunk.text[:MAX_EVIDENCE_CHARS]
        compressed.append(
            RetrievedChunk(
                chunk_id=chunk.chunk_id,
                text=text,
                metadata=chunk.metadata,
                score=chunk.score,
                retrievers=chunk.retrievers,
            )
        )
    return compressed
