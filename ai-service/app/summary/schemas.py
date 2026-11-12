from pydantic import BaseModel, ConfigDict, Field


class ResearchSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(description="Paper title, or 'Not stated' if absent.")
    authors: list[str] = Field(description="Author names as written in the paper; [] if absent.")
    abstract: str = Field(description="Abstract, or 'Not stated' if absent.")
    problem_statement: str = Field(description="Research problem, or 'Not stated' if absent.")
    methodology: str = Field(description="Methods used, or 'Not stated' if absent.")
    key_results: str = Field(description="Main findings, or 'Not stated' if absent.")
    conclusion: str = Field(description="Paper conclusion, or 'Not stated' if absent.")
