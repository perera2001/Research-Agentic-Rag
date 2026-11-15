from pydantic import BaseModel, Field


class DocumentRelevance(BaseModel):
    relevant_chunk_ids: list[str] = Field(
        default_factory=list,
        description="IDs of supplied chunks that contain evidence relevant to the question.",
    )


class Groundedness(BaseModel):
    grounded: bool


class EvidenceAnswer(BaseModel):
    answer: str = Field(description="A concise answer based only on the supplied evidence.")
    supporting_quotes: list[str] = Field(
        default_factory=list,
        description="Short verbatim excerpts from the supplied evidence that support the answer.",
    )
