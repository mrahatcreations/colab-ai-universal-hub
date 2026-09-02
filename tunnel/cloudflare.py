import os
import sys
import shutil
import subprocess
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

def start_tunnel(token: str):
    """
    Spawns cloudflared tunnel process using the provided token.
    """
    if not token or token == "YOUR_CLOUDFLARE_TUNNEL_TOKEN":
        raise ValueError("Invalid Cloudflare tunnel token.")

    install_cloudflared()

    cmd = ["cloudflared", "tunnel", "run", "--token", token]
    logger.info("Starting Cloudflare Tunnel...")
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return process
