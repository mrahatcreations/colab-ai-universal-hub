import gradio as gr
from core.vram_manager import get_vram_telemetry, free_gpu_memory
from core.model_loader import model_manager
from core.hf_hub import list_downloaded_models
from ui.tabs.chat_tab import create_chat_tab
from ui.tabs.ocr_tab import create_ocr_tab
from ui.tabs.models_tab import create_models_tab
from ui.tabs.search_tab import create_search_tab

CHATGPT_DARK_CSS = """
/* ==========================================================================
   ChatGPT Dark Theme Styling
   ========================================================================== */
:root {
    --bg-main: #212121;
    --bg-sidebar: #171717;
    --bg-input: #2f2f2f;
    --border-subtle: #303030;
    --text-main: #ececec;
    --text-muted: #b4b4b4;
    --accent-green: #10a37f;
}

/* Global Reset */
body, gradio-app {
    background-color: #212121 !important;
    color: #ececec !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}

.gradio-container {
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background-color: #212121 !important;
}

/* ChatGPT Sidebar */
#chatgpt-sidebar {
    background-color: #171717 !important;
    border-right: 1px solid #2d2d2d !important;
    padding: 16px 14px !important;
}

.sidebar-brand {
    font-size: 1.15rem;
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.sidebar-telemetry {
    background-color: #212121;
    border: 1px solid #2f2f2f;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.85rem;
    color: #b4b4b4;
}

/* Chatbot Central Flow */
#chatgpt-chatbot {
    background: transparent !important;
    border: none !important;
    max-width: 880px !important;
    margin: 0 auto !important;
}

/* Message bubbles */
#chatgpt-chatbot .message.user {
    background-color: #2f2f2f !important;
    border-radius: 18px !important;
    color: #ececec !important;
    border: 1px solid #3d3d3d !important;
    padding: 12px 18px !important;
}

#chatgpt-chatbot .message.bot {
    background-color: transparent !important;
    color: #ececec !important;
    padding: 12px 6px !important;
}

/* Chat Input Bar */
#chatgpt-input textarea {
    background-color: #2f2f2f !important;
    border: 1px solid #424242 !important;
    border-radius: 24px !important;
    color: #ffffff !important;
    padding: 14px 20px !important;
    font-size: 0.95rem !important;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
}

#chatgpt-input textarea:focus {
    border-color: #10a37f !important;
    box-shadow: 0 0 0 1px #10a37f !important;
}

/* Tabs Header */
.tabs > .tab-nav {
    border-bottom: 1px solid #2d2d2d !important;
    background-color: #171717 !important;
    padding: 6px 16px !important;
}

.tabs > .tab-nav > button {
    color: #b4b4b4 !important;
    font-weight: 500 !important;
    font-size: 0.92rem !important;
    border-radius: 6px !important;
    padding: 8px 14px !important;
    transition: all 0.2s ease;
}

.tabs > .tab-nav > button.selected {
    color: #ffffff !important;
    background-color: #2f2f2f !important;
}
"""

def build_app():
    with gr.Blocks(title="Colab AI (ChatGPT Style)", css=CHATGPT_DARK_CSS, theme=gr.themes.Soft(neutral_hue="neutral")) as app:
        
        # -------------------------------------------------------------------
        # ChatGPT Left Collapsible Sidebar
        # -------------------------------------------------------------------
        with gr.Sidebar(elem_id="chatgpt-sidebar"):
            gr.Markdown(
                "<div class='sidebar-brand'>🌌 Colab AI</div>"
                "<span style='color: #8e8ea0; font-size: 0.8rem;'>ChatGPT Interface & Universal Hub</span>"
            )

            gr.Markdown("---")
            gr.Markdown("##### 🤖 **মডেল সুইচ করুন (Quick Model Switch)**")
            
            sidebar_model_dropdown = gr.Dropdown(
                choices=list_downloaded_models(),
                label="মডেল নির্বাচন",
                value=list_downloaded_models()[0] if list_downloaded_models() else None
            )
            with gr.Row():
                sidebar_load_btn = gr.Button("⚡ লোড", variant="primary", scale=1)
                sidebar_unload_btn = gr.Button("🧹 আনলোড", variant="stop", scale=1)

            sidebar_model_status = gr.Markdown(f"**সক্রিয়:** `{model_manager.active_model_name}`")

            gr.Markdown("---")
            gr.Markdown("##### 🖥️ **GPU & VRAM টেলিমেট্রি**")
            sidebar_vram = gr.Markdown(get_vram_telemetry(), elem_classes=["sidebar-telemetry"])
            refresh_telemetry_btn = gr.Button("🔄 রিফ্রেশ মেমরি", size="sm")

            # Sidebar Handlers
            def on_sidebar_load(m_id):
                msg, vram, active = model_manager.load_model(m_id, quantization="4bit")
                return vram, active

            def on_sidebar_unload():
                msg, vram, active = model_manager.unload_model()
                return vram, active

            def on_refresh_telemetry():
                models = list_downloaded_models()
                new_val = models[0] if models else None
                return get_vram_telemetry(), gr.update(choices=models, value=new_val)

            sidebar_load_btn.click(
                fn=on_sidebar_load,
                inputs=[sidebar_model_dropdown],
                outputs=[sidebar_vram, sidebar_model_status]
            )
            sidebar_unload_btn.click(
                fn=on_sidebar_unload,
                outputs=[sidebar_vram, sidebar_model_status]
            )
            refresh_telemetry_btn.click(
                fn=on_refresh_telemetry,
                outputs=[sidebar_vram, sidebar_model_dropdown]
            )

        # -------------------------------------------------------------------
        # Main Area (ChatGPT Central View + Power Tools)
        # -------------------------------------------------------------------
        with gr.Tabs():
            create_chat_tab()
            create_ocr_tab()
            create_models_tab(sidebar_vram, sidebar_model_status)
            create_search_tab()

    return app
