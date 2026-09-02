import threading
import torch
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer
from config import MODELS_DIR
from core.vram_manager import free_gpu_memory, get_vram_telemetry

class ModelManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ModelManager, cls).__new__(cls)
                cls._instance._init_state()
            return cls._instance

    def _init_state(self):
        self.current_model = None
        self.current_tokenizer = None
        self.active_model_name = "None"

    def unload_model(self):
        """Safely unloads the active model from memory."""
        with self._lock:
            if self.current_model is not None:
                del self.current_model
                del self.current_tokenizer
                self.current_model = None
                self.current_tokenizer = None
                self.active_model_name = "None"
                free_gpu_memory()
        return "✅ সক্রিয় মডেল সফলভাবে আনলোড করা হয়েছে।", get_vram_telemetry(), "**সক্রিয় মডেল:** `None`"

    def load_model(self, model_identifier: str, quantization: str = "4bit"):
        """
        Loads a model either from local disk cache or directly from HuggingFace.
        Guarantees that only ONE model exists in memory at any given time.
        """
        if not model_identifier or not model_identifier.strip():
            return "❌ দয়া করে একটি মডেল নির্বাচন করুন!", get_vram_telemetry(), f"**সক্রিয় মডেল:** `{self.active_model_name}`"

        # 1. Unload previous model
        self.unload_model()

        # 2. Check local disk path
        sanitized_name = model_identifier.strip().replace("/", "--")
        local_path = MODELS_DIR / sanitized_name
        model_source = str(local_path) if local_path.exists() else model_identifier.strip()

        try:
            tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)

            load_kwargs = {
                "device_map": "auto",
                "trust_remote_code": True
            }

            if torch.cuda.is_available():
                load_kwargs["torch_dtype"] = torch.float16
                if quantization == "4bit":
                    load_kwargs["load_in_4bit"] = True
                elif quantization == "8bit":
                    load_kwargs["load_in_8bit"] = True

            model = AutoModelForCausalLM.from_pretrained(model_source, **load_kwargs)

            with self._lock:
                self.current_model = model
                self.current_tokenizer = tokenizer
                self.active_model_name = model_identifier.strip()

            msg = f"🚀 মডেল `{model_identifier}` সফলভাবে মেমরিতে লোড হয়েছে ({quantization.upper()} মোড)!"
            return msg, get_vram_telemetry(), f"**সক্রিয় মডেল:** `{self.active_model_name}`"

        except Exception as e:
            self.unload_model()
            return f"❌ মডেল লোড করতে ব্যর্থ: {str(e)}", get_vram_telemetry(), "**সক্রিয় মডেল:** `None`"

# Singleton instance
model_manager = ModelManager()
