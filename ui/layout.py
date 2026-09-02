import gradio as gr
from core.vram_manager import get_vram_telemetry
from core.model_loader import model_manager
from ui.tabs.chat_tab import create_chat_tab
from ui.tabs.ocr_tab import create_ocr_tab
from ui.tabs.models_tab import create_models_tab
from ui.tabs.search_tab import create_search_tab

CUSTOM_CSS = """
/* Clean editorial styling */
.gradio-container {
    max-width: 1200px !important;
    margin: 0 auto !important;
}
.telemetry-bar {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 12px 18px;
    margin-bottom: 12px;
}
"""

def build_app():
    with gr.Blocks(title="Colab AI Universal Hub") as app:
        gr.Markdown(
            "# 🌌 Colab AI Universal Hub\n"
            "**LLM Chat • OCR • Model Manager • Hugging Face Hub**"
        )

        with gr.Row(elem_classes=["telemetry-bar"]):
            vram_display = gr.Markdown(get_vram_telemetry())
            active_model_display = gr.Markdown(f"**সক্রিয় মডেল:** `{model_manager.active_model_name}`")

        # Render Modular Tabs
        create_chat_tab()
        create_ocr_tab()
        create_models_tab(vram_display, active_model_display)
        create_search_tab()

    return app
