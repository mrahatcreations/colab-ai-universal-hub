import os
import sys
import shutil
import subprocess
import threading
import logging

logger = logging.getLogger("CloudflareTunnel")

def install_cloudflared():
    """Installs cloudflared binary on Linux/Colab if not present."""
    if shutil.which("cloudflared"):
        return True

    if sys.platform.startswith("linux"):
        logger.info("Installing cloudflared deb package...")
        subprocess.run(
            "wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb",
            shell=True,
            check=False
        )
        return shutil.which("cloudflared") is not None
    return False

def _stream_logs(pipe):
    """Streams cloudflared logs in background thread to console."""
    try:
        for line in iter(pipe.readline, ""):
            line_str = line.strip()
            if line_str:
                # Filter relevant connection logs
                if any(k in line_str.lower() for k in ["registered", "connindex", "connection", "error", "fail", "unable"]):
                    print(f"[Cloudflare] {line_str}")
    except Exception:
        pass

def start_tunnel(token: str):
    """Spawns cloudflared tunnel process and streams logs in background."""
    if not token or token == "YOUR_CLOUDFLARE_TUNNEL_TOKEN":
        raise ValueError("Invalid Cloudflare tunnel token.")

    install_cloudflared()

    cmd = ["cloudflared", "tunnel", "run", "--token", token]
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    t = threading.Thread(target=_stream_logs, args=(process.stdout,), daemon=True)
    t.start()

    return process
