from pydantic import BaseModel, Field


class DocumentRelevance(BaseModel):
    relevant: bool


class Groundedness(BaseModel):
    grounded: bool


class EvidenceAnswer(BaseModel):
    answer: str = Field(description="A concise answer based only on the supplied evidence.")
    supporting_quotes: list[str] = Field(
        default_factory=list,
        description="Short verbatim excerpts from the supplied evidence that support the answer.",
    )


class AuthorExtraction(BaseModel):
    authors: list[str] = Field(default_factory=list)
