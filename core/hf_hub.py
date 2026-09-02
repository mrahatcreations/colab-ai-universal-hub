import json
import time
import shutil
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download
from config import MODELS_DIR

hf_api = HfApi()

def search_models(query: str, task: str = "text-generation", limit: int = 12):
    """Searches HuggingFace hub for popular and downloaded models."""
    if not query or not query.strip():
        return "অনুগ্রহ করে কোনো মডেল নাম বা কিওয়ার্ড দিয়ে সার্চ করুন (যেমন: qwen, mistral, llama, bangla)।"

    try:
        models = hf_api.list_models(
            search=query.strip(),
            filter=task if task != "all" else None,
            sort="downloads",
            direction=-1,
            limit=int(limit)
        )

        results = []
        for m in models:
            downloads = getattr(m, "downloads", 0)
            likes = getattr(m, "likes", 0)
            results.append(
                f"📦 **`{m.id}`**\n"
                f"   📥 ডাউনলোড: **{downloads:,}** | ❤️ লাইক: **{likes:,}**\n"
            )

        if not results:
            return "❌ কোনো মডেল পাওয়া যায়নি।"
        return "\n".join(results)
    except Exception as e:
        return f"⚠️ সার্চ করতে সমস্যা হয়েছে: {str(e)}"

def download_hf_model(repo_id: str, progress=None):
    """
    Downloads model weights directly into local MODELS_DIR.
    Stores metadata for quick offline detection.
    """
    if not repo_id or not repo_id.strip():
        return "❌ সঠিক Hugging Face Model Repo ID লিখুন।"

    repo_id = repo_id.strip()
    target_dir = MODELS_DIR / repo_id.replace("/", "--")

    try:
        if progress:
            progress(0.1, desc=f"ডাউনলোড শুরু হচ্ছে: {repo_id}...")

        snapshot_download(
            repo_id=repo_id,
            local_dir=str(target_dir),
            local_dir_use_symlinks=False,
            ignore_patterns=["*.msgpack", "*.h5", "*.ot", "*.onnx"]
        )

        # Save local metadata
        meta_file = target_dir / "meta.json"
        meta_file.write_text(json.dumps({
            "repo_id": repo_id,
            "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }, indent=2))

        return f"🎉 মডেল `{repo_id}` সফলভাবে ডাউনলোড সম্পন্ন হয়েছে!"
    except Exception as e:
        return f"❌ ডাউনলোড ব্যর্থ: {str(e)}"

def list_downloaded_models():
    """Scans and returns the list of locally downloaded models."""
    models = []
    if not MODELS_DIR.exists():
        return models

    for d in sorted(MODELS_DIR.iterdir()):
        if d.is_dir():
            meta_file = d / "meta.json"
            if meta_file.exists():
                try:
                    data = json.loads(meta_file.read_text())
                    models.append(data.get("repo_id", d.name.replace("--", "/")))
                except Exception:
                    models.append(d.name.replace("--", "/"))
            else:
                models.append(d.name.replace("--", "/"))
    return models

def delete_downloaded_model(repo_id: str):
    """Deletes model directory to free up disk space."""
    if not repo_id:
        return "❌ কোনো মডেল সিলেক্ট করা হয়নি।"
    target_dir = MODELS_DIR / repo_id.replace("/", "--")
    if target_dir.exists():
        try:
            shutil.rmtree(target_dir)
            return f"🗑️ `{repo_id}` ডিস্ক থেকে সফলভাবে মুছে ফেলা হয়েছে।"
        except Exception as e:
            return f"❌ ডিলিট এরর: {str(e)}"
    return "⚠️ মডেল ফোল্ডার পাওয়া যায়নি।"
