import os
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import time
import subprocess
import uvicorn
from config import CLOUDFLARE_TUNNEL_TOKEN, SERVER_HOST, SERVER_PORT, DOMAIN
from tunnel.cloudflare import start_tunnel

def main():
    print("=" * 65)
    print("🚀 Colab AI Universal Core API & Cloudflare Tunnel Runner")
    print("=" * 65)

    # 1. Kill any existing process on port
    subprocess.run(f"fuser -k {SERVER_PORT}/tcp 2>/dev/null", shell=True, check=False)
    time.sleep(1)

    # 1.1 Set default vision model to auto-load upon startup
    if "AUTO_LOAD_MODEL" not in os.environ:
        os.environ["AUTO_LOAD_MODEL"] = "Qwen/Qwen2.5-VL-3B-Instruct"

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
    print(f"🎉 Colab AI Backend API Live at: https://{DOMAIN}")
    print(f"👉 Local Port: http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"📄 Interactive Swagger API Docs: https://{DOMAIN}/docs")
    print("=" * 65 + "\n")

    # 3. Launch FastAPI with Uvicorn
    try:
        uvicorn.run("server:app", host=SERVER_HOST, port=SERVER_PORT, log_level="info", reload=False)
    except KeyboardInterrupt:
        print("\n[!] Shutting down server...")
    finally:
        if tunnel_proc:
            tunnel_proc.terminate()

if __name__ == "__main__":
    main()
