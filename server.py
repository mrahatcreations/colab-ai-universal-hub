import os
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
CURRENT_PROCESSOR = None
IS_VISION_MODEL = False
ACTIVE_MODEL_NAME = "None"
ocr_reader = None
hf_api = HfApi()

def clear_vram():
    global CURRENT_MODEL, CURRENT_TOKENIZER, CURRENT_PROCESSOR, IS_VISION_MODEL, ACTIVE_MODEL_NAME
    with state_lock:
        if CURRENT_MODEL is not None:
            del CURRENT_MODEL
            del CURRENT_TOKENIZER
            if CURRENT_PROCESSOR is not None:
                del CURRENT_PROCESSOR
            CURRENT_MODEL = None
            CURRENT_TOKENIZER = None
            CURRENT_PROCESSOR = None
            IS_VISION_MODEL = False
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

@app.on_event("startup")
def on_startup():
    auto_model = os.getenv("AUTO_LOAD_MODEL", "").strip()
    if auto_model:
        print(f"[*] Auto-loading model upon startup: {auto_model}...", flush=True)
        try:
            load_model_endpoint(LoadModelRequest(repo_id=auto_model, quantization="4bit"))
            print(f"[+] Model '{auto_model}' successfully loaded upon startup!", flush=True)
        except Exception as e:
            print(f"[!] Failed to auto-load model '{auto_model}': {e}", flush=True)

@app.get("/api/status")
def get_status():
    return {
        "active_model": ACTIVE_MODEL_NAME,
        "vram": get_vram_info(),
        "ocr_available": OCR_AVAILABLE
    }

# ---------------------------------------------------------------------------
# Default recommended models for T4 GPU (can be customized or fetched dynamically)
DEFAULT_FEATURED_MODELS = [
    {
        "id": "baidu/Unlimited-OCR",
        "name": "Baidu Unlimited-OCR (Long-Horizon Document)",
        "badge": "📄 ৪০+ পেজ ১-শট OCR",
        "badgeColor": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
        "desc": "বই, প্রশ্নব্যাংক ও মাল্টি-পেজ ডকুমেন্ট এক ক্লিকে নির্ভুল টেক্সট ও কলামসহ পার্স করার জন্য আল্ট্রা-ফাস্ট মডেল।",
        "vram": "~6.0 GB VRAM"
    },
    {
        "id": "unsloth/Qwen2.5-VL-7B-Instruct-bnb-4bit",
        "name": "Qwen 2.5 VL (7B Vision & Layout)",
        "badge": "🌟 ২-কলাম বই ও ভিশন",
        "badgeColor": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        "desc": "বইয়ের ২-কলাম পেজ, চার্ট ও বাংলা যুক্তবর্ণ সরাসরি ছবি দেখে নির্ভুলভাবে পড়ার জন্য এক নম্বর ভিশন মডেল।",
        "vram": "~5.5 GB VRAM"
    },
    {
        "id": "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
        "name": "Qwen 2.5 Instruct (7B Multilingual)",
        "badge": "বাংলা ব্যাকরণ ও প্রশ্নব্যাংক",
        "badgeColor": "bg-sky-500/10 text-sky-400 border-sky-500/30",
        "desc": "বাংলা ভাষা ও পরীক্ষার ফরম্যাটের জন্য বিশ্বের #১ টেক্সট মডেল (সরাসরি দ্রুত আউটপুট)।",
        "vram": "~4.8 GB VRAM"
    },
    {
        "id": "unsloth/DeepSeek-R1-Distill-Qwen-7B-bnb-4bit",
        "name": "DeepSeek R1 (7B Reasoning)",
        "badge": "ডিপ রিজনিং",
        "badgeColor": "bg-purple-500/10 text-purple-400 border-purple-500/30",
        "desc": "জটিল প্রশ্নের গভীর যুক্তি ও বিশ্লেষণ করার জন্য শক্তিশালী রিজনিং ইঞ্জিন।",
        "vram": "~5.2 GB VRAM"
    },
    {
        "id": "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
        "name": "Llama 3.1 Instruct (8B Meta)",
        "badge": "সুপারফাস্ট",
        "badgeColor": "bg-amber-500/10 text-amber-400 border-amber-500/30",
        "desc": "মেটার অত্যন্ত দ্রুতগতির এবং স্থিতিশীল সর্বজনীন ভাষা মডেল।",
        "vram": "~5.4 GB VRAM"
    }
]

# ---------------------------------------------------------------------------
# Model Management Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/models")
def list_models():
    """Lists locally downloaded models, active model, and featured recommendations."""
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
        "downloaded_models": downloaded,
        "featured_models": DEFAULT_FEATURED_MODELS
    }

@app.post("/api/models/load")
def load_model_endpoint(req: LoadModelRequest):
    global CURRENT_MODEL, CURRENT_TOKENIZER, ACTIVE_MODEL_NAME, CURRENT_PROCESSOR, IS_VISION_MODEL
    repo_id = req.repo_id.strip()
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id cannot be empty")

    # Safety net: Unsloth bnb-4bit checkpoints have broken LinearFP4 visual layers with standard transformers
    is_vl = any(term in repo_id.lower() for term in ["vl", "vision"])
    if "unsloth" in repo_id.lower() and is_vl:
        print(f"[!] Unsloth BNB-4bit vision checkpoints have broken LinearFP4 visual layers in standard transformers. Automatically switching to official 'Qwen/Qwen2.5-VL-3B-Instruct' for rock-solid native FP16 inference!", flush=True)
        repo_id = "Qwen/Qwen2.5-VL-3B-Instruct"

    clear_vram()

    local_path = MODELS_DIR / repo_id.replace("/", "--")
    model_source = str(local_path) if local_path.exists() else repo_id

    try:
        load_kwargs = {
            "device_map": "auto",
            "trust_remote_code": True
        }

        is_vl = any(term in repo_id.lower() for term in ["vl", "vision"])
        processor = None

        if torch.cuda.is_available():
            load_kwargs["torch_dtype"] = torch.float16
            # 3B vision models fit natively in T4 VRAM without quantization
            needs_quant = (req.quantization in ["4bit", "8bit"]) and not ("3b" in repo_id.lower() and is_vl)
            if needs_quant:
                try:
                    from transformers import BitsAndBytesConfig
                    skip_mods = ["visual", "lm_head", "multi_modal_projector", "merger", "modality_projection"] if is_vl else None
                    if req.quantization == "4bit":
                        load_kwargs["quantization_config"] = BitsAndBytesConfig(
                            load_in_4bit=True,
                            bnb_4bit_compute_dtype=torch.float16,
                            bnb_4bit_quant_type="nf4",
                            bnb_4bit_use_double_quant=True,
                            llm_int8_skip_modules=skip_mods
                        )
                    elif req.quantization == "8bit":
                        load_kwargs["quantization_config"] = BitsAndBytesConfig(
                            load_in_8bit=True,
                            llm_int8_skip_modules=skip_mods
                        )
                except Exception as bnb_err:
                    print(f"[!] BitsAndBytes config error: {bnb_err}", flush=True)

        if is_vl:
            try:
                from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
                processor = AutoProcessor.from_pretrained(model_source, trust_remote_code=True)
                model = Qwen2_5_VLForConditionalGeneration.from_pretrained(model_source, **load_kwargs)
                tokenizer = processor.tokenizer
            except Exception:
                from transformers import AutoModelForVision2Seq, AutoProcessor
                processor = AutoProcessor.from_pretrained(model_source, trust_remote_code=True)
                model = AutoModelForVision2Seq.from_pretrained(model_source, **load_kwargs)
                tokenizer = processor.tokenizer
        elif "ocr" in repo_id.lower() or "unlimited" in repo_id.lower():
            # OCR / VLM Foundation Model (e.g., baidu/Unlimited-OCR, DeepSeek-OCR)
            from transformers import AutoModel
            tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
            model = AutoModel.from_pretrained(model_source, **load_kwargs)
        else:
            tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
            try:
                model = AutoModelForCausalLM.from_pretrained(model_source, **load_kwargs)
            except Exception:
                # Fallback to AutoModel if CausalLM header fails
                from transformers import AutoModel
                model = AutoModel.from_pretrained(model_source, **load_kwargs)

        with state_lock:
            CURRENT_MODEL = model
            CURRENT_TOKENIZER = tokenizer
            CURRENT_PROCESSOR = processor
            IS_VISION_MODEL = is_vl or ("ocr" in repo_id.lower())
            ACTIVE_MODEL_NAME = repo_id

        return {
            "status": "success",
            "message": f"Model '{repo_id}' loaded successfully in {req.quantization.upper()} mode.",
            "active_model": ACTIVE_MODEL_NAME,
            "is_vision_model": IS_VISION_MODEL,
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
def search_hf_endpoint(q: str, task: str = "all", limit: int = 15):
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
        if IS_VISION_MODEL and CURRENT_PROCESSOR is not None:
            prompt_text = CURRENT_PROCESSOR.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = CURRENT_PROCESSOR(text=[prompt_text], return_tensors="pt").to(CURRENT_MODEL.device)
        elif hasattr(CURRENT_TOKENIZER, "apply_chat_template") and CURRENT_TOKENIZER.chat_template:
            prompt_text = CURRENT_TOKENIZER.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = CURRENT_TOKENIZER(prompt_text, return_tensors="pt").to(CURRENT_MODEL.device)
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
# Multimodal Vision-Language OCR Streaming Endpoint (Qwen2.5-VL)
# ---------------------------------------------------------------------------
@app.post("/api/vision/ocr")
async def vision_ocr_endpoint(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None)
):
    global CURRENT_MODEL, CURRENT_PROCESSOR, CURRENT_TOKENIZER, IS_VISION_MODEL
    if CURRENT_MODEL is None or CURRENT_PROCESSOR is None:
        raise HTTPException(
            status_code=400,
            detail="No Vision Model is currently loaded. Please load Qwen2.5-VL first."
        )

    from PIL import Image
    import io

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    default_prompt = (
        "You are an expert academic document transcriber and editorial proofreader specializing in university admission test question banks.\n"
        "Carefully transcribe this textbook page into publication-ready Markdown following these UNIVERSAL COGNITIVE & EDITORIAL RULES:\n\n"
        "1. STRICT SEQUENTIAL QUESTION NUMBERING (ক্রমিক নম্বর পুনরুদ্ধার):\n"
        "   - Every single question MUST have a clear sequential number: ### 🔹 প্রশ্ন [১/২/৩...]: [প্রশ্ন]\n"
        "   - If the raw text or book image dropped, blurred, or omitted a question number, intelligently infer and restore the correct chronological number based on the sequence of surrounding questions (e.g., if question 1 is followed by an unnumbered question before question 3, restore it as question 2).\n"
        "   - For written passages and sub-questions, use clear sub-numbering: #### 🔸 (ক), #### 🔸 (খ), etc.\n"
        "   - NEVER leave a question unnumbered or floating.\n\n"
        "2. DOMAIN-AGNOSTIC CONTEXTUAL CORRECTION (সার্বজনীন বোধগম্যতা ও বানান শুদ্ধিকরণ):\n"
        "   - Do NOT rely on any fixed keyword list. Apply your comprehensive contextual understanding across all academic domains (Bengali literature, grammar, world history, law, politics, science, geography, economics).\n"
        "   - Read the entire sentence syntax and subject context before deciding a word.\n"
        "   - Automatically detect and heal broken conjuncts (যুক্তবর্ণ), disjointed vowel diacritics (হ্রস্ব-ই/দীর্ঘ-ঈ কার, য-ফলা, রেফ), OCR character confusions (ক/ত, ড়/র, ণ/ন, শ/ষ/স), and split/joined words.\n"
        "   - Reconstruct any real literary reference, author, book, proverb, legal term, or historical entity accurately based on the surrounding context.\n\n"
        "3. TWO-COLUMN LAYOUT DISCIPLINE:\n"
        "   - When a page has two printed columns, transcribe Column 1 (Left) completely from top to bottom first.\n"
        "   - Then transcribe Column 2 (Right) from top to bottom.\n"
        "   - Completely ignore repeating running headers, footers, page numbers, and publisher advertisements/watermarks.\n\n"
        "4. STRICT MCQ OPTIONS ISOLATION:\n"
        "   - EVERY option MUST be on its own separate line:\n"
        "     - **(A)** [বিকল্প]\n"
        "     - **(B)** [বিকল্প]\n"
        "     - **(C)** [বিকল্প]\n"
        "     - **(D)** [বিকল্প]\n"
        "   - NEVER combine multiple options onto the same line, even if they were printed side-by-side in the original book.\n\n"
        "5. CLEAN ANSWER & EXPLANATION BLOCKS:\n"
        "   - Format Bengali answers as:\n"
        "     > 💡 **উত্তর:** (A)\n"
        "     > 📖 **ব্যাখ্যা:** [বিশদ ও নির্ভুল ব্যাকরণসম্মত ব্যাখ্যা]\n"
        "   - Format English answers as:\n"
        "     > 💡 **Ans:** (A)\n"
        "     > 📖 **Expl:** [Clear grammatical explanation]\n"
        "   - Never output OCR corruption artifacts like 'উব্র', 'ডওতর', 'ডবগর', or 'Ans: এ'.\n\n"
        "6. ELEGANT TABLES FOR VOCABULARY & INDICES:\n"
        "   - For word meanings (শব্দার্থ), antonyms/synonyms, or index lists, ALWAYS render them as clean Markdown tables with header and alignment.\n\n"
        "7. PURE CLEAN OUTPUT:\n"
        "   - Output ONLY the finished Markdown text. Do NOT output any internal chain-of-thought, conversation, or meta-notes."
    )
    user_prompt = prompt.strip() if prompt and prompt.strip() else default_prompt

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": user_prompt}
            ]
        }
    ]

    try:
        text = CURRENT_PROCESSOR.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        try:
            from qwen_vl_utils import process_vision_info
            image_inputs, video_inputs = process_vision_info(messages)
            inputs = CURRENT_PROCESSOR(
                text=[text],
                images=image_inputs,
                videos=video_inputs,
                padding=True,
                return_tensors="pt"
            ).to(CURRENT_MODEL.device)
        except Exception:
            inputs = CURRENT_PROCESSOR(
                text=[text],
                images=[image],
                padding=True,
                return_tensors="pt"
            ).to(CURRENT_MODEL.device)

        streamer = TextIteratorStreamer(
            CURRENT_TOKENIZER,
            timeout=60.0,
            skip_prompt=True,
            skip_special_tokens=True
        )

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=2048,
            do_sample=False
        )

        thread = threading.Thread(target=CURRENT_MODEL.generate, kwargs=generation_kwargs)
        thread.start()

        async def sse_vision_stream():
            loop = asyncio.get_event_loop()
            while True:
                token = await loop.run_in_executor(None, lambda: next(streamer, None))
                if token is None:
                    break
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: [DONE]\n\n"

        return StreamingResponse(
            sse_vision_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision inference error: {str(e)}")

# ---------------------------------------------------------------------------
# OCR Endpoint & Intelligent Column-Aware Formatter
# ---------------------------------------------------------------------------
def group_boxes_into_lines(boxes, y_threshold=14):
    """
    Groups bounding boxes that share approximately the same vertical line (Y).
    Sorts words horizontally (X left-to-right) and joins them with spaces into full sentences.
    Prevents single-word vertical fragmentation.
    """
    if not boxes:
        return []
    
    # Sort boxes primarily by Y
    boxes = sorted(boxes, key=lambda b: (b[0], b[1]))
    
    lines = []
    current_line = []
    current_y = None

    for min_y, min_x, text in boxes:
        if current_y is None or abs(min_y - current_y) <= y_threshold:
            current_line.append((min_x, text))
            if current_y is None:
                current_y = min_y
        else:
            # Sort words on this line from left to right
            current_line.sort(key=lambda item: item[0])
            line_str = " ".join([item[1] for item in current_line])
            lines.append(line_str)
            current_line = [(min_x, text)]
            current_y = min_y

    if current_line:
        current_line.sort(key=lambda item: item[0])
        lines.append(" ".join([item[1] for item in current_line]))

    return lines

def format_ocr_results(results, img_width=None):
    """
    Sorts and formats EasyOCR results with column-awareness, horizontal sentence assembly, and smart spacing.
    Prevents two-column pages from horizontally interweaving into a messy wall of text.
    """
    import re
    if not results:
        return ""

    if img_width is None:
        all_xs = [pt[0] for r in results for pt in r[0]]
        img_width = max(all_xs) if all_xs else 1000

    mid_x = img_width / 2.0
    left_boxes = []
    right_boxes = []
    full_boxes = []

    for r in results:
        bbox, text, conf = r
        clean_text = text.strip()
        if not clean_text:
            continue
        xs = [pt[0] for pt in bbox]
        ys = [pt[1] for pt in bbox]
        min_x, max_x = min(xs), max(xs)
        min_y = min(ys)

        # Spans across middle significantly (like header title)
        if min_x < mid_x * 0.75 and max_x > mid_x * 1.25:
            full_boxes.append((min_y, min_x, clean_text))
        elif max_x < mid_x * 1.05:
            left_boxes.append((min_y, min_x, clean_text))
        elif min_x > mid_x * 0.95:
            right_boxes.append((min_y, min_x, clean_text))
        else:
            if (min_x + max_x) / 2.0 < mid_x:
                left_boxes.append((min_y, min_x, clean_text))
            else:
                right_boxes.append((min_y, min_x, clean_text))

    total_col_boxes = len(left_boxes) + len(right_boxes)
    if total_col_boxes > 5 and (len(left_boxes) / total_col_boxes) > 0.2 and (len(right_boxes) / total_col_boxes) > 0.2:
        ordered_texts = group_boxes_into_lines(full_boxes)
        if ordered_texts:
            ordered_texts.append("\n--- [কলাম ১] ---\n")
        ordered_texts.extend(group_boxes_into_lines(left_boxes))
        ordered_texts.append("\n--- [কলাম ২] ---\n")
        ordered_texts.extend(group_boxes_into_lines(right_boxes))
    else:
        all_boxes = [(min(pt[1] for pt in r[0]), min(pt[0] for pt in r[0]), r[1].strip()) for r in results if r[1].strip()]
        ordered_texts = group_boxes_into_lines(all_boxes)

    # Smart paragraph formation
    formatted_lines = []
    for line in ordered_texts:
        if re.match(r"^(\d+[\.\)]|[A-D][\.\)]|উত্তর|ব্যাখ্যা|প্রশ্ন|বিষয়|সূচিপত্র)", line):
            formatted_lines.append("\n" + line)
        else:
            formatted_lines.append(line)

    return "\n".join(formatted_lines).strip()

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
            extracted_text = format_ocr_results(results)

            return {
                "status": "success",
                "is_pdf": False,
                "filename": file.filename,
                "total_pages": 1,
                "pages": [{
                    "page_num": 1,
                    "text": extracted_text,
                    "lines_count": len(results)
                }],
                "text": extracted_text,
                "lines_count": len(results)
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
            text = format_ocr_results(results, img_width=np_image.shape[1])

            return {
                "status": "success",
                "is_pdf": True,
                "filename": file.filename,
                "page_num": target_idx + 1,
                "total_pages": total_pages,
                "text": text,
                "lines_count": len(results)
            }
        else:
            results = ocr_reader.readtext(file_bytes)
            text = format_ocr_results(results)
            return {
                "status": "success",
                "is_pdf": False,
                "filename": file.filename,
                "page_num": 1,
                "total_pages": 1,
                "text": text,
                "lines_count": len(results)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Page OCR failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    from config import SERVER_HOST, SERVER_PORT
    uvicorn.run("server:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)
