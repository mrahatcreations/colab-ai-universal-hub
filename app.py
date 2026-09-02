import sys
import logging
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
from config import SERVER_HOST, SERVER_PORT
from ui.layout import build_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

def main():
    app = build_app()
    print("=" * 60)
    print(f"🚀 Colab AI Universal Hub Starting on http://{SERVER_HOST}:{SERVER_PORT}")
    print("=" * 60)
    app.launch(
        server_name=SERVER_HOST,
        server_port=SERVER_PORT,
        share=False
    )

if __name__ == "__main__":
    main()
