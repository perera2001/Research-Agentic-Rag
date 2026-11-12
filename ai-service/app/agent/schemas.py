from typing import Literal

from pydantic import BaseModel, Field


class RouteDecision(BaseModel):
    route: Literal["retrieve", "conversation"]
    selected_document_ids: list[int] = Field(default_factory=list)
    retrieval_query: str = ""


class DocumentRelevance(BaseModel):
    relevant: bool


class Groundedness(BaseModel):
    grounded: bool


class AuthorExtraction(BaseModel):
    authors: list[str] = Field(default_factory=list)
