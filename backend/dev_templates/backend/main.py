"""Todo API scaffold — wire up in M5."""

from fastapi import FastAPI

app = FastAPI(title="DevFlow Todo API (scaffold)")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "note": "Implement todos CRUD per REQUIREMENTS.md"}
