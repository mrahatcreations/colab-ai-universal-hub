import os
import sys
import subprocess
import time

# ---------------------------------------------------------------------------
# 1. Cloudflare Token Configuration
# ---------------------------------------------------------------------------
# ইউজার তার Cloudflare Zero Trust টানেল টোকেন এখানে বসাবেন:
CLOUDFLARE_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "YOUR_CLOUDFLARE_TUNNEL_TOKEN_HERE")

def run_cmd(cmd, check=True):
    print(f"\n[EXEC]: {cmd}")
    res = subprocess.run(cmd, shell=True)
    if check and res.returncode != 0:
        print(f"Warning: Command failed with code {res.returncode}")
    return res.returncode

def main():
    print("=" * 65)
    print("🚀 Colab AI Universal Dashboard & Cloudflare Tunnel Installer")
    print("=" * 65)

    # Step 1: Install Cloudflared
    print("\n[Step 1/4] Installing cloudflared...")
    run_cmd("wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb")
    run_cmd("dpkg -i cloudflared-linux-amd64.deb")

    # Step 2: Install Python dependencies
    print("\n[Step 2/4] Installing Python dependencies...")
    run_cmd("pip install -q gradio transformers accelerate bitsandbytes easyocr torch huggingface_hub")

    # Step 3: Launch Gradio App on port 8000
    print("\n[Step 3/4] Launching Gradio Dashboard on port 8000...")
    # Kill any existing process on port 8000
    run_cmd("fuser -k 8000/tcp 2>/dev/null", check=False)
    time.sleep(1)

    app_process = subprocess.Popen(["python3", "app.py"])
    time.sleep(4)

    # Step 4: Run Cloudflare Tunnel
    print("\n[Step 4/4] Starting Cloudflare Tunnel...")
    if CLOUDFLARE_TOKEN == "YOUR_CLOUDFLARE_TUNNEL_TOKEN_HERE" or not CLOUDFLARE_TOKEN:
        print("\n⚠️ সতর্কবার্তা: Cloudflare টোকেন দেওয়া হয়নি!")
        print("দয়া করে এই স্ক্রিপ্টে আপনার CLOUDFLARE_TOKEN বসান অথবা রান করুন:")
        print("!cloudflared tunnel run --token <YOUR_TOKEN>")
    else:
        tunnel_cmd = f"cloudflared tunnel run --token {CLOUDFLARE_TOKEN}"
        tunnel_proc = subprocess.Popen(tunnel_cmd.split())
        print("\n" + "=" * 65)
        print("🎉 Dashboard ও Tunnel সফলভাবে চালু হয়েছে!")
        print("👉 আপনার সাবডোমেইনে ভিজিট করুন: https://colabapi.iunisphere.com")
        print("=" * 65)
        
        # Keep alive
        try:
            tunnel_proc.wait()
        except KeyboardInterrupt:
            print("\nShutting down processes...")
            app_process.terminate()
            tunnel_proc.terminate()

if __name__ == "__main__":
    main()
