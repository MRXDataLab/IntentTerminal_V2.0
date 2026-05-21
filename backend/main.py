import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Use uvloop for better async performance on Linux/macOS
if sys.platform != "win32":
    try:
        import uvloop
        uvloop.install()
    except ImportError:
        pass

app = FastAPI(title="MRX Module-1 Orchestrator API")

from api import intake
from api import ecosystem
from api import sources
from api import context_upload
from api import ingest
from api import brief
from api import manifest
from api import truth_map
from api import dev_bypass
from api import methodology
from api import discovery
from api import intelligence_map
from api import hypotheses
from api import llm_provider

app.include_router(intake.router, prefix="/api")
app.include_router(ecosystem.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(context_upload.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(brief.router, prefix="/api")
app.include_router(manifest.router, prefix="/api")
app.include_router(truth_map.router, prefix="/api")
app.include_router(dev_bypass.router, prefix="/api")
app.include_router(methodology.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(intelligence_map.router, prefix="/api")
app.include_router(hypotheses.router, prefix="/api")
app.include_router(llm_provider.router, prefix="/api")

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
