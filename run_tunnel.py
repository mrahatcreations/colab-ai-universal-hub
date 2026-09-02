import os
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import time
import subprocess
from config import CLOUDFLARE_TUNNEL_TOKEN, SERVER_HOST, SERVER_PORT, DOMAIN
from tunnel.cloudflare import start_tunnel
from ui.layout import build_app

def main():
    print("=" * 65)
    print("🚀 Colab AI Universal Hub & Cloudflare Tunnel Runner")
    print("=" * 65)

    # 1. Kill any existing process on port 8000
    subprocess.run(f"fuser -k {SERVER_PORT}/tcp 2>/dev/null", shell=True, check=False)
    time.sleep(1)

    # 2. Launch Cloudflare Tunnel in background
    token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", CLOUDFLARE_TUNNEL_TOKEN)
    tunnel_proc = None
    if token and "YOUR_" not in token:
        print(f"[*] Connecting Cloudflare Tunnel for https://{DOMAIN}...")
        try:
            tunnel_proc = start_tunnel(token)
            time.sleep(2)
        except Exception as e:
            print(f"[!] Warning: Could not start tunnel: {e}")
    else:
        print("[!] No Cloudflare token provided. Running in local mode only.")

    print("\n" + "=" * 65)
    print(f"🎉 ড্যাশবোর্ড চালু হচ্ছে: https://{DOMAIN}")
    print(f"👉 লোকাল পোর্ট: http://{SERVER_HOST}:{SERVER_PORT}")
    print("=" * 65 + "\n")

    # 3. Launch Gradio App in foreground
    app = build_app()
    try:
        app.launch(
            server_name=SERVER_HOST,
            server_port=SERVER_PORT,
            share=False
        )
    except KeyboardInterrupt:
        print("\n[!] Shutting down...")
    finally:
        if tunnel_proc:
            tunnel_proc.terminate()

if __name__ == "__main__":
    main()
