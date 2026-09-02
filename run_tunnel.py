import os
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import time
import subprocess
from config import CLOUDFLARE_TUNNEL_TOKEN, SERVER_PORT, DOMAIN
from tunnel.cloudflare import install_cloudflared, start_tunnel

def main():
    print("=" * 65)
    print("🚀 Colab AI Universal Hub & Cloudflare Tunnel Runner")
    print("=" * 65)

    # 1. Kill any existing process on port
    subprocess.run(f"fuser -k {SERVER_PORT}/tcp 2>/dev/null", shell=True, check=False)
    time.sleep(1)

    # 2. Launch App in Background
    print(f"[*] Starting Gradio App on port {SERVER_PORT}...")
    app_proc = subprocess.Popen([sys.executable, "app.py"])
    time.sleep(4)

    # 3. Launch Cloudflare Tunnel
    token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", CLOUDFLARE_TUNNEL_TOKEN)
    if not token or "YOUR_" in token:
        print("\n⚠️ সতর্কবার্তা: Cloudflare টোকেন দেওয়া হয়নি!")
        print("দয়া করে config.py-তে অথবা এনভায়রনমেন্টে CLOUDFLARE_TUNNEL_TOKEN সেট করুন।")
        print(f"লোকাল ড্যাশবোর্ড লিসেন করছে: http://127.0.0.1:{SERVER_PORT}")
        app_proc.wait()
        return

    print(f"[*] Connecting Cloudflare Tunnel for https://{DOMAIN}...")
    tunnel_proc = start_tunnel(token)

    print("\n" + "=" * 65)
    print(f"🎉 আপনার ড্যাশবোর্ড এখন লাইভ: https://{DOMAIN}")
    print("=" * 65)

    try:
        app_proc.wait()
    except KeyboardInterrupt:
        print("\n[!] Shutting down...")
        app_proc.terminate()
        tunnel_proc.terminate()

if __name__ == "__main__":
    main()
