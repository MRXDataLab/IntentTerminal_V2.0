from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MRX Module-1 Orchestrator API")

from api import intake
from api import ecosystem
from api import sources
app.include_router(intake.router, prefix="/api")
app.include_router(ecosystem.router, prefix="/api")
app.include_router(sources.router, prefix="/api")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to MRX Module-1 Orchestrator API"}
