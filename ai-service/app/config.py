from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    openai_api_key: SecretStr = Field(validation_alias="OPENAI_API_KEY")
    openai_model: str = Field(validation_alias="OPENAI_MODEL")
    embedding_model: str = Field(validation_alias="EMBEDDING_MODEL")
    chroma_db_path: Path = Field(default=Path("./data/chromadb"), validation_alias="CHROMA_DB_PATH")
    retrieval_top_k: int = Field(default=5, gt=0, validation_alias="RETRIEVAL_TOP_K")
    max_retry_count: int = Field(default=3, ge=0, le=10, validation_alias="MAX_RETRY_COUNT")

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
