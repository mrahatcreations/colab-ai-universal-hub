# 🌌 Colab AI Universal Hub

একটি প্রফেশনাল, মডুলার ও অপ্টিমাইজড মাল্টি-টাস্ক এআই ড্যাশবোর্ড যা Google Colab (T4 GPU)-এ নির্বিঘ্নে চলবে এবং Cloudflare Zero Trust টানেলের মাধ্যমে কাস্টম সাবডোমেইনে (`https://colabapi.iunisphere.com`) লাইভ থাকবে।

---

## 📂 প্রোজেক্ট স্ট্রাকচার (Clean Modular Architecture)

```
google Colab Api/
├── config.py                 # গ্লোবাল কনফিগারেশন (পোর্ট, ডোমেইন, টোকেন, ডিফল্ট কোয়ান্টাইজেশন)
├── app.py                    # মূল অ্যাপ্লিকেশন এন্ট্রি পয়েন্ট (Gradio Blocks Launch)
├── run_tunnel.py             # ড্যাশবোর্ড ও ক্লাউডফ্লেয়ার টানেল একযোগে চালানোর রানার
├── colab_runner.ipynb        # গুগল কোলাবে ১-ক্লিকে চালানোর জুপিটার নোটবুক
├── requirements.txt          # প্রোজেক্ট ডিপেন্ডেন্সি তালিকা
├── .env.example              # এনভায়রনমেন্ট ভেরিয়েবল টেমপ্লেট
│
├── core/                     # কোর ব্যাকএন্ড লজিক ও অপ্টিমাইজেশন ইঞ্জিন
│   ├── vram_manager.py       # VRAM মেমরি ফ্লাশ, গারবেজ কালেকশন ও রিয়েলটাইম টেলিমেট্রি
│   ├── model_loader.py       # থ্রেড-সেফ মডেল লোডার (4-Bit/8-Bit কোয়ান্টাইজেশন, অটো আনলোড)
│   ├── inference.py          # টোকেনাইজার চ্যাট টেমপ্লেট ও টেক্সট স্ট্রিমিং ইনফারেন্স
│   ├── ocr_engine.py         # EasyOCR ইন্টিগ্রেশন (বাংলা ও ইংরেজি সাপোর্ট)
│   └── hf_hub.py             # Hugging Face Hub সার্চ, ডাউনলোড ও ডিস্ক মডেল ম্যানেজমেন্ট
│
├── ui/                       # মডুলার প্রেজেন্টেশন ও ইউজার ইন্টারফেস
│   ├── layout.py             # ইউনিফায়েড Gradio লেআউট ও কাস্টম থিম
│   └── tabs/                 # প্রতিটি মেনু/ফিচারের জন্য পৃথক ট্যাব
│       ├── chat_tab.py       # চ্যাট ইন্টারফেস (রিয়েলটাইম স্ট্রিমিং ও টোকেন কন্ট্রোল)
│       ├── ocr_tab.py        # ওসিআর ইন্টারফেস (ইমেজ আপলোড ও টেক্সট কপি)
│       ├── models_tab.py     # লোকাল মডেল ম্যানেজার (রান, আনলোড, ডিস্ক থেকে ডিলিট)
│       └── search_tab.py     # Hugging Face সার্চ ও ডিরেক্ট ডাউনলোড
│
└── tunnel/                   # নেটওয়ার্ক ও টানেলিং লেয়ার
    └── cloudflare.py         # cloudflared অটো ইনস্টলার ও টানেল প্রসেস স্পনার
```

---

## 🚀 প্রধান সুবিধাসমূহ:

1. **VRAM সুরক্ষা ও ওওএম (OOM) মুক্ত ডিজাইন**:
   - একবারে মেমরিতে শুধুমাত্র **১টি মডেল** থাকবে।
   - নতুন মডেল লোড করার আগে স্বয়ংক্রিয়ভাবে পূর্বের মডেল ডিলিট করে `torch.cuda.empty_cache()` এবং `gc.collect()` রান করা হয়।
   - ডিফল্ট **4-Bit Quantization** থাকায় Mistral-7B, Llama-3-8B বা Qwen2-7B মডেলগুলো মাত্র 5.5 GB VRAM নিয়ে Colab T4 (15GB)-এ দ্রুত ও মসৃণভাবে চলে।

2. **মডুলার ও এক্সটেনসিবল**:
   - চ্যাট, ওসিআর, মডেল ম্যানেজার এবং সার্চ লজিক সম্পূর্ণ আলাদা মডিউলে বিভক্ত।
   - কোড পরিবর্তন বা নতুন কোনো ফিচার (যেমন ভয়েস/টিটিএস) যোগ করা অত্যন্ত সহজ।

3. **১-ক্লিক Colab নোটবুক**:
   - `colab_runner.ipynb` ব্যবহার করে সরাসরি কোলাবে মাত্র কয়েকটি সেল রান করলেই সম্পূর্ণ সার্ভিস লাইভ হয়ে যাবে।

---

## ⚡ Colab-এ চালানোর ধাপ:

### উপায় ১: `colab_runner.ipynb` ওপেন করুন
Google Colab-এ গিয়ে `colab_runner.ipynb` নোটবুকটি আপলোড করে সেলগুলো পরপর রান করুন।

### উপায় ২: সরাসরি টার্মিনাল কমান্ডে
```bash
# ১. ডিপেন্ডেন্সি ও cloudflared ইনস্টল
!wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i cloudflared-linux-amd64.deb
!pip install -q gradio transformers accelerate bitsandbytes easyocr torch huggingface_hub

# ২. আপনার Cloudflare Token দিয়ে এক ক্লিকে সার্ভিস রান করুন
!CLOUDFLARE_TUNNEL_TOKEN="YOUR_TOKEN" python3 run_tunnel.py
```
সার্ভিস চালু হওয়ার পর ভিজিট করুন: **`https://colabapi.iunisphere.com`**
