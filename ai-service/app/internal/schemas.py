from typing import Literal

from pydantic import BaseModel


class ProcessDocumentResponse(BaseModel):
    status: Literal["indexed"]
    page_count: int
    chunk_count: int


class DeleteDocumentResponse(BaseModel):
    status: Literal["deleted"]
