# 🚀 Colab AI Universal Hub — 1-Click Run Guide

Google Colab (T4 বা A100 GPU)-এ সম্পূর্ণ ব্যাকএন্ড, Cloudflare Zero Trust টানেল এবং Baidu Unlimited-OCR / Qwen2.5-VL স্বয়ংক্রিয়ভাবে বুট করার জন্য নিচের কোডটি একটি কোড সেলে পেস্ট করে চালান।

---

```python
# ==============================================================================
# 🚀 1-Click All-in-One: Setup, Pull, Cloudflare Tunnel & Auto-Boot Server
# ==============================================================================
import os, subprocess, time

# আপনার ক্লাউডফ্লেয়ার টানেল টোকেন
CLOUDFLARE_TOKEN = "eyJhIjoiMGE2ODA2NzA2MzI0N2Q1ZGU5NzJkZGUzNWIwZmI0NWUiLCJ0IjoiOGRjNGZiNDUtZDc1Mi00NmViLWE4YWYtY2UxM2MyYzA4MzY3IiwicyI6Ik1HUTFaR0ZoWkRFdFpqSXhOeTAwTUdFeExUbGxabU10TjJNNE1HVmxNelptTmpkbSJ9"

# ১. পুরোনো প্রসেস ও পোর্ট ৮০০০ খালি করা
!fuser -k 8000/tcp 2>/dev/null

# ২. প্রজেক্ট রিপোজিটরি ক্লোন বা লেটেস্ট আপডেট পুল করা
!if [ ! -d "/content/colab-api" ]; then \
    git clone https://github.com/mrahatcreations/colab-ai-universal-hub.git /content/colab-api; \
  fi
%cd /content/colab-api
!git fetch --all && git reset --hard origin/main

# ৩. Cloudflared ক্লায়েন্ট ইনস্টল নিশ্চিত করা
!which cloudflared || (wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1)

# ৪. ভিশন, আনলিমিটেড-ওসিআর ও সার্ভার ডিপেন্ডেন্সি ইনস্টল
print("⏳ প্রয়োজনীয় লাইব্রেরি ইনস্টল হচ্ছে (১-২ মিনিট সময় লাগবে)...")
!pip install -q \
    "transformers>=4.48.0" \
    torchvision accelerate bitsandbytes \
    qwen-vl-utils einops addict easydict pymupdf psutil \
    fastapi uvicorn pydantic python-multipart nest_asyncio \
    easyocr huggingface_hub pypdfium2 pillow

# ৫. এনভায়রনমেন্ট ভেরিয়েবল সেট (টোকেন ও স্টার্টআপ মডেল)
os.environ["CLOUDFLARE_TUNNEL_TOKEN"] = CLOUDFLARE_TOKEN
os.environ["AUTO_LOAD_MODEL"] = "baidu/Unlimited-OCR"

# ৬. সার্ভার ও ক্লাউডফ্লেয়ার টানেল চালু
print("\n" + "="*65)
print("🚀 সার্ভার ও ক্লাউডফ্লেয়ার টানেল চালু হচ্ছে...")
print("👉 লাইভ ডোমেইন: https://colabapi.lunisphere.com")
print("="*65 + "\n")

!python run_tunnel.py
```
