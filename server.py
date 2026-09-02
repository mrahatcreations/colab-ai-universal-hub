import gc
import json
import time
import shutil
import asyncio
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any

import torch
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
from huggingface_hub import HfApi, snapshot_download

try:
    import easyocr
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

from config import MODELS_DIR, DEFAULT_OCR_LANGS

# ---------------------------------------------------------------------------
# FastAPI Initialization & CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Colab AI Universal Core API",
    description="High-performance AI Backend for LLM Streaming, Vision/OCR, and Hugging Face Hub",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global State & Memory
# ---------------------------------------------------------------------------
state_lock = threading.Lock()
CURRENT_MODEL = None
CURRENT_TOKENIZER = None
ACTIVE_MODEL_NAME = "None"
ocr_reader = None
hf_api = HfApi()

def clear_vram():
    global CURRENT_MODEL, CURRENT_TOKENIZER, ACTIVE_MODEL_NAME
    with state_lock:
        if CURRENT_MODEL is not None:
            del CURRENT_MODEL
            del CURRENT_TOKENIZER
            CURRENT_MODEL = None
            CURRENT_TOKENIZER = None
            ACTIVE_MODEL_NAME = "None"
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()

def get_vram_info() -> Dict[str, Any]:
    if not torch.cuda.is_available():
        return {
            "gpu_available": False,
            "device_name": "CPU",
            "allocated_gb": 0.0,
            "total_gb": 0.0,
            "free_gb": 0.0
        }
    total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    allocated = torch.cuda.memory_allocated(0) / (1024 ** 3)
    reserved = torch.cuda.memory_reserved(0) / (1024 ** 3)
    return {
        "gpu_available": True,
        "device_name": torch.cuda.get_device_name(0),
        "allocated_gb": round(allocated, 2),
        "reserved_gb": round(reserved, 2),
        "total_gb": round(total, 2),
        "free_gb": round(total - reserved, 2)
    }

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatStreamRequest(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    prompt: Optional[str] = None
    max_new_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9

class LoadModelRequest(BaseModel):
    repo_id: str
    quantization: str = "4bit"  # '4bit', '8bit', or 'fp16'

class DownloadModelRequest(BaseModel):
    repo_id: str

# ---------------------------------------------------------------------------
# Health & Status Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
@app.get("/")
def health():
    return {
        "status": "healthy",
        "service": "Colab AI Universal Core API",
        "active_model": ACTIVE_MODEL_NAME,
        "vram": get_vram_info(),
        "timestamp": time.time()
    }

@app.get("/api/status")
def get_status():
    return {
        "active_model": ACTIVE_MODEL_NAME,
        "vram": get_vram_info(),
        "ocr_available": OCR_AVAILABLE
    }

# ---------------------------------------------------------------------------
# Model Management Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/models")
def list_models():
    """Lists locally downloaded models and active model."""
    downloaded = []
    if MODELS_DIR.exists():
        for d in sorted(MODELS_DIR.iterdir()):
            if d.is_dir():
                meta = d / "meta.json"
                if meta.exists():
                    try:
                        data = json.loads(meta.read_text())
                        downloaded.append({
                            "id": data.get("repo_id", d.name.replace("--", "/")),
                            "folder": d.name,
                            "downloaded_at": data.get("downloaded_at")
                        })
                    except Exception:
                        downloaded.append({"id": d.name.replace("--", "/"), "folder": d.name})
                else:
                    downloaded.append({"id": d.name.replace("--", "/"), "folder": d.name})

    return {
        "active_model": ACTIVE_MODEL_NAME,
        "downloaded_models": downloaded
    }

@app.post("/api/models/load")
def load_model_endpoint(req: LoadModelRequest):
    global CURRENT_MODEL, CURRENT_TOKENIZER, ACTIVE_MODEL_NAME
    repo_id = req.repo_id.strip()
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id cannot be empty")

    clear_vram()

    local_path = MODELS_DIR / repo_id.replace("/", "--")
    model_source = str(local_path) if local_path.exists() else repo_id

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
        load_kwargs = {
            "device_map": "auto",
            "trust_remote_code": True
        }

        if torch.cuda.is_available():
            load_kwargs["torch_dtype"] = torch.float16
            try:
                from transformers import BitsAndBytesConfig
                if req.quantization == "4bit":
                    load_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=torch.float16,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_use_double_quant=True
                    )
                elif req.quantization == "8bit":
                    load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
            except Exception:
                if req.quantization == "4bit":
                    load_kwargs["load_in_4bit"] = True
                elif req.quantization == "8bit":
                    load_kwargs["load_in_8bit"] = True

        model = AutoModelForCausalLM.from_pretrained(model_source, **load_kwargs)

        with state_lock:
            CURRENT_MODEL = model
            CURRENT_TOKENIZER = tokenizer
            ACTIVE_MODEL_NAME = repo_id

        return {
            "status": "success",
            "message": f"Model '{repo_id}' loaded successfully in {req.quantization.upper()} mode.",
            "active_model": ACTIVE_MODEL_NAME,
            "vram": get_vram_info()
        }
    except Exception as e:
        clear_vram()
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

@app.post("/api/models/unload")
def unload_model_endpoint():
    clear_vram()
    return {
        "status": "success",
        "message": "Model unloaded and GPU memory freed.",
        "active_model": "None",
        "vram": get_vram_info()
    }

@app.delete("/api/models/{folder_name}")
def delete_model_endpoint(folder_name: str):
    global ACTIVE_MODEL_NAME
    target = MODELS_DIR / folder_name
    if target.exists():
        if ACTIVE_MODEL_NAME.replace("/", "--") == folder_name:
            clear_vram()
        shutil.rmtree(target)
        return {"status": "success", "message": f"Deleted model {folder_name}"}
    raise HTTPException(status_code=404, detail="Model folder not found")

# ---------------------------------------------------------------------------
# Hugging Face Hub Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/hf/search")
def search_hf_endpoint(q: str, task: str = "text-generation", limit: int = 15):
    if not q or not q.strip():
        return {"results": []}
    try:
        models = hf_api.list_models(
            search=q.strip(),
            filter=task if task != "all" else None,
            sort="downloads",
            direction=-1,
            limit=limit
        )
        return {
            "results": [
                {
                    "id": m.id,
                    "downloads": getattr(m, "downloads", 0),
                    "likes": getattr(m, "likes", 0),
                    "last_modified": str(getattr(m, "last_modified", ""))
                }
                for m in models
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/hf/download")
def download_hf_endpoint(req: DownloadModelRequest):
    repo_id = req.repo_id.strip()
    if not repo_id:
        raise HTTPException(status_code=400, detail="Invalid repo_id")

    target_dir = MODELS_DIR / repo_id.replace("/", "--")
    try:
        snapshot_download(
            repo_id=repo_id,
            local_dir=str(target_dir),
            local_dir_use_symlinks=False,
            ignore_patterns=["*.msgpack", "*.h5", "*.ot", "*.onnx"]
        )
        meta_file = target_dir / "meta.json"
        meta_file.write_text(json.dumps({
            "repo_id": repo_id,
            "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }, indent=2))

        return {"status": "success", "message": f"Model {repo_id} downloaded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

# ---------------------------------------------------------------------------
# Server-Sent Events (SSE) Streaming Chat
# ---------------------------------------------------------------------------
@app.post("/api/chat/stream")
async def chat_stream_endpoint(req: ChatStreamRequest):
    if CURRENT_MODEL is None or CURRENT_TOKENIZER is None:
        raise HTTPException(
            status_code=400,
            detail="No model currently active. Please load a model first via /api/models/load"
        )

    # Format messages
    messages = []
    if req.messages:
        for m in req.messages:
            messages.append({"role": m.role, "content": m.content})
    elif req.prompt:
        messages.append({"role": "user", "content": req.prompt})
    else:
        raise HTTPException(status_code=400, detail="Must provide 'messages' or 'prompt'")

    try:
        if hasattr(CURRENT_TOKENIZER, "apply_chat_template") and CURRENT_TOKENIZER.chat_template:
            prompt_text = CURRENT_TOKENIZER.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        else:
            prompt_text = ""
            for msg in messages:
                role = "User" if msg["role"] == "user" else "Assistant"
                prompt_text += f"{role}: {msg['content']}\n"
            prompt_text += "Assistant: "

        inputs = CURRENT_TOKENIZER(prompt_text, return_tensors="pt").to(CURRENT_MODEL.device)
        streamer = TextIteratorStreamer(
            CURRENT_TOKENIZER,
            timeout=60.0,
            skip_prompt=True,
            skip_special_tokens=True
        )

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=req.max_new_tokens,
            do_sample=req.temperature > 0.0,
            temperature=float(req.temperature),
            top_p=float(req.top_p)
        )

        thread = threading.Thread(target=CURRENT_MODEL.generate, kwargs=generation_kwargs)
        thread.start()

        async def sse_event_stream():
            loop = asyncio.get_event_loop()
            while True:
                # Read next token from streamer without blocking async loop
                token = await loop.run_in_executor(None, lambda: next(streamer, None))
                if token is None:
                    break
                # Send Server-Sent Event chunk
                yield f"data: {json.dumps({'token': token})}\n\n"

            yield f"data: [DONE]\n\n"

        return StreamingResponse(
            sse_event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

# ---------------------------------------------------------------------------
# OCR Endpoint
# ---------------------------------------------------------------------------
@app.post("/api/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    languages: str = Form("en,bn")
):
    global ocr_reader
    if not OCR_AVAILABLE:
        raise HTTPException(status_code=503, detail="EasyOCR is not installed on the server.")

    try:
        lang_list = [l.strip() for l in languages.split(",") if l.strip()]
        if not lang_list:
            lang_list = DEFAULT_OCR_LANGS

        if ocr_reader is None:
            ocr_reader = easyocr.Reader(lang_list, gpu=torch.cuda.is_available())

        file_bytes = await file.read()
        is_pdf = file.filename.lower().endswith(".pdf") or "pdf" in (file.content_type or "").lower()

        if is_pdf:
            try:
                import pypdfium2 as pdfium
                import numpy as np
            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="pypdfium2 লাইব্রেরি পাওয়া যায়নি। (`pip install pypdfium2` রান করুন)"
                )

            pdf = pdfium.PdfDocument(file_bytes)
            total_pages = len(pdf)
            pages_data = []

            for i in range(total_pages):
                page = pdf[i]
                # High resolution render (scale=2.0) for sharp OCR
                pil_image = page.render(scale=2.0).to_pil()
                np_image = np.array(pil_image)
                results = ocr_reader.readtext(np_image)
                lines = [r[1] for r in results]
                p_text = "\n".join(lines)
                pages_data.append({
                    "page_num": i + 1,
                    "text": p_text,
                    "lines_count": len(lines)
                })

            full_text = "\n\n--- Page Break ---\n\n".join([p["text"] for p in pages_data])
            return {
                "status": "success",
                "is_pdf": True,
                "filename": file.filename,
                "total_pages": total_pages,
                "pages": pages_data,
                "text": full_text
            }
        else:
            # Single Image processing
            results = ocr_reader.readtext(file_bytes)
            lines = [r[1] for r in results]
            extracted_text = "\n".join(lines)

            return {
                "status": "success",
                "is_pdf": False,
                "filename": file.filename,
                "total_pages": 1,
                "pages": [{
                    "page_num": 1,
                    "text": extracted_text,
                    "lines_count": len(lines)
                }],
                "text": extracted_text,
                "lines_count": len(lines)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

@app.post("/api/pdf/info")
async def get_pdf_info(file: UploadFile = File(...)):
    """Returns total pages and metadata of a PDF file quickly."""
    try:
        import pypdfium2 as pdfium
        content = await file.read()
        pdf = pdfium.PdfDocument(content)
        return {
            "status": "success",
            "filename": file.filename,
            "total_pages": len(pdf)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF reading error: {str(e)}")

@app.post("/api/pdf/render_page")
async def render_pdf_page_endpoint(
    file: UploadFile = File(...),
    page_num: int = Form(1)
):
    """Renders a single PDF page into a high-res PNG image for clean fit display."""
    import io
    try:
        import pypdfium2 as pdfium
        content = await file.read()
        pdf = pdfium.PdfDocument(content)
        total_pages = len(pdf)
        target_idx = max(0, min(page_num - 1, total_pages - 1))
        page = pdf[target_idx]
        pil_image = page.render(scale=2.0).to_pil()
        buf = io.BytesIO()
        pil_image.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render page error: {str(e)}")

@app.post("/api/ocr/page")
async def ocr_single_page_endpoint(
    file: UploadFile = File(...),
    page_num: int = Form(1),
    languages: str = Form("en,bn")
):
    """Scans a specific single page of a PDF or image in real time."""
    global ocr_reader
    if not OCR_AVAILABLE:
        raise HTTPException(status_code=503, detail="EasyOCR is not installed.")

    try:
        lang_list = [l.strip() for l in languages.split(",") if l.strip()]
        if not lang_list:
            lang_list = DEFAULT_OCR_LANGS

        if ocr_reader is None:
            ocr_reader = easyocr.Reader(lang_list, gpu=torch.cuda.is_available())

        file_bytes = await file.read()
        is_pdf = file.filename.lower().endswith(".pdf") or "pdf" in (file.content_type or "").lower()

        if is_pdf:
            import pypdfium2 as pdfium
            import numpy as np
            pdf = pdfium.PdfDocument(file_bytes)
            total_pages = len(pdf)

            target_idx = max(0, min(page_num - 1, total_pages - 1))
            page = pdf[target_idx]
            pil_image = page.render(scale=2.0).to_pil()
            np_image = np.array(pil_image)

            results = ocr_reader.readtext(np_image)
            lines = [r[1] for r in results]
            text = "\n".join(lines)

            return {
                "status": "success",
                "is_pdf": True,
                "filename": file.filename,
                "page_num": target_idx + 1,
                "total_pages": total_pages,
                "text": text,
                "lines_count": len(lines)
            }
        else:
            results = ocr_reader.readtext(file_bytes)
            lines = [r[1] for r in results]
            text = "\n".join(lines)
            return {
                "status": "success",
                "is_pdf": False,
                "filename": file.filename,
                "page_num": 1,
                "total_pages": 1,
                "text": text,
                "lines_count": len(lines)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Page OCR failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    from config import SERVER_HOST, SERVER_PORT
    uvicorn.run("server:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)
