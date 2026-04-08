import io
import json
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

async def parse_csv(content: bytes) -> str:
    try:
        df = pd.read_csv(io.BytesIO(content))
        summary_lines = [
            f"Dataset contains {len(df)} rows and {len(df.columns)} columns.",
            f"Columns: {', '.join(df.columns.tolist())}",
        ]
        for col in df.select_dtypes(include='number').columns[:5]:
            summary_lines.append(
                f"  - {col}: min={df[col].min():.2f}, max={df[col].max():.2f}, mean={df[col].mean():.2f}"
            )
        return "\n".join(summary_lines)
    except Exception as e:
        return f"Could not parse CSV: {str(e)}"

async def parse_pdf(content: bytes) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages[:5]:  # Max 5 pages
            text += page.extract_text() or ""
        return text[:2500].strip()
    except ImportError:
        return "PDF parsing unavailable (pypdf not installed)."
    except Exception as e:
        return f"Could not parse PDF: {str(e)}"

async def parse_text(content: bytes) -> str:
    try:
        return content.decode("utf-8")[:2500].strip()
    except Exception as e:
        return f"Could not parse text file: {str(e)}"

@router.post("/upload-context")
async def upload_context(file: UploadFile = File(...)):
    """
    FR 1.3: Accepts internal data files (CSVs, NPS exports, PDF reports)
    and extracts a structured summary to inject as context into the intake session.
    """
    filename = file.filename or ""
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "csv":
        context_summary = await parse_csv(content)
        file_type = "Sales/NPS Data (CSV)"
    elif ext == "pdf":
        context_summary = await parse_pdf(content)
        file_type = "Secondary Report (PDF)"
    elif ext in ("txt", "md"):
        context_summary = await parse_text(content)
        file_type = "Research Brief (Text)"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}. Supported: .csv, .pdf, .txt, .md")

    return {
        "status": "success",
        "file_type": file_type,
        "context_summary": context_summary,
        "message": f"Context from '{filename}' extracted successfully. This will be used to calibrate the agent's probing."
    }
