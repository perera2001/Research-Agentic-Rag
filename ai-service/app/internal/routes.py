from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile as FastAPIUploadFile
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from app.summary.schemas import ResearchSummary
from app.summary.service import PdfExtractionError, SummaryGenerationError, summarize_research_paper
from app.documents.service import DocumentIndexError, delete_document_index, process_document
from app.internal.schemas import DeleteDocumentResponse, ProcessDocumentResponse
from app.rag.pdf_loader import PdfLoadError


router = APIRouter(prefix="/internal")


@router.post("/documents/summary", response_model=ResearchSummary)
async def summarize_document(request: Request) -> ResearchSummary:
    async with request.form(max_files=1, max_fields=1) as form:
        files = form.getlist("file")
        if len(files) != 1 or not isinstance(files[0], UploadFile):
            raise HTTPException(status_code=400, detail="Upload one PDF in the 'file' field.")

        upload = files[0]
        if not upload.filename:
            raise HTTPException(status_code=400, detail="The uploaded file needs a filename.")
        if not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="The uploaded filename must end in .pdf.")

        try:
            return await run_in_threadpool(summarize_research_paper, upload.file)
        except PdfExtractionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except ValidationError as exc:
            raise HTTPException(status_code=503, detail="AI service configuration is incomplete.") from exc
        except SummaryGenerationError as exc:
            raise HTTPException(status_code=502, detail="Summary generation failed.") from exc


@router.post("/documents/process", response_model=ProcessDocumentResponse)
async def process_uploaded_document(
    user_id: Annotated[int, Form(gt=0)],
    document_id: Annotated[int, Form(gt=0)],
    file_name: Annotated[str, Form(min_length=1)],
    file_path: Annotated[str, Form(min_length=1)],
    file: Annotated[FastAPIUploadFile, File()],
) -> ProcessDocumentResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file in the 'file' field.")
    if not file_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="file_name must end in .pdf.")

    try:
        page_count, chunk_count = await run_in_threadpool(
            process_document,
            file.file,
            user_id=user_id,
            document_id=document_id,
            file_name=file_name,
            file_path=file_path,
        )
        return ProcessDocumentResponse(
            status="indexed", page_count=page_count, chunk_count=chunk_count
        )
    except PdfLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=503, detail="AI service configuration is incomplete.") from exc
    except DocumentIndexError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        await file.close()


@router.delete("/documents/{document_id}", response_model=DeleteDocumentResponse)
async def delete_indexed_document(
    document_id: int,
    user_id: Annotated[int, Query(gt=0)],
) -> DeleteDocumentResponse:
    if document_id < 1:
        raise HTTPException(status_code=400, detail="document_id must be positive.")
    try:
        await run_in_threadpool(
            delete_document_index, user_id=user_id, document_id=document_id
        )
        return DeleteDocumentResponse(status="deleted")
    except ValidationError as exc:
        raise HTTPException(status_code=503, detail="AI service configuration is incomplete.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not delete document indexes.") from exc
