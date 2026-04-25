from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MRX Module-1 Orchestrator API")

from api import intake
from api import ecosystem
from api import sources
from api import context_upload
from api import ingest
from api import brief
from api import manifest
from api import truth_map

app.include_router(intake.router, prefix="/api")
app.include_router(ecosystem.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(context_upload.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(brief.router, prefix="/api")
app.include_router(manifest.router, prefix="/api")
app.include_router(truth_map.router, prefix="/api")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to MRX Module-1 Orchestrator API"}
