import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "downloaded_models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Server Configuration
SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.environ.get("SERVER_PORT", 8000))

# Cloudflare Configuration
CLOUDFLARE_TUNNEL_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "")
DOMAIN = "colabapi.iunisphere.com"

# Hardware / GPU Defaults
DEFAULT_QUANTIZATION = "4bit"  # Options: '4bit', '8bit', 'fp16'
MAX_NEW_TOKENS = 512
DEFAULT_TEMPERATURE = 0.7
DEFAULT_TOP_P = 0.9

# OCR Defaults
DEFAULT_OCR_LANGS = ["en", "bn"]
