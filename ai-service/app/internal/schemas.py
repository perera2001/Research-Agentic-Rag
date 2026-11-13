from typing import Literal

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator


class ProcessDocumentResponse(BaseModel):
    status: Literal["indexed"]
    page_count: int
    chunk_count: int


class DeleteDocumentResponse(BaseModel):
    status: Literal["deleted"]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class AvailableDocument(BaseModel):
    document_id: int = Field(gt=0, validation_alias=AliasChoices("document_id", "id"))
    file_name: str = Field(min_length=1)
    file_path: str | None = None


class ChatRequest(BaseModel):
    user_id: int = Field(gt=0)
    question: str = Field(min_length=1)
    chat_history: list[ChatMessage] = Field(default_factory=list)
    available_documents: list[AvailableDocument] = Field(default_factory=list)
    selected_document_ids: list[int] | None = None

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def selected_documents_are_available(self) -> "ChatRequest":
        ids = [document.document_id for document in self.available_documents]
        if len(ids) != len(set(ids)):
            raise ValueError("available_documents contains duplicate document IDs")
        if self.selected_document_ids is None or len(self.selected_document_ids) != 1:
            raise ValueError("select exactly one document")
        if self.selected_document_ids[0] < 1 or self.selected_document_ids[0] not in ids:
            raise ValueError("selected_document_ids must contain an available document ID")
        return self


class ChatSource(BaseModel):
    source: str
    page_number: int
    document_id: int


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource]
    retry_count: int
    documents_relevant: bool
    grounded: bool
