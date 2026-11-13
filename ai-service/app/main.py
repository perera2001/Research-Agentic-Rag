from fastapi import FastAPI

from app.internal.routes import router as internal_router


app = FastAPI(title="ResearchMind AI Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ResearchMind AI Service"}


app.include_router(internal_router)
