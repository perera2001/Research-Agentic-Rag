from threading import RLock
from typing import BinaryIO

from pydantic import ValidationError

from app.rag.bm25_store import get_bm25_store
from app.rag.chunker import create_semantic_chunks
from app.rag.pdf_loader import PdfLoadError, load_pdf_pages
from app.rag.vector_store import get_vector_store


INDEX_LOCK = RLock()


class DocumentIndexError(RuntimeError):
    pass


def process_document(
    pdf_file: BinaryIO,
    *,
    user_id: int,
    document_id: int,
    file_name: str,
    file_path: str,
) -> tuple[int, int]:
    page_count, pages = load_pdf_pages(
        pdf_file,
        user_id=user_id,
        document_id=document_id,
        file_name=file_name,
        file_path=file_path,
    )
    try:
        chunks = create_semantic_chunks(pages)
    except ValidationError:
        raise
    except Exception as exc:
        raise DocumentIndexError("Could not create semantic chunks.") from exc
    if not chunks:
        raise PdfLoadError("No text chunks could be created from the PDF.")

    vector_store = get_vector_store()
    bm25_store = get_bm25_store()
    with INDEX_LOCK:
        try:
            # Reprocessing replaces the same owner's previous index entries.
            vector_store.delete_document(user_id=user_id, document_id=document_id)
            bm25_store.delete_document(user_id=user_id, document_id=document_id)
            vector_store.add_chunks(chunks)
            bm25_store.add_chunks(chunks)
        except Exception as exc:
            cleanup_failed = False
            try:
                vector_store.delete_document(user_id=user_id, document_id=document_id)
            except Exception:
                cleanup_failed = True
            try:
                bm25_store.delete_document(user_id=user_id, document_id=document_id)
            except Exception:
                cleanup_failed = True
            detail = (
                "Document indexing failed and partial index cleanup was incomplete."
                if cleanup_failed
                else "Document indexing failed; partial index entries were removed."
            )
            raise DocumentIndexError(detail) from exc

    return page_count, len(chunks)


def delete_document_index(*, user_id: int, document_id: int) -> None:
    vector_store = get_vector_store()
    bm25_store = get_bm25_store()
    with INDEX_LOCK:
        vector_store.delete_document(user_id=user_id, document_id=document_id)
        bm25_store.delete_document(user_id=user_id, document_id=document_id)
